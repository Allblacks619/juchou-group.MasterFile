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
import { buildClientInvoiceDraftFromV2 } from "./clientInvoiceV2Builder";
import { buildWorkerInvoicePdfRenderPayload, generateWorkerInvoicePdf } from "./workerInvoicePdf";
import { buildWorkerInvoiceDraftFromV2, WorkerMonthlyClosingNotSubmittedError } from "./workerInvoiceV2Builder";
import { seedBetaFixture, BETA_TEST_MONTH } from "./betaFixture";
import { seedSimulationFixture } from "./simulationFixture";
import { buildAccountingCsv, accountingCsvFilename, type AccountingCsvInvoice } from "./accountingCsv";
import { computeAdvanceBalance, computeAppliedOffset, computeMaxOffset, signedDelta } from "./workerAdvance";
import { resolveProjectMemberRatesForMonth, resolveWorkerPaymentRate } from "./rateResolver";
import { genbaRouter } from "./genba/router";

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

const monthlyClosingV2ProjectStatuses = ["未着手", "確認中", "情報不足", "差し戻しあり", "締め完了"] as const;
const monthlyClosingV2ParticipantStatuses = ["未確認", "出面確認済み", "交通費未入力", "情報不足", "差し戻し", "確認済み", "締め完了"] as const;
const monthlyClosingV2TransportationStatuses = ["未入力", "入力済み", "確認待ち", "確認済み", "情報不足", "集計対象外"] as const;
const monthlyClosingV2InvoiceInfoStatuses = ["確認待ち", "確認中", "確認済み", "情報不足", "集計対象外"] as const;
const monthlyClosingV2PayerTypes = ["none", "worker_paid", "company_card_etc", "company_paid", "client_paid_direct"] as const;

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


function canManageMonthlyClosingV2Transportation(role: unknown) {
  return ["super_admin", "admin", "manager", "leader", "supervisor", "accounting-manager"].includes(String(role || ""));
}

const monthlyClosingV2TransportationManagementProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = (ctx.user as any).appRole || ctx.user.role;
  if (!canManageMonthlyClosingV2Transportation(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "交通費の内部管理情報を操作する権限がありません" });
  }
  return next({ ctx });
});

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
  const { start, end } = getMonthDateRange(closingMonth);
  const [closing, project, employees, attendanceRecordsRaw] = await Promise.all([
    db.getProjectClosingByProjectMonth(projectId, closingMonth),
    db.getProjectById(projectId),
    db.getAllEmployees(),
    db.getAttendanceByProject(projectId, start, end),
  ]);

  const client = project?.clientId ? await db.getClientById(project.clientId) : null;
  const attendanceRecords = excludeRemovedGuestMarkers(attendanceRecordsRaw);
  const employeeMap = new Map<number, any>(employees.map((e: any) => [e.id, e]));

  const nonGuestByEmployee = new Map<number, any[]>();
  const guestByName = new Map<string, any[]>();
  for (const rec of attendanceRecords) {
    if (rec.employeeId) {
      if (!nonGuestByEmployee.has(rec.employeeId)) nonGuestByEmployee.set(rec.employeeId, []);
      nonGuestByEmployee.get(rec.employeeId)!.push(rec);
      continue;
    }
    const guestName = (rec.guestName || '').trim();
    if (!guestName || isRemovedGuestMarkerName(guestName)) continue;
    if (!guestByName.has(guestName)) guestByName.set(guestName, []);
    guestByName.get(guestName)!.push(rec);
  }

  const submissions = closing?.id ? await db.getClosingSubmissionsByClosing(closing.id) : [];
  const submissionByEmployee = new Map<number, any>(submissions.map((s: any) => [s.employeeId, s]));

  const targetEmployeeIds = new Set<number>([
    ...Array.from(nonGuestByEmployee.keys()),
    ...submissions.map((s: any) => Number(s.employeeId)).filter(Boolean),
  ]);

  const workerRows = await Promise.all(Array.from(targetEmployeeIds).map(async (employeeId) => {
    const records = nonGuestByEmployee.get(employeeId) || [];
    const existing = submissionByEmployee.get(employeeId);
    const attendanceDays = new Set(records.map((r: any) => { const d = new Date(r.workDate); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }).filter(Boolean)).size;
    const totalHours = records.reduce((sum: number, r: any) => sum + Number(r.hoursWorked || 0), 0) / 10;
    return {
      ...(existing || { id: `attendance-${projectId}-${closingMonth}-${employeeId}`, closingId: closing?.id || null, employeeId, status: 'pending', transportAmount: 0, expenseAmount: 0, receiptRequired: false, receiptUploaded: false, notes: null }),
      employee: employeeMap.get(employeeId) || null,
      documents: existing?.id ? await db.listClosingSubmissionDocuments(existing.id) : [],
      attendanceDays,
      totalHours,
      submissionStatus: existing?.status || 'pending',
      adminReviewStatus: existing?.status === 'approved' ? 'approved' : existing?.status || 'pending',
      isGuest: false,
    };
  }));

  const guestRows = Array.from(guestByName.entries()).map(([guestName, records]) => ({
    id: `guest-${projectId}-${closingMonth}-${guestName}`,
    employeeId: null,
    employee: { nameKanji: guestName },
    status: 'not_required',
    transportAmount: 0,
    expenseAmount: 0,
    receiptRequired: false,
    receiptUploaded: false,
    notes: null,
    documents: [],
    attendanceDays: new Set(records.map((r: any) => { const d = new Date(r.workDate); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }).filter(Boolean)).size,
    totalHours: 0,
    isGuest: true,
    excludedFromSubmission: true,
  }));

  const enrichedSubmissions = [...workerRows, ...guestRows].sort((a, b) => (a.employee?.nameKanji || '').localeCompare(b.employee?.nameKanji || '', 'ja'));
  const targetSubmissions = workerRows.filter((s) => s.status !== 'not_required');
  const pendingCount = targetSubmissions.filter((s) => s.status === 'pending' || s.status === 'rejected').length;
  const submittedCount = targetSubmissions.filter((s) => s.status === 'submitted' || s.status === 'approved').length;
  const approvedCount = targetSubmissions.filter((s) => s.status === 'approved').length;
  const receiptMissingCount = targetSubmissions.filter((s) => s.receiptRequired && !s.receiptUploaded).length;
  const canMarkReady = Boolean(closing?.id) && targetSubmissions.length > 0 && pendingCount === 0 && receiptMissingCount === 0;

  return { closing: closing || null, project, client, submissions: enrichedSubmissions, summary: { targetCount: targetSubmissions.length, pendingCount, submittedCount, approvedCount, receiptMissingCount, canMarkReady } };
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

/** 作業員単位の支払ビュー用: 締め月の全支払行を closing 付きで収集する（支払行が無い closing は空扱い）。 */
async function collectMonthPaymentRows(closingMonth: string) {
  const closings = await db.getProjectClosingsByMonth(closingMonth);
  const rows: { closing: any; payment: any }[] = [];
  for (const closing of closings) {
    if (!closing?.id) continue;
    const payments = await db.getEmployeePaymentsByClosing(closing.id);
    for (const payment of payments) rows.push({ closing, payment });
  }
  return rows;
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


const CLOSING_YEAR_SHIFT_DIAGNOSTIC_MONTHS = ["2025-04", "2025-05", "2026-04", "2026-05"] as const;
const LOW_YEAR_SHIFT_ATTENDANCE_THRESHOLD = 1;

function pairYearShiftMonth(month: string) {
  if (!/^2025-(04|05)$/.test(month)) return null;
  return month.replace(/^2025-/, "2026-");
}

async function countProjectAttendanceForMonth(projectId: number, closingMonth: string) {
  const { start, end } = getMonthDateRange(closingMonth);
  const records = excludeRemovedGuestMarkers(await db.getAttendanceByProject(projectId, start, end));
  return records.length;
}

async function buildClosingYearShiftDiagnostics() {
  const projects = await db.getAllProjects();
  const rowsByProjectMonth = new Map<string, any>();

  for (const project of projects) {
    for (const month of CLOSING_YEAR_SHIFT_DIAGNOSTIC_MONTHS) {
      const [closing, attendanceCount] = await Promise.all([
        db.getProjectClosingByProjectMonth(project.id, month),
        countProjectAttendanceForMonth(project.id, month),
      ]);
      const submissionsCount = closing?.id
        ? (await db.getClosingSubmissionsByClosing(closing.id)).length
        : 0;
      rowsByProjectMonth.set(`${project.id}:${month}`, {
        projectId: Number(project.id),
        projectName: project.name,
        closingMonth: month,
        closingExists: Boolean(closing?.id),
        closingId: closing?.id ? Number(closing.id) : null,
        closingStatus: closing?.status || null,
        attendanceCount,
        closingSubmissionsCount: submissionsCount,
        isYearShiftCandidate: false,
      });
    }
  }

  for (const project of projects) {
    for (const fromMonth of ["2025-04", "2025-05"] as const) {
      const toMonth = pairYearShiftMonth(fromMonth)!;
      const fromRow = rowsByProjectMonth.get(`${project.id}:${fromMonth}`);
      const toRow = rowsByProjectMonth.get(`${project.id}:${toMonth}`);
      if (!fromRow || !toRow) continue;
      fromRow.isYearShiftCandidate = Boolean(
        fromRow.closingExists &&
        fromRow.attendanceCount <= LOW_YEAR_SHIFT_ATTENDANCE_THRESHOLD &&
        toRow.attendanceCount > 0 &&
        !toRow.closingExists
      );
    }
  }

  return Array.from(rowsByProjectMonth.values()).sort((a: any, b: any) =>
    a.projectName.localeCompare(b.projectName, "ja") || a.closingMonth.localeCompare(b.closingMonth)
  );
}

async function repairClosingYearShiftProjectMonth(projectId: number, fromMonth: string, toMonth: string) {
  const expectedToMonth = pairYearShiftMonth(fromMonth);
  if (!expectedToMonth || expectedToMonth !== toMonth) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "2025-04/05 から対応する 2026-04/05 への修復のみ実行できます" });
  }

  const fromClosing = await db.getProjectClosingByProjectMonth(projectId, fromMonth);
  if (!fromClosing?.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${fromMonth} の締め行が見つかりません` });
  }

  const toClosing = await db.getProjectClosingByProjectMonth(projectId, toMonth);
  if (toClosing?.id) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${toMonth} の締め行が既に存在するため修復できません` });
  }

  const toAttendanceCount = await countProjectAttendanceForMonth(projectId, toMonth);
  if (toAttendanceCount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${toMonth} の出面が存在しないため修復できません` });
  }

  const updated = await db.updateProjectClosing(fromClosing.id, { closingMonth: toMonth } as any);
  return {
    success: true,
    projectId,
    closingId: Number(fromClosing.id),
    fromMonth,
    toMonth,
    toAttendanceCount,
    closing: updated,
  };
}

async function getMyClosingSubmission(projectId: number, closingMonth: string, userId: number, requestedEmployeeId?: number, actorRole?: string) {
  const employee = await db.getEmployeeByUserId(userId);
  if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員情報が見つかりません" });
  const role = actorRole || "worker";
  const canDelegate = role === "super_admin" || role === "admin" || role === "manager";
  // 作業員は自分のみ。管理者は対象未指定なら自分の月締め、指定があればその作業員（代理）。
  if (!canDelegate && requestedEmployeeId && Number(requestedEmployeeId) !== Number(employee.id)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "他の作業員の月締めは参照できません" });
  }
  const targetEmployeeId = canDelegate && requestedEmployeeId ? Number(requestedEmployeeId) : employee.id;

  const overview = await buildWorkerMonthlyOverview({
    closingMonth,
    actorUserId: userId,
    actorRole: role,
    employeeId: targetEmployeeId,
  });
  const targetHasMonthlyAttendance = Boolean(overview?.isTarget);
  const filteredLines = projectId
    ? (overview?.projectLines || []).filter((line: any) => Number(line.projectId) === Number(projectId))
    : (overview?.projectLines || []);

  const hasProjectAttendance = filteredLines.length > 0;
  const shouldInitializeProjectClosing = Number(projectId) > 0 && hasProjectAttendance;
  const closing = shouldInitializeProjectClosing
    ? await ensureClosingInitializedForProjectMonth(projectId, closingMonth)
    : await db.getProjectClosingByProjectMonth(projectId, closingMonth);
  const detail = await buildClosingDetail(projectId, closingMonth);
  const submission = closing?.id ? await db.getClosingSubmissionByClosingEmployee(closing.id!, targetEmployeeId) : null;
  const targetEmployee = targetEmployeeId === employee.id ? employee : await db.getEmployeeById(targetEmployeeId);
  // 差し戻し理由は月締めV2のレビューに保存される。作業員が理由を見て是正できるように返す。
  const v2Review = Number(projectId) > 0
    ? await db.getMonthlyClosingV2ParticipantReview(closingMonth, Number(projectId), `worker:${targetEmployeeId}`)
    : undefined;

  return {
    employee: targetEmployee || employee,
    actorEmployeeId: employee.id,
    closing,
    detail,
    submission,
    sendBackReason: (v2Review as any)?.sendBackReason || null,
    eligible: targetHasMonthlyAttendance && (!projectId || hasProjectAttendance),
    monthlyOverview: {
      ...overview,
      projectLines: filteredLines,
    },
    nonTargetReason: targetHasMonthlyAttendance
      ? (hasProjectAttendance ? null : "no_attendance_for_selected_project")
      : "no_attendance",
  };
}




async function buildWorkerMonthlyOverview(params: {
  closingMonth: string;
  actorUserId: number;
  actorRole?: string | null;
  employeeId?: number;
  projectId?: number;
}) {
  const role = params.actorRole || "worker";
  const canDelegate = role === "super_admin" || role === "admin" || role === "manager";
  const actorEmployee = await db.getEmployeeByUserId(params.actorUserId);
  // 管理者は対象未指定なら自分の月締め、指定があればその作業員（代理）。自分の従業員レコードも対象
  // 指定も無い管理者だけ対象が必要。作業員は常に自分。
  if (!actorEmployee && !params.employeeId) {
    throw new TRPCError({
      code: canDelegate ? "BAD_REQUEST" : "NOT_FOUND",
      message: canDelegate ? "target employee required for delegated monthly closing" : "従業員情報が見つかりません",
    });
  }
  if (!canDelegate && params.employeeId && Number(params.employeeId) != Number(actorEmployee!.id)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "他の作業員の月締めは参照できません" });
  }

  const targetEmployeeId = (canDelegate && params.employeeId) ? Number(params.employeeId) : Number(actorEmployee!.id);

  const targetEmployee = targetEmployeeId === Number(actorEmployee?.id)
    ? actorEmployee
    : await db.getEmployeeById(targetEmployeeId);

  const { start, end } = getMonthDateRange(params.closingMonth);
  const monthlyRecords = excludeRemovedGuestMarkers(await db.getAttendanceByDateRange(start, end));
  const workerRecords = monthlyRecords.filter((r: any) => Number(r.employeeId) === targetEmployeeId);

  const projects = await db.getAllProjects();
  const projectMap = new Map<number, any>(projects.map((p: any) => [Number(p.id), p]));

  const grouped = new Map<number, any[]>();
  for (const rec of workerRecords) {
    const pid = Number(rec.projectId);
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(rec);
  }

  const lines = await Promise.all(Array.from(grouped.entries()).map(async ([projectId, records]) => {
    // 出勤日数は実働日のみ（休=day_off/absence や 時間0 は数えない。出面表・ダッシュボードと一致）。
    const workedRecords = records.filter((r: any) => isWorkedType(r.workType) && Number(r.hoursWorked || 0) > 0);
    const attendanceDays = new Set(workedRecords.map((r: any) => { const d = new Date(r.workDate); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }).filter(Boolean)).size;
    const totalHours = workedRecords.reduce((sum: number, r: any) => sum + Number(r.hoursWorked || 0), 0) / 10;
    const overtimeHours = records.reduce((sum: number, r: any) => sum + Number(r.overtimeHours || 0), 0) / 10;

    const closing = await db.getProjectClosingByProjectMonth(projectId, params.closingMonth);
    const submission = closing?.id ? await db.getClosingSubmissionByClosingEmployee(closing.id, targetEmployeeId) : null;

    return {
      projectId,
      projectName: projectMap.get(projectId)?.name || `Project #${projectId}`,
      attendanceDays,
      totalHours,
      overtimeHours,
      guestExcluded: false,
      submissionStatus: submission?.status || null,
      adminReviewStatus: submission?.status === "approved" ? "approved" : submission?.status || null,
    };
  }));

  const filteredLines = params.projectId
    ? lines.filter((line) => Number(line.projectId) === Number(params.projectId))
    : lines;

  return {
    employeeId: targetEmployeeId,
    employeeName: targetEmployee?.nameKanji || targetEmployee?.nameRomaji || null,
    closingMonth: params.closingMonth,
    isTarget: lines.length > 0,
    targetReason: lines.length > 0 ? "attendance_found" : "no_attendance",
    projectLines: filteredLines.sort((a, b) => a.projectName.localeCompare(b.projectName, "ja")),
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

/** 請求書に紐づく現場ID一覧（複数現場の合算請求は internalMemo の projectIds= から復元）。 */
function getInvoiceProjectIds(invoice: any): number[] {
  const memo = String(invoice?.internalMemo || "");
  const memoMatch = memo.match(/projectIds=([\d,]+)/);
  return memoMatch
    ? Array.from(new Set(memoMatch[1].split(",").map(Number).filter(Boolean)))
    : invoice?.projectId ? [Number(invoice.projectId)] : [];
}

/** 請求書の対象月×現場の出面表PDFをバッファで生成する（ダウンロード用と添付合体用の共通処理）。
 * 月締め確定後の請求書用のため、平日の未記入・休は「×」で埋める（見本準拠）。 */
async function buildInvoiceAttendanceSheetBuffers(invoice: any, opts?: { includeGuests?: boolean }) {
  const period = invoice.periodStart ? new Date(invoice.periodStart) : new Date();
  const year = period.getUTCFullYear();
  const month = period.getUTCMonth() + 1;
  const projectIds = getInvoiceProjectIds(invoice);
  if (!projectIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "請求書に紐づく現場が特定できません" });
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const [allEmployees, allProjects, company] = await Promise.all([db.getAllEmployees(), db.getAllProjects(), db.getCompanyProfile()]);
  const { generateAttendancePdf } = await import("./pdfAttendance");

  const sheets: Array<{ projectId: number; projectName: string; fileName: string; hasData: boolean; buffer: Buffer }> = [];
  for (const projectId of projectIds) {
    const records = await db.getAttendanceByDateRange(startDate, endDate, projectId);
    const project = (allProjects as any[]).find((p) => p.id === projectId);
    const empIds = new Set<number>();
    const guestNameSet = new Set<string>();
    for (const rec of records as any[]) {
      if (rec.employeeId) empIds.add(rec.employeeId);
      if (rec.guestName) guestNameSet.add(rec.guestName);
    }
    const employees = (allEmployees as any[])
      .filter((e) => empIds.has(e.id))
      .map((e) => ({ id: e.id, nameKanji: e.nameKanji || e.nameRomaji || `ID:${e.id}` }));

    const buffer = await generateAttendancePdf({
      year,
      month,
      projectName: project?.name || `Project #${projectId}`,
      companyName: company?.companyName || "充寵グループ",
      logoUrl: company?.logoUrl || undefined,
      watermarkUrl: company?.watermarkUrl || undefined,
      employees,
      guestNames: Array.from(guestNameSet),
      records: (records as any[]).map((r) => ({
        employeeId: r.employeeId,
        guestName: r.guestName,
        workDate: r.workDate,
        hoursWorked: r.hoursWorked,
        overtimeHours: r.overtimeHours,
        workType: r.workType,
        shiftType: r.shiftType || "day",
        notes: r.notes,
      })),
      includeGuests: opts?.includeGuests !== false,
      fillAbsentWeekdays: true,
    });

    const fileName = `attendance-invoice-${invoice.id}-${projectId}-${year}-${String(month).padStart(2, "0")}.pdf`;
    sheets.push({ projectId, projectName: project?.name || `現場${projectId}`, fileName, hasData: records.length > 0, buffer });
  }
  return { year, month, sheets };
}

/**
 * 請求書に添付できるアップロード済み書類の候補を集める。
 * 対象: 作業員が月締めで提出した領収書等（closing_submission_documents＋旧単発領収書）と、
 * 管理側が月締めV2で登録した交通費領収書。
 */
async function collectInvoiceAttachableDocuments(invoice: any) {
  const period = invoice.periodStart ? new Date(invoice.periodStart) : new Date();
  const monthKey = `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, "0")}`;
  const projectIds = getInvoiceProjectIds(invoice);
  const [allEmployees, allProjects] = await Promise.all([db.getAllEmployees(), db.getAllProjects()]);
  const employeeName = (id: number | null | undefined) => {
    if (!id) return null;
    const e = (allEmployees as any[]).find((x) => Number(x.id) === Number(id));
    return e?.nameKanji || e?.nameRomaji || `従業員${id}`;
  };
  const projectName = (id: number) => (allProjects as any[]).find((p) => Number(p.id) === Number(id))?.name || `現場${id}`;

  const seen = new Set<string>();
  const documents: Array<{ key: string; fileName: string; url: string; mimeType: string; source: string; projectName: string; workerName: string | null }> = [];
  const push = (doc: { key: string; fileName: string; url: string; mimeType: string; source: string; projectName: string; workerName: string | null }) => {
    if (!doc.key || seen.has(doc.key)) return;
    seen.add(doc.key);
    documents.push(doc);
  };

  for (const projectId of projectIds) {
    // 作業員アップロード書類（複数）
    for (const doc of await db.listClosingSubmissionDocumentsByProjectMonth(projectId, monthKey) as any[]) {
      push({
        key: doc.fileKey,
        fileName: doc.fileName,
        url: doc.fileUrl,
        mimeType: doc.mimeType || "application/octet-stream",
        source: "作業員提出",
        projectName: projectName(projectId),
        workerName: employeeName(doc.employeeId),
      });
    }
    // 旧: 提出行に直接付いた領収書
    const closing = await db.getProjectClosingByProjectMonth(projectId, monthKey);
    if (closing?.id) {
      for (const submission of await db.getClosingSubmissionsByClosing(closing.id) as any[]) {
        if (submission.receiptFileKey) {
          push({
            key: submission.receiptFileKey,
            fileName: submission.receiptFileName || "領収書",
            url: submission.receiptFileUrl || "",
            mimeType: submission.receiptMimeType || "application/octet-stream",
            source: "作業員提出",
            projectName: projectName(projectId),
            workerName: employeeName(submission.employeeId),
          });
        }
      }
    }
    // 管理側の交通費領収書（月締めV2）
    for (const receipt of await db.getMonthlyClosingV2ExpenseLineReceiptsByMonthProject(monthKey, projectId) as any[]) {
      push({
        key: receipt.receiptFileKey,
        fileName: receipt.originalFileName || "領収書",
        url: receipt.receiptFileUrl || "",
        mimeType: receipt.mimeType || "application/octet-stream",
        source: "交通費領収書",
        projectName: projectName(projectId),
        workerName: employeeName(receipt.workerId),
      });
    }
  }
  return documents;
}

export const appRouter = router({
  system: systemRouter,

  /**
   * 現場ビジョン (genba) — M1基盤。加算専用の独立ルーター (server/genba/router.ts)。
   * GENBA_ENABLED=false で全手続きが FORBIDDEN を返す。
   */
  genba: genbaRouter,

  /**
   * Beta test fixture (固定Betaセット) — super_admin only. Creates/resets the fixed Beta set
   * (Beta_Client_01 / Beta_Worker_01 / Beta_Project_01, month 2024-01) for reproducible
   * verification. Only touches Beta_* entities + 2024-01; never production data.
   */
  betaFixture: router({
    seed: superAdminProcedure.mutation(async ({ ctx }) => {
      const result = await seedBetaFixture();
      await safeAuditLog(ctx.user.id, "betaFixture.seed", "beta_fixture", {
        employeeId: result.workerId,
        projectId: result.projectId,
        note: `Beta検証データを作成/リセット (${result.targetMonth})`,
      });
      return result;
    }),
    info: superAdminProcedure.query(() => ({ targetMonth: BETA_TEST_MONTH })),
    /**
     * 本格シミュレーション（取引先1・現場3・作業員2, 2025-01）を作成/リセット。super_admin のみ。
     * SIM_* エンティティ + 2025-01 のみを操作し、本番データには触れない。
     */
    seedSimulation: superAdminProcedure.mutation(async ({ ctx }) => {
      const result = await seedSimulationFixture();
      await safeAuditLog(ctx.user.id, "betaFixture.seedSimulation", "beta_fixture", {
        note: `シミュレーション検証データを作成/リセット (${result.targetMonth}, 現場${result.projects.length}/作業員${result.workers.length}/出面${result.attendanceRecords})`,
      });
      return result;
    }),
  }),

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
        // インボイス登録番号: 数字13桁を強制し、先頭のTはサーバ側で自動付与する。
        // 未対応事業者（チェック解除）にした場合は番号もクリアし、消費税10%判定に残らないようにする。
        if (input.invoiceIssuerNumber !== undefined) {
          const digits = String(input.invoiceIssuerNumber).replace(/[^0-9]/g, "");
          if (digits.length === 0) {
            data.invoiceIssuerNumber = null;
          } else if (digits.length === 13) {
            data.invoiceIssuerNumber = `T${digits}`;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "インボイス登録番号は数字13桁で入力してください（先頭のTは自動で付きます）" });
          }
        }
        if (input.isInvoiceIssuer === false) data.invoiceIssuerNumber = null;
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
        // インボイス登録番号: マイプロフィール側と同じ正規化（数字13桁必須・Tは自動付与、チェックOFFでクリア）。
        if (updateData.invoiceIssuerNumber !== undefined) {
          const digits = String(updateData.invoiceIssuerNumber).replace(/[^0-9]/g, "");
          if (digits.length === 0) {
            data.invoiceIssuerNumber = null;
          } else if (digits.length === 13) {
            data.invoiceIssuerNumber = `T${digits}`;
          } else {
            throw new TRPCError({ code: "BAD_REQUEST", message: "インボイス登録番号は数字13桁で入力してください（先頭のTは自動で付きます）" });
          }
        }
        if (updateData.isInvoiceIssuer === false) data.invoiceIssuerNumber = null;
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

        const company = await db.getCompanyProfile();
        const { generateAttendancePdf } = await import("./pdfAttendance");
        const pdfBuffer = await generateAttendancePdf({
          year: input.year,
          month: input.month,
          projectName: project?.name || `Project #${input.projectId}`,
          companyName: company?.companyName || "充寵グループ",
          logoUrl: company?.logoUrl || undefined,
          watermarkUrl: company?.watermarkUrl || undefined,
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

  monthlyClosingV2: router({
    /**
     * Project-centric dashboard (現場単位ダッシュボード)
     * Returns one row per project that had attendance in the target month.
     * Each project row includes a list of participating workers with their status.
     */
    projectDashboard: leaderOrAdminProcedure
      .input(z.object({ targetMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const { start, end } = getMonthDateRange(input.targetMonth);
        const [recordsRaw, employees, allProjects, allClients, submissions] = await Promise.all([
          db.getAttendanceByDateRange(start, end),
          db.getAllEmployees(),
          db.getAllProjects(),
          db.getAllClients(),
          db.getMonthlyClosingV2WorkerSubmissionsByMonth(input.targetMonth),
        ]);
        const employeeMap = new Map<number, any>(employees.map((e: any) => [Number(e.id), e]));
        const projectMap = new Map<number, any>(allProjects.map((p: any) => [Number(p.id), p]));
        const clientMap = new Map<number, any>(allClients.map((c: any) => [Number(c.id), c]));
        const submissionMap = new Map<number, any>(submissions.map((s: any) => [Number(s.workerId), s]));

        // Group attendance: projectId -> workerId -> { attendanceCount }
        const projectWorkerMap = new Map<number, Map<number, { attendanceCount: number }>>();
        for (const record of excludeRemovedGuestMarkers(recordsRaw as any[])) {
          if (!record.employeeId) continue;
          // 出勤日数: 出面表と同じく、出勤扱い かつ 実働時間>0 のみ。休・欠勤・時間0は数えない。
          if (!isWorkedType(record.workType) || Number(record.hoursWorked || 0) <= 0) continue;
          const projectId = Number(record.projectId);
          const workerId = Number(record.employeeId);
          if (!projectWorkerMap.has(projectId)) projectWorkerMap.set(projectId, new Map());
          const wm = projectWorkerMap.get(projectId)!;
          const existing = wm.get(workerId) || { attendanceCount: 0 };
          existing.attendanceCount += 1;
          wm.set(workerId, existing);
        }

        // Derive worker-status labels
        const WORKER_STATUS_LABELS: Record<string, string> = {
          not_submitted: "未確認",
          submitted: "確認中",
          sent_back: "差戻し",
          accepted: "確認済",
          ready_to_close: "締め可能",
          closed: "締め完了",
        };

        // Build project rows
        const projectRows = [];
        for (const [projectId, workerMap] of Array.from(projectWorkerMap.entries())) {
          const project = projectMap.get(projectId);
          const client = project?.clientId ? clientMap.get(Number(project.clientId)) : null;

          const workerRows = [];
          for (const [workerId, stats] of Array.from(workerMap.entries())) {
            const employee = employeeMap.get(workerId);
            const submission = submissionMap.get(workerId);
            const workerStatus = submission?.status || "not_submitted";
            workerRows.push({
              workerId,
              workerName: employee?.nameKanji || employee?.nameRomaji || `従業員ID:${workerId}`,
              attendanceCount: stats.attendanceCount,
              status: workerStatus,
              statusLabel: WORKER_STATUS_LABELS[workerStatus] || "未確認",
              expenseStatus: "未入力", // Phase 2 will query expense lines
            });
          }
          workerRows.sort((a, b) => a.workerName.localeCompare(b.workerName, "ja"));

          // Derive project-level status from worker statuses
          const statuses = workerRows.map((w) => w.status);
          let projectStatus: string;
          let projectStatusLabel: string;
          if (statuses.length === 0) {
            projectStatus = "not_started"; projectStatusLabel = "未着手";
          } else if (statuses.every((s) => s === "closed")) {
            projectStatus = "closed"; projectStatusLabel = "締め完了";
          } else if (statuses.some((s) => s === "sent_back")) {
            projectStatus = "has_sendback"; projectStatusLabel = "差戻しあり";
          } else if (statuses.some((s) => s === "not_submitted")) {
            projectStatus = "info_missing"; projectStatusLabel = "情報不足";
          } else if (statuses.every((s) => s === "accepted" || s === "ready_to_close" || s === "closed")) {
            projectStatus = "ready"; projectStatusLabel = "確認中";
          } else {
            projectStatus = "in_review"; projectStatusLabel = "確認中";
          }

          projectRows.push({
            projectId,
            projectName: project?.name || `現場ID:${projectId}`,
            clientId: project?.clientId ? Number(project.clientId) : null,
            clientName: client?.name || null,
            workerCount: workerRows.length,
            projectStatus,
            projectStatusLabel,
            workers: workerRows,
          });
        }

        projectRows.sort((a, b) => a.projectName.localeCompare(b.projectName, "ja"));
        return { targetMonth: input.targetMonth, projects: projectRows };
      }),
    dashboard: leaderOrAdminProcedure
      .input(z.object({ targetMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const { start, end } = getMonthDateRange(input.targetMonth);
        const [recordsRaw, employees, projects, clients, submissions, projectReviews, participantReviews, transportationLines] = await Promise.all([
          db.getAttendanceByDateRange(start, end),
          db.getAllEmployees(),
          db.getAllProjects(),
          db.getAllClients(),
          db.getMonthlyClosingV2WorkerSubmissionsByMonth(input.targetMonth),
          db.getMonthlyClosingV2ProjectReviewsByMonth(input.targetMonth),
          db.getMonthlyClosingV2ParticipantReviewsByMonth(input.targetMonth),
          db.getMonthlyClosingV2TransportationLinesByMonth(input.targetMonth),
        ]);

        // 交通費が入力済みの (現場, 作業員)。行が存在すれば 0円（交通費なし）でも「入力済み」。
        // 「交通費未入力」の警告は、提出も交通費入力も無い場合だけに出す。
        const transportEnteredKeys = new Set<string>(
          (transportationLines as any[]).map((line) => `${Number(line.projectId)}:${Number(line.workerId)}`)
        );

        const employeeMap = new Map<number, any>(employees.map((employee: any) => [Number(employee.id), employee]));
        const projectMap = new Map<number, any>(projects.map((project: any) => [Number(project.id), project]));
        const clientMap = new Map<number, any>(clients.map((client: any) => [Number(client.id), client]));
        const submissionMap = new Map<number, any>(submissions.map((submission: any) => [Number(submission.workerId), submission]));
        const projectReviewMap = new Map<number, any>(projectReviews.map((review: any) => [Number(review.projectId), review]));
        const participantReviewMap = new Map<string, any>(participantReviews.map((review: any) => [`${Number(review.projectId)}:${review.participantKey}`, review]));
        const projectGroups = new Map<number, any>();

        const buildWorkerName = (workerId: number) => {
          const employee = employeeMap.get(workerId);
          return employee?.nameKanji || employee?.nameRomaji || `従業員ID:${workerId}`;
        };

        const buildParticipantStatuses = (submission: any | undefined, isGuest: boolean, hasTransportEntry: boolean) => {
          if (isGuest) {
            return {
              transportationStatus: "集計対象外",
              invoiceInfoStatus: "集計対象外",
              individualStatus: "未確認",
              sendBackReason: "",
              missingInfo: "ゲストのため集計対象外",
              warningCount: 0,
            };
          }

          if (!submission) {
            // 交通費が入力済み（0円=交通費なし を含む）なら「交通費未入力」の警告は出さない。
            if (hasTransportEntry) {
              return {
                transportationStatus: "入力済み",
                invoiceInfoStatus: "確認待ち",
                individualStatus: "出面確認済み",
                sendBackReason: "",
                missingInfo: "",
                warningCount: 0,
              };
            }
            return {
              transportationStatus: "未入力",
              invoiceInfoStatus: "確認待ち",
              individualStatus: "交通費未入力",
              sendBackReason: "",
              missingInfo: "交通費・請求情報の確認が必要です",
              warningCount: 1,
            };
          }

          if (submission.status === "sent_back") {
            return {
              transportationStatus: "確認待ち",
              invoiceInfoStatus: "確認待ち",
              individualStatus: "差し戻し",
              sendBackReason: submission.sendBackReason || "差し戻し理由を確認してください",
              missingInfo: "差し戻し対応が必要です",
              warningCount: 1,
            };
          }

          if (submission.status === "closed") {
            return {
              transportationStatus: "入力済み",
              invoiceInfoStatus: "確認済み",
              individualStatus: "締め完了",
              sendBackReason: "",
              missingInfo: "",
              warningCount: 0,
            };
          }

          if (submission.status === "accepted" || submission.status === "ready_to_close") {
            return {
              transportationStatus: "入力済み",
              invoiceInfoStatus: "確認済み",
              individualStatus: "確認済み",
              sendBackReason: "",
              missingInfo: "",
              warningCount: 0,
            };
          }

          if (submission.status === "submitted") {
            return {
              transportationStatus: "入力済み",
              invoiceInfoStatus: "確認中",
              individualStatus: "出面確認済み",
              sendBackReason: "",
              missingInfo: "請求情報の確認中です",
              warningCount: 0,
            };
          }

          return {
            transportationStatus: "未入力",
            invoiceInfoStatus: "情報不足",
            individualStatus: "情報不足",
            sendBackReason: "",
            missingInfo: "提出情報が不足しています",
            warningCount: 1,
          };
        };

        const deriveProjectStatus = (participants: any[]) => {
          const aggregateParticipants = participants.filter((participant) => !participant.isAggregationExcluded);
          if (aggregateParticipants.length === 0) return "未着手";
          if (aggregateParticipants.some((participant) => participant.individualStatus === "差し戻し")) return "差し戻しあり";
          if (aggregateParticipants.some((participant) => participant.individualStatus === "情報不足" || participant.individualStatus === "交通費未入力")) return "情報不足";
          if (aggregateParticipants.every((participant) => participant.individualStatus === "締め完了")) return "締め完了";
          if (aggregateParticipants.some((participant) => participant.individualStatus === "出面確認済み" || participant.individualStatus === "確認済み")) return "確認中";
          return "未着手";
        };

        // A stored (manual) project status is only honored when the current participants still
        // support it; otherwise it is stale — e.g. 差し戻しあり left over after the participant was
        // resolved to 締め完了 — and we fall back to the status derived from the participants.
        const reconcileProjectStatus = (stored: string | undefined, participants: any[]) => {
          const derived = deriveProjectStatus(participants);
          if (!stored) return derived;
          const aggregate = participants.filter((p) => !p.isAggregationExcluded);
          const someStatus = (s: string) => aggregate.some((p) => p.individualStatus === s);
          if (stored === "差し戻しあり") return someStatus("差し戻し") ? stored : derived;
          if (stored === "情報不足") return (someStatus("情報不足") || someStatus("交通費未入力")) ? stored : derived;
          if (stored === "締め完了") return aggregate.length > 0 && aggregate.every((p) => p.individualStatus === "締め完了") ? stored : derived;
          return stored;
        };

        for (const record of excludeRemovedGuestMarkers(recordsRaw as any[])) {
          const projectId = Number(record.projectId);
          const project = projectMap.get(projectId);
          const client = project?.clientId ? clientMap.get(Number(project.clientId)) : null;
          const projectGroup = projectGroups.get(projectId) || {
            targetMonth: input.targetMonth,
            projectId,
            projectName: project?.name || `現場ID:${projectId}`,
            clientId: project?.clientId ? Number(project.clientId) : null,
            clientName: client?.name || "未設定",
            participantCount: 0,
            attendanceCount: 0,
            closingStatus: projectReviewMap.get(projectId)?.status || "未着手",
            warningCount: 0,
            warnings: [] as string[],
            participants: [] as any[],
          };

          const isGuest = !record.employeeId;
          const guestName = record.guestName || "ゲスト";
          const participantKey = isGuest ? `guest:${guestName}` : `worker:${Number(record.employeeId)}`;
          let participant = projectGroup.participants.find((item: any) => item.participantKey === participantKey);

          if (!participant) {
            const workerId = record.employeeId ? Number(record.employeeId) : null;
            const submission = workerId ? submissionMap.get(workerId) : undefined;
            const hasTransportEntry = workerId != null && transportEnteredKeys.has(`${projectId}:${workerId}`);
            const statuses = buildParticipantStatuses(submission, isGuest, hasTransportEntry);
            const review = participantReviewMap.get(`${projectId}:${participantKey}`);
            const isAggregationExcluded = review?.isAggregationExcluded ?? isGuest;
            // 保存済みステータスが「交通費未入力」でも、その後交通費が入力済みなら陳腐化と見なして自動導出に戻す。
            const staleTransportReview = review?.individualStatus === "交通費未入力" && hasTransportEntry;
            const reviewedStatus = staleTransportReview ? undefined : review?.individualStatus;
            const warningCount = isAggregationExcluded ? 0 : reviewedStatus ? (["交通費未入力", "情報不足", "差し戻し"].includes(reviewedStatus) ? 1 : 0) : statuses.warningCount;
            participant = {
              participantKey,
              workerId,
              workerName: isGuest ? guestName : buildWorkerName(workerId!),
              category: isGuest ? (isAggregationExcluded ? "ゲスト / 集計対象外" : "ゲスト / 管理者により集計対象") : (isAggregationExcluded ? "作業員 / 集計対象外" : "作業員"),
              isGuest,
              isAggregationExcluded,
              attendanceCount: 0,
              transportationStatus: (staleTransportReview ? undefined : review?.transportationStatus) || (isAggregationExcluded && isGuest ? "集計対象外" : statuses.transportationStatus),
              invoiceInfoStatus: review?.invoiceInfoStatus || (isAggregationExcluded && isGuest ? "集計対象外" : statuses.invoiceInfoStatus),
              individualStatus: reviewedStatus || statuses.individualStatus,
              sendBackReason: review?.sendBackReason || statuses.sendBackReason,
              missingInfo: review?.missingInfo || (isAggregationExcluded && isGuest ? "ゲストのため集計対象外" : statuses.missingInfo),
              aggregationOverrideReason: review?.aggregationOverrideReason || "",
              aggregationOverrideBy: review?.aggregationOverrideBy || null,
              aggregationOverrideAt: review?.aggregationOverrideAt || null,
              warningCount,
            };
            projectGroup.participants.push(participant);
          }

          // 出勤日数: count only actual worked days, matching the 出面表 (pdfAttendance):
          // worked type AND hoursWorked > 0. 休・欠勤、および時間0のレコードは数えない。
          if (isWorkedType(record.workType) && Number(record.hoursWorked || 0) > 0) {
            participant.attendanceCount += 1;
            projectGroup.attendanceCount += 1;
          }
          projectGroups.set(projectId, projectGroup);
        }

        const rows = Array.from(projectGroups.values()).map((projectGroup) => {
          projectGroup.participants.sort((a: any, b: any) => {
            if (a.isGuest !== b.isGuest) return a.isGuest ? 1 : -1;
            return a.workerName.localeCompare(b.workerName, "ja");
          });
          projectGroup.participantCount = projectGroup.participants.filter((participant: any) => !participant.isAggregationExcluded).length;
          projectGroup.warningCount = projectGroup.participants
            .filter((participant: any) => !participant.isAggregationExcluded)
            .reduce((sum: number, participant: any) => sum + participant.warningCount, 0);
          projectGroup.warnings = projectGroup.warningCount > 0 ? [`${projectGroup.warningCount}件`] : [];
          projectGroup.closingStatus = reconcileProjectStatus(projectReviewMap.get(projectGroup.projectId)?.status, projectGroup.participants);
          return projectGroup;
        });

        return {
          targetMonth: input.targetMonth,
          rows: rows.sort((a, b) => {
            const clientCompare = a.clientName.localeCompare(b.clientName, "ja");
            if (clientCompare !== 0) return clientCompare;
            return a.projectName.localeCompare(b.projectName, "ja");
          }),
        };
      }),
    getTransportationExpenses: monthlyClosingV2TransportationManagementProcedure
      .input(z.object({
        targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
        projectId: z.number().int().positive(),
      }))
      .query(async ({ input }) => {
        const lines = await db.getMonthlyClosingV2ExpenseLinesByProjectMonth(input.projectId, input.targetMonth);
        const receipts = await db.getMonthlyClosingV2ExpenseLineReceiptsByExpenseLineIds(lines.map((line: any) => Number(line.id)));
        const receiptsByLine = new Map<number, any[]>();
        for (const receipt of receipts as any[]) {
          const lineReceipts = receiptsByLine.get(Number(receipt.expenseLineId)) || [];
          lineReceipts.push(receipt);
          receiptsByLine.set(Number(receipt.expenseLineId), lineReceipts);
        }
        const result: Record<number, { amount: number; payerType: string; clientBillable: boolean; memo: string | null; receiptStatus: string; receiptCount: number; receipts: any[] }> = {};
        for (const line of lines as any[]) {
          if (line.workerId) {
            const lineReceipts = receiptsByLine.get(Number(line.id)) || [];
            result[Number(line.workerId)] = {
              amount: Number(line.amount || 0),
              payerType: db.payerTypeFromPaymentMethod(line),
              clientBillable: line.paymentMethod === "paid_by_client" ? false : Boolean(line.isClientBillable),
              memo: line.memo ?? null,
              receiptStatus: lineReceipts.length > 0 ? "添付済み" : "未添付",
              receiptCount: lineReceipts.length,
              receipts: lineReceipts.map((receipt: any) => ({
                id: receipt.id,
                fileName: receipt.originalFileName,
                fileUrl: receipt.receiptFileUrl,
                mimeType: receipt.mimeType,
                fileSize: receipt.fileSize,
                uploadedAt: receipt.uploadedAt,
              })),
            };
          }
        }
        return result;
      }),
    upsertTransportationExpense: monthlyClosingV2TransportationManagementProcedure
      .input(z.object({
        targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
        projectId: z.number().int().positive(),
        workerId: z.number().int().positive(),
        payerType: z.enum(monthlyClosingV2PayerTypes),
        clientBillable: z.boolean(),
        amount: z.number().int().min(0).optional().default(0),
        memo: z.string().max(500).optional().default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertMonthlyClosingV2TransportationExpense({
          workerId: input.workerId,
          projectId: input.projectId,
          targetMonth: input.targetMonth,
          payerType: input.payerType,
          clientBillable: input.clientBillable,
          amount: input.amount,
          memo: input.memo?.trim() || null,
          updatedBy: ctx.user.id,
        });
      }),
    uploadTransportationReceipt: monthlyClosingV2TransportationManagementProcedure
      .input(z.object({
        targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
        projectId: z.number().int().positive(),
        workerId: z.number().int().positive(),
        base64: z.string(),
        mimeType: z.enum(["application/pdf", "image/jpeg", "image/jpg", "image/png"]),
        fileName: z.string().min(1).max(512),
        payerType: z.enum(monthlyClosingV2PayerTypes).optional().default("company_card_etc"),
      }))
      .mutation(async ({ ctx, input }) => {
        const { start, end } = getMonthDateRange(input.targetMonth);
        const attendance = await db.getAttendanceByDateRange(start, end, input.projectId);
        const hasWorkerAttendance = attendance.some((record: any) => Number(record.employeeId) === input.workerId);
        if (!hasWorkerAttendance) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "対象月・現場に該当作業員の出勤がありません" });
        }

        const buffer = Buffer.from(input.base64, "base64");
        const validationError = validateFile(input.fileName, input.mimeType, buffer.length);
        if (validationError) throw new TRPCError({ code: "BAD_REQUEST", message: validationError.replace("WEBP、", "") });

        let line = (await db.getMonthlyClosingV2ExpenseLinesByWorkerProjectMonth(input.workerId, input.projectId, input.targetMonth))[0];
        if (!line) {
          line = await db.upsertMonthlyClosingV2TransportationExpense({
            workerId: input.workerId,
            projectId: input.projectId,
            targetMonth: input.targetMonth,
            payerType: input.payerType,
            clientBillable: false,
            amount: 0,
            memo: null,
            updatedBy: ctx.user.id,
          });
        }

        const suffix = nanoid(8);
        const safeFileName = input.fileName.replace(/[\/]/g, "_");
        const fileKey = `monthly-closing-v2/${input.targetMonth}/project-${input.projectId}/worker-${input.workerId}/transport-${suffix}-${safeFileName}`;
        const { url } = await storagePut(fileKey, buffer, input.mimeType);
        const receipt = await db.createMonthlyClosingV2ExpenseLineReceipt({
          expenseLineId: Number(line.id),
          workerId: input.workerId,
          targetMonth: input.targetMonth,
          projectId: input.projectId,
          receiptFileKey: fileKey,
          receiptFileUrl: url,
          originalFileName: input.fileName,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
        });
        await safeAuditLog(ctx.user.id, "monthlyClosingV2.transportationReceipt.upload", "monthly_closing_v2_expense_line", {
          entityId: Number(line.id),
          projectId: input.projectId,
          employeeId: input.workerId,
          note: `${input.targetMonth} 交通費領収書アップロード: ${input.fileName}`,
        });
        return { receiptId: receipt.id, url, fileName: input.fileName };
      }),
    transportationBillingSummary: monthlyClosingV2TransportationManagementProcedure
      .input(z.object({ targetMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const [summaries, projects, clients] = await Promise.all([
          db.getMonthlyClosingV2ClientTransportationBillingSummary(input.targetMonth),
          db.getAllProjects(),
          db.getAllClients(),
        ]);
        const projectMap = new Map(projects.map((project: any) => [Number(project.id), project]));
        const clientMap = new Map(clients.map((client: any) => [Number(client.id), client]));
        return Promise.all((summaries as any[]).map(async (summary) => {
          const project = summary.projectId ? projectMap.get(Number(summary.projectId)) : null;
          const clientId = summary.clientId ? Number(summary.clientId) : (project?.clientId ? Number(project.clientId) : null);
          const client = clientId ? clientMap.get(clientId) : null;
          const projectId = summary.projectId ? Number(summary.projectId) : null;
          const billableLines = projectId
            ? (await db.getMonthlyClosingV2ExpenseLinesByProjectMonth(projectId, input.targetMonth)).filter((line: any) => line.isClientBillable && line.paymentMethod !== "paid_by_client")
            : [];
          const receipts = await db.getMonthlyClosingV2ExpenseLineReceiptsByExpenseLineIds(billableLines.map((line: any) => Number(line.id)));
          return {
            targetMonth: input.targetMonth,
            clientId,
            clientName: client?.name || "未設定",
            projectId,
            projectName: project?.name || (projectId ? `現場ID:${projectId}` : "未設定"),
            transportationAmount: Number(summary.totalAmount || 0),
            lineCount: Number(summary.lineCount || 0),
            receiptCount: receipts.length,
            receiptReferences: (receipts as any[]).map((receipt) => ({
              id: receipt.id,
              fileName: receipt.originalFileName,
              fileUrl: receipt.receiptFileUrl,
              mimeType: receipt.mimeType,
            })),
            note: "作業員別・日別内訳は社内管理情報のため標準請求表示には含めません。関連領収書は交通費明細に紐づけて参照します。",
          };
        }));
      }),
    updateProjectStatus: leaderOrAdminProcedure
      .input(z.object({
        targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
        projectId: z.number().int().positive(),
        status: z.enum(monthlyClosingV2ProjectStatuses),
      }))
      .mutation(async ({ ctx, input }) => {
        return db.upsertMonthlyClosingV2ProjectReview({
          targetMonth: input.targetMonth,
          projectId: input.projectId,
          status: input.status,
          updatedBy: ctx.user.id,
        });
      }),
    updateParticipantStatus: leaderOrAdminProcedure
      .input(z.object({
        targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
        projectId: z.number().int().positive(),
        participantKey: z.string().min(1).max(255),
        workerId: z.number().int().positive().nullable().optional(),
        guestName: z.string().max(255).nullable().optional(),
        individualStatus: z.enum(monthlyClosingV2ParticipantStatuses),
        transportationStatus: z.enum(monthlyClosingV2TransportationStatuses),
        invoiceInfoStatus: z.enum(monthlyClosingV2InvoiceInfoStatuses),
        sendBackReason: z.string().max(2000).optional().default(""),
        missingInfo: z.string().max(2000).optional().default(""),
        isAggregationExcluded: z.boolean(),
        aggregationOverrideReason: z.string().max(2000).optional().default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const isAdmin = isPrivilegedAppRole((ctx.user as any).appRole);
        const isGuestParticipant = input.participantKey.startsWith("guest:");
        const defaultExcluded = isGuestParticipant;
        const currentReview = await db.getMonthlyClosingV2ParticipantReview(input.targetMonth, input.projectId, input.participantKey);
        const currentExcluded = currentReview?.isAggregationExcluded ?? defaultExcluded;
        const changesAggregationInclusion = input.isAggregationExcluded !== currentExcluded;

        if (changesAggregationInclusion && !isAdmin) {
          throw new TRPCError({ code: "FORBIDDEN", message: "集計対象の変更は管理者のみ実行できます" });
        }
        if (changesAggregationInclusion && input.aggregationOverrideReason.trim().length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "集計対象を変更する理由を入力してください" });
        }

        const aggregationAudit = changesAggregationInclusion
          ? {
              aggregationOverrideReason: input.aggregationOverrideReason.trim(),
              aggregationOverrideBy: ctx.user.id,
              aggregationOverrideAt: new Date(),
            }
          : {
              aggregationOverrideReason: input.aggregationOverrideReason.trim() || null,
              aggregationOverrideBy: null,
              aggregationOverrideAt: null,
            };

        const review = await db.upsertMonthlyClosingV2ParticipantReview({
          targetMonth: input.targetMonth,
          projectId: input.projectId,
          participantKey: input.participantKey,
          workerId: input.workerId ?? null,
          guestName: input.guestName ?? null,
          individualStatus: input.individualStatus,
          transportationStatus: input.transportationStatus,
          invoiceInfoStatus: input.invoiceInfoStatus,
          sendBackReason: input.sendBackReason.trim(),
          missingInfo: input.missingInfo.trim(),
          isAggregationExcluded: input.isAggregationExcluded,
          ...aggregationAudit,
          updatedBy: ctx.user.id,
        });

        // V2の承認/差し戻しを作業員側(V1提出)へ反映するブリッジ。
        // 差し戻し→rejected（作業員が再編集・再提出できる）、確認済み/締め完了→approved。
        if (input.workerId) {
          const closing = await db.getProjectClosingByProjectMonth(input.projectId, input.targetMonth);
          const submission = closing?.id ? await db.getClosingSubmissionByClosingEmployee(closing.id, input.workerId) : null;
          if (submission?.id) {
            if (input.individualStatus === "差し戻し" && submission.status !== "rejected") {
              await db.updateClosingSubmission(submission.id, { status: "rejected", approvedAt: null, reviewedBy: ctx.user.id } as any);
              await safeAuditLog(ctx.user.id, "submission.returnReject", "submission", { entityId: submission.id, closingId: closing!.id, employeeId: input.workerId, projectId: input.projectId, note: `月締めV2から差し戻し: ${input.sendBackReason.trim() || "理由未記入"}` });
            } else if ((input.individualStatus === "確認済み" || input.individualStatus === "締め完了") && submission.status !== "approved") {
              await db.updateClosingSubmission(submission.id, { status: "approved", approvedAt: new Date(), reviewedBy: ctx.user.id } as any);
              await safeAuditLog(ctx.user.id, "submission.approve", "submission", { entityId: submission.id, closingId: closing!.id, employeeId: input.workerId, projectId: input.projectId, note: "月締めV2から承認" });
            }
          }
        }

        return review;
      }),
  }),

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
            let hasMonthlyAttendance = monthlyAttendanceProjectIds.has(project.id);
            if (!hasMonthlyAttendance) {
              const projectMonthlyRecords = excludeRemovedGuestMarkers(await db.getAttendanceByProject(project.id, start, end));
              hasMonthlyAttendance = projectMonthlyRecords.length > 0;
            }
            const relevant = Boolean(closing?.id || hasMonthlyAttendance);

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


    diagnoseYearShift: superAdminProcedure
      .query(async () => {
        return buildClosingYearShiftDiagnostics();
      }),

    repairYearShift: superAdminProcedure
      .input(z.object({
        projectId: z.number(),
        fromMonth: z.string().regex(/^\d{4}-\d{2}$/),
        toMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await repairClosingYearShiftProjectMonth(input.projectId, input.fromMonth, input.toMonth);
        await safeAuditLog(ctx.user.id, "closing.repairYearShift", "closing", {
          entityId: result.closingId,
          projectId: input.projectId,
          closingId: result.closingId,
          note: `${input.fromMonth} から ${input.toMonth} へ締め月を修復`,
        });
        return result;
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
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        return {
          eligible: result.eligible,
          isTarget: result.eligible,
          closing: result.detail?.closing || result.closing,
          project: result.detail?.project || null,
          client: result.detail?.client || null,
          employee: result.employee || null,
          actorEmployeeId: result.actorEmployeeId,
          submission: result.submission ? { ...result.submission, documents: await db.listClosingSubmissionDocuments(result.submission.id) } : null,
          sendBackReason: result.sendBackReason || null,
          summary: result.detail?.summary || null,
          monthlyOverview: result.monthlyOverview || null,
          nonTargetReason: result.nonTargetReason || null,
        };
      }),


    workerMonthlyOverview: protectedProcedure
      .input(z.object({
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        employeeId: z.number().optional(),
        projectId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        return buildWorkerMonthlyOverview({
          closingMonth: input.closingMonth,
          actorUserId: ctx.user.id,
          actorRole: (ctx.user as any).appRole,
          employeeId: input.employeeId,
          projectId: input.projectId,
        });
      }),

    // 作業員向け: 自分の支払状況（支払待ち/支払済み）。提出後の「次のステップ」の可視化に使う。
    // employeeId 指定は管理者の代行閲覧のみ許可。
    myPaymentStatus: protectedProcedure
      .input(z.object({
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        employeeId: z.number().optional(),
      }))
      .query(async ({ ctx, input }) => {
        const role = (ctx.user as any).appRole;
        const canDelegate = role === "super_admin" || role === "admin" || role === "manager";
        const me = await db.getEmployeeByUserId(ctx.user.id);
        if (input.employeeId && !canDelegate && Number(input.employeeId) !== Number(me?.id)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "他の作業員の支払状況は参照できません" });
        }
        const targetEmployeeId = (canDelegate && input.employeeId) ? Number(input.employeeId) : me?.id ? Number(me.id) : null;
        if (!targetEmployeeId) return { lines: [] as any[] };

        const closings = await db.getProjectClosingsByMonth(input.closingMonth);
        const projects = await db.getAllProjects();
        const projectMap = new Map<number, any>(projects.map((p: any) => [Number(p.id), p]));
        const lines: any[] = [];
        for (const closing of closings as any[]) {
          if (!closing?.id) continue;
          const payment = await db.getEmployeePaymentByClosingEmployee(closing.id, targetEmployeeId);
          if (!payment) continue;
          lines.push({
            projectId: Number(closing.projectId),
            projectName: projectMap.get(Number(closing.projectId))?.name || `現場ID:${closing.projectId}`,
            status: payment.status, // pending | confirmed | paid
            totalAmount: Number(payment.totalAmount || 0),
            paidAt: payment.paidAt || null,
          });
        }
        return { lines };
      }),

    saveMySubmission: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        transportAmount: z.number().min(0),
        expenseAmount: z.number().min(0),
        notes: z.string().optional(),
        // 管理者代行用（getMyClosingSubmission 内で権限チェック。作業員は自分以外を指定不可）
        employeeId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では編集できません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
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
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では提出できません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
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
        employeeId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では領収書をアップロードできません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
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
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        const docs = await db.listClosingSubmissionDocuments(result.submission.id);
        return { documents: docs, legacyReceipt: result.submission.receiptFileUrl ? { fileUrl: result.submission.receiptFileUrl, fileName: result.submission.receiptFileName, fileKey: result.submission.receiptFileKey, mimeType: result.submission.receiptMimeType } : null };
      }),

    uploadMyReceiptDocument: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), base64: z.string(), mimeType: z.string(), fileName: z.string(), documentType: z.enum(["receipt","company_card","etc","other"]).optional(), employeeId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
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
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), documentId: z.number(), employeeId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
        if (!canWorkerEditSubmission(result.closing.status, result.submission.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "この状態では削除できません" });
        const doc = await db.getClosingSubmissionDocumentById(input.documentId);
        if (!doc || doc.submissionId !== result.submission.id) throw new TRPCError({ code: "NOT_FOUND", message: "書類が見つかりません" });
        await db.deleteClosingSubmissionDocument(input.documentId);
        const rest = await db.listClosingSubmissionDocuments(result.submission.id);
        if (rest.length === 0 && !result.submission.receiptFileUrl) await db.updateClosingSubmission(result.submission.id, { receiptUploaded: false } as any);
        return { success: true };
      }),

    clearMyReceipt: protectedProcedure
      .input(z.object({ projectId: z.number(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        if (isGuestRole((ctx.user as any).appRole)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "ゲスト権限では領収書を解除できません" });
        }
        const result = await getMyClosingSubmission(input.projectId, input.closingMonth, ctx.user.id, input.employeeId, (ctx.user as any).appRole);
        if (!result.eligible || !result.submission || !result.closing?.id) throw new TRPCError({ code: "BAD_REQUEST", message: "この月の提出対象ではありません" });
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
        // 月締めV2を主軸に: 締め完了現場をV2から、交通費はV2のクライアント請求対象集計から、
        // 残業はV2の出面から。V1締めしか無い現場は自動でV1ブリッジ。
        const draft = await buildClientInvoiceDraftFromV2({
          projectIds: selectedProjectIds,
          targetMonth: input.closingMonth,
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
          warnings: draft.warnings,
          message: draft.warnings.length
            ? `請求書ドラフトを作成しました（要確認 ${draft.warnings.length}件）。PDF出力前に内容を確認・編集してください。`
            : "請求書ドラフトを作成しました。PDF出力前に内容を確認・編集してください。",
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
    /** Generate attendance & transportation confirmation PDF */
    generateConfirmationPdf: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .mutation(async ({ ctx, input }) => {
        const actorRole = (ctx.user as any).appRole;
        const actorEmployee = await db.getEmployeeByUserId(ctx.user.id);
        if (!isManagerLike(actorRole) && (!actorEmployee || actorEmployee.id !== input.employeeId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "権限がありません" });
        }
        const employee = await db.getEmployeeById(input.employeeId);
        if (!employee) throw new TRPCError({ code: "NOT_FOUND", message: "従業員が見つかりません" });
        const [yearStr, monthStr] = input.closingMonth.split("-");
        const year = parseInt(yearStr, 10);
        const monthNum = parseInt(monthStr, 10);
        const { start, end } = getMonthDateRange(input.closingMonth);
        let records = excludeRemovedGuestMarkers(await db.getAttendanceByDateRange(start, end));
        records = records.filter((r: any) => Number(r.employeeId) === input.employeeId);
        const allProjects = await db.getAllProjects();
        const projectMap = new Map(allProjects.map((p: any) => [Number(p.id), p]));
        const projectIds = Array.from(new Set(records.map((r: any) => Number(r.projectId))));
        const projectTransports: Array<{ projectId: number; projectName: string; monthlyAmount: number; attendanceDays: number }> = [];
        for (const pid of projectIds) {
          const closing = await db.getProjectClosingByProjectMonth(pid, input.closingMonth);
          let transportAmount = 0;
          if (closing?.id) {
            const submission = await db.getClosingSubmissionByClosingEmployee(closing.id, input.employeeId);
            transportAmount = submission?.transportAmount || 0;
          }
          const daysForProject = new Set(records.filter((r: any) => Number(r.projectId) === pid).map((r: any) => new Date(r.workDate).toISOString().slice(0, 10))).size;
          projectTransports.push({
            projectId: pid,
            projectName: projectMap.get(pid)?.name || `Project #${pid}`,
            monthlyAmount: transportAmount,
            attendanceDays: daysForProject,
          });
        }
        const confirmRecords = records.map((r: any) => ({
          workDate: r.workDate,
          projectId: Number(r.projectId),
          projectName: projectMap.get(Number(r.projectId))?.name || `Project #${r.projectId}`,
          shiftType: (r.shiftType || "day") as "day" | "night",
          overtimeHours: Number(r.overtimeHours || 0),
          notes: r.notes,
        }));
        const { generateConfirmationPdf } = await import("./pdfConfirmation");
        const pdfBuffer = await generateConfirmationPdf({
          year,
          month: monthNum,
          employeeName: employee.nameKanji || employee.nameRomaji || `ID:${employee.id}`,
          companyName: "充寵グループ",
          records: confirmRecords,
          projectTransports,
        });
        const fileName = `confirmation-${input.closingMonth}-${input.employeeId}-${Date.now()}.pdf`;
        const { url } = await storagePut(
          `confirmations/${fileName}`,
          pdfBuffer,
          "application/pdf"
        );
        await safeAuditLog(ctx.user.id, "closing.generateConfirmationPdf", "closing", {
          entityId: input.employeeId,
          employeeId: input.employeeId,
          note: `確認表PDF生成 ${fileName}`,
          payload: { closingMonth: input.closingMonth },
        });
        return { url, fileName };
      }),
    /** List confirmation PDF history for an employee */
    confirmationPdfHistory: protectedProcedure
      .input(z.object({
        employeeId: z.number(),
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      }))
      .query(async ({ ctx, input }) => {
        const actorRole = (ctx.user as any).appRole;
        const actorEmployee = await db.getEmployeeByUserId(ctx.user.id);
        if (!isManagerLike(actorRole) && (!actorEmployee || actorEmployee.id !== input.employeeId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "権限がありません" });
        }
        const allLogs = await db.getAuditLogsByAction("closing.generateConfirmationPdf");
        let logs = allLogs.filter((l: any) => {
          const meta = typeof l.payload === "string" ? JSON.parse(l.payload) : (l.payload || {});
          return Number(meta?.employeeId || l.employeeId) === input.employeeId;
        });
        if (input.closingMonth) {
          logs = logs.filter((l: any) => {
            const meta = typeof l.payload === "string" ? JSON.parse(l.payload) : (l.payload || {});
            return meta?.closingMonth === input.closingMonth;
          });
        }
        return logs.slice(0, 50).map((l: any) => {
          const meta = typeof l.payload === "string" ? JSON.parse(l.payload) : (l.payload || {});
          return {
            id: l.id,
            closingMonth: meta?.closingMonth || null,
            projectId: meta?.projectId || null,
            note: l.note || meta?.note || null,
            createdAt: l.performedAt,
          };
        });
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

    // 作業員単位の月次支払サマリー（支払は作業員単位で行うため、案件横断で集計する）。
    workerMonthSummary: leaderOrAdminProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const [monthRows, projects, employees, allAdvances] = await Promise.all([
          collectMonthPaymentRows(input.closingMonth),
          db.getAllProjects(),
          db.getAllEmployees(),
          db.getAllWorkerAdvances(),
        ]);
        const projectMap = new Map<number, any>(projects.map((p: any) => [p.id, p]));
        const empMap = new Map<number, any>(employees.map((e: any) => [e.id, e]));

        const advByEmp = new Map<number, any[]>();
        const advByPay = new Map<number, any[]>();
        for (const a of allAdvances as any[]) {
          const e = advByEmp.get(a.employeeId);
          if (e) e.push(a); else advByEmp.set(a.employeeId, [a]);
          if (a.relatedPaymentId) {
            const p = advByPay.get(a.relatedPaymentId);
            if (p) p.push(a); else advByPay.set(a.relatedPaymentId, [a]);
          }
        }

        const byWorker = new Map<number, any[]>();
        for (const { closing, payment } of monthRows) {
          const project = projectMap.get(closing.projectId);
          const list = byWorker.get(payment.employeeId) || [];
          list.push({
            projectId: closing.projectId,
            projectName: project?.name || `案件${closing.projectId}`,
            paymentId: payment.id,
            baseAmount: Number(payment.baseAmount || 0),
            transportAmount: Number(payment.transportAmount || 0),
            expenseAmount: Number(payment.expenseAmount || 0),
            adjustmentAmount: Number(payment.adjustmentAmount || 0),
            totalAmount: Number(payment.totalAmount || 0),
            status: payment.status,
            paidAt: payment.paidAt || null,
          });
          byWorker.set(payment.employeeId, list);
        }

        const workers = Array.from(byWorker.entries())
          .map(([employeeId, projectRows]) => {
            const emp = empMap.get(employeeId);
            const totalAmount = projectRows.reduce((sum, r) => sum + r.totalAmount, 0);
            const advanceBalance = computeAdvanceBalance(advByEmp.get(employeeId) || []);
            const appliedOffset = projectRows.reduce((sum, r) => sum + computeAppliedOffset(advByPay.get(r.paymentId) || []), 0);
            const maxOffset = computeMaxOffset(advanceBalance, totalAmount, appliedOffset);
            const paidRows = projectRows.filter((r) => r.status === "paid");
            const paidStatus = paidRows.length === projectRows.length ? "paid" : paidRows.length > 0 ? "partial" : "unpaid";
            const lastPaidAt = paidRows.reduce<any>((latest, r) => {
              if (!r.paidAt) return latest;
              return !latest || new Date(r.paidAt) > new Date(latest) ? r.paidAt : latest;
            }, null);
            return {
              employeeId,
              name: emp?.nameKanji || emp?.nameRomaji || `従業員${employeeId}`,
              projects: projectRows,
              totalAmount,
              advanceBalance,
              appliedOffset,
              maxOffset,
              netPayable: Math.max(totalAmount - appliedOffset, 0),
              paidStatus,
              lastPaidAt,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, "ja"));

        return {
          workers,
          summary: {
            workerCount: workers.length,
            totalAmount: workers.reduce((sum, w) => sum + w.totalAmount, 0),
            netPayableTotal: workers.reduce((sum, w) => sum + w.netPayable, 0),
            paidCount: workers.filter((w) => w.paidStatus === "paid").length,
            unpaidCount: workers.filter((w) => w.paidStatus !== "paid").length,
          },
        };
      }),

    // 作業員単位の一括支払済み（その月のその作業員の全支払行を paid にする）。
    markWorkerPaid: leaderOrAdminProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const rows = (await collectMonthPaymentRows(input.closingMonth)).filter((r) => r.payment.employeeId === input.employeeId);
        for (const { payment } of rows) {
          await db.updateEmployeePayment(payment.id, { status: "paid", paidAt: new Date(), paidBy: ctx.user.id } as any);
        }
        await safeAuditLog(ctx.user.id, "payment.markWorkerPaid", "payment", { employeeId: input.employeeId, note: `${input.closingMonth} 作業員単位で支払済み` });
        return { success: true };
      }),

    // 作業員単位の一括未払い戻し。
    markWorkerUnpaid: leaderOrAdminProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/), employeeId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const rows = (await collectMonthPaymentRows(input.closingMonth)).filter((r) => r.payment.employeeId === input.employeeId);
        for (const { payment } of rows) {
          await db.updateEmployeePayment(payment.id, { status: "pending", paidAt: null, paidBy: null } as any);
        }
        await safeAuditLog(ctx.user.id, "payment.markWorkerUnpaid", "payment", { employeeId: input.employeeId, note: `${input.closingMonth} 作業員単位で未払いに戻す` });
        return { success: true };
      }),
  }),

  // 前借り／立替 台帳（残高）と支払時の自動相殺。
  advance: router({
    // 残高のある作業員一覧（台帳の概要）。
    overview: leaderOrAdminProcedure.query(async () => {
      const [advances, employees] = await Promise.all([db.getAllWorkerAdvances(), db.getAllEmployees()]);
      const empMap = new Map<number, any>(employees.map((e: any) => [e.id, e]));
      const byEmp = new Map<number, any[]>();
      for (const a of advances as any[]) {
        const arr = byEmp.get(a.employeeId);
        if (arr) arr.push(a);
        else byEmp.set(a.employeeId, [a]);
      }
      const rows = Array.from(byEmp.entries())
        .map(([employeeId, entries]) => {
          const emp = empMap.get(employeeId);
          const lastEntryAt = entries.reduce((m: any, e: any) => (!m || new Date(e.createdAt) > new Date(m) ? e.createdAt : m), null as any);
          return {
            employeeId,
            name: emp?.nameKanji || emp?.nameRomaji || `従業員${employeeId}`,
            balance: computeAdvanceBalance(entries),
            entryCount: entries.length,
            lastEntryAt,
          };
        })
        .filter((r) => r.balance !== 0)
        .sort((a, b) => b.balance - a.balance);
      const totalOutstanding = rows.reduce((sum, r) => sum + Math.max(r.balance, 0), 0);
      return { rows, totalOutstanding };
    }),

    // ある作業員の台帳（残高＋履歴）。
    ledger: leaderOrAdminProcedure
      .input(z.object({ employeeId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const [entries, emp] = await Promise.all([
          db.getWorkerAdvancesByEmployee(input.employeeId),
          db.getEmployeeById(input.employeeId),
        ]);
        const sorted = [...(entries as any[])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return {
          employeeId: input.employeeId,
          name: emp?.nameKanji || emp?.nameRomaji || `従業員${input.employeeId}`,
          balance: computeAdvanceBalance(entries as any[]),
          entries: sorted,
        };
      }),

    // 台帳エントリの手動追加（前借り／相殺／調整）。
    addEntry: leaderOrAdminProcedure
      .input(z.object({
        employeeId: z.number().int().positive(),
        entryType: z.enum(["advance", "repayment", "adjustment"]),
        amount: z.number().int().positive(),
        increase: z.boolean().optional().default(true),
        reason: z.string().max(255).optional().default(""),
      }))
      .mutation(async ({ ctx, input }) => {
        const delta = signedDelta(input.entryType, input.amount, input.increase);
        const created = await db.createWorkerAdvance({
          employeeId: input.employeeId,
          entryType: input.entryType,
          amount: delta,
          reason: input.reason.trim() || null,
          createdBy: ctx.user.id,
        } as any);
        const balance = computeAdvanceBalance(await db.getWorkerAdvancesByEmployee(input.employeeId) as any[]);
        await safeAuditLog(ctx.user.id, "advance.addEntry", "worker_advance", { entityId: (created as any).id, employeeId: input.employeeId, note: `${input.entryType} ${delta}円 / 残高${balance}円` });
        return { success: true, balance };
      }),

    // 台帳エントリの削除（管理者の訂正用）。
    deleteEntry: leaderOrAdminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const entry = await db.getWorkerAdvanceById(input.id);
        if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "台帳エントリが見つかりません" });
        await db.deleteWorkerAdvance(input.id);
        await safeAuditLog(ctx.user.id, "advance.deleteEntry", "worker_advance", { entityId: input.id, employeeId: entry.employeeId, note: "台帳エントリ削除" });
        return { success: true };
      }),

    // 支払時の相殺（前借り残高を支払から差し引く）。repayment を支払に紐づけて記録。
    offsetPayment: leaderOrAdminProcedure
      .input(z.object({ paymentId: z.number().int().positive(), amount: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const payment = await db.getEmployeePaymentById(input.paymentId);
        if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "支払行が見つかりません" });
        const [entries, linked, closing] = await Promise.all([
          db.getWorkerAdvancesByEmployee(payment.employeeId),
          db.getWorkerAdvancesByPayment(input.paymentId),
          db.getProjectClosingById(payment.closingId),
        ]);
        const balance = computeAdvanceBalance(entries as any[]);
        const alreadyOffset = computeAppliedOffset(linked as any[]);
        const maxOffset = computeMaxOffset(balance, Number(payment.totalAmount || 0), alreadyOffset);
        if (input.amount > maxOffset) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `相殺可能額を超えています（最大 ${maxOffset}円）` });
        }
        const created = await db.createWorkerAdvance({
          employeeId: payment.employeeId,
          entryType: "repayment",
          amount: -Math.abs(input.amount),
          reason: "支払時相殺",
          relatedPaymentId: input.paymentId,
          closingMonth: (closing as any)?.closingMonth || null,
          createdBy: ctx.user.id,
        } as any);
        const newBalance = balance - input.amount;
        await safeAuditLog(ctx.user.id, "advance.offsetPayment", "worker_advance", { entityId: (created as any).id, employeeId: payment.employeeId, closingId: payment.closingId, note: `支払相殺 ${input.amount}円 / 残高${newBalance}円` });
        return { success: true, applied: input.amount, balance: newBalance };
      }),

    // 作業員単位の月次相殺（その月の支払行へ順に相殺を配分して repayment を記録）。
    offsetWorkerMonth: leaderOrAdminProcedure
      .input(z.object({
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        employeeId: z.number().int().positive(),
        amount: z.number().int().positive(),
      }))
      .mutation(async ({ ctx, input }) => {
        const rows = (await collectMonthPaymentRows(input.closingMonth))
          .filter((r) => r.payment.employeeId === input.employeeId)
          .map((r) => r.payment);
        const entries = await db.getWorkerAdvancesByEmployee(input.employeeId);
        const balance = computeAdvanceBalance(entries as any[]);

        const rowInfos: { payment: any; applied: number }[] = [];
        for (const payment of rows) {
          const applied = computeAppliedOffset(await db.getWorkerAdvancesByPayment(payment.id) as any[]);
          rowInfos.push({ payment, applied });
        }
        const totalPayable = rowInfos.reduce((sum, r) => sum + Number(r.payment.totalAmount || 0), 0);
        const appliedTotal = rowInfos.reduce((sum, r) => sum + r.applied, 0);
        const maxOffset = computeMaxOffset(balance, totalPayable, appliedTotal);
        if (input.amount > maxOffset) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `相殺可能額を超えています（最大 ${maxOffset}円）` });
        }

        let remaining = input.amount;
        let remainingBalance = balance;
        for (const { payment, applied } of rowInfos) {
          if (remaining <= 0) break;
          const room = computeMaxOffset(remainingBalance, Number(payment.totalAmount || 0), applied);
          const take = Math.min(room, remaining);
          if (take <= 0) continue;
          await db.createWorkerAdvance({
            employeeId: input.employeeId,
            entryType: "repayment",
            amount: -take,
            reason: "支払時相殺",
            relatedPaymentId: payment.id,
            closingMonth: input.closingMonth,
            createdBy: ctx.user.id,
          } as any);
          remaining -= take;
          remainingBalance -= take;
        }
        const newBalance = balance - input.amount;
        await safeAuditLog(ctx.user.id, "advance.offsetWorkerMonth", "worker_advance", { employeeId: input.employeeId, note: `${input.closingMonth} 月次相殺 ${input.amount}円 / 残高${newBalance}円` });
        return { success: true, applied: input.amount, balance: newBalance };
      }),

    // 支払詳細画面向け: この締めの各支払行の残高・適用相殺・相殺可能額・差引支払額。
    paymentContext: leaderOrAdminProcedure
      .input(z.object({ projectId: z.number().int().positive(), closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ input }) => {
        const closing = await db.getProjectClosingByProjectMonth(input.projectId, input.closingMonth);
        if (!closing?.id) return { byPayment: {} as Record<number, any> };
        const [payments, allAdvances] = await Promise.all([
          db.getEmployeePaymentsByClosing(closing.id),
          db.getAllWorkerAdvances(),
        ]);
        const byEmp = new Map<number, any[]>();
        const byPay = new Map<number, any[]>();
        for (const a of allAdvances as any[]) {
          const e = byEmp.get(a.employeeId);
          if (e) e.push(a); else byEmp.set(a.employeeId, [a]);
          if (a.relatedPaymentId) {
            const p = byPay.get(a.relatedPaymentId);
            if (p) p.push(a); else byPay.set(a.relatedPaymentId, [a]);
          }
        }
        const byPayment: Record<number, any> = {};
        for (const p of payments as any[]) {
          const balance = computeAdvanceBalance(byEmp.get(p.employeeId) || []);
          const appliedOffset = computeAppliedOffset(byPay.get(p.id) || []);
          const maxOffset = computeMaxOffset(balance, Number(p.totalAmount || 0), appliedOffset);
          byPayment[p.id] = {
            employeeId: p.employeeId,
            balance,
            appliedOffset,
            maxOffset,
            netPayable: Math.max(Number(p.totalAmount || 0) - appliedOffset, 0),
          };
        }
        return { byPayment };
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

    // 会計ソフト（freee / マネーフォワード）向けCSV出力（参考用）。対象月の売上(取引先請求)を出力。
    exportCsv: leaderOrAdminProcedure
      .input(z.object({
        closingMonth: z.string().regex(/^\d{4}-\d{2}$/),
        format: z.enum(["freee", "mf", "detail"]),
      }))
      .query(async ({ input }) => {
        const [invoices, clients, projects] = await Promise.all([
          db.getAllInvoices(),
          db.getAllClients(),
          db.getAllProjects(),
        ]);
        const clientMap = new Map<number, any>(clients.map((c: any) => [c.id, c]));
        const projectMap = new Map<number, any>(projects.map((p: any) => [p.id, p]));
        const statusLabelMap: Record<string, string> = {
          pending: "入金待ち", partial: "一部入金", received: "入金済", overdue: "期限超過", cancelled: "取消",
        };
        const rows: AccountingCsvInvoice[] = invoices
          .filter((invoice: any) => getMonthKeyFromDate(invoice.periodStart) === input.closingMonth && invoice.status !== "cancelled")
          .sort((a: any, b: any) => {
            const ad = a.dueDate ? new Date(a.dueDate).getTime() : 0;
            const bd = b.dueDate ? new Date(b.dueDate).getTime() : 0;
            return ad - bd;
          })
          .map((invoice: any) => ({
            invoiceNumber: invoice.invoiceNumber,
            clientName: clientMap.get(invoice.clientId)?.name || "取引先",
            projectName: invoice.projectId ? (projectMap.get(invoice.projectId)?.name || null) : null,
            issueDate: invoice.issueDate,
            dueDate: invoice.dueDate,
            subtotal: Number(invoice.subtotal || 0),
            taxAmount: Number(invoice.taxAmount || 0),
            totalAmount: Number(invoice.totalAmount || 0),
            receivedAmount: getInvoiceReceivedAmount(invoice),
            receivedAt: invoice.receivedAt,
            statusLabel: statusLabelMap[getReceivableStatus(invoice)] || "入金待ち",
            notes: invoice.notes || null,
          }));
        return {
          filename: accountingCsvFilename(input.format, input.closingMonth),
          content: buildAccountingCsv(rows, input.format),
          count: rows.length,
        };
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
        // 月締めV2を主軸に: 締め完了現場をV2から、交通費はV2のクライアント請求対象集計から、
        // 残業はV2の出面から。V1締めしか無い現場は自動でV1ブリッジ。
        const draft = await buildClientInvoiceDraftFromV2({
          projectIds: selectedProjectIds,
          targetMonth: input.closingMonth,
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
          warnings: draft.warnings,
          message: draft.warnings.length
            ? `請求書ドラフトを作成しました（要確認 ${draft.warnings.length}件）。PDF出力前に内容を確認・編集してください。`
            : "請求書ドラフトを作成しました。PDF出力前に内容を確認・編集してください。",
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

    /**
     * Generate the per-project 出面表 (attendance sheet) for a client invoice's project(s) + month,
     * so the user can attach them when sending the invoice to the client. Reuses the same attendance
     * PDF as the 出面表 screen. Project list comes from the invoice (its projectId, plus projectIds=
     * recorded in the internal memo for consolidated multi-project invoices).
     */
    generateAttendanceSheets: leaderOrAdminProcedure
      .input(z.object({ invoiceId: z.number(), includeGuests: z.boolean().optional().default(true) }))
      .mutation(async ({ input }) => {
        const invoice = await db.getInvoiceById(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });

        const built = await buildInvoiceAttendanceSheetBuffers(invoice, { includeGuests: input.includeGuests });
        const { storagePut } = await import("./storage");
        const sheets: Array<{ projectId: number; projectName: string; url: string; fileName: string; hasData: boolean }> = [];
        for (const sheet of built.sheets) {
          const { url } = await storagePut(`attendance/${sheet.fileName}`, sheet.buffer, "application/pdf");
          sheets.push({ projectId: sheet.projectId, projectName: sheet.projectName, url, fileName: sheet.fileName, hasData: sheet.hasData });
        }
        return { year: built.year, month: built.month, sheets };
      }),

    /** 請求書に添付できるアップロード済み書類（領収書など）の候補一覧。 */
    listAttachableDocuments: leaderOrAdminProcedure
      .input(z.object({ invoiceId: z.number() }))
      .query(async ({ input }) => {
        const invoice = await db.getInvoiceById(input.invoiceId);
        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "請求書が見つかりません" });
        return { documents: await collectInvoiceAttachableDocuments(invoice) };
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

        const draft = await buildClientInvoiceDraftFromV2({
          projectIds: input.projectIds,
          targetMonth: closingMonth,
          expectedClientId: input.clientId,
          // 取引先請求書は行ごとに税率を持つ（作業費=指定税率 / 交通費=0%）。源泉は支払い側の話なのでここでは適用しない。
          taxRates: { labor: input.taxRate, overtime: input.taxRate },
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
        return { id: invoice.id, invoiceNumber, totalAmount: draft.totalAmount, warnings: draft.warnings };
      }),

    /** Generate PDF for an invoice（出面表・アップロード書類を1つのPDFに合体して添付できる） */
    generatePdf: leaderOrAdminProcedure
      .input(z.object({
        id: z.number(),
        // 出面表（現場別・自動生成）を後ろに合体する
        attachAttendanceSheets: z.boolean().optional().default(false),
        // 出面表にゲストの行を載せる
        includeGuests: z.boolean().optional().default(true),
        // 添付するアップロード書類の storage キー（listAttachableDocuments の候補のみ有効）
        attachDocumentKeys: z.array(z.string()).optional().default([]),
      }))
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

        let pdfBuffer = await generateInvoicePdf({
          invoice, items, company, clientName,
          clientAddress, clientPostalCode, clientContactPerson,
          showSeal: invoice.showSeal,
          showLogo: invoice.showLogo,
        });

        // 添付の合体（出面表 → アップロード書類 の順）。
        // 添付処理が失敗しても請求書PDF自体は生成できるよう、失敗時は添付なしで続行し警告で理由を返す。
        const warnings: string[] = [];
        let attachedCount = 0;
        if (input.attachAttendanceSheets || input.attachDocumentKeys.length > 0) {
          try {
            const { mergePdfWithAttachments } = await import("./pdfMerge");
            const { storageGetBytes } = await import("./storage");
            const attachments: Array<{ name: string; mimeType: string; bytes: Buffer }> = [];

            if (input.attachAttendanceSheets) {
              const built = await buildInvoiceAttendanceSheetBuffers(invoice, { includeGuests: input.includeGuests });
              for (const sheet of built.sheets) {
                if (!sheet.hasData) {
                  warnings.push(`${sheet.projectName}: 出面データが無いため出面表は添付しませんでした`);
                  continue;
                }
                attachments.push({ name: `出面表(${sheet.projectName})`, mimeType: "application/pdf", bytes: sheet.buffer });
              }
            }

            if (input.attachDocumentKeys.length > 0) {
              // 任意のstorageキーを禁止し、この請求書の添付候補に含まれるものだけ許可する。
              const candidates = await collectInvoiceAttachableDocuments(invoice);
              const candidateMap = new Map(candidates.map((doc) => [doc.key, doc]));
              for (const key of input.attachDocumentKeys) {
                const doc = candidateMap.get(key);
                if (!doc) {
                  warnings.push(`添付候補に無い書類キーをスキップしました`);
                  continue;
                }
                try {
                  const bytes = await storageGetBytes(doc.key);
                  attachments.push({ name: doc.fileName, mimeType: doc.mimeType, bytes });
                } catch {
                  warnings.push(`${doc.fileName}: 取得に失敗したため添付をスキップしました`);
                }
              }
            }

            if (attachments.length > 0) {
              const merged = await mergePdfWithAttachments(pdfBuffer, attachments);
              pdfBuffer = merged.bytes;
              warnings.push(...merged.warnings);
              attachedCount = attachments.length;
            }
          } catch (mergeError: any) {
            warnings.push(`添付の合体に失敗したため、請求書のみのPDFを生成しました（${mergeError?.message || "不明なエラー"}）`);
            attachedCount = 0;
          }
        }

        const fileName = `invoice_${invoice.invoiceNumber}_${Date.now()}.pdf`;
        const fileKey = `invoices/${fileName}`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        // Update invoice with PDF URL
        await db.updateInvoice(input.id, { pdfUrl: url });
        await safeAuditLog(ctx.user.id, "invoice.generatePdf", "invoice", { entityId: input.id, invoiceId: input.id, note: `PDF生成 ${fileName}${attachedCount ? `（添付${attachedCount}件合体）` : ""}` });

        return { url, fileName, attachedCount, warnings };
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
        subject: z.string().max(255).optional(),
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

      // 1) 既に保存済みの請求書明細があればそれを優先して返す（編集済みを尊重）。
      const invoice = closing.id ? await db.getWorkerInvoiceByClosingEmployee(closing.id, me.id) : null;
      const savedItems = invoice?.id ? await db.getWorkerInvoiceItems(invoice.id) : [];
      if (savedItems.length > 0) {
        return {
          id: invoice?.id,
          closingId: closing.id,
          projectId: input.projectId,
          employeeId: me.id,
          closingMonth: input.closingMonth,
          status: (invoice?.status as string) || "draft",
          subject: invoice?.subject ?? null,
          notes: invoice?.notes ?? null,
          invoiceNumber: invoice?.invoiceNumber ?? null,
          subtotalAmount: Number(invoice?.subtotalAmount || 0),
          taxAmount: Number(invoice?.taxAmount || 0),
          totalAmount: Number(invoice?.totalAmount || 0),
          items: savedItems,
          autoGenerated: false,
          warnings: [] as string[],
        };
      }

      // 2) 保存済み明細が無ければ、出面×単価から自動計算した明細を提案として返す。
      //    ・締め提出前でも下書きしたいので提出ゲートはバイパスする。
      //    ・提出レコードが未作成でも自動生成する（プレビュー用途）。
      //    ・失敗時は「なぜ空なのか」を warnings に載せて必ず返す（黙って空にしない）。
      const warnings: string[] = [];
      let autoItems: Array<Record<string, unknown>> = [];
      try {
        const draft = await buildWorkerInvoiceDraftFromV2({
          workerId: me.id,
          targetMonth: input.closingMonth,
          submissionStatusOverride: "submitted",
          includeProjectSectionHeaders: false, // 現場ごとの単票なので見出しは不要
        });
        warnings.push(...(draft.warnings || []));
        autoItems = draft.items
          .filter((it: any) => it.itemType !== "text" && Number(it.projectId) === Number(input.projectId))
          .map((it: any, idx: number) => ({
            label: it.label,
            itemType: it.itemType || "normal",
            quantity: it.quantity,
            unit: it.unit,
            unitPrice: it.unitPrice,
            category: it.category,
            taxRate: it.taxRate,
            amount: it.amount,
            sortOrder: idx,
          }));
        if (autoItems.length === 0) {
          warnings.push(
            `この現場（ID:${input.projectId}）の${input.closingMonth}の出面が見つからず、自動生成できる明細がありませんでした。マイ出面表で対象月の出面を保存しているかご確認ください。`
          );
        }
      } catch (error: any) {
        console.error("[workerInvoice.getMyDraft] auto-generation failed", error);
        warnings.push(`請求明細の自動計算に失敗しました: ${error?.message || String(error)}`);
      }

      return {
        id: invoice?.id,
        closingId: closing.id,
        projectId: input.projectId,
        employeeId: me.id,
        closingMonth: input.closingMonth,
        status: (invoice?.status as string) || "draft",
        subject: invoice?.subject ?? null,
        notes: invoice?.notes ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
        subtotalAmount: Number(invoice?.subtotalAmount || 0),
        taxAmount: Number(invoice?.taxAmount || 0),
        totalAmount: Number(invoice?.totalAmount || 0),
        items: autoItems,
        autoGenerated: autoItems.length > 0,
        warnings,
      };
    }),
    /**
     * 月次（全現場まとめ）の作業員請求書プレビュー＋各現場の月締め完了チェックリスト。
     * ・請求書は月に1枚（全現場まとめ、FREEEの見本と同じ形）。
     * ・発行(確定)は「全現場の月締め提出が完了」してから（canIssue）。
     * ・入力途中でも自動計算の下書きプレビューは見られる（②B）。
     */
    getMyMonthlyInvoice: protectedProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(async ({ ctx, input }) => {
        const me = await db.getEmployeeByUserId(ctx.user.id);
        if (!me) throw new TRPCError({ code: "FORBIDDEN" });

        // 月内に出面のある全現場と、各現場の提出状況を集める。
        const overview = await buildWorkerMonthlyOverview({
          closingMonth: input.closingMonth,
          actorUserId: ctx.user.id,
          actorRole: (ctx.user as any).appRole,
          employeeId: me.id,
        });
        const projectLines = overview?.projectLines || [];

        const SUBMITTED_STATUSES = new Set(["submitted", "accepted", "ready_to_close", "closed", "approved"]);
        const sites = await Promise.all(
          projectLines.map(async (line: any) => {
            const closing = await db.getProjectClosingByProjectMonth(Number(line.projectId), input.closingMonth);
            const submission = closing?.id ? await db.getClosingSubmissionByClosingEmployee(closing.id, me.id) : null;
            const status = String(line.submissionStatus || submission?.status || "not_submitted");
            const transportAmount = Number(submission?.transportAmount || 0);
            const expenseAmount = Number(submission?.expenseAmount || 0);
            return {
              projectId: Number(line.projectId),
              projectName: line.projectName,
              attendanceDays: Number(line.attendanceDays || 0),
              transportAmount,
              expenseAmount,
              // 0円は「交通費なし」＝入力済み扱い（提出済みなら確定）。未提出のときのみ未確定。
              transportEntered: SUBMITTED_STATUSES.has(status),
              receiptUploaded: !!submission?.receiptUploaded,
              submissionStatus: status,
              submitted: SUBMITTED_STATUSES.has(status),
            };
          })
        );

        const canIssue = sites.length > 0 && sites.every((site) => site.submitted);
        const pendingSites = sites.filter((site) => !site.submitted).map((site) => site.projectName);

        // 全現場まとめの集計プレビュー（②B: 途中でも見える）。失敗しても理由を warnings で返す。
        const [year, month] = input.closingMonth.split("-").map(Number);
        let draft: any = {
          items: [],
          subtotal: 0,
          taxAmount: 0,
          totalAmount: 0,
          laborAmount: 0,
          transportAmount: 0,
          expenseAmount: 0,
          warnings: [] as string[],
        };
        try {
          const d = await buildWorkerInvoiceDraftFromV2({
            workerId: me.id,
            targetMonth: input.closingMonth,
            submissionStatusOverride: "submitted",
            includeProjectSectionHeaders: true,
          });
          draft = {
            items: d.items,
            subtotal: d.subtotal,
            taxAmount: d.taxAmount,
            totalAmount: d.totalAmount,
            laborAmount: d.laborAmount,
            transportAmount: d.transportAmount,
            expenseAmount: d.expenseAmount,
            warnings: d.warnings,
          };
        } catch (error: any) {
          console.error("[workerInvoice.getMyMonthlyInvoice] aggregate failed", error);
          draft.warnings = [`請求明細の自動集計に失敗しました: ${error?.message || String(error)}`];
        }

        return {
          closingMonth: input.closingMonth,
          subject: `${year}年${month}月分請求書`,
          sites,
          canIssue,
          pendingSites,
          draft,
        };
      }),
    /**
     * 月次まとめ請求書の確定発行（月に1枚・全現場まとめ・②B）。
     * 全現場の月締め提出が完了しているときのみPDFを生成する。既存の作業員請求書PDF生成器を
     * 再利用し、現場見出し付きの集計明細を1枚にレンダリングする（新規テーブル不要）。
     */
    issueMyMonthlyInvoice: protectedProcedure
      .input(z.object({ closingMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const me = await db.getEmployeeByUserId(ctx.user.id);
        if (!me) throw new TRPCError({ code: "FORBIDDEN" });

        // ── 発行ゲート: 対象月に出面のある全現場の月締めが提出済みであること。
        const overview = await buildWorkerMonthlyOverview({
          closingMonth: input.closingMonth,
          actorUserId: ctx.user.id,
          actorRole: (ctx.user as any).appRole,
          employeeId: me.id,
        });
        const projectLines = overview?.projectLines || [];
        if (projectLines.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "対象月に出面のある現場がありません。" });
        }
        const SUBMITTED_STATUSES = new Set(["submitted", "accepted", "ready_to_close", "closed", "approved"]);
        const pending: string[] = [];
        for (const line of projectLines) {
          const closing = await db.getProjectClosingByProjectMonth(Number(line.projectId), input.closingMonth);
          const submission = closing?.id ? await db.getClosingSubmissionByClosingEmployee(closing.id, me.id) : null;
          const status = String(line.submissionStatus || submission?.status || "not_submitted");
          if (!SUBMITTED_STATUSES.has(status)) pending.push(String(line.projectName));
        }
        if (pending.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `未提出の現場があるため発行できません：${pending.join("、")}` });
        }

        // ── 全現場まとめの明細（現場見出し付き）を集計。
        const draft = await buildWorkerInvoiceDraftFromV2({
          workerId: me.id,
          targetMonth: input.closingMonth,
          submissionStatusOverride: "submitted",
          includeProjectSectionHeaders: true,
        });
        if (!draft.items.some((it: any) => it.itemType !== "text")) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "請求できる明細がありません。出面・単価をご確認ください。" });
        }

        const [year, month] = input.closingMonth.split("-").map(Number);
        const monthPart = input.closingMonth.replace(/-/g, "");
        const invoiceNumber = `WM-${monthPart}-W${String(me.id).padStart(4, "0")}`;
        const subject = `${year}年${month}月分請求書`;
        const company = await db.getCompanyProfile();

        const invoice = {
          invoiceNumber,
          subject,
          closingMonth: input.closingMonth,
          issueDate: new Date(),
          submittedAt: new Date(),
          subtotalAmount: draft.subtotal,
          taxAmount: draft.taxAmount,
          totalAmount: draft.totalAmount,
          notes: null,
        };

        const { generateWorkerInvoicePdf } = await import("./pdfWorkerInvoice");
        const pdfBuffer = await generateWorkerInvoicePdf({
          invoice,
          items: draft.items,
          employee: me,
          project: { name: "全現場（月次まとめ）" },
          company,
          snapshotData: { docs: [] },
        });
        const fileKey = `worker-invoices/monthly/${me.id}-${input.closingMonth}-${Date.now()}.pdf`;
        const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

        await safeAuditLog(ctx.user.id, "workerInvoice.issueMonthly", "worker_invoice", {
          employeeId: me.id,
          note: `${subject} 月次まとめ請求書を発行（${invoiceNumber} / 合計 ${draft.totalAmount}）`,
        });

        return { url, invoiceNumber, subject, totalAmount: draft.totalAmount };
      }),
    /**
     * Build an editable worker-invoice draft from Monthly Closing V2 data (admin/manager only).
     * Labor (出勤日数×単価), transport (日割り), and expense are computed by the V2 builder.
     * Tax rates are provisional and overridable per request (明細可変); read-only preview, no DB write.
     */
    getV2Draft: leaderOrAdminProcedure
      .input(z.object({
        workerId: z.number().int().positive(),
        targetMonth: z.string().regex(/^\d{4}-\d{2}$/),
        taxRates: z.object({
          labor: z.number().min(0).max(100).optional(),
          transport: z.number().min(0).max(100).optional(),
          expense: z.number().min(0).max(100).optional(),
        }).optional(),
      }))
      .query(async ({ input }) => {
        try {
          const draft = await buildWorkerInvoiceDraftFromV2({
            workerId: input.workerId,
            targetMonth: input.targetMonth,
            taxRates: input.taxRates,
          });
          const worker = await db.getEmployeeById(input.workerId);
          return {
            ...draft,
            workerName: worker?.nameKanji || worker?.nameRomaji || `従業員ID:${input.workerId}`,
          };
        } catch (error) {
          if (error instanceof WorkerMonthlyClosingNotSubmittedError) {
            throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
          }
          throw error;
        }
      }),
    saveMyDraft: protectedProcedure.input(z.object({ projectId: z.number(), closingMonth: z.string(), subject: z.string().optional(), notes: z.string().optional(), items: z.array(z.object({ label: z.string(), quantity: z.number(), unitPrice: z.number(), unit: z.string().optional(), category: z.string().optional(), itemType: z.enum(["normal", "text"]).optional() })).optional() })).mutation(async ({ ctx, input }) => {
      const me = await db.getEmployeeByUserId(ctx.user.id); if (!me) throw new TRPCError({ code: "FORBIDDEN" });
      const closing = await ensureClosingInitializedForProjectMonth(input.projectId, input.closingMonth);
      const submission = await db.getClosingSubmissionByClosingEmployee(closing.id!, me.id); if (!submission) throw new TRPCError({ code: "NOT_FOUND" });
      const existing = await db.getWorkerInvoiceByClosingEmployee(closing.id!, me.id);
      if (existing?.status === "approved") throw new TRPCError({ code: "FORBIDDEN", message: "Approved invoice is read-only" });
      const saved = await db.upsertWorkerInvoice({ closingId: closing.id!, submissionId: submission.id!, projectId: input.projectId, employeeId: me.id, closingMonth: input.closingMonth, status: existing?.status === "returned" ? "returned" : "draft", subject: input.subject, notes: input.notes });
      if (saved?.id && input.items) {
        await db.replaceWorkerInvoiceItems(saved.id, input.items.map((item, index) => {
          const isText = item.itemType === "text";
          return {
            workerInvoiceId: saved.id!,
            itemType: isText ? "text" : "normal",
            label: item.label,
            description: item.label,
            quantity: isText ? 0 : item.quantity,
            unitPrice: isText ? 0 : item.unitPrice,
            amount: isText ? 0 : Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
            unit: isText ? "" : (item.unit || "式"),
            category: (item.category || undefined) as "labor" | "transport" | "expense" | "materials" | "misc" | undefined,
            sortOrder: index,
          };
        }));
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
