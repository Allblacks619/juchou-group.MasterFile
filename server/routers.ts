import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { storagePut } from "./storage";
import { TRPCError } from "@trpc/server";

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
});

export type AppRouter = typeof appRouter;
