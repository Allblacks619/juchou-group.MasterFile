import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, superAdminProcedure, router, isManagerLike, isGuestRole, isSuperAdmin } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import * as db from "./db";
import { parseDateString, parseDateRange } from "./dateHelpers";
import { isWorkedType } from "@shared/attendanceStatus";
import { storageGet, storagePut } from "./storage";
import { validateFile, ALLOWED_MIME_TYPES, MAX_IMAGE_SIZE, MAX_PDF_SIZE } from "../shared/uploadValidation";
import * as schema from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { generateRosterPdf, generateRosterListPdf, generateMultiRosterPdf } from "./pdfRoster";
import { generateInvoicePdf } from "./pdfInvoice";
import { buildInvoiceDraftFromProjects } from "./invoiceBuilder";
import { buildWorkerInvoicePdfRenderPayload, generateWorkerInvoicePdf } from "./workerInvoicePdf";
import { resolveProjectMemberRatesForMonth, resolveWorkerPaymentRate } from "./rateResolver";

const BCRYPT_ROUNDS = 12;
const RESET_LINK_TTL_MS = 60 * 60 * 1000;

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildResetLink(req: any, token: string) {
  const protocol = req?.protocol || "https";
  const host = req?.headers?.host || "__ORIGIN__";
  return `${protocol}://${host}/app/reset-password/${token}`;
}

function normalizePhoneForMatch(phone: string | null | undefined) {
  return (phone || "").replace(/\D/g, "");
}

function formatDateForMatch(date: Date | string | null | undefined) {
  if (!date) return "";
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function isPrivilegedAppRole(role: unknown) {
  return role === "super_admin" || role === "admin";
}

const ATTENDANCE_REMOVED_GUEST_PREFIX = "__attendance_removed_guest__:";
const ATTENDANCE_REMOVED_GUEST_DATE = "1900-01-01";

function canRemoveAttendanceMember(role: unknown) {
  return role === "super_admin" || role === "admin" || role === "manager";
}

function removedGuestMarkerName(guestName: string) {
  return `${ATTENDANCE_REMOVED_GUEST_PREFIX}${createHash("sha256").update(guestName).digest("hex")}`;
}

function isRemovedGuestMarkerName(guestName: string | null | undefined) {
  return !!guestName && guestName.startsWith(ATTENDANCE_REMOVED_GUEST_PREFIX);
}

function removedGuestMarkerNote(guestName: string) {
  return `attendance_removed_guest:${guestName}`;
}

function excludeRemovedGuestMarkers<T extends { guestName: string | null }>(records: T[]) {
  return records.filter((record) => !isRemovedGuestMarkerName(record.guestName));
}

// ── Helper: check admin or leader role ──
const leaderOrAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isManagerLike((ctx.user as any).appRole)) {
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


const CLIENT_INVOICE_ELIGIBLE_CLOSING_STATUSES = ["ready", "closed", "locked"] as const;

function normalizeClosingStatusReason(status: string | null | undefined) {
  if (!status) return "締めデータが未作成です";
  if ((CLIENT_INVOICE_ELIGIBLE_CLOSING_STATUSES as readonly string[]).includes(status)) return null;
  if (status === "open") return "締め準備が完了していません";
  return `請求対象外の締め状態です: ${status}`;
}

async function buildSameClientInvoiceCandidates(projectId: number, closingMonth: string) {
  const currentProject = await db.getProjectById(projectId);
  if (!currentProject?.clientId) return [];

  const [client, allProjects] = await Promise.all([
    db.getClientById(Number(currentProject.clientId)),
    db.getAllProjects(),
  ]);
  const sameClientProjects = allProjects.filter(
    (project: any) => Number(project.clientId) === Number(currentProject.clientId)
  );

  const rows = [];
  for (const project of sameClientProjects) {
    const closing = await db.getProjectClosingByProjectMonth(project.id, closingMonth);
    const closingStatus = closing?.status || "none";
    const reason = normalizeClosingStatusReason(closing?.status);
    rows.push({
      projectId: Number(project.id),
      projectName: project.name,
      clientId: Number(currentProject.clientId),
      clientName: client?.name || null,
      closingId: closing?.id ? Number(closing.id) : null,
      closingMonth,
      closingStatus,
      isEligible: !reason,
      reason,
    });
  }

  return rows.sort((a: any, b: any) => a.projectName.localeCompare(b.projectName, "ja"));
}

async function assertProjectMember(employeeId: number, projectId: number) {
  const memberships = await db.getProjectsByEmployee(employeeId);
  const isMember = memberships.some((member: any) => member.projectId === projectId && member.isActive !== false);
  if (!isMember) {
    throw new TRPCError({ code: "FORBIDDEN", message: "この現場のメンバーではありません" });
  }
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
  const enrichedSubmissions = (await Promise.all(submissions
    .map(async (submission) => ({ ...submission, employee: employeeMap.get(submission.employeeId) || null, documents: await db.listClosingSubmissionDocuments(submission.id) }))))
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

function isWorkerEditLockedByClosing(status?: string | null) {
  return status === "closed" || status === "locked" || status === "completed";
}


function canWorkerEditSubmission(closingStatus?: string | null, submissionStatus?: string | null) {
  if (isWorkerEditLockedByClosing(closingStatus)) return false;
  if (closingStatus === "ready") return submissionStatus === "rejected";
  return true;
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

const EMPTY_CLOSING_SUMMARY = {
  targetCount: 0,
  pendingCount: 0,
  submittedCount: 0,
  approvedCount: 0,
  receiptMissingCount: 0,
  canMarkReady: false,
};

function toComparableDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function projectOverlapsMonth(project: any, monthStart: Date, monthEnd: Date) {
  const projectStart = toComparableDate(project.startDate);
  const projectEnd = toComparableDate(project.endDate);

  if (projectStart && projectStart.getTime() > monthEnd.getTime()) return false;
  if (projectEnd && projectEnd.getTime() < monthStart.getTime()) return false;
  return true;
}

function isProjectActiveDuringMonth(project: any, monthStart: Date, monthEnd: Date) {
  return (project.status || "active") === "active" && projectOverlapsMonth(project, monthStart, monthEnd);
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
  const records = await db.getAttendanceByProject(projectId, start, end);

  // Monthly attendance is the source of truth for closing relevance.
  // Removed/inactive project members with real attendance for this month must
  // remain target submissions and must not be downgraded to not_required just
  // because project_members.isActive is now false.
  const targetEmployeeIds = Array.from(new Set(
    records
      .filter((rec) => !!rec.employeeId)
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


function toYmd(value: unknown): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function normalizeWorkerTaxRate(value: unknown): 0 | 8 | 10 {
  const rate = Number(value);
  return rate === 8 ? 8 : rate === 10 ? 10 : 0;
}

function formatWorkerBankInfo(worker: any): string | null {
  const parts = [worker?.bankName, worker?.branchName, worker?.accountType, worker?.accountNumber, worker?.accountHolder]
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .map((v) => String(v));
  return parts.length > 0 ? parts.join(" ") : null;
}

function parseWorkerInvoiceSnapshot(snapshot: any): any {
  try {
    return JSON.parse(snapshot?.snapshotJson || "{}");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "請求書スナップショットを読み込めません。管理者に確認してください。" });
  }
}

async function getLatestWorkerInvoiceSnapshot(workerInvoiceId: number) {
  const snapshots = await db.getWorkerInvoiceSnapshots(workerInvoiceId);
  const latest = [...snapshots].sort((a: any, b: any) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime || Number(b.id || 0) - Number(a.id || 0);
  })[0];
  if (!latest) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "提出済みスナップショットがありません。提出後にPDFを出力してください。" });
  }
  return latest;
}

async function buildWorkerInvoicePreviewModelFromSnapshot(invoice: any) {
  const snapshotRow = await getLatestWorkerInvoiceSnapshot(invoice.id!);
  const snapshot = parseWorkerInvoiceSnapshot(snapshotRow);
  const snapInvoice = snapshot.invoice || {};
  const snapSubmission = snapshot.submission || {};
  const snapProject = snapshot.project || {};
  const snapCompany = snapshot.company || {};
  const snapWorker = snapshot.worker || {};
  const snapItems = Array.isArray(snapshot.items) ? snapshot.items : [];
  const supportingDocuments = Array.isArray(snapshot.supportingDocuments) ? snapshot.supportingDocuments : [];
  const lineItems = snapItems.length > 0
    ? snapItems
        .filter((item: any) => item?.itemType !== "text")
        .map((item: any) => ({
          label: String(item?.label || "請求明細"),
          quantity: Number(item?.quantity || 1),
          unitPrice: Number(item?.unitPrice || 0),
          amount: Number(item?.amount || 0),
          taxRate: normalizeWorkerTaxRate(item?.taxRate),
        }))
    : [
        { label: "交通費", quantity: 1, unitPrice: Number(snapSubmission.transportAmount || 0), amount: Number(snapSubmission.transportAmount || 0), taxRate: 0 as const },
        { label: "経費", quantity: 1, unitPrice: Number(snapSubmission.expenseAmount || 0), amount: Number(snapSubmission.expenseAmount || 0), taxRate: 0 as const },
      ].filter((item) => item.amount !== 0);

  const model = {
    invoiceId: Number(snapInvoice.id || invoice.id),
    invoiceNumber: snapInvoice.invoiceNumber || null,
    issueDate: toYmd(snapInvoice.issueDate || snapInvoice.submittedAt || snapInvoice.createdAt),
    closingMonth: snapInvoice.closingMonth || undefined,
    projectName: snapProject.name || null,
    subject: snapInvoice.subject || (snapInvoice.closingMonth ? `${snapInvoice.closingMonth} 作業請求` : "作業請求"),
    company: {
      name: snapCompany.companyName || "充寵グループ",
      address: snapCompany.address || null,
      phone: snapCompany.phone || null,
      email: snapCompany.email || null,
    },
    worker: {
      employeeId: Number(snapWorker.id || snapInvoice.employeeId || invoice.employeeId),
      name: snapWorker.nameKanji || `Worker #${snapInvoice.employeeId || invoice.employeeId}`,
      address: snapWorker.address || null,
      phone: snapWorker.phone || null,
      email: snapWorker.email || null,
      invoiceRegistrationNumber: snapWorker.invoiceIssuerNumber || null,
      bankInfo: formatWorkerBankInfo(snapWorker),
      sealImageUrl: snapWorker.stampUrl || null,
    },
    lineItems,
    subtotal: Number(snapInvoice.subtotalAmount || 0),
    tax: Number(snapInvoice.taxAmount || 0),
    total: Number(snapInvoice.totalAmount || 0),
    notes: snapInvoice.notes || null,
    supportingDocuments: supportingDocuments
      .filter((doc: any) => doc?.id && doc?.fileKey)
      .map((doc: any) => ({
        id: Number(doc.id),
        fileKey: String(doc.fileKey),
        originalFileName: doc.originalFileName || null,
        mimeType: doc.mimeType || null,
      })),
  };

  return { model, snapshot, snapshotRow };
}

async function ensureWorkerInvoiceAccess(ctx: any, invoice: any) {
  const me = await db.getEmployeeByUserId(ctx.user.id);
  const manager = isManagerLike(ctx.user.appRole) || isSuperAdmin(ctx.user.appRole);
  if (!manager && (!me || me.id !== invoice.employeeId)) throw new TRPCError({ code: "FORBIDDEN" });
  return { me, manager };
}

async function getOrCreateWorkerInvoicePdfDownload(model: any, invoiceId: number) {
  const key = `worker-invoices/${invoiceId}/invoice.pdf`;
  try {
    const existing = await storageGet(key);
    return { fileName: `worker-invoice-${invoiceId}.pdf`, key: existing.key, url: existing.url, mimeType: "application/pdf", generated: false };
  } catch {
    const pdf = await generateWorkerInvoicePdf(model);
    const stored = await storagePut(key, pdf, "application/pdf");
    return { fileName: `worker-invoice-${invoiceId}.pdf`, key: stored.key, url: stored.url, mimeType: "application/pdf", generated: true };
  }
}

function isDuplicateKeyError(error: any) {
  const code = String(error?.code || error?.errno || "");
  const message = String(error?.message || "");
  return code.includes("ER_DUP_ENTRY") || message.includes("Duplicate entry") || message.includes("duplicate");
}

async function generateWorkerInvoiceNumber(projectId: number, closingMonth: string) {
  const project = await db.getProjectById(projectId);
  const scopeClientId = project?.clientId ? `C${String(project.clientId).padStart(5, "0")}` : `P${String(projectId).padStart(5, "0")}`;
  const monthPart = closingMonth.replace(/-/g, "");
  const all = await db.listWorkerInvoicesForReview();
  const prefix = `WI-${monthPart}-${scopeClientId}-`;
  const seqs = all
    .map((v: any) => String(v.invoiceNumber || ""))
    .filter((num: string) => num.startsWith(prefix))
    .map((num: string) => Number(num.split("-").pop() || 0))
    .filter((n: number) => Number.isFinite(n));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
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


  passwordRecovery: router({
    request: publicProcedure
      .input(z.object({
        loginId: z.string().min(1),
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        phone: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const user = await db.getUserByLoginId(input.loginId);
        const employee = user?.id ? await db.getEmployeeByUserId(user.id) : undefined;
        const verificationMatched = Boolean(
          user && employee
          && formatDateForMatch((employee as any).dateOfBirth) === input.birthDate
          && normalizePhoneForMatch((employee as any).phone) === normalizePhoneForMatch(input.phone)
        );

        const result = await dbInstance.insert(schema.passwordResetRequests).values({
          userId: user?.id ?? null,
          employeeId: (employee as any)?.id ?? null,
          loginId: input.loginId,
          status: "pending",
          verificationMatched,
          requestedAt: new Date(),
        } as any);
        const requestId = result?.[0]?.insertId ?? null;

        await safeAuditLog(null, "password_recovery_request_created", "password_reset_request", {
          entityId: requestId,
          employeeId: (employee as any)?.id ?? null,
          note: "password recovery request created",
          payload: { loginId: input.loginId, verificationMatched },
        });

        return { success: true, message: "復旧依頼を送信しました。管理者の確認をお待ちください。" };
      }),

    resetWithToken: publicProcedure
      .input(z.object({
        token: z.string().min(32),
        newPassword: z.string().min(6),
        confirmPassword: z.string().min(6),
      }))
      .mutation(async ({ input }) => {
        if (input.newPassword !== input.confirmPassword) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "確認用パスワードが一致しません" });
        }
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const tokenHash = hashResetToken(input.token);
        const rows = await dbInstance.select().from(schema.passwordResetRequests).where(eq(schema.passwordResetRequests.tokenHash, tokenHash)).limit(1);
        const request = rows[0] as any;
        const now = new Date();
        if (!request || !request.userId || request.status === "completed" || request.status === "rejected" || request.tokenUsedAt || !request.tokenExpiresAt || new Date(request.tokenExpiresAt) <= now) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "再設定リンクが無効または期限切れです" });
        }

        const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
        await dbInstance.update(schema.users)
          .set({ passwordHash, mustChangePassword: false })
          .where(eq(schema.users.id, request.userId));
        await dbInstance.update(schema.passwordResetRequests)
          .set({ status: "completed", tokenUsedAt: now, completedAt: now })
          .where(eq(schema.passwordResetRequests.id, request.id));

        await safeAuditLog(request.userId, "password_reset_completed", "password_reset_request", {
          entityId: request.id,
          employeeId: request.employeeId ?? null,
          note: "password reset completed with one-time link",
          payload: { loginId: request.loginId },
        });

        return { success: true };
      }),
  }),

  superAdmin: router({
    listPasswordRecoveryRequests: superAdminProcedure.query(async () => {
      const dbInstance = await db.getDb();
      if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const requests = await dbInstance.select().from(schema.passwordResetRequests);
      if ((requests as any[]).length === 0) return [];

      const employeeIds = Array.from(new Set((requests as any[])
        .map((request) => request.employeeId)
        .filter((id): id is number => typeof id === "number")));
      const userIds = Array.from(new Set((requests as any[])
        .map((request) => request.userId)
        .filter((id): id is number => typeof id === "number")));

      const [employees, users] = await Promise.all([
        employeeIds.length > 0
          ? dbInstance.select({
            id: schema.employees.id,
            nameKanji: schema.employees.nameKanji,
            nameRomaji: schema.employees.nameRomaji,
          }).from(schema.employees).where(inArray(schema.employees.id, employeeIds))
          : Promise.resolve([]),
        userIds.length > 0
          ? dbInstance.select({
            id: schema.users.id,
            appRole: schema.users.appRole,
          }).from(schema.users).where(inArray(schema.users.id, userIds))
          : Promise.resolve([]),
      ]);
      const employeeMap = new Map((employees as any[]).map((employee) => [employee.id, employee]));
      const userMap = new Map((users as any[]).map((user) => [user.id, user]));
      return (requests as any[])
        .sort((a, b) => new Date(b.requestedAt ?? b.createdAt).getTime() - new Date(a.requestedAt ?? a.createdAt).getTime())
        .map(({ tokenHash, passwordHash, ...request }) => {
          const employee = employeeMap.get(request.employeeId);
          const user = userMap.get(request.userId);
          return {
            ...request,
            appRole: user?.appRole ?? null,
            hasActiveToken: Boolean(request.tokenExpiresAt && !request.tokenUsedAt && new Date(request.tokenExpiresAt) > new Date()),
            employeeName: employee?.nameKanji ?? employee?.nameRomaji ?? null,
          };
        });
    }),

    listUsersForPasswordReset: superAdminProcedure.query(async () => {
      const [users, employees] = await Promise.all([db.getAllUsers(), db.getAllEmployees()]);
      const employeeMap = new Map((employees as any[]).map((employee) => [employee.userId, employee]));
      return (users as any[])
        .filter((user) => user.loginId)
        .map(({ passwordHash, ...user }) => {
          const employee = employeeMap.get(user.id);
          return {
            id: user.id,
            loginId: user.loginId,
            name: user.name,
            appRole: user.appRole,
            employeeId: employee?.id ?? user.employeeId ?? null,
            employeeName: employee?.nameKanji ?? employee?.nameRomaji ?? user.name ?? null,
          };
        });
    }),

    approvePasswordRecoveryRequest: superAdminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const rows = await dbInstance.select().from(schema.passwordResetRequests).where(eq(schema.passwordResetRequests.id, input.requestId)).limit(1);
        const request = rows[0] as any;
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "復旧依頼が見つかりません" });
        await dbInstance.update(schema.passwordResetRequests)
          .set({ status: "approved", approvedByUserId: ctx.user.id })
          .where(eq(schema.passwordResetRequests.id, input.requestId));
        await safeAuditLog(ctx.user.id, "password_recovery_request_approved", "password_reset_request", {
          entityId: input.requestId,
          employeeId: request.employeeId ?? null,
          note: "password recovery request approved",
          payload: { loginId: request.loginId, verificationMatched: request.verificationMatched },
        });
        return { success: true };
      }),

    rejectPasswordRecoveryRequest: superAdminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const rows = await dbInstance.select().from(schema.passwordResetRequests).where(eq(schema.passwordResetRequests.id, input.requestId)).limit(1);
        const request = rows[0] as any;
        if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "復旧依頼が見つかりません" });
        await dbInstance.update(schema.passwordResetRequests)
          .set({ status: "rejected", rejectedByUserId: ctx.user.id })
          .where(eq(schema.passwordResetRequests.id, input.requestId));
        await safeAuditLog(ctx.user.id, "password_recovery_request_rejected", "password_reset_request", {
          entityId: input.requestId,
          employeeId: request.employeeId ?? null,
          note: "password recovery request rejected",
          payload: { loginId: request.loginId, verificationMatched: request.verificationMatched },
        });
        return { success: true };
      }),

    generateResetLinkForRequest: superAdminProcedure
      .input(z.object({ requestId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const rows = await dbInstance.select().from(schema.passwordResetRequests).where(eq(schema.passwordResetRequests.id, input.requestId)).limit(1);
        const request = rows[0] as any;
        if (!request || !request.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "有効なユーザーに紐づく復旧依頼が見つかりません" });
        if (request.status === "rejected" || request.status === "completed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "この復旧依頼ではリンクを発行できません" });
        }
        const token = randomBytes(32).toString("base64url");
        const tokenHash = hashResetToken(token);
        const expiresAt = new Date(Date.now() + RESET_LINK_TTL_MS);
        await dbInstance.update(schema.passwordResetRequests)
          .set({ status: "approved", tokenHash, tokenExpiresAt: expiresAt, tokenUsedAt: null, approvedByUserId: ctx.user.id })
          .where(eq(schema.passwordResetRequests.id, input.requestId));
        await safeAuditLog(ctx.user.id, "password_reset_link_generated", "password_reset_request", {
          entityId: input.requestId,
          employeeId: request.employeeId ?? null,
          note: "one-time reset link generated",
          payload: { loginId: request.loginId, expiresAt: expiresAt.toISOString() },
        });
        return { loginId: request.loginId, resetLink: buildResetLink(ctx.req, token), expiresAt, warning: "このリンクは一度だけ使用できます" };
      }),

    generateUserResetLink: superAdminProcedure
      .input(z.object({ userId: z.number(), confirmPrivilegedReset: z.boolean().optional() }))
      .mutation(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const userRows = await dbInstance.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
        const targetUser = userRows[0] as any;
        if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
        if (isPrivilegedAppRole(targetUser.appRole) && !input.confirmPrivilegedReset) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "管理者以上のアカウントを再発行するには確認が必要です" });
        }
        const employee = await db.getEmployeeByUserId(targetUser.id);
        const token = randomBytes(32).toString("base64url");
        const tokenHash = hashResetToken(token);
        const expiresAt = new Date(Date.now() + RESET_LINK_TTL_MS);
        const result = await dbInstance.insert(schema.passwordResetRequests).values({
          userId: targetUser.id,
          employeeId: (employee as any)?.id ?? targetUser.employeeId ?? null,
          loginId: targetUser.loginId ?? targetUser.name ?? String(targetUser.id),
          status: "approved",
          verificationMatched: true,
          tokenHash,
          tokenExpiresAt: expiresAt,
          approvedByUserId: ctx.user.id,
          requestedAt: new Date(),
        } as any);
        const requestId = result?.[0]?.insertId ?? null;
        await safeAuditLog(ctx.user.id, "password_reset_link_generated", "password_reset_request", {
          entityId: requestId,
          employeeId: (employee as any)?.id ?? targetUser.employeeId ?? null,
          note: "admin-initiated one-time reset link generated",
          payload: { loginId: targetUser.loginId ?? null, targetUserId: targetUser.id, expiresAt: expiresAt.toISOString() },
        });
        return { loginId: targetUser.loginId ?? targetUser.name ?? "", resetLink: buildResetLink(ctx.req, token), expiresAt, warning: "このリンクは一度だけ使用できます" };
      }),

    resetUserPassword: superAdminProcedure
      .input(z.object({
        userId: z.number(),
        newTemporaryPassword: z.string().min(6).optional(),
        confirmResetCurrentSuperAdmin: z.boolean().optional(),
        confirmPrivilegedReset: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        const rows = await dbInstance.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
        const targetUser = rows[0] as any;
        if (!targetUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "ユーザーが見つかりません" });
        }
        if (targetUser.id === ctx.user.id && !input.confirmResetCurrentSuperAdmin) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "現在ログイン中の統括管理者を再発行するには確認が必要です" });
        }
        if (isPrivilegedAppRole(targetUser.appRole) && !input.confirmPrivilegedReset && targetUser.id !== ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "管理者以上のアカウントを再発行するには確認が必要です" });
        }

        const temporaryPassword = input.newTemporaryPassword ?? randomBytes(18).toString("base64url");
        const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

        await dbInstance.update(schema.users)
          .set({ passwordHash, mustChangePassword: true })
          .where(eq(schema.users.id, input.userId));

        await safeAuditLog(ctx.user.id, "temporary_password_generated", "user", {
          entityId: targetUser.id,
          employeeId: targetUser.employeeId ?? null,
          note: "super_admin reset user password",
          payload: { loginId: targetUser.loginId ?? null, appRole: targetUser.appRole ?? null },
        });

        return {
          success: true,
          userId: targetUser.id,
          loginId: targetUser.loginId ?? targetUser.name ?? "",
          temporaryPassword,
          mustChangePassword: true,
        };
      }),
    bulkChangeRoles: superAdminProcedure
      .input(z.object({
        userIds: z.array(z.number()).min(1),
        appRole: z.enum(["super_admin", "admin", "manager", "worker", "guest"]),
      }))
      .mutation(async ({ input }) => {
        if (input.appRole === "super_admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "super_admin への一括昇格はできません" });
        }
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        for (const userId of input.userIds) {
          const users = await dbInstance.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
          const user = users[0] as any;
          if (!user) continue;
          if (isSuperAdmin(user.appRole)) continue;
          await dbInstance.update(schema.users).set({ appRole: input.appRole as any, role: input.appRole === "admin" ? "admin" : "user" as any }).where(eq(schema.users.id, userId));
        }
        return { success: true };
      }),
    bulkDeleteEmployees: superAdminProcedure
      .input(z.object({ employeeIds: z.array(z.number()).min(1), confirmText: z.string() }))
      .mutation(async ({ input }) => {
        if (input.confirmText !== "DELETE") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "confirmText must be DELETE" });
        }
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        for (const employeeId of input.employeeIds) {
          const employee = await db.getEmployeeById(employeeId);
          if (!employee) continue;
          if (employee.userId) {
            const users = await dbInstance.select().from(schema.users).where(eq(schema.users.id, employee.userId)).limit(1);
            const linked = users[0] as any;
            if (linked && isSuperAdmin((linked as any).appRole)) continue;
          }
          await db.deleteEmployee(employeeId);
        }
        return { success: true };
      }),
    previewBulkDeleteEmployees: superAdminProcedure
      .input(z.object({ employeeIds: z.array(z.number()).min(1) }))
      .query(async ({ input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const selected: any[] = [];
        const missingEmployeeIds: number[] = [];
        const superAdminTargetEmployeeIds: number[] = [];
        const linkedUsers: any[] = [];
        for (const employeeId of input.employeeIds) {
          const employee = await db.getEmployeeById(employeeId);
          if (!employee) {
            missingEmployeeIds.push(employeeId);
            continue;
          }
          selected.push(employee);
          if (employee.userId) {
            const users = await dbInstance.select().from(schema.users).where(eq(schema.users.id, employee.userId)).limit(1);
            const linked = users[0] as any;
            if (linked) {
              linkedUsers.push({ employeeId, userId: linked.id, appRole: linked.appRole, loginId: linked.loginId });
              if (isSuperAdmin(linked.appRole)) superAdminTargetEmployeeIds.push(employeeId);
            }
          }
        }
        return {
          selectedEmployees: selected,
          linkedUsers,
          superAdminTargetEmployeeIds,
          missingEmployeeIds,
          relatedRecords: { detectable: false },
        };
      }),
  }),

  // ── Invitation System ──
  invitation: router({
    create: leaderOrAdminProcedure
      .input(z.object({
        loginId: z.string().min(1),
        tempPassword: z.string().min(6),
        assignedRole: z.enum(["super_admin", "admin", "manager", "worker", "guest", "leader"]).transform((v) => v === "leader" ? "manager" : v),
        recipientEmail: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Only super_admin can create super_admin/admin invitations
        if ((input.assignedRole === "super_admin" || input.assignedRole === "admin") && !isSuperAdmin((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "統括管理者のみが高権限招待を作成できます" });
        }

        const token = nanoid(32);
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.createInvitation({
          token,
          loginId: input.loginId,
          tempPassword: input.tempPassword,
          assignedRole: input.assignedRole as any,
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
        logoSettings: z.any().optional(),
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
          project: r.projectId ? projMap.get(r.projectId) ?? null : null,
        }));
      }),

    listAll: leaderOrAdminProcedure.query(async () => {
      const [rates, empList, projList, clientList] = await Promise.all([
        db.getAllEmployeeRates(),
        db.getAllEmployees(),
        db.getAllProjects(),
        db.getAllClients(),
      ]);
      const empMap = new Map(empList.map(e => [e.id, e]));
      const projMap = new Map(projList.map(p => [p.id, p]));
      const clientMap = new Map(clientList.map(c => [c.id, c]));
      const toTime = (v: any, fallback: number) => v ? new Date(v).getTime() : fallback;
      const overlaps = (a: any, b: any) => {
        const aFrom = toTime(a.effectiveFrom, Number.MIN_SAFE_INTEGER);
        const aTo = toTime(a.effectiveUntil, Number.MAX_SAFE_INTEGER);
        const bFrom = toTime(b.effectiveFrom, Number.MIN_SAFE_INTEGER);
        const bTo = toTime(b.effectiveUntil, Number.MAX_SAFE_INTEGER);
        return aFrom <= bTo && bFrom <= aTo;
      };
      return rates.map(r => ({
        ...r,
        employee: r.employeeId ? empMap.get(r.employeeId) ?? null : null,
        project: r.projectId ? projMap.get(r.projectId) ?? null : null,
        client: r.clientId ? clientMap.get(r.clientId) ?? null : null,
        hasOverlapWarning: rates.some(other => other.id !== r.id
          && other.scopeType === r.scopeType
          && (other.projectId ?? null) === (r.projectId ?? null)
          && (other.clientId ?? null) === (r.clientId ?? null)
          && (other.employeeId ?? null) === (r.employeeId ?? null)
          && (other.shiftType ?? "day") === (r.shiftType ?? "day")
          && overlaps(r, other)),
      }));
    }),

    create: leaderOrAdminProcedure
      .input(z.object({
        employeeId: z.number().nullable().optional(),
        scopeType: z.enum(["project", "client"]).default("project"),
        projectId: z.number().optional(),
        clientId: z.number().optional(),
        shiftType: z.enum(["day", "night"]).default("day"),
        clientRate: z.number().min(0).optional(),
        workerRate: z.number().min(0).optional(),
        effectiveFrom: z.string().optional(),
        effectiveUntil: z.string().optional(),
        notes: z.string().optional(),
      }).refine((data) => data.clientRate != null || data.workerRate != null, {
        message: "売上単価または支払単価のいずれかを入力してください",
      }))
      .mutation(async ({ input }) => {
        if (input.scopeType === "project" && !input.projectId) throw new TRPCError({ code: "BAD_REQUEST", message: "現場別では現場選択が必需です" });
        if (input.scopeType === "client" && !input.clientId) throw new TRPCError({ code: "BAD_REQUEST", message: "取引先別では取引先選択が必需です" });
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
        const records = await db.getAttendanceByDateRange(
          startRange.start,
          endRange.end,
          input.projectId,
        );
        return excludeRemovedGuestMarkers(records);
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
          projectId: z.number().int().positive(),
          workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          hoursWorked: z.number().min(0).max(240).default(80),
          overtimeHours: z.number().min(0).max(240).default(0),
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


    /** Remove an active attendance member without deleting historical attendance data */
    removeMember: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        employeeId: z.number().optional(),
        guestName: z.string().trim().min(1).max(128).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!canRemoveAttendanceMember((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
        }
        if (!!input.employeeId === !!input.guestName) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "従業員またはゲストを1人指定してください" });
        }

        if (input.employeeId) {
          await db.removeProjectMember(input.projectId, input.employeeId);
          return { success: true };
        }

        const guestName = input.guestName!;
        await db.upsertAttendance({
          employeeId: null,
          guestName: removedGuestMarkerName(guestName),
          projectId: input.projectId,
          workDate: parseDateString(ATTENDANCE_REMOVED_GUEST_DATE),
          hoursWorked: 0,
          overtimeHours: 0,
          workType: "absence",
          shiftType: "day",
          notes: removedGuestMarkerNote(guestName),
          enteredBy: ctx.user.id,
        });
        return { success: true };
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
          projectId: z.number().int().positive(),
          workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          hoursWorked: z.number().min(0).max(240).default(80),
          overtimeHours: z.number().min(0).max(240).default(0),
          workType: z.enum(["normal", "half_day", "overtime", "holiday", "absence", "day_off"]).default("normal"),
          shiftType: z.enum(["day", "night"]).default("day"),
          notes: z.string().optional(),
        })),
        deletes: z.array(z.object({
          projectId: z.number().int().positive(),
          workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const employee = await db.getEmployeeByUserId(ctx.user.id);
        if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員情報が見つかりません" });
        const projectIds = new Set([
          ...input.records.map((rec) => rec.projectId),
          ...(input.deletes || []).map((del) => del.projectId),
        ]);
        for (const projectId of Array.from(projectIds)) {
          await assertProjectMember(employee.id, projectId);
        }
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
      const allProjects = await db.getAllProjects();
      if (isManagerLike((ctx.user as any).appRole)) {
        return allProjects.filter(p => p.status === "active");
      }
      const employee = await db.getEmployeeByUserId(ctx.user.id);
      if (!employee) return [];
      const memberships = await db.getProjectsByEmployee(employee.id);
      const projectIds = new Set(memberships.map((m: any) => m.projectId));
      return allProjects.filter(p => p.status === "active" && projectIds.has(p.id));
    }),

    /** Get projects relevant to the selected attendance month. */
    monthProjectOptions: protectedProcedure
      .input(z.object({
        startDate: z.string(),
        endDate: z.string(),
      }))
      .query(async ({ ctx, input }) => {
        const startDate = parseDateRange(input.startDate).start;
        const endDate = parseDateRange(input.endDate).end;
        const [allProjects, rawMonthlyRecords] = await Promise.all([
          db.getAllProjects(),
          db.getAttendanceByDateRange(startDate, endDate),
        ]);
        const monthlyRecords = excludeRemovedGuestMarkers(rawMonthlyRecords);
        const attendanceCounts = new Map<number, number>();
        for (const record of monthlyRecords) {
          attendanceCounts.set(record.projectId, (attendanceCounts.get(record.projectId) || 0) + 1);
        }

        let candidateProjects = allProjects;
        if (!isManagerLike((ctx.user as any).appRole)) {
          const employee = await db.getEmployeeByUserId(ctx.user.id);
          if (!employee) return [];
          const [memberships, ownRawMonthlyRecords] = await Promise.all([
            db.getProjectsByEmployee(employee.id),
            db.getAttendanceByEmployee(employee.id, startDate, endDate),
          ]);
          const ownMonthlyRecords = excludeRemovedGuestMarkers(ownRawMonthlyRecords);
          const memberProjectIds = new Set(memberships.map((member: any) => member.projectId));
          const ownAttendanceProjectIds = new Set(ownMonthlyRecords.map((record: any) => record.projectId));
          const ownAttendanceCounts = new Map<number, number>();
          for (const record of ownMonthlyRecords) {
            ownAttendanceCounts.set(record.projectId, (ownAttendanceCounts.get(record.projectId) || 0) + 1);
          }
          for (const [projectId, count] of Array.from(ownAttendanceCounts.entries())) {
            if (!attendanceCounts.has(projectId)) attendanceCounts.set(projectId, count);
          }
          candidateProjects = allProjects.filter((project: any) =>
            memberProjectIds.has(project.id) || ownAttendanceProjectIds.has(project.id)
          );
        }

        const options = (await Promise.all(candidateProjects.map(async (project: any) => {
          const members = await db.getProjectMembers(project.id);
          const activeMemberCount = members.filter((member: any) => member.isActive).length;
          let attendanceCount = attendanceCounts.get(project.id) || 0;
          if (attendanceCount === 0) {
            const fallbackRecords = excludeRemovedGuestMarkers(await db.getAttendanceByProject(project.id, startDate, endDate));
            attendanceCount = fallbackRecords.length;
            if (attendanceCount > 0) attendanceCounts.set(project.id, attendanceCount);
          }
          const hasMonthlyAttendance = attendanceCount > 0;
          if (!hasMonthlyAttendance && activeMemberCount === 0) return null;
          return {
            ...project,
            hasMonthlyAttendance,
            attendanceCount,
            activeMemberCount,
          };
        }))).filter((project): project is NonNullable<typeof project> => project !== null);

        return options.sort((a: any, b: any) => {
          if (a.hasMonthlyAttendance !== b.hasMonthlyAttendance) return a.hasMonthlyAttendance ? -1 : 1;
          if (b.attendanceCount !== a.attendanceCount) return b.attendanceCount - a.attendanceCount;
          return String(a.name || "").localeCompare(String(b.name || ""), "ja");
        });
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
      .query(async ({ ctx, input }) => {
        const startDate = parseDateRange(input.startDate).start;
        const endDate = parseDateRange(input.endDate).end;
        const rawRecords = await db.getAttendanceByProject(
          input.projectId,
          startDate,
          endDate,
        );
        const records = excludeRemovedGuestMarkers(rawRecords);

        if (!isManagerLike((ctx.user as any).appRole)) {
          const employee = await db.getEmployeeByUserId(ctx.user.id);
          if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員情報が見つかりません" });
          const memberships = await db.getProjectsByEmployee(employee.id);
          const isActiveMember = memberships.some((member: any) =>
            member.projectId === input.projectId && member.isActive !== false
          );
          const hasMonthlyAttendance = records.some((record: any) => record.employeeId === employee.id);
          if (!isActiveMember && !hasMonthlyAttendance) {
            throw new TRPCError({ code: "FORBIDDEN", message: "この現場のメンバーではありません" });
          }
        }

        const projectMembers = await db.getProjectMembers(input.projectId);
        // Collect unique employee IDs and guest names from active project members
        // plus exact selected-month attendance. Attendance history is the source
        // of truth for historical rows after a worker/guest is removed.
        const empIds = new Set<number>();
        const guestNames = new Set<string>();
        for (const member of projectMembers) {
          if (member.isActive !== false && member.employeeId) empIds.add(member.employeeId);
        }
        for (const rec of records) {
          if (rec.employeeId) empIds.add(rec.employeeId);
          if (rec.guestName) guestNames.add(rec.guestName);
        }
        const allEmployees = await db.getAllEmployees();
        const employeeById = new Map(allEmployees.map((employee: any) => [employee.id, employee]));
        const members = Array.from(empIds).map(id => {
          const employee = employeeById.get(id);
          return { id, nameKanji: employee?.nameKanji || employee?.nameRomaji || `ID:${id}`, type: "employee" as const };
        });
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
        const { start, end } = getMonthDateRange(input.closingMonth);
        const [projects, clients, closings, monthlyAttendanceRecords] = await Promise.all([
          db.getAllProjects(),
          db.getAllClients(),
          db.getProjectClosingsByMonth(input.closingMonth),
          db.getAttendanceByDateRange(start, end),
        ]);
        const clientMap = new Map<number, any>(clients.map((c: any) => [c.id, c]));
        const closingMap = new Map<number, any>(closings.map((c: any) => [c.projectId, c]));
        const monthlyAttendanceProjectIds = new Set(
          monthlyAttendanceRecords
            .filter((record: any) => !isRemovedGuestMarkerName(record.guestName))
            .map((record: any) => record.projectId)
        );

        const rows = (await Promise.all(
          projects.map(async (project) => {
            const closing = closingMap.get(project.id) || null;
            const projectMembers = closing?.id ? [] : await db.getProjectMembers(project.id);
            let hasMonthlyAttendance = monthlyAttendanceProjectIds.has(project.id);
            if (!hasMonthlyAttendance) {
              const projectMonthlyRecords = excludeRemovedGuestMarkers(await db.getAttendanceByProject(project.id, start, end));
              hasMonthlyAttendance = projectMonthlyRecords.length > 0;
            }
            const hasActiveMembers = projectMembers.some((member: any) => member.isActive);
            const overlapsMonth = projectOverlapsMonth(project, start, end);
            const relevant = Boolean(
              closing?.id
              || hasMonthlyAttendance
              || (hasActiveMembers && overlapsMonth)
              || isProjectActiveDuringMonth(project, start, end)
            );

            if (!relevant) return null;

            if (!closing?.id) {
              return {
                project,
                client: project.clientId ? clientMap.get(project.clientId) || null : null,
                closing: null,
                summary: { ...EMPTY_CLOSING_SUMMARY },
              };
            }

            const detail = await buildClosingDetail(project.id, input.closingMonth);
            return {
              project,
              client: project.clientId ? clientMap.get(project.clientId) || null : null,
              closing,
              summary: detail?.summary || { ...EMPTY_CLOSING_SUMMARY },
            };
          })
        )).filter((row): row is NonNullable<typeof row> => row !== null);

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
        const action = nextStatus === "rejected" ? "submission.returnReject" : "submission.update";
        await safeAuditLog(ctx.user.id, action, "submission", { entityId: input.id, closingId: current.closingId, employeeId: current.employeeId, note: `提出状態を更新: ${nextStatus}` });
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
        if (isWorkerEditLockedByClosing(closing.status)) {
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
          submission: result.submission ? { ...result.submission, documents: await db.listClosingSubmissionDocuments(result.submission.id) } : null,
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
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では編集できません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (!canWorkerEditSubmission(result.closing.status, result.submission.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "この状態では編集できません" });
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
        if (["submitted", "approved", "rejected"].includes(result.submission.status) && nextStatus === "pending") {
          await safeAuditLog(ctx.user.id, "submission.resubmitAfterReopen", "submission", { entityId: result.submission.id, projectId: input.projectId, closingId: result.closing.id, employeeId: result.submission.employeeId, note: `${input.closingMonth} を再編集して再提出待ちに戻した` });
        }
        await safeAuditLog(ctx.user.id, "submission.saveMySubmission", "submission", { entityId: result.submission.id, projectId: input.projectId, closingId: result.closing.id, employeeId: result.submission.employeeId, note: `${input.closingMonth} の提出内容を保存` });
        return { success: true };
      }),

    submitMySubmission: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では提出できません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (!canWorkerEditSubmission(result.closing.status, result.submission.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "この状態では提出できません" });
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
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では領収書をアップロードできません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (!canWorkerEditSubmission(result.closing.status, result.submission.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "この状態ではアップロードできません" });
        }
        const buffer = Buffer.from(input.base64, "base64");
        const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
        if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
        const suffix = nanoid(8);
        const fileKey = `closings/${result.submission.closingId}/employee-${result.submission.employeeId}/receipt-${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        await db.updateClosingSubmission(result.submission.id, {
          receiptUploaded: true,
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


    listMyReceiptDocuments: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        const docs = await db.listClosingSubmissionDocuments(result.submission.id);
        return { documents: docs, legacyReceipt: result.submission.receiptFileUrl ? { fileUrl: result.submission.receiptFileUrl, fileName: result.submission.receiptFileName, fileKey: result.submission.receiptFileKey, mimeType: result.submission.receiptMimeType } : null };
      }),

    uploadMyReceiptDocument: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), base64: z.string(), mimeType: z.string(), fileName: z.string(), documentType: z.enum(["receipt","company_card","etc","other"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (!canWorkerEditSubmission(result.closing.status, result.submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "この状態ではアップロードできません" });
        const buffer = Buffer.from(input.base64, "base64");
        const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
        if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError });
        const suffix = nanoid(8);
        const fileKey = `closings/${result.submission.closingId}/employee-${result.submission.employeeId}/doc-${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const doc = await db.createClosingSubmissionDocument({ submissionId: result.submission.id, projectId: input.projectId, employeeId: result.submission.employeeId, closingMonth: input.closingMonth, fileName: input.fileName, fileUrl: url, fileKey, mimeType: input.mimeType, fileSize: buffer.length, documentType: input.documentType || "receipt", uploadedByUserId: ctx.user.id });
        await db.updateClosingSubmission(result.submission.id, { receiptUploaded: true, receiptFileUrl: result.submission.receiptFileUrl || url, receiptFileName: result.submission.receiptFileName || input.fileName, receiptFileKey: result.submission.receiptFileKey || fileKey, receiptMimeType: result.submission.receiptMimeType || input.mimeType } as any);
        return doc;
      }),

    deleteMyReceiptDocument: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), documentId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id);
        if (!result.eligible || !result.submission) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (!canWorkerEditSubmission(result.closing.status, result.submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "この状態では削除できません" });
        const doc = await db.getClosingSubmissionDocumentById(input.documentId);
        if (!doc || doc.submissionId !== result.submission.id) throw new TRPCError({ code: "NOT_FOUND", message: "書類が見つかりません" });
        await db.deleteClosingSubmissionDocument(input.documentId);
        const rest = await db.listClosingSubmissionDocuments(result.submission.id);
        if (rest.length === 0 && !result.submission.receiptFileUrl) await db.updateClosingSubmission(result.submission.id, { receiptUploaded: false } as any);
        return { success: true };
      }),

    clearMyReceipt: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では領収書を解除できません" });
        }
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
          internalMemo: [`closing draft / projectIds=${draft.projectIds.join(",")}`, draft.internalRateMemo].filter(Boolean).join("\n\n"),
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
        return buildSameClientInvoiceCandidates(input.projectId, input.closingMonth);
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
          internalMemo: [`closing draft / projectIds=${draft.projectIds.join(",")}`, draft.internalRateMemo].filter(Boolean).join("\n\n"),
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
        return buildSameClientInvoiceCandidates(input.projectId, input.closingMonth);
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
          internalMemo: [`attendance draft / projectIds=${draft.projectIds.join(",")}`, draft.internalRateMemo].filter(Boolean).join("\n\n"),
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

  workerInvoice: router({
    getMyDraft: protectedProcedure.input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) })).query(async ({ ctx, input }) => {
      const me = await db.getEmployeeByUserId(ctx.user.id);
      if (!me) throw new TRPCError({ code: "FORBIDDEN" });
      const closing = await ensureClosingInitializedForProjectMonth(input.projectId, input.closingMonth);
      const submission = await db.getClosingSubmissionByClosingEmployee(closing.id!, me.id);
      if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
      let invoice = await db.getWorkerInvoiceByClosingEmployee(closing.id!, me.id);
      if (!invoice) {
        const total = Number(submission.transportAmount || 0) + Number(submission.expenseAmount || 0);
        invoice = await db.upsertWorkerInvoice({ closingId: closing.id!, submissionId: submission.id!, projectId: input.projectId, employeeId: me.id, closingMonth: input.closingMonth, status: "draft", subject: `${input.closingMonth} 作業請求`, subtotalAmount: total, taxAmount: 0, totalAmount: total });
      }
      const items = invoice?.id ? await db.getWorkerInvoiceItems(invoice.id) : [];
      return { ...invoice, items };
    }),
    saveMyDraft: protectedProcedure.input(z.object({ projectId: z.number(), closingMonth: z.string(), subject: z.string().optional(), notes: z.string().optional(), items: z.array(z.object({ label: z.string(), quantity: z.number(), unitPrice: z.number(), unit: z.string().optional(), category: z.string().optional() })).optional() })).mutation(async ({ ctx, input }) => {
      const me = await db.getEmployeeByUserId(ctx.user.id); if (!me) throw new TRPCError({ code: "FORBIDDEN" });
      const closing = await ensureClosingInitializedForProjectMonth(input.projectId, input.closingMonth);
      const submission = await db.getClosingSubmissionByClosingEmployee(closing.id!, me.id); if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = await db.getWorkerInvoiceByClosingEmployee(closing.id!, me.id);
      if (existing?.status === "approved") throw new TRPCError({ code: "FORBIDDEN", message: "Approved invoice is read-only" });
      const saved = await db.upsertWorkerInvoice({ closingId: closing.id!, submissionId: submission.id!, projectId: input.projectId, employeeId: me.id, closingMonth: input.closingMonth, status: existing?.status === "returned" ? "returned" : "draft", subject: input.subject, notes: input.notes });
      if (saved?.id && input.items) {
        await db.replaceWorkerInvoiceItems(saved.id, input.items.map((item, index) => ({
          workerInvoiceId: saved.id!,
          itemType: "normal",
          label: item.label,
          description: item.label,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
          unit: item.unit || "式",
          category: (item.category || undefined) as "labor" | "transport" | "expense" | "materials" | "misc" | undefined,
          sortOrder: index,
        })));
      }
      return { success: true };
    }),
    submitMyInvoice: protectedProcedure.input(z.object({ projectId: z.number(), closingMonth: z.string() })).mutation(async ({ ctx, input }) => {
      const me = await db.getEmployeeByUserId(ctx.user.id); if (!me) throw new TRPCError({ code: "FORBIDDEN" });
      const closing = await ensureClosingInitializedForProjectMonth(input.projectId, input.closingMonth);
      const submission = await db.getClosingSubmissionByClosingEmployee(closing.id!, me.id); if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = await db.getWorkerInvoiceByClosingEmployee(closing.id!, me.id);
      if (existing?.status === "approved") throw new TRPCError({ code: "FORBIDDEN", message: "Approved invoice is read-only" });
      let invoice: any = null;
      const fixedInvoiceNumber = existing?.invoiceNumber || null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidateInvoiceNumber = fixedInvoiceNumber || await generateWorkerInvoiceNumber(input.projectId, input.closingMonth);
        try {
          invoice = await db.upsertWorkerInvoice({ closingId: closing.id!, submissionId: submission.id!, projectId: input.projectId, employeeId: me.id, closingMonth: input.closingMonth, status: "submitted", submittedAt: new Date(), invoiceNumber: candidateInvoiceNumber });
          break;
        } catch (error: any) {
          if (!fixedInvoiceNumber && isDuplicateKeyError(error) && attempt < 4) continue;
          throw error;
        }
      }
      if (!invoice) throw new TRPCError({ code: "CONFLICT", message: "請求書番号の採番に失敗しました。再試行してください。" });
      const [docs, items, project, company, worker] = await Promise.all([
        db.getSupportingDocumentsBySubmission(submission.id!),
        invoice?.id ? db.getWorkerInvoiceItems(invoice.id) : Promise.resolve([]),
        db.getProjectById(input.projectId),
        db.getCompanyProfile(),
        db.getEmployeeById(me.id),
      ]);
      const snapshot = {
        invoice,
        submission,
        items,
        project: project ? { id: project.id, name: project.name } : null,
        company: company ? { companyName: company.companyName, address: company.address, phone: company.phone, email: company.email } : null,
        worker: worker ? { id: worker.id, nameKanji: worker.nameKanji, address: worker.address, phone: worker.phone, email: worker.email, invoiceIssuerNumber: worker.invoiceIssuerNumber, bankName: worker.bankName, branchName: worker.branchName, accountType: worker.accountType, accountNumber: worker.accountNumber, accountHolder: worker.accountHolder, stampUrl: worker.stampUrl } : null,
        supportingDocuments: docs,
      };
      const prevSnapshots = await db.getWorkerInvoiceSnapshots(invoice!.id!);
      await db.createWorkerInvoiceSnapshot({ workerInvoiceId: invoice!.id!, snapshotVersion: (prevSnapshots?.length || 0) + 1, snapshotJson: JSON.stringify(snapshot), createdBy: ctx.user.id });
      return { success: true, id: invoice?.id };
    }),
    listMyInvoices: protectedProcedure.query(async ({ ctx }) => {
      const me = await db.getEmployeeByUserId(ctx.user.id); if (!me) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getWorkerInvoicesByEmployee(me.id);
    }),
    listForReview: protectedProcedure.query(async ({ ctx }) => {
      if (!isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      return db.listWorkerInvoicesForReview();
    }),
    getForReview: protectedProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
      if (!isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      const all = await db.listWorkerInvoicesForReview();
      return all.find((v: any) => v.id === input.invoiceId) || null;
    }),
    approve: protectedProcedure.input(z.object({ invoiceId: z.number() })).mutation(async ({ ctx, input }) => {
      if (!isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status !== "submitted" && invoice.status !== "returned") throw new TRPCError({ code: "BAD_REQUEST", message: "提出済みまたは差戻し済みの請求書のみ承認できます" });
      await db.updateWorkerInvoice(input.invoiceId, { status: "approved", approvedAt: new Date(), approvedBy: ctx.user.id });
      await safeAuditLog(ctx.user.id, "workerInvoice.approve", "workerInvoice", { entityId: input.invoiceId });
      return { success: true };
    }),
    returnInvoice: protectedProcedure.input(z.object({ invoiceId: z.number(), reason: z.string().min(1) })).mutation(async ({ ctx, input }) => {
      if (!isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status !== "submitted" && invoice.status !== "approved") throw new TRPCError({ code: "BAD_REQUEST", message: "提出済みまたは承認済みの請求書のみ差戻しできます" });
      await db.updateWorkerInvoice(input.invoiceId, { status: "returned", returnedAt: new Date(), returnedBy: ctx.user.id, returnReason: input.reason });
      await safeAuditLog(ctx.user.id, "workerInvoice.return", "workerInvoice", { entityId: input.invoiceId, note: input.reason });
      return { success: true };
    }),
    getPreviewData: protectedProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      const me = await db.getEmployeeByUserId(ctx.user.id);
      if (me && invoice.employeeId !== me.id && !isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      const items = await db.getWorkerInvoiceItems(invoice.id);
      const employee = await db.getEmployeeById(invoice.employeeId);
      const project = await db.getProjectById(invoice.projectId);
      const company = await db.getCompanyProfile();
      const submission = await db.getClosingSubmissionByClosingEmployee(invoice.closingId, invoice.employeeId);
      const docs = submission ? await db.getSupportingDocumentsBySubmission(submission.id!) : [];
      return { invoice, items, employee, project, company, submission, docs };
    }),

    previewMyInvoice: protectedProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      await ensureWorkerInvoiceAccess(ctx, invoice);
      const { model } = await buildWorkerInvoicePreviewModelFromSnapshot(invoice);
      return { model, pdfRenderPayload: buildWorkerInvoicePdfRenderPayload(model) };
    }),
    downloadMyInvoicePdf: protectedProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      await ensureWorkerInvoiceAccess(ctx, invoice);
      const { model } = await buildWorkerInvoicePreviewModelFromSnapshot(invoice);
      return getOrCreateWorkerInvoicePdfDownload(model, input.invoiceId);
    }),
    downloadSupportingDocument: protectedProcedure.input(z.object({ invoiceId: z.number(), documentId: z.number() })).query(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      await ensureWorkerInvoiceAccess(ctx, invoice);
      const { model } = await buildWorkerInvoicePreviewModelFromSnapshot(invoice);
      const doc = model.supportingDocuments.find((d: any) => d.id === input.documentId);
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "指定された添付資料はこの請求書に含まれていません。" });
      const out = await storageGet(doc.fileKey);
      return { documentId: doc.id, fileKey: doc.fileKey, url: out.url, originalFileName: doc.originalFileName || null, mimeType: doc.mimeType || null };
    }),
    exportMyInvoicePackage: protectedProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      await ensureWorkerInvoiceAccess(ctx, invoice);
      const { model } = await buildWorkerInvoicePreviewModelFromSnapshot(invoice);
      const invoicePdf = await getOrCreateWorkerInvoicePdfDownload(model, input.invoiceId);
      const documents = await Promise.all(model.supportingDocuments.map(async (doc: any) => {
        const out = await storageGet(doc.fileKey);
        return { id: doc.id, fileKey: doc.fileKey, originalFileName: doc.originalFileName || null, mimeType: doc.mimeType || null, url: out.url };
      }));
      return {
        invoiceId: input.invoiceId,
        invoicePdf,
        documents,
        zipPackage: null,
        grouped: [{ invoiceId: input.invoiceId, pdfPreview: buildWorkerInvoicePdfRenderPayload(model), supportingDocuments: model.supportingDocuments }],
      };
    }),
    getSupportingDocs: protectedProcedure.input(z.object({ invoiceId: z.number() })).query(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      const me = await db.getEmployeeByUserId(ctx.user.id);
      if (me && invoice.employeeId !== me.id && !isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      const submission = await db.getClosingSubmissionByClosingEmployee(invoice.closingId, invoice.employeeId);
      if (!submission) return [];
      return db.getSupportingDocumentsBySubmission(submission.id!);
    }),
    downloadPdf: protectedProcedure.input(z.object({ invoiceId: z.number() })).mutation(async ({ ctx, input }) => {
      const invoice = await db.getWorkerInvoiceById(input.invoiceId);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND" });
      if (invoice.status === "draft") throw new TRPCError({ code: "BAD_REQUEST", message: "下書き状態ではPDFを生成できません" });
      const me = await db.getEmployeeByUserId(ctx.user.id);
      if (me && invoice.employeeId !== me.id && !isManagerLike(ctx.user.appRole) && !isSuperAdmin(ctx.user.appRole)) throw new TRPCError({ code: "FORBIDDEN" });
      const snapshots = await db.getWorkerInvoiceSnapshots(invoice.id);
      if (snapshots.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "スナップショットがありません" });
      const latestSnapshot = snapshots.sort((a: any, b: any) => b.snapshotVersion - a.snapshotVersion)[0];
      const snapshotData = JSON.parse(latestSnapshot.snapshotJson);
      const employee = await db.getEmployeeById(invoice.employeeId);
      const project = await db.getProjectById(invoice.projectId);
      const company = await db.getCompanyProfile();
      const items = await db.getWorkerInvoiceItems(invoice.id);
      const { generateWorkerInvoicePdf } = await import("./pdfWorkerInvoice");
      const pdfBuffer = await generateWorkerInvoicePdf({ invoice, items, employee, project, company, snapshotData });
      const fileKey = `worker-invoices/${invoice.id}-${Date.now()}.pdf`;
      const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");
      return { url };
    }),
  }),
});

export type AppRouter = typeof appRouter;
