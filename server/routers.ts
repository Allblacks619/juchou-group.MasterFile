import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { generateRosterPdf, generateRosterListPdf, generateMultiRosterPdf } from "./pdfRoster";
import { generateInvoicePdf } from "./pdfInvoice";

// ── Helper: check admin or leader role ──
const leaderOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.appRole !== "admin" && ctx.user.appRole !== "leader") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者または責任者権限が必要です" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Invitation System ──
  invitation: router({
    create: leaderOrAdminProcedure
      .input(z.object({
        loginId: z.string().min(1),
        tempPassword: z.string().min(6),
        assignedRole: z.enum(["admin", "leader", "worker"]),
        recipientEmail: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only admin can create admin invitations
        if (input.assignedRole === "admin" && ctx.user.appRole !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者のみが管理者招待を作成できます" });
        }

        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.createInvitation({
          token,
          loginId: input.loginId,
          tempPassword: input.tempPassword,
          assignedRole: input.assignedRole,
          recipientEmail: input.recipientEmail ?? null,
          status: "pending",
          emailSent: false,
          createdBy: ctx.user.id,
          expiresAt,
        });

        return {
          token,
          loginId: input.loginId,
          tempPassword: input.tempPassword,
          expiresAt,
          inviteUrl: `__ORIGIN__/app/invite/${token}`,
        };
      }),

    list: leaderOrAdminProcedure.query(async ({ ctx }) => {
      if (ctx.user.appRole === "admin") {
        return db.getAllInvitations();
      }
      return db.getInvitationsByCreator(ctx.user.id);
    }),

    verify: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        const invitation = await db.getInvitationByToken(input.token);
        if (!invitation) {
          return { valid: false, reason: "招待リンクが見つかりません" };
        }
        if (invitation.status === "used") {
          return { valid: false, reason: "この招待リンクは既に使用されています" };
        }
        if (new Date() > invitation.expiresAt) {
          return { valid: false, reason: "招待リンクの有効期限が切れています" };
        }
        return {
          valid: true,
          loginId: invitation.loginId,
          assignedRole: invitation.assignedRole,
        };
      }),
  }),

  // ── Company Profile ──
  company: router({
    get: protectedProcedure.query(async () => {
      const profile = await db.getCompanyProfile();
      return profile ?? null;
    }),

    upsert: adminProcedure
      .input(z.object({
        companyName: z.string().min(1),
        postalCode: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        registrationNumber: z.string().optional(),
        invoiceIssuerNumber: z.string().optional(),
        representativeName: z.string().optional(),
        bankName: z.string().optional(),
        branchName: z.string().optional(),
        accountType: z.enum(["ordinary", "checking"]).optional(),
        accountNumber: z.string().optional(),
        accountHolder: z.string().optional(),
        sealSettings: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.upsertCompanyProfile(input);
      }),

    uploadImage: adminProcedure
      .input(z.object({
        type: z.enum(["logo", "seal", "watermark"]),
        base64: z.string(),
        mimeType: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const suffix = nanoid(8);
        const key = `company/${input.type}/${suffix}-${input.fileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        // Update company profile with the new URL
        const existing = await db.getCompanyProfile();
        if (existing) {
          const updateData: Record<string, unknown> = {};
          if (input.type === "logo") updateData.logoUrl = url;
          if (input.type === "seal") updateData.sealUrl = url;
          if (input.type === "watermark") updateData.watermarkUrl = url;
          await db.upsertCompanyProfile({
            companyName: existing.companyName,
            ...updateData,
          } as any);
        }

        return { url };
      }),
  }),

  // ── Employee Management ──
  employee: router({
    list: leaderOrAdminProcedure.query(async () => {
      return db.getAllEmployees();
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const employee = await db.getEmployeeById(input.id);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "従業員が見つかりません" });
        }
        // Workers can only see their own profile
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "アクセス権限がありません" });
        }
        return employee;
      }),

    getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getEmployeeByUserId(ctx.user.id);
      return profile ?? null;
    }),

    /** Update own profile (any authenticated user) */
    updateMyProfile: protectedProcedure
      .input(z.object({
        nameKanji: z.string().optional(),
        nameKana: z.string().optional(),
        nameRomaji: z.string().optional(),
        dateOfBirth: z.string().optional(),
        bloodType: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
        gender: z.enum(["male", "female"]).nullable().optional(),
        nationality: z.string().optional(),
        residenceStatus: z.string().optional(),
        residenceCardNumber: z.string().optional(),
        residenceCardExpiry: z.string().optional(),
        passportNumber: z.string().optional(),
        passportExpiry: z.string().optional(),
        postalCode: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        healthCheckDate: z.string().optional(),
        healthInsuranceNumber: z.string().optional(),
        insuranceType: z.enum(["national", "social", "construction"]).nullable().optional(),
        workersCompNumber: z.string().optional(),
        pensionNumber: z.string().optional(),
        careerUpNumber: z.string().optional(),
        employmentType: z.enum(["sole_proprietor", "employee", "other"]).nullable().optional(),
        emergencyNameKana: z.string().optional(),
        emergencyNameKanji: z.string().optional(),
        emergencyRelationship: z.string().optional(),
        emergencyPostalCode: z.string().optional(),
        emergencyAddress: z.string().optional(),
        emergencyPhone: z.string().optional(),
        bankName: z.string().optional(),
        branchName: z.string().optional(),
        accountType: z.enum(["ordinary", "checking"]).nullable().optional(),
        accountNumber: z.string().optional(),
        accountHolder: z.string().optional(),
        isInvoiceIssuer: z.boolean().optional(),
        invoiceIssuerNumber: z.string().optional(),
        height: z.number().optional(),
        weight: z.number().optional(),
        experienceYears: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const profile = await db.getEmployeeByUserId(ctx.user.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "従業員プロフィールが見つかりません" });
        }
        const data: any = { ...input };
        if (input.dateOfBirth) data.dateOfBirth = new Date(input.dateOfBirth);
        if (input.residenceCardExpiry) data.residenceCardExpiry = new Date(input.residenceCardExpiry);
        if (input.passportExpiry) data.passportExpiry = new Date(input.passportExpiry);
        if (input.healthCheckDate) data.healthCheckDate = new Date(input.healthCheckDate);
        return db.updateEmployee(profile.id, data);
      }),

    /** Check missing required fields for own profile */
    getMyMissingFields: protectedProcedure.query(async ({ ctx }) => {
      const profile = await db.getEmployeeByUserId(ctx.user.id);
      if (!profile) {
        return { hasProfile: false, missingFields: [], completionPercent: 0 };
      }

      const requiredFields: { key: string; label: string; section: string }[] = [
        { key: "nameKanji", label: "氏名（漢字）", section: "基本情報" },
        { key: "nameKana", label: "氏名（カナ）", section: "基本情報" },
        { key: "nameRomaji", label: "氏名（ローマ字）", section: "基本情報" },
        { key: "dateOfBirth", label: "生年月日", section: "基本情報" },
        { key: "bloodType", label: "血液型", section: "基本情報" },
        { key: "phone", label: "電話番号", section: "連絡先" },
        { key: "postalCode", label: "郵便番号", section: "住所" },
        { key: "address", label: "住所", section: "住所" },
        { key: "emergencyNameKanji", label: "緊急連絡先氏名", section: "緊急連絡先" },
        { key: "emergencyPhone", label: "緊急連絡先電話番号", section: "緊急連絡先" },
        { key: "emergencyRelationship", label: "緊急連絡先続柄", section: "緊急連絡先" },
        { key: "bankName", label: "銀行名", section: "振込先" },
        { key: "branchName", label: "支店名", section: "振込先" },
        { key: "accountNumber", label: "口座番号", section: "振込先" },
        { key: "accountHolder", label: "口座名義", section: "振込先" },
      ];

      const missingFields = requiredFields.filter(f => {
        const val = (profile as any)[f.key];
        return val === null || val === undefined || val === "";
      });

      const completionPercent = Math.round(((requiredFields.length - missingFields.length) / requiredFields.length) * 100);

      return {
        hasProfile: true,
        missingFields: missingFields.map(f => ({ key: f.key, label: f.label, section: f.section })),
        completionPercent,
      };
    }),

    create: leaderOrAdminProcedure
      .input(z.object({
        nameKanji: z.string().min(1),
        nameKana: z.string().optional(),
        nameRomaji: z.string().optional(),
        experienceYears: z.number().optional(),
        dateOfBirth: z.string().optional(),
        bloodType: z.enum(["A", "B", "AB", "O"]).optional(),
        gender: z.enum(["male", "female"]).optional(),
        nationality: z.string().default("日本"),
        residenceStatus: z.string().optional(),
        residenceCardNumber: z.string().optional(),
        residenceCardExpiry: z.string().optional(),
        passportNumber: z.string().optional(),
        passportExpiry: z.string().optional(),
        postalCode: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        healthCheckDate: z.string().optional(),
        healthInsuranceNumber: z.string().optional(),
        insuranceType: z.enum(["national", "social", "construction"]).optional(),
        workersCompNumber: z.string().optional(),
        pensionNumber: z.string().optional(),
        careerUpNumber: z.string().optional(),
        employmentType: z.enum(["sole_proprietor", "employee", "other"]).optional(),
        emergencyNameKana: z.string().optional(),
        emergencyNameKanji: z.string().optional(),
        emergencyRelationship: z.string().optional(),
        emergencyPostalCode: z.string().optional(),
        emergencyAddress: z.string().optional(),
        emergencyPhone: z.string().optional(),
        bankName: z.string().optional(),
        branchName: z.string().optional(),
        accountType: z.enum(["ordinary", "checking"]).optional(),
        accountNumber: z.string().optional(),
        accountHolder: z.string().optional(),
        isInvoiceIssuer: z.boolean().default(false),
        invoiceIssuerNumber: z.string().optional(),
        height: z.number().optional(),
        weight: z.number().optional(),
        bloodPressureHigh: z.number().optional(),
        bloodPressureLow: z.number().optional(),
        insuredNumber: z.string().optional(),
        employmentInsuranceNumber: z.string().optional(),
        userId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        // Convert date strings to Date objects
        if (input.dateOfBirth) data.dateOfBirth = new Date(input.dateOfBirth);
        if (input.residenceCardExpiry) data.residenceCardExpiry = new Date(input.residenceCardExpiry);
        if (input.passportExpiry) data.passportExpiry = new Date(input.passportExpiry);
        if (input.healthCheckDate) data.healthCheckDate = new Date(input.healthCheckDate);
        return db.createEmployee(data);
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        nameKanji: z.string().optional(),
        nameKana: z.string().optional(),
        nameRomaji: z.string().optional(),
        experienceYears: z.number().optional(),
        dateOfBirth: z.string().optional(),
        bloodType: z.enum(["A", "B", "AB", "O"]).optional(),
        gender: z.enum(["male", "female"]).optional(),
        nationality: z.string().optional(),
        residenceStatus: z.string().optional(),
        residenceCardNumber: z.string().optional(),
        residenceCardExpiry: z.string().optional(),
        passportNumber: z.string().optional(),
        passportExpiry: z.string().optional(),
        postalCode: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        healthCheckDate: z.string().optional(),
        healthInsuranceNumber: z.string().optional(),
        insuranceType: z.enum(["national", "social", "construction"]).optional(),
        workersCompNumber: z.string().optional(),
        pensionNumber: z.string().optional(),
        careerUpNumber: z.string().optional(),
        employmentType: z.enum(["sole_proprietor", "employee", "other"]).optional(),
        emergencyNameKana: z.string().optional(),
        emergencyNameKanji: z.string().optional(),
        emergencyRelationship: z.string().optional(),
        emergencyPostalCode: z.string().optional(),
        emergencyAddress: z.string().optional(),
        emergencyPhone: z.string().optional(),
        bankName: z.string().optional(),
        branchName: z.string().optional(),
        accountType: z.enum(["ordinary", "checking"]).optional(),
        accountNumber: z.string().optional(),
        accountHolder: z.string().optional(),
        isInvoiceIssuer: z.boolean().optional(),
        invoiceIssuerNumber: z.string().optional(),
        height: z.number().optional(),
        weight: z.number().optional(),
        bloodPressureHigh: z.number().optional(),
        bloodPressureLow: z.number().optional(),
        insuredNumber: z.string().optional(),
        employmentInsuranceNumber: z.string().optional(),
        photoUrl: z.string().optional(),
        stampUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updateData } = input;
        const employee = await db.getEmployeeById(id);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "従業員が見つかりません" });
        }
        // Workers can only update their own profile
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "アクセス権限がありません" });
        }
        const data: any = { ...updateData };
        if (updateData.dateOfBirth) data.dateOfBirth = new Date(updateData.dateOfBirth);
        if (updateData.residenceCardExpiry) data.residenceCardExpiry = new Date(updateData.residenceCardExpiry);
        if (updateData.passportExpiry) data.passportExpiry = new Date(updateData.passportExpiry);
        if (updateData.healthCheckDate) data.healthCheckDate = new Date(updateData.healthCheckDate);
        return db.updateEmployee(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEmployee(input.id);
        return { success: true };
      }),

    uploadFile: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        type: z.enum(["photo", "stamp", "residence_card", "passport", "health_check", "qualification_cert", "id_document", "receipt", "invoice", "other"]),
        base64: z.string(),
        mimeType: z.string(),
        fileName: z.string(),
        expiryDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND", message: "従業員が見つかりません" });
        }
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "アクセス権限がありません" });
        }

        const buffer = Buffer.from(input.base64, "base64");
        const suffix = nanoid(8);
        const key = `employees/${input.employeeId}/${input.type}/${suffix}-${input.fileName}`;
        const { url } = await storagePut(key, buffer, input.mimeType);

        // If it's a photo or stamp, update the employee record
        if (input.type === "photo") {
          await db.updateEmployee(input.employeeId, { photoUrl: url });
          return { url, type: "photo" };
        }
        if (input.type === "stamp") {
          await db.updateEmployee(input.employeeId, { stampUrl: url });
          return { url, type: "stamp" };
        }

        // For other document types, create a document record
        const docTypeMap: Record<string, any> = {
          residence_card: "residence_card",
          passport: "passport",
          health_check: "health_check",
          qualification_cert: "qualification_cert",
          id_document: "id_document",
          receipt: "receipt",
          invoice: "invoice",
          other: "other",
        };

        const doc = await db.createDocument({
          employeeId: input.employeeId,
          documentType: docTypeMap[input.type] || "other",
          fileName: input.fileName,
          fileUrl: url,
          fileKey: key,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          uploadedBy: ctx.user.id,
        });

        return { url, documentId: doc.id, type: input.type };
      }),
  }),

  // ── Qualifications ──
  qualification: router({
    list: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return db.getQualificationsByEmployee(input.employeeId);
      }),

    create: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        name: z.string().min(1),
        obtainedDate: z.string().optional(),
        certificateNumber: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return db.createQualification({
          employeeId: input.employeeId,
          name: input.name,
          obtainedDate: input.obtainedDate ? new Date(input.obtainedDate) : undefined,
          certificateNumber: input.certificateNumber,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        obtainedDate: z.string().optional(),
        certificateNumber: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const updateData: any = { ...data };
        if (data.obtainedDate) updateData.obtainedDate = new Date(data.obtainedDate);
        return db.updateQualification(id, updateData);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteQualification(input.id);
        return { success: true };
      }),
  }),

  // ── Documents ──
  document: router({
    list: protectedProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ ctx, input }) => {
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return db.getDocumentsByEmployee(input.employeeId);
      }),

    updateStatus: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        docStatus: z.enum(["valid", "renewing", "renewed", "expired"]),
      }))
      .mutation(async ({ input }) => {
        return db.updateDocument(input.id, { docStatus: input.docStatus });
      }),

    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteDocument(input.id);
        return { success: true };
      }),

    expiring: adminProcedure
      .input(z.object({ daysAhead: z.number().default(90) }))
      .query(async ({ input }) => {
        return db.getExpiringDocuments(input.daysAhead);
      }),
  }),

  // ── Clients (取引先) ──
  clientInfo: router({
    list: leaderOrAdminProcedure.query(async () => {
      return db.getAllClients();
    }),

    get: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const client = await db.getClientById(input.id);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "取引先が見つかりません" });
        return client;
      }),

    create: leaderOrAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        postalCode: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        contactPerson: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        return db.createClient(input);
      }),

    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        postalCode: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().optional(),
        contactPerson: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        return db.updateClient(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteClient(input.id);
        return { success: true };
      }),
  }),

  // ── Projects (現場) ──
  project: router({
    list: leaderOrAdminProcedure.query(async () => {
      const [projectList, clientList] = await Promise.all([
        db.getAllProjects(),
        db.getAllClients(),
      ]);
      const clientMap = new Map(clientList.map(c => [c.id, c]));
      return projectList.map(p => ({
        ...p,
        client: p.clientId ? clientMap.get(p.clientId) ?? null : null,
      }));
    }),

    get: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const project = await db.getProjectById(input.id);
        if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
        const client = project.clientId ? await db.getClientById(project.clientId) : null;
        return { ...project, client };
      }),

    create: leaderOrAdminProcedure
      .input(z.object({
        name: z.string().min(1),
        clientId: z.number().optional(),
        address: z.string().optional(),
        status: z.enum(["active", "completed", "cancelled"]).default("active"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        if (input.startDate) data.startDate = new Date(input.startDate);
        if (input.endDate) data.endDate = new Date(input.endDate);
        return db.createProject(data);
      }),

    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        clientId: z.number().nullable().optional(),
        address: z.string().optional(),
        status: z.enum(["active", "completed", "cancelled"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updateData } = input;
        const data: any = { ...updateData };
        if (updateData.startDate) data.startDate = new Date(updateData.startDate);
        if (updateData.endDate) data.endDate = new Date(updateData.endDate);
        return db.updateProject(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteProject(input.id);
        return { success: true };
      }),
  }),

  // ── Employee Rates (単価管理) ──
  rate: router({
    listByProject: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const [rates, empList] = await Promise.all([
          db.getRatesByProject(input.projectId),
          db.getAllEmployees(),
        ]);
        const empMap = new Map(empList.map(e => [e.id, e]));
        return rates.map(r => ({
          ...r,
          employee: r.employeeId ? empMap.get(r.employeeId) ?? null : null,
        }));
      }),

    listByEmployee: leaderOrAdminProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => {
        const [rates, projList] = await Promise.all([
          db.getRatesByEmployee(input.employeeId),
          db.getAllProjects(),
        ]);
        const projMap = new Map(projList.map(p => [p.id, p]));
        return rates.map(r => ({
          ...r,
          project: projMap.get(r.projectId) ?? null,
        }));
      }),

    listAll: leaderOrAdminProcedure.query(async () => {
      const [rates, empList, projList] = await Promise.all([
        db.getAllEmployeeRates(),
        db.getAllEmployees(),
        db.getAllProjects(),
      ]);
      const empMap = new Map(empList.map(e => [e.id, e]));
      const projMap = new Map(projList.map(p => [p.id, p]));
      return rates.map(r => ({
        ...r,
        employee: r.employeeId ? empMap.get(r.employeeId) ?? null : null,
        project: projMap.get(r.projectId) ?? null,
      }));
    }),

    create: leaderOrAdminProcedure
      .input(z.object({
        employeeId: z.number().nullable().optional(),
        projectId: z.number(),
        shiftType: z.enum(["day", "night"]).default("day"),
        clientRate: z.number().min(0),
        workerRate: z.number().min(0),
        effectiveFrom: z.string().optional(),
        effectiveUntil: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        if (input.effectiveFrom) data.effectiveFrom = new Date(input.effectiveFrom);
        if (input.effectiveUntil) data.effectiveUntil = new Date(input.effectiveUntil);
        return db.createEmployeeRate(data);
      }),

    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        shiftType: z.enum(["day", "night"]).optional(),
        clientRate: z.number().min(0).optional(),
        workerRate: z.number().min(0).optional(),
        effectiveFrom: z.string().optional(),
        effectiveUntil: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updateData } = input;
        const data: any = { ...updateData };
        if (updateData.effectiveFrom) data.effectiveFrom = new Date(updateData.effectiveFrom);
        if (updateData.effectiveUntil) data.effectiveUntil = new Date(updateData.effectiveUntil);
        return db.updateEmployeeRate(id, data);
      }),

    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEmployeeRate(input.id);
        return { success: true };
      }),
  }),

  // ── PDF Generation (作業員名簿) ──
  pdf: router({
    /** Generate individual worker roster PDF */
    rosterSingle: leaderOrAdminProcedure
      .input(z.object({
        employeeId: z.number(),
        projectName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員が見つかりません" });
        const qualifications = await db.getQualificationsByEmployee(input.employeeId);
        const company = await db.getCompanyProfile();

        const pdfBuffer = await generateRosterPdf({
          employee,
          qualifications,
          company,
          projectName: input.projectName,
        });

        // Upload to S3
        const fileName = `roster_${employee.nameRomaji || employee.id}_${Date.now()}.pdf`;
        const fileKey = `rosters/${fileName}`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        return { url, fileName };
      }),

    /** Generate multi-worker roster list PDF (table format) */
    rosterList: leaderOrAdminProcedure
      .input(z.object({
        employeeIds: z.array(z.number()),
        projectName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const allEmployees = await db.getAllEmployees();
        const selectedEmployees = input.employeeIds.length > 0
          ? allEmployees.filter(e => input.employeeIds.includes(e.id))
          : allEmployees;

        const workers = await Promise.all(
          selectedEmployees.map(async (emp) => ({
            employee: emp,
            qualifications: await db.getQualificationsByEmployee(emp.id),
          }))
        );

        const company = await db.getCompanyProfile();
        const pdfBuffer = await generateRosterListPdf(workers, company, input.projectName);

        const fileName = `roster_list_${Date.now()}.pdf`;
        const fileKey = `rosters/${fileName}`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        return { url, fileName };
      }),

    /** Generate multiple individual roster PDFs (one page per worker) */
    rosterMulti: leaderOrAdminProcedure
      .input(z.object({
        employeeIds: z.array(z.number()).min(1),
        projectName: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const workers = await Promise.all(
          input.employeeIds.map(async (id) => {
            const emp = await db.getEmployeeById(id);
            if (!emp) throw new TRPCError({ code: "NOT_FOUND", message: `従業員ID ${id} が見つかりません` });
            const quals = await db.getQualificationsByEmployee(id);
            return { employee: emp, qualifications: quals };
          })
        );

        const company = await db.getCompanyProfile();
        const pdfBuffer = await generateMultiRosterPdf(workers, company, input.projectName);

        const fileName = `roster_multi_${workers.length}名_${Date.now()}.pdf`;
        const fileKey = `rosters/${fileName}`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        return { url, fileName };
      }),
  }),

  // ── Attendance (出面表 / 出勤管理) ──
  attendance: router({
    /** List attendance records for a date range (optionally filtered by project) */
    list: leaderOrAdminProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        projectId: z.number().optional(),
      }))
      .query(async ({ input }) => {
        return db.getAttendanceByDateRange(
          new Date(input.startDate),
          new Date(input.endDate),
          input.projectId,
        );
      }),

    /** List attendance for a specific employee */
    byEmployee: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }))
      .query(async ({ input }) => {
        return db.getAttendanceByEmployee(
          input.employeeId,
          input.startDate ? new Date(input.startDate) : undefined,
          input.endDate ? new Date(input.endDate) : undefined,
        );
      }),

    /** Upsert a single attendance record (admin/leader or project member) */
    upsert: protectedProcedure
      .input(z.object({
        employeeId: z.number().nullable().optional(),
        guestName: z.string().optional(),
        projectId: z.number(),
        workDate: z.string(),
        hoursWorked: z.number().default(80),
        overtimeHours: z.number().default(0),
        workType: z.enum(["normal", "half_day", "overtime", "holiday", "absence"]).default("normal"),
        shiftType: z.enum(["day", "night"]).default("day"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertAttendance({
          employeeId: input.employeeId ?? null,
          guestName: input.guestName || null,
          projectId: input.projectId,
          workDate: new Date(input.workDate),
          hoursWorked: input.hoursWorked,
          overtimeHours: input.overtimeHours,
          workType: input.workType,
          shiftType: input.shiftType,
          notes: input.notes || null,
          enteredBy: ctx.user.id,
        });
      }),

    /** Batch upsert attendance records (for grid entry) */
    batchUpsert: protectedProcedure
      .input(z.object({
        records: z.array(z.object({
          employeeId: z.number().nullable().optional(),
          guestName: z.string().optional(),
          projectId: z.number(),
          workDate: z.string(),
          hoursWorked: z.number().default(80),
          overtimeHours: z.number().default(0),
          workType: z.enum(["normal", "half_day", "overtime", "holiday", "absence"]).default("normal"),
          shiftType: z.enum(["day", "night"]).default("day"),
          notes: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        for (const rec of input.records) {
          const result = await db.upsertAttendance({
            employeeId: rec.employeeId ?? null,
            guestName: rec.guestName || null,
            projectId: rec.projectId,
            workDate: new Date(rec.workDate),
            hoursWorked: rec.hoursWorked,
            overtimeHours: rec.overtimeHours,
            workType: rec.workType,
            shiftType: rec.shiftType,
            notes: rec.notes || null,
            enteredBy: ctx.user.id,
          });
          results.push(result);
        }
        return { count: results.length };
      }),

    /** Delete an attendance record */
    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAttendance(input.id);
        return { success: true };
      }),

    /** Get my attendance records (for employee self-service) */
    myAttendance: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
        projectId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        // Get employee linked to this user
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) return [];
        const records = await db.getAttendanceByEmployee(
          employee.id,
          new Date(input.startDate),
          new Date(input.endDate),
        );
        if (input.projectId) {
          return records.filter(r => r.projectId === input.projectId);
        }
        return records;
      }),

    /** Get projects where the current employee has attendance records or is assigned */
    myProjects: protectedProcedure.query(async ({ ctx }) => {
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      if (!employee) return [];
      // Get all projects and filter to those where this employee has records
      const allProjects = await db.getAllProjects();
      const allRecords = await db.getAttendanceByEmployee(employee.id);
      const projectIds = new Set(allRecords.map(r => r.projectId));
      // Return all active projects (employees can input for any active project)
      return allProjects.filter(p => p.status === "active");
    }),

    /** Get last used project for current employee */
    lastProject: protectedProcedure.query(async ({ ctx }) => {
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      if (!employee) return null;
      // Get most recent attendance record to find last project
      const records = await db.getAttendanceByEmployee(employee.id);
      if (records.length === 0) return null;
      // Sort by workDate desc, then by updatedAt desc
      records.sort((a, b) => {
        const dateA = new Date(b.workDate).getTime();
        const dateB = new Date(a.workDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      const lastProjectId = records[0].projectId;
      const allProjects = await db.getAllProjects();
      return allProjects.find(p => p.id === lastProjectId) || null;
    }),

    /** Get project attendance data with member info (for team view) */
    projectTeamData: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ input }) => {
        const records = await db.getAttendanceByProject(
          input.projectId,
          new Date(input.startDate),
          new Date(input.endDate),
        );
        // Collect unique employee IDs and guest names
        const empIds = new Set<number>();
        const guestNames = new Set<string>();
        for (const rec of records) {
          if (rec.employeeId) empIds.add(rec.employeeId);
          if (rec.guestName) guestNames.add(rec.guestName);
        }
        // Get employee info
        const allEmployees = await db.getAllEmployees();
        const members = allEmployees
          .filter(e => empIds.has(e.id))
          .map(e => ({ id: e.id, nameKanji: e.nameKanji || e.nameRomaji || `ID:${e.id}`, type: "employee" as const }));
        const guests = Array.from(guestNames).map(name => ({ id: 0, nameKanji: name, type: "guest" as const }));
        return {
          members: [...members, ...guests],
          records: records.map(r => ({
            id: r.id,
            employeeId: r.employeeId,
            guestName: r.guestName,
            projectId: r.projectId,
            workDate: r.workDate,
            hoursWorked: r.hoursWorked,
            overtimeHours: r.overtimeHours,
            workType: r.workType,
            shiftType: r.shiftType,
            notes: r.notes,
          })),
        };
      }),

    /** Get my employee info */
    myEmployeeInfo: protectedProcedure.query(async ({ ctx }) => {
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      if (!employee) return null;
      return { id: employee.id, nameKanji: employee.nameKanji || employee.nameRomaji || "" };
    }),

    /** Generate attendance PDF */
    generatePdf: protectedProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
        projectId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const startDate = new Date(input.year, input.month - 1, 1);
        const endDate = new Date(input.year, input.month, 0);
        const records = await db.getAttendanceByDateRange(startDate, endDate, input.projectId);
        const allEmployees = await db.getAllEmployees();
        const projects = await db.getAllProjects();
        const project = projects.find(p => p.id === input.projectId);

        // Collect unique employee IDs and guest names from records
        const empIds = new Set<number>();
        const guestNameSet = new Set<string>();
        for (const rec of records) {
          if (rec.employeeId) empIds.add(rec.employeeId);
          if (rec.guestName) guestNameSet.add(rec.guestName);
        }

        const employees = allEmployees
          .filter(e => empIds.has(e.id))
          .map(e => ({ id: e.id, nameKanji: e.nameKanji || e.nameRomaji || `ID:${e.id}` }));

        const { generateAttendancePdf } = await import("./pdfAttendance");
        const pdfBuffer = await generateAttendancePdf({
          year: input.year,
          month: input.month,
          projectName: project?.name || `Project #${input.projectId}`,
          companyName: "充寵グループ",
          employees,
          guestNames: Array.from(guestNameSet),
          records: records.map(r => ({
            employeeId: r.employeeId,
            guestName: r.guestName,
            workDate: r.workDate,
            hoursWorked: r.hoursWorked,
            overtimeHours: r.overtimeHours,
            workType: r.workType,
            shiftType: r.shiftType || "day",
            notes: r.notes,
          })),
        });

        const { storagePut } = await import("./storage");
        const fileName = `attendance-${input.year}-${String(input.month).padStart(2, "0")}-${input.projectId}.pdf`;
        const { url } = await storagePut(
          `attendance/${fileName}`,
          pdfBuffer,
          "application/pdf"
        );
        return { url, fileName };
      }),
  }),

  // ── Invoices (請求書) ──
  invoice: router({
    /** List all invoices */
    list: leaderOrAdminProcedure.query(async () => {
      return db.getAllInvoices();
    }),

    /** Get single invoice with items */
    get: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const invoice = await db.getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const items = await db.getInvoiceItemsByInvoice(input.id);
        return { invoice, items };
      }),

    /** Create invoice from attendance data */
    createFromAttendance: leaderOrAdminProcedure
      .input(z.object({
        clientId: z.number(),
        projectId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        taxRate: z.number().default(10),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get attendance records for the period
        const records = await db.getAttendanceByDateRange(
          new Date(input.periodStart),
          new Date(input.periodEnd),
          input.projectId,
        );

        // Get rates for this project
        const rates = await db.getRatesByProject(input.projectId);
        const rateMap = new Map(rates.map(r => [r.employeeId, r]));

        // Get all employees for names
        const allEmployees = await db.getAllEmployees();
        const empMap = new Map(allEmployees.map(e => [e.id, e]));

        // Group attendance by employee
        const byEmployee = new Map<number, typeof records>();
        for (const rec of records) {
          if (!rec.employeeId) continue; // skip guest records for invoice
          const arr = byEmployee.get(rec.employeeId) || [];
          arr.push(rec);
          byEmployee.set(rec.employeeId, arr);
        }

        // Build invoice items
        const items: Array<{ employeeId: number; description: string; quantity: number; unitPrice: number; amount: number; unit: string }> = [];
        let subtotal = 0;

        for (const [empId, empRecords] of Array.from(byEmployee.entries())) {
          const emp = empMap.get(empId);
          const rate = rateMap.get(empId);
          const clientRate = rate?.clientRate || 0;

          // Calculate total days (hours / 80 = days, since 80 = 8.0h = 1 day)
          let totalHours = 0;
          for (const rec of empRecords) {
            totalHours += rec.hoursWorked;
          }
          // Convert to days * 10 (e.g., 200 = 20.0 days)
          const totalDaysTimes10 = Math.round(totalHours / 8);

          const amount = Math.round((totalDaysTimes10 / 10) * clientRate);
          subtotal += amount;

          items.push({
            employeeId: empId,
            description: `${emp?.nameKanji || `従業員${empId}`}`,
            quantity: totalDaysTimes10,
            unitPrice: clientRate,
            amount,
            unit: "日",
          });
        }

        const taxAmount = Math.round(subtotal * input.taxRate / 100);
        const totalAmount = subtotal + taxAmount;

        // Generate invoice number
        const yearMonth = input.periodStart.slice(0, 7);
        const invoiceNumber = await db.getNextInvoiceNumber(yearMonth);

        // Create invoice
        const invoice = await db.createInvoice({
          invoiceNumber,
          clientId: input.clientId,
          projectId: input.projectId,
          periodStart: new Date(input.periodStart),
          periodEnd: new Date(input.periodEnd),
          issueDate: new Date(),
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          subtotal,
          taxAmount,
          totalAmount,
          taxRate: input.taxRate,
          notes: input.notes || null,
          createdBy: ctx.user.id,
        });

        // Create invoice items
        for (const item of items) {
          await db.createInvoiceItem({
            invoiceId: invoice.id!,
            employeeId: item.employeeId,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            unit: item.unit,
          });
        }

        return { id: invoice.id, invoiceNumber, totalAmount };
      }),

    /** Generate PDF for an invoice */
    generatePdf: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const invoice = await db.getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const items = await db.getInvoiceItemsByInvoice(input.id);
        const company = await db.getCompanyProfile();

        // Get client name
        let clientName = "取引先";
        if (invoice.clientId) {
          const client = await db.getClientById(invoice.clientId);
          if (client) clientName = client.name;
        }

        const pdfBuffer = await generateInvoicePdf({ invoice, items, company, clientName });

        const fileName = `invoice_${invoice.invoiceNumber}_${Date.now()}.pdf`;
        const fileKey = `invoices/${fileName}`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Update invoice with PDF URL
        await db.updateInvoice(input.id, { pdfUrl: url });

        return { url, fileName };
      }),

    /** Update invoice status */
    updateStatus: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]),
      }))
      .mutation(async ({ input }) => {
        return db.updateInvoice(input.id, { status: input.status });
      }),

    /** Delete an invoice */
    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInvoice(input.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
