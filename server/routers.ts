import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { parseDateString, parseDateRange } from "./dateHelpers";
import { isWorkedType } from "@shared/attendanceStatus";
import { storagePut } from "./storage";
import { validateFile, ALLOWED_MIME_TYPES, MAX_IMAGE_SIZE, MAX_PDF_SIZE } from "../shared/uploadValidation";
import * as schema from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateRosterPdf, generateRosterListPdf, generateMultiRosterPdf } from "./pdfRoster";
import { generateInvoicePdf } from "./pdfInvoice";
import { buildInvoiceDraftFromProjects } from "./invoiceBuilder";
import { resolveProjectMemberRatesForMonth, resolveWorkerPaymentRate } from "./rateResolver";

// ── Helper: check admin or leader role ──
const leaderOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.appRole !== "admin" && ctx.user.appRole !== "leader") {
    throw new TRPCError({ code: "FORBIDDEN", message: "管理者または責任者権限が必要です" });
  }
  return next({ ctx });
});

/** Recalculate invoice totals from items */
async function recalcInvoiceTotals(invoiceId: number) {
  const items = await db.getInvoiceItemsByInvoice(invoiceId);
  let subtotal = 0;
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    subtotal += item.amount;
    const rate = item.itemTaxRate;
    const existing = taxByRate.get(rate) || 0;
    taxByRate.set(rate, existing + item.amount);
  }
  let totalTax = 0;
  for (const [rate, base] of Array.from(taxByRate.entries())) {
    totalTax += Math.round(base * rate / 100);
  }
  await db.updateInvoice(invoiceId, {
    subtotal,
    taxAmount: totalTax,
    totalAmount: subtotal + totalTax,
  });
}




async function safeAuditLog(userId: number | null | undefined, action: string, entityType: string, meta: {
  entityId?: number | null;
  projectId?: number | null;
  closingId?: number | null;
  invoiceId?: number | null;
  employeeId?: number | null;
  note?: string | null;
  payload?: any;
} = {}) {
  try {
    await db.createAuditLog({
      action,
      entityType,
      entityId: meta.entityId ?? null,
      projectId: meta.projectId ?? null,
      closingId: meta.closingId ?? null,
      invoiceId: meta.invoiceId ?? null,
      employeeId: meta.employeeId ?? null,
      performedBy: userId ?? null,
      note: meta.note ?? null,
      payload: meta.payload ? JSON.stringify(meta.payload) : null,
    } as any);
  } catch (error) {
    console.warn("[AuditLog] failed:", error);
  }
}

function getMonthDateRange(closingMonth: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(closingMonth)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "closingMonth must be YYYY-MM" });
  }
  const [year, month] = closingMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

async function buildClosingDetail(projectId: number, closingMonth: string) {
  const closing = await db.getProjectClosingByProjectMonth(projectId, closingMonth);
  if (!closing?.id) return null;

  const project = await db.getProjectById(projectId);
  const [client, submissions, employees] = await Promise.all([
    project?.clientId ? db.getClientById(project.clientId) : Promise.resolve(null),
    db.getClosingSubmissionsByClosing(closing.id),
    db.getAllEmployees(),
  ]);

  const employeeMap = new Map<number, any>(employees.map((e: any) => [e.id, e]));
  const enrichedSubmissions = submissions
    .map((submission) => ({ ...submission, employee: employeeMap.get(submission.employeeId) || null }))
    .sort((a, b) => (a.employee?.nameKanji || "").localeCompare(b.employee?.nameKanji || "", "ja"));

  const targetSubmissions = enrichedSubmissions.filter((s) => s.status !== "not_required");
  const pendingCount = targetSubmissions.filter((s) => s.status === "pending" || s.status === "rejected").length;
  const submittedCount = targetSubmissions.filter((s) => s.status === "submitted" || s.status === "approved").length;
  const approvedCount = targetSubmissions.filter((s) => s.status === "approved").length;
  const receiptMissingCount = targetSubmissions.filter((s) => s.receiptRequired && !s.receiptUploaded).length;
  const canMarkReady = targetSubmissions.length > 0 && pendingCount === 0 && receiptMissingCount === 0;

  return {
    closing,
    project,
    client,
    submissions: enrichedSubmissions,
    summary: {
      targetCount: targetSubmissions.length,
      pendingCount,
      submittedCount,
      approvedCount,
      receiptMissingCount,
      canMarkReady,
    },
  };
}

function canInvoiceFromClosingStatus(status?: string | null) {
  return status === "ready" || status === "closed" || status === "locked";
}


function findBestWorkerRate(rates: any[], employeeId: number, shiftType: string) {
  return (
    rates.find((r) => r.employeeId === employeeId && r.shiftType === shiftType) ||
    rates.find((r) => r.employeeId === employeeId) ||
    rates.find((r) => !r.employeeId && r.shiftType === shiftType) ||
    rates.find((r) => !r.employeeId) ||
    null
  );
}

async function ensurePaymentRowsForProjectMonth(projectId: number, closingMonth: string) {
  const closing = await ensureClosingInitializedForProjectMonth(projectId, closingMonth);
  const submissions = await db.getClosingSubmissionsByClosing(closing.id!);
  const { start, end } = getMonthDateRange(closingMonth);
  const attendanceRecords = await db.getAttendanceByProject(projectId, start, end);

  const targetSubmissions = submissions.filter((s: any) => s.status !== "not_required");
  for (const submission of targetSubmissions) {
    const empRecords = attendanceRecords.filter((rec: any) => rec.employeeId === submission.employeeId);
    const byShift = new Map<string, number>();
    for (const rec of empRecords) {
      if (!rec.employeeId) continue;
      const shift = rec.shiftType || "day";
      byShift.set(shift, (byShift.get(shift) || 0) + (rec.hoursWorked || 0));
    }

    let baseDaysTimes10 = 0;
    let baseAmount = 0;
    for (const [shiftType, totalHoursTimes10] of Array.from(byShift.entries())) {
      const daysTimes10 = Math.round(totalHoursTimes10 / 8);
      if (daysTimes10 <= 0) continue;

      baseDaysTimes10 += daysTimes10;

      const sampleRecord = empRecords.find((rec: any) => (rec.shiftType || "day") === shiftType);
      const workDate = sampleRecord?.workDate
        ? (sampleRecord.workDate instanceof Date ? sampleRecord.workDate : new Date(sampleRecord.workDate))
        : start;

      const resolvedWorkerRate = await resolveWorkerPaymentRate({
        projectId,
        employeeId: submission.employeeId,
        shiftType,
        workDate,
      });

      baseAmount += Math.round((daysTimes10 / 10) * resolvedWorkerRate.rate);
    }

    const existing = await db.getEmployeePaymentByClosingEmployee(closing.id!, submission.employeeId);
    const adjustmentAmount = existing?.adjustmentAmount || 0;
    const totalAmount = baseAmount + (submission.transportAmount || 0) + (submission.expenseAmount || 0) + adjustmentAmount;

    await db.upsertEmployeePayment({
      closingId: closing.id!,
      employeeId: submission.employeeId,
      status: existing?.status || "pending",
      baseDaysTimes10,
      baseAmount,
      transportAmount: submission.transportAmount || 0,
      expenseAmount: submission.expenseAmount || 0,
      adjustmentAmount,
      totalAmount,
      paidAt: existing?.paidAt || null,
      paidBy: existing?.paidBy || null,
      notes: existing?.notes || null,
    } as any);
  }

  return closing;
}

function getMonthKeyFromDate(value?: Date | string | null) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 7);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getInvoiceReceivedAmount(invoice: any) {
  const received = Number(invoice.receivedAmount || 0);
  if (received > 0) return received;
  if (invoice.status === "paid") return Number(invoice.totalAmount || 0);
  return 0;
}

function getReceivableStatus(invoice: any): "pending" | "partial" | "received" | "overdue" | "cancelled" {
  if (invoice.status === "cancelled") return "cancelled";
  const expected = Number(invoice.totalAmount || 0);
  const received = getInvoiceReceivedAmount(invoice);
  if (expected > 0 && received >= expected) return "received";
  if (received > 0) return "partial";
  if (invoice.status === "overdue") return "overdue";
  if (invoice.dueDate) {
    const due = typeof invoice.dueDate === "string" ? new Date(invoice.dueDate) : invoice.dueDate;
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "overdue";
  }
  return "pending";
}

async function buildReceivableMonthSummary(closingMonth: string) {
  const [allInvoices, closings] = await Promise.all([
    db.getAllInvoices(),
    db.getProjectClosingsByMonth(closingMonth),
  ]);
  const invoicesForMonth = allInvoices.filter((invoice: any) => getMonthKeyFromDate(invoice.periodStart) === closingMonth && invoice.status !== "cancelled");
  const invoiceCount = invoicesForMonth.length;
  const expectedTotal = invoicesForMonth.reduce((sum: number, invoice: any) => sum + Number(invoice.totalAmount || 0), 0);
  const receivedTotal = invoicesForMonth.reduce((sum: number, invoice: any) => sum + getInvoiceReceivedAmount(invoice), 0);
  const outstandingTotal = Math.max(expectedTotal - receivedTotal, 0);

  let employeePaymentTotal = 0;
  let employeePaidTotal = 0;
  for (const closing of closings) {
    if (!closing?.id) continue;
    const payments = await db.getEmployeePaymentsByClosing(closing.id);
    employeePaymentTotal += payments.reduce((sum: number, payment: any) => sum + Number(payment.totalAmount || 0), 0);
    employeePaidTotal += payments.filter((payment: any) => payment.status === "paid").reduce((sum: number, payment: any) => sum + Number(payment.totalAmount || 0), 0);
  }

  return {
    invoiceCount,
    expectedTotal,
    receivedTotal,
    outstandingTotal,
    employeePaymentTotal,
    employeePaidTotal,
    cashBalance: receivedTotal - employeePaidTotal,
  };
}

async function buildPaymentDetail(projectId: number, closingMonth: string) {
  const closing = await ensurePaymentRowsForProjectMonth(projectId, closingMonth);
  const [project, closingsDetail, employees, payments] = await Promise.all([
    db.getProjectById(projectId),
    buildClosingDetail(projectId, closingMonth),
    db.getAllEmployees(),
    db.getEmployeePaymentsByClosing(closing.id!),
  ]);

  const employeeMap = new Map<number, any>(employees.map((e: any) => [e.id, e]));
  const submissionMap = new Map<number, any>((closingsDetail?.submissions || []).map((s: any) => [s.employeeId, s]));
  const rows = payments
    .map((payment: any) => ({
      payment,
      employee: employeeMap.get(payment.employeeId) || null,
      submission: submissionMap.get(payment.employeeId) || null,
    }))
    .sort((a: any, b: any) => (a.employee?.nameKanji || "").localeCompare(b.employee?.nameKanji || "", "ja"));

  const targetCount = rows.length;
  const paidCount = rows.filter((r: any) => r.payment.status === "paid").length;
  const confirmedCount = rows.filter((r: any) => r.payment.status === "confirmed").length;
  const unpaidCount = rows.filter((r: any) => r.payment.status !== "paid").length;
  const totalAmount = rows.reduce((sum: number, r: any) => sum + Number(r.payment.totalAmount || 0), 0);

  return {
    closing,
    project,
    client: closingsDetail?.client || null,
    payments: rows,
    summary: { targetCount, paidCount, confirmedCount, unpaidCount, totalAmount },
  };
}

async function ensureClosingInitializedForProjectMonth(projectId: number, closingMonth: string) {
  const existing = await db.getProjectClosingByProjectMonth(projectId, closingMonth);
  const closing = existing?.id
    ? existing
    : await db.createProjectClosing({
        projectId,
        closingMonth,
        status: "open",
        notes: null,
        closedAt: null,
        closedBy: null,
      });

  const { start, end } = getMonthDateRange(closingMonth);
  const [records, projectMembers] = await Promise.all([
    db.getAttendanceByProject(projectId, start, end),
    db.getProjectMembers(projectId),
  ]);

  const activeMemberIds = new Set(projectMembers.filter((m) => m.isActive).map((m) => m.employeeId));
  const targetEmployeeIds = Array.from(new Set(
    records
      .filter((rec) => !!rec.employeeId && activeMemberIds.has(rec.employeeId!))
      .map((rec) => rec.employeeId!)
  ));

  const existingSubmissions = await db.getClosingSubmissionsByClosing(closing.id!);
  const existingByEmployee = new Map<number, any>(existingSubmissions.map((s: any) => [s.employeeId, s]));

  for (const employeeId of targetEmployeeIds) {
    const prev = existingByEmployee.get(employeeId);
    await db.upsertClosingSubmission({
      closingId: closing.id!,
      employeeId,
      status: prev?.status && prev.status !== "not_required" ? prev.status : "pending",
      transportAmount: prev?.transportAmount || 0,
      expenseAmount: prev?.expenseAmount || 0,
      receiptRequired: prev?.receiptRequired || false,
      receiptUploaded: prev?.receiptUploaded || false,
      receiptFileUrl: prev?.receiptFileUrl || null,
      receiptFileName: prev?.receiptFileName || null,
      receiptFileKey: prev?.receiptFileKey || null,
      receiptMimeType: prev?.receiptMimeType || null,
      submittedAt: prev?.submittedAt || null,
      approvedAt: prev?.approvedAt || null,
      reviewedBy: prev?.reviewedBy || null,
      notes: prev?.notes || null,
    } as any);
  }

  for (const submission of existingSubmissions) {
    if (!targetEmployeeIds.includes(submission.employeeId)) {
      await db.updateClosingSubmission(submission.id, { status: "not_required" });
    }
  }

  return closing;
}

async function getMyClosingSubmission(projectId: number, closingMonth: string, userId: number) {
  const employee = await db.getEmployeeByUserId(userId);
  if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員情報が見つかりません" });

  const closing = await ensureClosingInitializedForProjectMonth(projectId, closingMonth);
  const detail = await buildClosingDetail(projectId, closingMonth);
  const submission = await db.getClosingSubmissionByClosingEmployee(closing.id!, employee.id);

  return {
    employee,
    closing,
    detail,
    submission,
    eligible: !!submission && submission.status !== "not_required",
  };
}

export const appRouter = router({
  system: systemRouter,

  diagnostic: router({
    runtimeInfo: protectedProcedure.query(() => {
      return {
        ok: true,
        sourceRepo: "Allblacks619/juchou-group.MasterFile",
        buildMarker: "masterfile-runtime-diagnostic-2026-04-28",
        timestamp: new Date().toISOString(),
        expectedProcedures: [
          "closing.generateForClosing",
          "closing.sameClientInvoiceCandidates",
          "invoice.generatePdf",
        ],
      };
    }),
  }),

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

    deleteExpired: leaderOrAdminProcedure
      .mutation(async () => {
        const count = await db.deleteExpiredInvitations();
        return { deleted: count };
      }),
    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteInvitation(input.id);
        return { success: true };
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
        const vErr = validateFile(input.fileName, input.mimeType, buffer.length);
        if (vErr) throw new TRPCError({ code: "BAD_REQUEST", message: vErr });
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
      let profile = await db.getEmployeeByUserId(ctx.user.id);
      if (!profile) {
        try {
          // Auto-create employee record for users who don't have one yet
          const userName = ctx.user.name || ctx.user.loginId || "未設定";
          const created = await db.createEmployee({
            nameKanji: userName,
            userId: ctx.user.id,
          });
          // Link employee to user
          const dbInstance = await db.getDb();
          if (dbInstance && created.id) {
            await dbInstance.update(schema.users).set({ employeeId: created.id }).where(eq(schema.users.id, ctx.user.id));
          }
          profile = await db.getEmployeeByUserId(ctx.user.id);
        } catch (error) {
          if (error instanceof Error && error.message === "Database not available") {
            return null;
          }
          throw error;
        }
      }
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
        insuranceNumberType: z.enum(["workers_comp", "employment"]).nullable().optional(),
        workersCompNumber: z.string().optional(),
        pensionNumber: z.string().optional(),
        careerUpNumber: z.string().optional(),
        employmentType: z.enum(["sole_proprietor", "employee", "other"]).nullable().optional(),
        employmentInsuranceNumber: z.string().optional(),
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
        if (input.dateOfBirth) data.dateOfBirth = parseDateString(input.dateOfBirth);
        if (input.residenceCardExpiry) data.residenceCardExpiry = parseDateString(input.residenceCardExpiry);
        if (input.passportExpiry) data.passportExpiry = parseDateString(input.passportExpiry);
        if (input.healthCheckDate) data.healthCheckDate = parseDateString(input.healthCheckDate);
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
        insuranceNumberType: z.enum(["workers_comp", "employment"]).optional(),
        workersCompNumber: z.string().optional(),
        pensionNumber: z.string().optional(),
        careerUpNumber: z.string().optional(),
        employmentType: z.enum(["sole_proprietor", "employee", "other"]).optional(),
        employmentInsuranceNumber: z.string().optional(),
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
        userId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const data: any = { ...input };
        // Convert date strings to Date objects
        if (input.dateOfBirth) data.dateOfBirth = parseDateString(input.dateOfBirth);
        if (input.residenceCardExpiry) data.residenceCardExpiry = parseDateString(input.residenceCardExpiry);
        if (input.passportExpiry) data.passportExpiry = parseDateString(input.passportExpiry);
        if (input.healthCheckDate) data.healthCheckDate = parseDateString(input.healthCheckDate);
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
        insuranceNumberType: z.enum(["workers_comp", "employment"]).optional(),
        workersCompNumber: z.string().optional(),
        pensionNumber: z.string().optional(),
        careerUpNumber: z.string().optional(),
        employmentType: z.enum(["sole_proprietor", "employee", "other"]).optional(),
        employmentInsuranceNumber: z.string().optional(),
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
        if (updateData.dateOfBirth) data.dateOfBirth = parseDateString(updateData.dateOfBirth);
        if (updateData.residenceCardExpiry) data.residenceCardExpiry = parseDateString(updateData.residenceCardExpiry);
        if (updateData.passportExpiry) data.passportExpiry = parseDateString(updateData.passportExpiry);
        if (updateData.healthCheckDate) data.healthCheckDate = parseDateString(updateData.healthCheckDate);
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
        type: z.enum(["photo", "stamp", "residence_card", "passport", "health_check", "qualification_cert", "id_document", "receipt", "invoice", "other", "residence_card_front", "residence_card_back", "drivers_license_front", "drivers_license_back", "insurance_card", "pension_book", "ccus_card", "drivers_license"]),
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

        // Validate file type, extension, and size
        const buffer = Buffer.from(input.base64, "base64");
        const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
        if (validationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
        }
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
          expiryDate: input.expiryDate ? parseDateString(input.expiryDate) : undefined,
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
        certificateBase64: z.string().optional(),
        certificateMimeType: z.string().optional(),
        certificateFileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        if (ctx.user.appRole === "worker" && employee.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        let certificateFileUrl: string | undefined;
        let certificateFileKey: string | undefined;
        if (input.certificateBase64 && input.certificateFileName) {
          const buffer = Buffer.from(input.certificateBase64, "base64");
          const vErr = validateFile(input.certificateFileName, input.certificateMimeType || "application/octet-stream", buffer.length);
          if (vErr) throw new TRPCError({ code: "BAD_REQUEST", message: vErr });
          const suffix = nanoid(8);
          const key = `employees/${input.employeeId}/qualifications/${suffix}-${input.certificateFileName}`;
          const { url } = await storagePut(key, buffer, input.certificateMimeType || "application/octet-stream");
          certificateFileUrl = url;
          certificateFileKey = key;
        }
        return db.createQualification({
          employeeId: input.employeeId,
          name: input.name,
          obtainedDate: input.obtainedDate ? parseDateString(input.obtainedDate) : undefined,
          certificateNumber: input.certificateNumber,
          certificateFileUrl,
          certificateFileKey,
        });
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().optional(),
        obtainedDate: z.string().optional(),
        certificateNumber: z.string().optional(),
        certificateBase64: z.string().optional(),
        certificateMimeType: z.string().optional(),
        certificateFileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, certificateBase64, certificateMimeType, certificateFileName, ...data } = input;
        const updateData: any = { ...data };
        if (data.obtainedDate) updateData.obtainedDate = parseDateString(data.obtainedDate);
        if (certificateBase64 && certificateFileName) {
          const buffer = Buffer.from(certificateBase64, "base64");
          const vErr = validateFile(certificateFileName, certificateMimeType || "application/octet-stream", buffer.length);
          if (vErr) throw new TRPCError({ code: "BAD_REQUEST", message: vErr });
          const suffix = nanoid(8);
          const key = `qualifications/${id}/${suffix}-${certificateFileName}`;
          const { url } = await storagePut(key, buffer, certificateMimeType || "application/octet-stream");
          updateData.certificateFileUrl = url;
          updateData.certificateFileKey = key;
        }
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
      .mutation(async ({ ctx, input }) => {
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
        if (input.startDate) data.startDate = parseDateString(input.startDate);
        if (input.endDate) data.endDate = parseDateString(input.endDate);
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
        if (updateData.startDate) data.startDate = parseDateString(updateData.startDate);
        if (updateData.endDate) data.endDate = parseDateString(updateData.endDate);
        return db.updateProject(id, data);
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteProject(input.id);
        return { success: true };
      }),

    /** List project members */
    members: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ input }) => {
        const members = await db.getProjectMembers(input.projectId);
        const allEmployees = await db.getAllEmployees();
        const empMap = new Map<number, any>(allEmployees.map((e: any) => [e.id, e]));
        return members.map(m => ({
          ...m,
          employee: empMap.get(m.employeeId) || null,
        }));
      }),

    /** Add member to project */
    addMember: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        employeeId: z.number(),
        projectRole: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.addProjectMember({
          projectId: input.projectId,
          employeeId: input.employeeId,
          projectRole: input.projectRole || null,
          addedBy: ctx.user.id,
        });
      }),

    /** Remove member from project */
    removeMember: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        employeeId: z.number(),
      }))
      .mutation(async ({ input }) => {
        await db.removeProjectMember(input.projectId, input.employeeId);
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
        if (input.effectiveFrom) data.effectiveFrom = parseDateString(input.effectiveFrom);
        if (input.effectiveUntil) data.effectiveUntil = parseDateString(input.effectiveUntil);
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
        if (updateData.effectiveFrom) data.effectiveFrom = parseDateString(updateData.effectiveFrom);
        if (updateData.effectiveUntil) data.effectiveUntil = parseDateString(updateData.effectiveUntil);
        return db.updateEmployeeRate(id, data);
      }),

    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteEmployeeRate(input.id);
        return { success: true };
      }),

    resolvePreview: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .query(async ({ input }) => resolveProjectMemberRatesForMonth(input)),
  }),

  workerBaseRate: router({
    listAll: leaderOrAdminProcedure.query(async () => db.getAllWorkerBaseRates()),
    listByEmployee: leaderOrAdminProcedure
      .input(z.object({ employeeId: z.number() }))
      .query(async ({ input }) => db.getWorkerBaseRatesByEmployee(input.employeeId)),
    create: leaderOrAdminProcedure
      .input(z.object({
        employeeId: z.number(),
        shiftType: z.enum(["day", "night"]).default("day"),
        workerRate: z.number().min(0),
        effectiveFrom: z.string().nullable().optional(),
        effectiveUntil: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => db.createWorkerBaseRate({
        employeeId: input.employeeId,
        shiftType: input.shiftType,
        workerRate: input.workerRate,
        effectiveFrom: input.effectiveFrom ? parseDateString(input.effectiveFrom) : null,
        effectiveUntil: input.effectiveUntil ? parseDateString(input.effectiveUntil) : null,
        notes: input.notes || null,
      } as any)),
    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        shiftType: z.enum(["day", "night"]).optional(),
        workerRate: z.number().min(0).optional(),
        effectiveFrom: z.string().nullable().optional(),
        effectiveUntil: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...rest } = input;
        return db.updateWorkerBaseRate(id, {
          ...rest,
          effectiveFrom: rest.effectiveFrom ? parseDateString(rest.effectiveFrom) : rest.effectiveFrom === null ? null : undefined,
          effectiveUntil: rest.effectiveUntil ? parseDateString(rest.effectiveUntil) : rest.effectiveUntil === null ? null : undefined,
        } as any);
      }),
    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteWorkerBaseRate(input.id);
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
        const startRange = parseDateRange(input.startDate);
        const endRange = parseDateRange(input.endDate);
        return db.getAttendanceByDateRange(
          startRange.start,
          endRange.end,
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
          input.startDate ? parseDateRange(input.startDate).start : undefined,
          input.endDate ? parseDateRange(input.endDate).end : undefined,
        );
      }),

    /** Upsert a single attendance record (admin/leader or project member) */
    upsert: leaderOrAdminProcedure
      .input(z.object({
        employeeId: z.number().nullable().optional(),
        guestName: z.string().optional(),
        projectId: z.number(),
        workDate: z.string(),
        hoursWorked: z.number().default(80),
        overtimeHours: z.number().default(0),
        workType: z.enum(["normal", "half_day", "overtime", "holiday", "absence", "day_off"]).default("normal"),
        shiftType: z.enum(["day", "night"]).default("day"),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertAttendance({
          employeeId: input.employeeId ?? null,
          guestName: input.guestName || null,
          projectId: input.projectId,
          workDate: parseDateString(input.workDate),
          hoursWorked: input.hoursWorked,
          overtimeHours: input.overtimeHours,
          workType: input.workType,
          shiftType: input.shiftType,
          notes: input.notes || null,
          enteredBy: ctx.user.id,
        });
      }),

    /** Batch upsert attendance records (for grid entry) */
    batchUpsert: leaderOrAdminProcedure
      .input(z.object({
        records: z.array(z.object({
          employeeId: z.number().nullable().optional(),
          guestName: z.string().optional(),
          projectId: z.number(),
          workDate: z.string(),
          hoursWorked: z.number().default(80),
          overtimeHours: z.number().default(0),
          workType: z.enum(["normal", "half_day", "overtime", "holiday", "absence", "day_off"]).default("normal"),
          shiftType: z.enum(["day", "night"]).default("day"),
          notes: z.string().optional(),
        })),
        deletes: z.array(z.object({
          employeeId: z.number().nullable().optional(),
          guestName: z.string().optional(),
          projectId: z.number(),
          workDate: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const results = [];
        // Upsert records with hours > 0
        for (const rec of input.records) {
          const result = await db.upsertAttendance({
            employeeId: rec.employeeId ?? null,
            guestName: rec.guestName || null,
            projectId: rec.projectId,
            workDate: parseDateString(rec.workDate),
            hoursWorked: rec.hoursWorked,
            overtimeHours: rec.overtimeHours,
            workType: rec.workType,
            shiftType: rec.shiftType,
            notes: rec.notes || null,
            enteredBy: ctx.user.id,
          });
          results.push(result);
        }
        // Delete records that were cleared (hoursWorked = 0)
        let deletedCount = 0;
        if (input.deletes) {
          for (const del of input.deletes) {
            await db.deleteAttendanceByKey({
              employeeId: del.employeeId ?? null,
              guestName: del.guestName || null,
              projectId: del.projectId,
              workDate: parseDateString(del.workDate),
            });
            deletedCount++;
          }
        }
        return { count: results.length + deletedCount };
      }),

    /** Delete an attendance record */
    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAttendance(input.id);
        return { success: true };
      }),

    /** Batch upsert MY OWN attendance records (worker self-service) */
    myBatchUpsert: protectedProcedure
      .input(z.object({
        records: z.array(z.object({
          projectId: z.number(),
          workDate: z.string(),
          hoursWorked: z.number().default(80),
          overtimeHours: z.number().default(0),
          workType: z.enum(["normal", "half_day", "overtime", "holiday", "absence", "day_off"]).default("normal"),
          shiftType: z.enum(["day", "night"]).default("day"),
          notes: z.string().optional(),
        })),
        deletes: z.array(z.object({
          projectId: z.number(),
          workDate: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員情報が見つかりません" });
        const results = [];
        for (const rec of input.records) {
          const result = await db.upsertAttendance({
            employeeId: employee.id,
            guestName: null,
            projectId: rec.projectId,
            workDate: parseDateString(rec.workDate),
            hoursWorked: rec.hoursWorked,
            overtimeHours: rec.overtimeHours,
            workType: rec.workType,
            shiftType: rec.shiftType,
            notes: rec.notes || null,
            enteredBy: ctx.user.id,
          });
          results.push(result);
        }
        let deletedCount = 0;
        if (input.deletes) {
          for (const del of input.deletes) {
            await db.deleteAttendanceByKey({
              employeeId: employee.id,
              guestName: null,
              projectId: del.projectId,
              workDate: parseDateString(del.workDate),
            });
            deletedCount++;
          }
        }
        return { count: results.length + deletedCount };
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
          parseDateRange(input.startDate).start,
          parseDateRange(input.endDate).end,
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
          parseDateRange(input.startDate).start,
          parseDateRange(input.endDate).end,
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
    generatePdf: leaderOrAdminProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
        projectId: z.number(),
      }))
       .mutation(async ({ input }) => {
        // Use UTC dates to avoid timezone shifts
        const startDate = new Date(Date.UTC(input.year, input.month - 1, 1, 0, 0, 0));
        const endDate = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59));
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

    /** Generate Excel for attendance */
    generateExcel: leaderOrAdminProcedure
      .input(z.object({
        year: z.number(),
        month: z.number().min(1).max(12),
        projectId: z.number(),
      }))
      .mutation(async ({ input }) => {
        // Use UTC dates to avoid timezone shifts
        const startDate = new Date(Date.UTC(input.year, input.month - 1, 1, 0, 0, 0));
        const endDate = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59));
        const records = await db.getAttendanceByDateRange(startDate, endDate, input.projectId);
        const allEmployees = await db.getAllEmployees();
        const projects = await db.getAllProjects();
        const project = projects.find(p => p.id === input.projectId);
        const empIds = new Set<number>();
        const guestNameSet = new Set<string>();;
        for (const rec of records) {
          if (rec.employeeId) empIds.add(rec.employeeId);
          if (rec.guestName) guestNameSet.add(rec.guestName);
        }

        const employees = allEmployees
          .filter(e => empIds.has(e.id))
          .map(e => ({ id: e.id, nameKanji: e.nameKanji || e.nameRomaji || `ID:${e.id}` }));

        const { generateAttendanceExcel } = await import("./excelAttendance");
        const excelBuffer = await generateAttendanceExcel({
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
        const fileName = `attendance-${input.year}-${String(input.month).padStart(2, "0")}-${input.projectId}.xlsx`;
        const { url } = await storagePut(
          `attendance/${fileName}`,
          excelBuffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        return { url, fileName };
      }),
  }),

  // ── Invoices (請求書) ──
  closing: router({
    listByMonth: leaderOrAdminProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const [projects, clients, closings] = await Promise.all([
          db.getAllProjects(),
          db.getAllClients(),
          db.getProjectClosingsByMonth(input.closingMonth),
        ]);
        const clientMap = new Map<number, any>(clients.map((c: any) => [c.id, c]));
        const closingMap = new Map<number, any>(closings.map((c: any) => [c.projectId, c]));

        const rows = await Promise.all(
          projects.map(async (project) => {
            const closing = closingMap.get(project.id) || null;
            if (!closing?.id) {
              return {
                project,
                client: project.clientId ? clientMap.get(project.clientId) || null : null,
                closing: null,
                summary: {
                  targetCount: 0,
                  pendingCount: 0,
                  submittedCount: 0,
                  approvedCount: 0,
                  receiptMissingCount: 0,
                  canMarkReady: false,
                },
              };
            }
            const detail = await buildClosingDetail(project.id, input.closingMonth);
            return {
              project,
              client: project.clientId ? clientMap.get(project.clientId) || null : null,
              closing,
              summary: detail?.summary || {
                targetCount: 0,
                pendingCount: 0,
                submittedCount: 0,
                approvedCount: 0,
                receiptMissingCount: 0,
                canMarkReady: false,
              },
            };
          })
        );

        return rows.sort((a, b) => a.project.name.localeCompare(b.project.name, "ja"));
      }),

    get: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        return buildClosingDetail(input.projectId, input.closingMonth);
      }),

    initialize: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureClosingInitializedForProjectMonth(input.projectId, input.closingMonth);
        await safeAuditLog(ctx.user.id, "closing.initialize", "closing", { projectId: input.projectId, note: `${input.closingMonth} を初期化` });
        return buildClosingDetail(input.projectId, input.closingMonth);
      }),

    updateSubmission: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["not_required", "pending", "submitted", "approved", "rejected"]).optional(),
        transportAmount: z.number().min(0).optional(),
        expenseAmount: z.number().min(0).optional(),
        receiptUploaded: z.boolean().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getClosingSubmissionById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "提出行が見つかりません" });

        const nextTransport = input.transportAmount ?? current.transportAmount;
        const nextExpense = input.expenseAmount ?? current.expenseAmount;
        const receiptRequired = nextTransport > 0 || nextExpense > 0;
        const nextStatus = input.status ?? current.status;

        const updateData: any = {
          status: nextStatus,
          transportAmount: nextTransport,
          expenseAmount: nextExpense,
          receiptRequired,
          receiptUploaded: input.receiptUploaded ?? current.receiptUploaded,
          notes: input.notes !== undefined ? input.notes : current.notes,
        };
        if (!receiptRequired) {
          updateData.receiptUploaded = false;
          updateData.receiptFileUrl = null;
          updateData.receiptFileName = null;
          updateData.receiptFileKey = null;
          updateData.receiptMimeType = null;
        }
        if (nextStatus === "submitted" && !current.submittedAt) updateData.submittedAt = new Date();
        if (nextStatus === "approved") {
          updateData.approvedAt = new Date();
          updateData.reviewedBy = ctx.user.id;
        }
        if (nextStatus === "rejected") updateData.approvedAt = null;

        await db.updateClosingSubmission(input.id, updateData);
        await safeAuditLog(ctx.user.id, "submission.update", "submission", { entityId: input.id, closingId: current.closingId, employeeId: current.employeeId, note: `提出状態を更新: ${nextStatus}` });
        return { success: true };
      }),

    uploadReceipt: leaderOrAdminProcedure
      .input(z.object({
        submissionId: z.number(),
        base64: z.string(),
        mimeType: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const submission = await db.getClosingSubmissionById(input.submissionId);
        if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "提出行が見つかりません" });
        const closing = await db.getProjectClosingById(submission.closingId);
        if (!closing) throw new TRPCError({ code: "NOT_FOUND", message: "締めデータが見つかりません" });
        if (closing.status === "closed" || closing.status === "locked") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "締め済みデータにはアップロードできません" });
        }

        const buffer = Buffer.from(input.base64, "base64");
        const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
        if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
        const suffix = nanoid(8);
        const fileKey = `closings/${submission.closingId}/employee-${submission.employeeId}/receipt-${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        await db.updateClosingSubmission(input.submissionId, {
          receiptUploaded: true,
          receiptRequired: true,
          receiptFileUrl: url,
          receiptFileName: input.fileName,
          receiptFileKey: fileKey,
          receiptMimeType: input.mimeType,
          reviewedBy: ctx.user.id,
        } as any);
        await safeAuditLog(ctx.user.id, "submission.uploadReceipt", "submission", { entityId: input.submissionId, closingId: submission.closingId, employeeId: submission.employeeId, note: `領収書アップロード: ${input.fileName}` });
        return { url, fileName: input.fileName };
      }),

    clearReceipt: leaderOrAdminProcedure
      .input(z.object({ submissionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const submission = await db.getClosingSubmissionById(input.submissionId);
        if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "提出行が見つかりません" });
        await db.updateClosingSubmission(input.submissionId, {
          receiptUploaded: false,
          receiptFileUrl: null,
          receiptFileName: null,
          receiptFileKey: null,
          receiptMimeType: null,
        } as any);
        await safeAuditLog(ctx.user.id, "submission.clearReceipt", "submission", { entityId: input.submissionId, closingId: submission.closingId, employeeId: submission.employeeId, note: "領収書解除" });
        return { success: true };
      }),

    mySubmission: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        return {
          eligible: result.eligible,
          closing: result.detail?.closing || result.closing,
          project: result.detail?.project || null,
          client: result.detail?.client || null,
          submission: result.submission || null,
          summary: result.detail?.summary || null,
        };
      }),

    saveMySubmission: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        transportAmount: z.number().min(0),
        expenseAmount: z.number().min(0),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (result.closing.status === "closed" || result.closing.status === "locked") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "締め済みデータは編集できません" });
        }
        const receiptRequired = input.transportAmount > 0 || input.expenseAmount > 0;
        let nextStatus = result.submission.status;
        if (["submitted", "approved", "rejected"].includes(nextStatus)) nextStatus = "pending";
        const updateData: any = {
          transportAmount: input.transportAmount,
          expenseAmount: input.expenseAmount,
          receiptRequired,
          status: nextStatus,
          notes: input.notes || null,
        };
        if (nextStatus === "pending") {
          updateData.approvedAt = null;
          updateData.reviewedBy = null;
        }
        if (!receiptRequired) {
          updateData.receiptUploaded = false;
          updateData.receiptFileUrl = null;
          updateData.receiptFileName = null;
          updateData.receiptFileKey = null;
          updateData.receiptMimeType = null;
        }
        await db.updateClosingSubmission(result.submission.id, updateData);
        await safeAuditLog(ctx.user.id, "submission.saveMySubmission", "submission", { entityId: result.submission.id, projectId: input.projectId, closingId: result.closing.id, employeeId: result.submission.employeeId, note: `${input.closingMonth} の提出内容を保存` });
        return { success: true };
      }),

    submitMySubmission: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (result.closing.status === "closed" || result.closing.status === "locked") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "締め済みデータは提出できません" });
        }
        if (result.submission.receiptRequired && !result.submission.receiptUploaded) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "領収書を添付してから提出してください" });
        }
        await db.updateClosingSubmission(result.submission.id, {
          status: "submitted",
          submittedAt: new Date(),
          approvedAt: null,
          reviewedBy: null,
        });
        await safeAuditLog(ctx.user.id, "submission.submit", "submission", { entityId: result.submission.id, projectId: input.projectId, closingId: result.closing.id, employeeId: result.submission.employeeId, note: `${input.closingMonth} を提出` });
        return { success: true };
      }),

    uploadMyReceipt: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        base64: z.string(),
        mimeType: z.string(),
        fileName: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (result.closing.status === "closed" || result.closing.status === "locked") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "締め済みデータにはアップロードできません" });
        }
        const buffer = Buffer.from(input.base64, "base64");
        const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
        if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
        const suffix = nanoid(8);
        const fileKey = `closings/${result.submission.closingId}/employee-${result.submission.employeeId}/receipt-${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await db.updateClosingSubmission(result.submission.id, {
          receiptUploaded: true,
          receiptRequired: true,
          receiptFileUrl: url,
          receiptFileName: input.fileName,
          receiptFileKey: fileKey,
          receiptMimeType: input.mimeType,
          status: result.submission.status === "approved" ? "pending" : result.submission.status,
          approvedAt: null,
          reviewedBy: null,
        } as any);
        await safeAuditLog(ctx.user.id, "submission.uploadMyReceipt", "submission", { entityId: result.submission.id, projectId: input.projectId, closingId: result.closing.id, employeeId: result.submission.employeeId, note: `自分の領収書アップロード: ${input.fileName}` });
        return { url, fileName: input.fileName };
      }),

    clearMyReceipt: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        await db.updateClosingSubmission(result.submission.id, {
          receiptUploaded: false,
          receiptFileUrl: null,
          receiptFileName: null,
          receiptFileKey: null,
          receiptMimeType: null,
          status: result.submission.status === "approved" ? "pending" : result.submission.status,
          approvedAt: null,
          reviewedBy: null,
        } as any);
        await safeAuditLog(ctx.user.id, "submission.clearMyReceipt", "submission", { entityId: result.submission.id, projectId: input.projectId, closingId: result.closing.id, employeeId: result.submission.employeeId, note: "自分の領収書解除" });
        return { success: true };
      }),

    markReady: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const detail = await buildClosingDetail(input.projectId, input.closingMonth);
        if (!detail?.closing?.id) throw new TRPCError({ code: "NOT_FOUND", message: "締めデータが見つかりません" });
        if (!detail.summary.canMarkReady) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "未提出または領収書不足があるため ready にできません" });
        }
        await db.updateProjectClosing(detail.closing.id, { status: "ready" });
        await safeAuditLog(ctx.user.id, "closing.markReady", "closing", { entityId: detail.closing.id, projectId: input.projectId, closingId: detail.closing.id, note: `${input.closingMonth} を ready 化` });
        return buildClosingDetail(input.projectId, input.closingMonth);
      }),

    close: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const detail = await buildClosingDetail(input.projectId, input.closingMonth);
        if (!detail?.closing?.id) throw new TRPCError({ code: "NOT_FOUND", message: "締めデータが見つかりません" });
        if (detail.closing.status !== "ready") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "ready 状態の締めのみ閉じられます" });
        }
        await db.updateProjectClosing(detail.closing.id, {
          status: "closed",
          closedAt: new Date(),
          closedBy: ctx.user.id,
        });
        await safeAuditLog(ctx.user.id, "closing.close", "closing", { entityId: detail.closing.id, projectId: input.projectId, closingId: detail.closing.id, note: `${input.closingMonth} を締め完了` });
        return buildClosingDetail(input.projectId, input.closingMonth);
      }),

    reopen: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const detail = await buildClosingDetail(input.projectId, input.closingMonth);
        if (!detail?.closing?.id) throw new TRPCError({ code: "NOT_FOUND", message: "締めデータが見つかりません" });
        await db.updateProjectClosing(detail.closing.id, {
          status: "open",
          closedAt: null,
          closedBy: null,
        });
        await safeAuditLog(ctx.user.id, "closing.reopen", "closing", { entityId: detail.closing.id, projectId: input.projectId, closingId: detail.closing.id, note: `${input.closingMonth} を再開` });
        return buildClosingDetail(input.projectId, input.closingMonth);
      }),

    /** Generate invoice draft for closing */
    generateForClosing: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number().optional(),
        projectIds: z.array(z.number()).optional(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const selectedProjectIds = input.projectIds?.length
          ? Array.from(new Set(input.projectIds.map(Number).filter(Boolean)))
          : input.projectId ? [input.projectId] : [];
        if (!selectedProjectIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "案件が選択されていません" });
        }
        const { start, end } = getMonthDateRange(input.closingMonth);
        const draft = await buildInvoiceDraftFromProjects({
          projectIds: selectedProjectIds,
          periodStart: start,
          periodEnd: end,
          allowedClosingStatuses: ["ready", "closed", "locked"],
          taxRate: 10,
          includeProjectSectionHeaders: selectedProjectIds.length > 1,
        });
        const billableItems = draft.items.filter((item: any) => item.itemType !== "text");
        if (!billableItems.length || Number(draft.totalAmount || 0) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "請求対象データがありません。空または0円の請求書ドラフトは作成できません。",
          });
        }
        const invoiceNumber = await db.getNextInvoiceNumber(input.closingMonth);
        const invoice = await db.createInvoice({
          invoiceNumber,
          clientId: draft.clientId,
          projectId: draft.primaryProjectId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          issueDate: new Date(),
          dueDate: null,
          subtotal: draft.subtotal,
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          taxRate: 10,
          status: "draft",
          notes: null,
          internalMemo: `closing draft / projectIds=${draft.projectIds.join(",")}`,
          pdfUrl: null,
          receivedAmount: 0,
          receivedAt: null,
          receivedBy: null,
          paymentMemo: null,
          createdBy: ctx.user.id,
          honorific: "御中",
          subNumber: null,
          paymentMethod: "口座振込",
          subject: draft.subject,
          showSeal: true,
          showLogo: true,
          withholding: !!draft.withholdingAmount,
          withholdingAmount: draft.withholdingAmount,
        } as any);
        for (const item of draft.items) {
          await db.createInvoiceItem({
            invoiceId: invoice.id,
            employeeId: item.employeeId,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: item.amount,
            itemTaxRate: item.itemTaxRate,
            sortOrder: item.sortOrder,
            notes: item.notes || null,
          } as any);
        }
        await safeAuditLog(ctx.user.id, "invoice_draft_created_from_closing", "invoice", {
          invoiceId: invoice.id,
          projectId: draft.primaryProjectId,
          note: "Created editable invoice draft from monthly closing. PDF not generated yet.",
          payload: {
            closingMonth: input.closingMonth,
            projectIds: draft.projectIds,
            subtotal: draft.subtotal,
            taxAmount: draft.taxAmount,
            totalAmount: draft.totalAmount,
          },
        });
        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: draft.totalAmount,
          status: "draft",
          editUrl: `/app/invoices?invoiceId=${invoice.id}`,
          message: "請求書ドラフトを作成しました。PDF出力前に内容を確認・編集してください。",
        };
      }),

    sameClientInvoiceCandidates: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        const currentProject = await db.getProjectById(input.projectId);
        if (!currentProject?.clientId) return [];
        const allProjects = await db.getAllProjects();
        const sameClientProjects = allProjects.filter(
          (project: any) => Number(project.clientId) === Number(currentProject.clientId)
        );
        const rows = [];
        for (const project of sameClientProjects) {
          const closing = await db.getProjectClosingByProjectMonth(project.id, input.closingMonth);
          if (closing && ["ready", "closed", "locked"].includes(closing.status)) {
            rows.push({ project, closing });
          }
        }
        return rows.sort((a: any, b: any) => a.project.name.localeCompare(b.project.name, "ja"));
      }),
  }),


  payment: router({
    listByMonth: leaderOrAdminProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const [projects, clients, closings] = await Promise.all([
          db.getAllProjects(),
          db.getAllClients(),
          db.getProjectClosingsByMonth(input.closingMonth),
        ]);
        const clientMap = new Map<number, any>(clients.map((c: any) => [c.id, c]));

        const rows = await Promise.all(projects.map(async (project) => {
          const closing = closings.find((c: any) => c.projectId === project.id && c.closingMonth === input.closingMonth) || null;
          if (!closing?.id) {
            return {
              project,
              client: project.clientId ? clientMap.get(project.clientId) || null : null,
              closing: null,
              summary: { targetCount: 0, paidCount: 0, confirmedCount: 0, unpaidCount: 0, totalAmount: 0 },
            };
          }
          const payments = await db.getEmployeePaymentsByClosing(closing.id);
          const targetCount = payments.length;
          const paidCount = payments.filter((p: any) => p.status === "paid").length;
          const confirmedCount = payments.filter((p: any) => p.status === "confirmed").length;
          const unpaidCount = payments.filter((p: any) => p.status !== "paid").length;
          const totalAmount = payments.reduce((sum: number, p: any) => sum + Number(p.totalAmount || 0), 0);
          return {
            project,
            client: project.clientId ? clientMap.get(project.clientId) || null : null,
            closing,
            summary: { targetCount, paidCount, confirmedCount, unpaidCount, totalAmount },
          };
        }));

        return rows.sort((a: any, b: any) => a.project.name.localeCompare(b.project.name, "ja"));
      }),

    get: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        return await buildPaymentDetail(input.projectId, input.closingMonth);
      }),

    refresh: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        await ensurePaymentRowsForProjectMonth(input.projectId, input.closingMonth);
        const refreshed = await buildPaymentDetail(input.projectId, input.closingMonth);
        await safeAuditLog(ctx.user.id, "payment.refresh", "payment", { projectId: input.projectId, closingId: refreshed?.closing?.id || null, note: `${input.closingMonth} の支払行を再計算` });
        return refreshed;

      }),

    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        adjustmentAmount: z.number().optional(),
        notes: z.string().optional(),
        status: z.enum(["pending", "confirmed", "paid"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getEmployeePaymentById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "支払行が見つかりません" });
        const adjustmentAmount = input.adjustmentAmount ?? current.adjustmentAmount;
        const totalAmount = Number(current.baseAmount || 0) + Number(current.transportAmount || 0) + Number(current.expenseAmount || 0) + Number(adjustmentAmount || 0);
        await db.updateEmployeePayment(input.id, {
          adjustmentAmount,
          totalAmount,
          notes: input.notes !== undefined ? input.notes : current.notes,
          status: input.status || current.status,
        } as any);
        await safeAuditLog(ctx.user.id, "payment.update", "payment", { entityId: input.id, closingId: current.closingId, employeeId: current.employeeId, note: `支払行更新: ${totalAmount}円` });
        return { success: true };
      }),

    markPaid: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getEmployeePaymentById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "支払行が見つかりません" });
        await db.updateEmployeePayment(input.id, { status: "paid", paidAt: new Date(), paidBy: ctx.user.id } as any);
        await safeAuditLog(ctx.user.id, "payment.markPaid", "payment", { entityId: input.id, closingId: current.closingId, employeeId: current.employeeId, note: `支払済みに変更 (${Number(current.totalAmount || 0)}円)` });
        return { success: true };
      }),

    markUnpaid: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getEmployeePaymentById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "支払行が見つかりません" });
        await db.updateEmployeePayment(input.id, { status: "pending", paidAt: null, paidBy: null } as any);
        await safeAuditLog(ctx.user.id, "payment.markUnpaid", "payment", { entityId: input.id, closingId: current.closingId, employeeId: current.employeeId, note: "支払済み解除" });
        return { success: true };
      }),
  }),

  receivable: router({
    listByMonth: leaderOrAdminProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const [invoices, clients, projects, summary] = await Promise.all([
          db.getAllInvoices(),
          db.getAllClients(),
          db.getAllProjects(),
          buildReceivableMonthSummary(input.closingMonth),
        ]);
        const clientMap = new Map<number, any>(clients.map((c: any) => [c.id, c]));
        const projectMap = new Map<number, any>(projects.map((p: any) => [p.id, p]));
        const rows = invoices
          .filter((invoice: any) => getMonthKeyFromDate(invoice.periodStart) === input.closingMonth)
          .map((invoice: any) => {
            const receivedAmount = getInvoiceReceivedAmount(invoice);
            return {
              invoice,
              client: clientMap.get(invoice.clientId) || null,
              project: invoice.projectId ? projectMap.get(invoice.projectId) || null : null,
              receivedAmount,
              outstandingAmount: Math.max(Number(invoice.totalAmount || 0) - receivedAmount, 0),
              receivableStatus: getReceivableStatus(invoice),
            };
          })
          .sort((a: any, b: any) => {
            const ad = a.invoice.dueDate ? new Date(a.invoice.dueDate).getTime() : 0;
            const bd = b.invoice.dueDate ? new Date(b.invoice.dueDate).getTime() : 0;
            return ad - bd;
          });
        return { rows, summary };
      }),

    get: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const invoice = await db.getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
        const [client, project, monthSummary] = await Promise.all([
          invoice.clientId ? db.getClientById(invoice.clientId) : Promise.resolve(null),
          invoice.projectId ? db.getProjectById(invoice.projectId) : Promise.resolve(null),
          buildReceivableMonthSummary(getMonthKeyFromDate(invoice.periodStart)),
        ]);
        const receivedAmount = getInvoiceReceivedAmount(invoice);
        return {
          invoice,
          client,
          project,
          receivedAmount,
          outstandingAmount: Math.max(Number(invoice.totalAmount || 0) - receivedAmount, 0),
          receivableStatus: getReceivableStatus(invoice),
          monthSummary,
        };
      }),

    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        receivedAmount: z.number().optional(),
        receivedAt: z.string().optional(),
        paymentMemo: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getInvoiceById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
        const receivedAmount = input.receivedAmount ?? Number(current.receivedAmount || 0);
        const expected = Number(current.totalAmount || 0);
        const dueDate = current.dueDate ? new Date(current.dueDate) : null;
        let status: any = current.status;
        if (current.status !== "cancelled") {
          if (expected > 0 && receivedAmount >= expected) status = "paid";
          else if (dueDate && dueDate.getTime() < Date.now()) status = "overdue";
          else status = current.status === "draft" ? "draft" : "sent";
        }
        await db.updateInvoice(input.id, {
          receivedAmount,
          receivedAt: input.receivedAt ? parseDateString(input.receivedAt) : current.receivedAt,
          receivedBy: receivedAmount > 0 ? ctx.user.id : current.receivedBy,
          paymentMemo: input.paymentMemo !== undefined ? input.paymentMemo : current.paymentMemo,
          status,
        } as any);
        await safeAuditLog(ctx.user.id, "receivable.update", "receivable", { entityId: input.id, invoiceId: input.id, note: `入金情報更新: ${receivedAmount}円` });
        return { success: true };
      }),

    markReceived: leaderOrAdminProcedure
      .input(z.object({ id: z.number(), receivedAmount: z.number().optional(), receivedAt: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getInvoiceById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
        const receivedAmount = input.receivedAmount ?? Number(current.totalAmount || 0);
        await db.updateInvoice(input.id, {
          status: "paid",
          receivedAmount,
          receivedAt: input.receivedAt ? parseDateString(input.receivedAt) : new Date(),
          receivedBy: ctx.user.id,
        } as any);
        await safeAuditLog(ctx.user.id, "receivable.markReceived", "receivable", { entityId: input.id, invoiceId: input.id, note: `入金済みに変更: ${receivedAmount}円` });
        return { success: true };
      }),

    markUnreceived: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getInvoiceById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
        const dueDate = current.dueDate ? new Date(current.dueDate) : null;
        const status: any = current.status === "cancelled"
          ? "cancelled"
          : dueDate && dueDate.getTime() < Date.now()
            ? "overdue"
            : current.status === "draft"
              ? "draft"
              : "sent";
        await db.updateInvoice(input.id, {
          status,
          receivedAmount: 0,
          receivedAt: null,
          receivedBy: null,
        } as any);
        await safeAuditLog(ctx.user.id, "receivable.markUnreceived", "receivable", { entityId: input.id, invoiceId: input.id, note: "入金済み解除" });
        return { success: true };
      }),
  }),


  audit: router({
    list: leaderOrAdminProcedure
      .input(z.object({
        month: z.string().regex(/^\d{4}-\d{2}$/),
        entityType: z.string().optional(),
        action: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const [logs, users, employees, projects, invoices] = await Promise.all([
          db.getAuditLogsByMonth(input.month),
          db.getAllUsers(),
          db.getAllEmployees(),
          db.getAllProjects(),
          db.getAllInvoices(),
        ]);
        const userMap = new Map(users.map((u: any) => [u.id, u]));
        const employeeMap = new Map(employees.map((e: any) => [e.id, e]));
        const projectMap = new Map(projects.map((p: any) => [p.id, p]));
        const invoiceMap = new Map(invoices.map((inv: any) => [inv.id, inv]));
        let rows = logs.map((log: any) => ({
          ...log,
          user: log.performedBy ? userMap.get(log.performedBy) || null : null,
          employeeName: log.employeeId ? (employeeMap.get(log.employeeId)?.nameKanji || null) : null,
          projectName: log.projectId ? (projectMap.get(log.projectId)?.name || null) : null,
          invoiceNumber: log.invoiceId ? (invoiceMap.get(log.invoiceId)?.invoiceNumber || null) : null,
        }));
        if (input.entityType) rows = rows.filter((row: any) => row.entityType === input.entityType);
        if (input.action) rows = rows.filter((row: any) => String(row.action || "").toLowerCase().includes(input.action!.toLowerCase()));
        rows.sort((a: any, b: any) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
        const byEntity = rows.reduce((acc: any, row: any) => {
          acc[row.entityType] = (acc[row.entityType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        return { rows, summary: { total: rows.length, byEntity } };
      }),

    /** Generate invoice draft for closing */
    generateForClosing: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number().optional(),
        projectIds: z.array(z.number()).optional(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const selectedProjectIds = input.projectIds?.length
          ? Array.from(new Set(input.projectIds.map(Number).filter(Boolean)))
          : input.projectId ? [input.projectId] : [];
        if (!selectedProjectIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "案件が選択されていません" });
        }
        const { start, end } = getMonthDateRange(input.closingMonth);
        const draft = await buildInvoiceDraftFromProjects({
          projectIds: selectedProjectIds,
          periodStart: start,
          periodEnd: end,
          allowedClosingStatuses: ["ready", "closed", "locked"],
          taxRate: 10,
          includeProjectSectionHeaders: selectedProjectIds.length > 1,
        });
        const billableItems = draft.items.filter((item: any) => item.itemType !== "text");
        if (!billableItems.length || Number(draft.totalAmount || 0) <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "請求対象データがありません。空または0円の請求書ドラフトは作成できません。",
          });
        }
        const invoiceNumber = await db.getNextInvoiceNumber(input.closingMonth);
        const invoice = await db.createInvoice({
          invoiceNumber,
          clientId: draft.clientId,
          projectId: draft.primaryProjectId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          issueDate: new Date(),
          dueDate: null,
          subtotal: draft.subtotal,
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          taxRate: 10,
          status: "draft",
          notes: null,
          internalMemo: `closing draft / projectIds=${draft.projectIds.join(",")}`,
          pdfUrl: null,
          receivedAmount: 0,
          receivedAt: null,
          receivedBy: null,
          paymentMemo: null,
          createdBy: ctx.user.id,
          honorific: "御中",
          subNumber: null,
          paymentMethod: "口座振込",
          subject: draft.subject,
          showSeal: true,
          showLogo: true,
          withholding: !!draft.withholdingAmount,
          withholdingAmount: draft.withholdingAmount,
        } as any);
        for (const item of draft.items) {
          await db.createInvoiceItem({
            invoiceId: invoice.id,
            employeeId: item.employeeId,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: item.amount,
            itemTaxRate: item.itemTaxRate,
            sortOrder: item.sortOrder,
            notes: item.notes || null,
          } as any);
        }
        await safeAuditLog(ctx.user.id, "invoice_draft_created_from_closing", "invoice", {
          invoiceId: invoice.id,
          projectId: draft.primaryProjectId,
          note: "Created editable invoice draft from monthly closing. PDF not generated yet.",
          payload: {
            closingMonth: input.closingMonth,
            projectIds: draft.projectIds,
            subtotal: draft.subtotal,
            taxAmount: draft.taxAmount,
            totalAmount: draft.totalAmount,
          },
        });
        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: draft.totalAmount,
          status: "draft",
          editUrl: `/app/invoices?invoiceId=${invoice.id}`,
          message: "請求書ドラフトを作成しました。PDF出力前に内容を確認・編集してください。",
        };
      }),
    sameClientInvoiceCandidates: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .query(async ({ input }) => {
        const currentProject = await db.getProjectById(input.projectId);
        if (!currentProject?.clientId) return [];
        const allProjects = await db.getAllProjects();
        const sameClientProjects = allProjects.filter(
          (project: any) => Number(project.clientId) === Number(currentProject.clientId)
        );
        const rows = [];
        for (const project of sameClientProjects) {
          const closing = await db.getProjectClosingByProjectMonth(project.id, input.closingMonth);
          if (closing && ["ready", "closed", "locked"].includes(closing.status)) {
            rows.push({ project, closing });
          }
        }
        return rows.sort((a: any, b: any) => a.project.name.localeCompare(b.project.name, "ja"));
      }),
  }),
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
        // Get client and company info for preview
        let client = null;
        if (invoice.clientId) {
          client = await db.getClientById(invoice.clientId);
        }
        const company = await db.getCompanyProfile();
        return { invoice, items, client, company };
      }),

    /** Create invoice from attendance data */
    createFromAttendance: leaderOrAdminProcedure
      .input(z.object({
        clientId: z.number(),
        projectIds: z.array(z.number()).min(1),
        periodStart: z.string(),
        periodEnd: z.string(),
        taxRate: z.number().default(10),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        subject: z.string().optional(),
        withholding: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const closingMonth = input.periodStart.slice(0, 7);
        if (input.periodEnd.slice(0, 7) !== closingMonth) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "請求対象期間は1ヶ月単位で指定してください" });
        }

        const draft = await buildInvoiceDraftFromProjects({
          projectIds: input.projectIds,
          periodStart: parseDateString(input.periodStart),
          periodEnd: parseDateString(input.periodEnd),
          allowedClosingStatuses: ["ready", "closed", "locked"],
          expectedClientId: input.clientId,
          taxRate: input.taxRate,
          withholding: input.withholding,
          subject: input.subject,
          includeProjectSectionHeaders: input.projectIds.length > 1,
        });

        const invoiceNumber = await db.getNextInvoiceNumber(closingMonth);
        const invoice = await db.createInvoice({
          invoiceNumber,
          clientId: draft.clientId,
          projectId: draft.primaryProjectId,
          periodStart: draft.periodStart,
          periodEnd: draft.periodEnd,
          issueDate: new Date(),
          dueDate: input.dueDate ? parseDateString(input.dueDate) : null,
          subtotal: draft.subtotal,
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          taxRate: input.taxRate,
          status: "draft",
          notes: input.notes || null,
          internalMemo: null,
          pdfUrl: null,
          receivedAmount: 0,
          receivedAt: null,
          receivedBy: null,
          paymentMemo: null,
          createdBy: ctx.user.id,
          honorific: "御中",
          subNumber: null,
          paymentMethod: "口座振込",
          subject: draft.subject,
          showSeal: true,
          showLogo: true,
          withholding: input.withholding,
          withholdingAmount: draft.withholdingAmount,
        });

        for (const item of draft.items) {
          await db.createInvoiceItem({
            invoiceId: invoice.id!,
            employeeId: item.employeeId,
            itemType: item.itemType,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            amount: item.amount,
            itemTaxRate: item.itemTaxRate,
            sortOrder: item.sortOrder,
            notes: item.notes || null,
          } as any);
        }

        for (const projectId of input.projectIds) {
          const closing = await db.getProjectClosingByProjectMonth(projectId, closingMonth);
          if (closing?.id) {
            await db.updateProjectClosing(closing.id, {
              status: "locked",
              closedAt: closing.closedAt || new Date(),
              closedBy: closing.closedBy || ctx.user.id,
            });
          }
        }

        await safeAuditLog(ctx.user.id, "invoice.createFromAttendance", "invoice", {
          entityId: invoice.id,
          invoiceId: invoice.id,
          projectId: draft.primaryProjectId || input.projectIds[0],
          note: `請求書自動作成 ${invoiceNumber}`,
          payload: { projectIds: input.projectIds, clientId: draft.clientId },
        });
        return { id: invoice.id, invoiceNumber, totalAmount: draft.totalAmount };
      }),

    /** Generate PDF for an invoice */
    generatePdf: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const invoice = await db.getInvoiceById(input.id);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
        const items = await db.getInvoiceItemsByInvoice(input.id);
        const company = await db.getCompanyProfile();

        // Get client info
        let clientName = "取引先";
        let clientAddress = "";
        let clientPostalCode = "";
        let clientContactPerson = "";
        if (invoice.clientId) {
          const client = await db.getClientById(invoice.clientId);
          if (client) {
            clientName = client.name;
            clientAddress = client.address || "";
            clientPostalCode = client.postalCode || "";
            clientContactPerson = client.contactPerson || "";
          }
        }

        const pdfBuffer = await generateInvoicePdf({
          invoice, items, company, clientName,
          clientAddress, clientPostalCode, clientContactPerson,
          showSeal: invoice.showSeal,
          showLogo: invoice.showLogo,
        });

        const fileName = `invoice_${invoice.invoiceNumber}_${Date.now()}.pdf`;
        const fileKey = `invoices/${fileName}`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Update invoice with PDF URL
        await db.updateInvoice(input.id, { pdfUrl: url });
        await safeAuditLog(ctx.user.id, "invoice.generatePdf", "invoice", { entityId: input.id, invoiceId: input.id, note: `PDF生成 ${fileName}` });

        return { url, fileName };
      }),

    /** Update invoice status */
    updateStatus: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getInvoiceById(input.id);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
        const updateData: any = { status: input.status };
        if (input.status === "paid") {
          updateData.receivedAmount = Number(current.receivedAmount || 0) > 0 ? Number(current.receivedAmount || 0) : Number(current.totalAmount || 0);
          updateData.receivedAt = current.receivedAt || new Date();
          updateData.receivedBy = ctx.user.id;
        }
        await safeAuditLog(ctx.user.id, "invoice.updateStatus", "invoice", { entityId: input.id, invoiceId: input.id, note: `ステータス変更: ${input.status}` });
        return db.updateInvoice(input.id, updateData);
      }),

    /** Create manual invoice (手動請求書作成) */
    createManual: leaderOrAdminProcedure
      .input(z.object({
        clientId: z.number(),
        projectId: z.number().optional(),
        periodStart: z.string(),
        periodEnd: z.string(),
        taxRate: z.number().default(10),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        subject: z.string().optional(),
        honorific: z.string().optional(),
        paymentMethod: z.string().optional(),
        withholding: z.boolean().default(false),
        withholdingAmount: z.number().default(0),
        items: z.array(z.object({
          itemType: z.enum(["normal", "text"]).default("normal"),
          description: z.string(),
          quantity: z.number().default(0),
          unit: z.string().default("日"),
          unitPrice: z.number().default(0),
          amount: z.number().default(0),
          itemTaxRate: z.number().default(10),
          notes: z.string().optional(),
          sortOrder: z.number().default(0),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        let subtotal = 0;
        for (const item of input.items) {
          if (item.itemType === "normal") subtotal += item.amount;
        }

        // Calculate tax per rate group
        const taxByRate = new Map<number, number>();
        for (const item of input.items) {
          if (item.itemType === "text") continue;
          const rate = item.itemTaxRate;
          const existing = taxByRate.get(rate) || 0;
          taxByRate.set(rate, existing + item.amount);
        }
        let totalTax = 0;
        for (const [rate, base] of Array.from(taxByRate.entries())) {
          totalTax += Math.round(base * rate / 100);
        }

        const totalAmount = subtotal + totalTax;
        const yearMonth = input.periodStart.slice(0, 7);
        const invoiceNumber = await db.getNextInvoiceNumber(yearMonth);

        const finalTotal = totalAmount - (input.withholdingAmount || 0);
        const invoice = await db.createInvoice({
          invoiceNumber,
          clientId: input.clientId,
          projectId: input.projectId || null,
          periodStart: parseDateString(input.periodStart),
          periodEnd: parseDateString(input.periodEnd),
          issueDate: new Date(),
          dueDate: input.dueDate ? parseDateString(input.dueDate) : null,
          subtotal,
          taxAmount: totalTax,
          totalAmount: finalTotal,
          taxRate: input.taxRate,
          notes: input.notes || null,
          subject: input.subject || null,
          honorific: input.honorific || "御中",
          paymentMethod: input.paymentMethod || "口座振込",
          withholding: input.withholding || false,
          withholdingAmount: input.withholdingAmount || 0,
          createdBy: ctx.user.id,
        });

        for (let i = 0; i < input.items.length; i++) {
          const item = input.items[i];
          await db.createInvoiceItem({
            invoiceId: invoice.id!,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
            unit: item.unit,
            itemType: item.itemType,
            itemTaxRate: item.itemTaxRate,
            sortOrder: item.sortOrder || i,
            notes: item.notes || null,
          });
        }

        await safeAuditLog(ctx.user.id, "invoice.createManual", "invoice", { entityId: invoice.id, invoiceId: invoice.id, projectId: input.projectId || null, note: `手動請求書作成 ${invoiceNumber}` });
        return { id: invoice.id, invoiceNumber, totalAmount };
      }),

    /** Add item to existing invoice */
    addItem: leaderOrAdminProcedure
      .input(z.object({
        invoiceId: z.number(),
        itemType: z.enum(["normal", "text"]).default("normal"),
        description: z.string(),
        quantity: z.number().default(0),
        unit: z.string().default("日"),
        unitPrice: z.number().default(0),
        amount: z.number().default(0),
        itemTaxRate: z.number().default(10),
        notes: z.string().optional(),
        sortOrder: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const invoice = await db.getInvoiceById(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });

        const newItem = await db.createInvoiceItem({
          invoiceId: input.invoiceId,
          itemType: input.itemType,
          description: input.description,
          quantity: input.quantity,
          unit: input.unit,
          unitPrice: input.unitPrice,
          amount: input.amount,
          itemTaxRate: input.itemTaxRate,
          sortOrder: input.sortOrder,
          notes: input.notes || null,
        });

        // Recalculate invoice totals
        await recalcInvoiceTotals(input.invoiceId);

        await safeAuditLog(ctx.user.id, "invoice.addItem", "invoice", { entityId: input.invoiceId, invoiceId: input.invoiceId, note: `明細追加: ${input.description}` });
        return newItem;
      }),

    /** Update an invoice item */
    updateItem: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().optional(),
        quantity: z.number().optional(),
        unit: z.string().optional(),
        unitPrice: z.number().optional(),
        amount: z.number().optional(),
        itemTaxRate: z.number().optional(),
        notes: z.string().optional(),
        sortOrder: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await db.updateInvoiceItem(id, data);

        // Get the item to find its invoiceId
        const item = await db.getInvoiceItemById(id);
        if (item) await recalcInvoiceTotals(item.invoiceId);
        await safeAuditLog(ctx.user.id, "invoice.updateItem", "invoice", { entityId: item?.invoiceId || null, invoiceId: item?.invoiceId || null, note: `明細更新 item:${id}` });

        return { success: true };
      }),

    /** Delete an invoice item */
    deleteItem: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const item = await db.getInvoiceItemById(input.id);
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });

        await db.deleteInvoiceItem(input.id);
        await recalcInvoiceTotals(item.invoiceId);
        await safeAuditLog(ctx.user.id, "invoice.deleteItem", "invoice", { entityId: item.invoiceId, invoiceId: item.invoiceId, note: `明細削除 item:${input.id}` });

        return { success: true };
      }),

    /** Update invoice details */
    update: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        notes: z.string().optional(),
        dueDate: z.string().optional(),
        honorific: z.string().optional(),
        paymentMethod: z.string().optional(),
        showSeal: z.boolean().optional(),
        showLogo: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        const updateData: any = { ...data };
        if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
        await safeAuditLog(ctx.user.id, "invoice.update", "invoice", { entityId: id, invoiceId: id, note: "請求書情報更新" });
        return db.updateInvoice(id, updateData);
      }),


    getSameClientProjects: leaderOrAdminProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string(),
      }))
      .query(async ({ input }) => {
        const project = await db.getProjectById(input.projectId);
        if (!project) throw new TRPCError({ code: "NOT_FOUND" });

        const allProjects = await db.getAllProjects();
        const sameClientProjects = allProjects.filter((p: any) => p.clientId === project.clientId && p.status === "active");

        const closingStatuses = await Promise.all(
          sameClientProjects.map(async (p: any) => {
            const closing = await db.getProjectClosingByProjectMonth(p.id, input.closingMonth);
            return {
              projectId: p.id,
              projectName: p.name,
              isClosed: closing?.status === "closed",
            };
          })
        );

        return closingStatuses.filter((s: any) => s.isClosed);
      }),

    /** Delete an invoice */
    delete: leaderOrAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteInvoice(input.id);
        await safeAuditLog(ctx.user.id, "invoice.delete", "invoice", { entityId: input.id, invoiceId: input.id, note: "請求書削除" });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
