import * as db from "./db";
import { isWorkedType, extractDateKey } from "@shared/attendanceStatus";
import { resolveWorkerPaymentRate } from "./rateResolver";

/**
 * Worker Invoice draft builder (Monthly Closing V2 based).
 *
 * Business rules:
 * - Source of truth for the gate is monthly_closing_v2_worker_submissions:
 *   a worker invoice draft can only be built AFTER the worker has submitted
 *   their monthly closing (status !== "not_submitted").
 * - Labor is auto-filled from attendance (出面表) × resolveWorkerPaymentRate (作業員支払単価),
 *   grouped per project + shift type. Auto-filled but later editable by the worker.
 * - Transport / expense are taken from monthly_closing_v2_expense_lines, but ONLY lines the
 *   worker fronted themselves (paymentMethod === "paid_by_worker"). Company-card / ETC /
 *   client-paid lines are NOT billed by the worker and are reported as excluded.
 * - Missing worker rate does not hard-fail the draft; the labor line is emitted with amount 0
 *   and a warning so an admin can set the rate and regenerate.
 */

export type WorkerInvoiceV2DraftCategory = "labor" | "transport" | "expense";

export type WorkerInvoiceV2DraftItem = {
  category: WorkerInvoiceV2DraftCategory;
  itemType: "normal";
  label: string;
  projectId: number | null;
  projectName: string | null;
  shiftType: string | null;
  /** days for labor (may be fractional, e.g. 0.5), 1 for aggregated transport/expense */
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxRate: number;
  source: "attendance_auto" | "expense_v2";
  sortOrder: number;
};

export type WorkerInvoiceV2AttendanceDay = {
  workDate: string;
  projectId: number;
  projectName: string | null;
  shiftType: string;
  workType: string;
  /** worked days for this record on a 1.0 = full-day scale */
  days: number;
};

export type WorkerInvoiceV2ExcludedExpense = {
  id: number | null;
  projectId: number | null;
  amount: number;
  paymentMethod: string;
  expenseType: string;
  reason: string;
};

export type WorkerInvoiceV2Draft = {
  workerId: number;
  targetMonth: string;
  submissionStatus: string;
  items: WorkerInvoiceV2DraftItem[];
  laborAmount: number;
  transportAmount: number;
  expenseAmount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  /** per-day attendance breakdown for the monthly work report (日報) */
  attendanceBreakdown: WorkerInvoiceV2AttendanceDay[];
  excludedExpenseLines: WorkerInvoiceV2ExcludedExpense[];
  warnings: string[];
};

export type WorkerInvoiceV2TaxRates = {
  labor?: number;
  transport?: number;
  expense?: number;
};

const ALLOWED_SUBMISSION_STATUSES = new Set([
  "submitted",
  "sent_back",
  "accepted",
  "ready_to_close",
  "closed",
]);

const DEFAULT_TAX_RATES: Required<WorkerInvoiceV2TaxRates> = {
  labor: 10,
  transport: 0,
  expense: 0,
};

function monthRange(targetMonth: string): { start: Date; end: Date } {
  const [year, month] = targetMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

export class WorkerMonthlyClosingNotSubmittedError extends Error {
  constructor(message = "作業員の月締め提出が未完了のため請求書を生成できません") {
    super(message);
    this.name = "WorkerMonthlyClosingNotSubmittedError";
  }
}

/**
 * Build an editable worker-invoice draft for a single worker + month from Monthly Closing V2 data.
 * Pure orchestration over db + rate resolver so it is unit-testable with mocks.
 */
export async function buildWorkerInvoiceDraftFromV2(args: {
  workerId: number;
  targetMonth: string;
  taxRates?: WorkerInvoiceV2TaxRates;
}): Promise<WorkerInvoiceV2Draft> {
  const { workerId, targetMonth } = args;
  const taxRates = { ...DEFAULT_TAX_RATES, ...(args.taxRates || {}) };
  const warnings: string[] = [];

  // 1) Gate: the worker must have submitted their monthly closing (V2).
  const submission = await db.getMonthlyClosingV2WorkerSubmission(workerId, targetMonth);
  if (!submission || !ALLOWED_SUBMISSION_STATUSES.has(String(submission.status))) {
    throw new WorkerMonthlyClosingNotSubmittedError();
  }

  const { start, end } = monthRange(targetMonth);
  const [records, expenseLines] = await Promise.all([
    db.getAttendanceByDateRange(start, end),
    db.getMonthlyClosingV2ExpenseLinesByWorkerMonth(workerId, targetMonth),
  ]);

  // 2) Labor: group worked attendance by project + shift type.
  type LaborBucket = {
    projectId: number;
    shiftType: string;
    daysTimes10: number;
    sampleWorkDate: Date;
  };
  const laborBuckets = new Map<string, LaborBucket>();
  const attendanceBreakdown: WorkerInvoiceV2AttendanceDay[] = [];

  for (const record of records as any[]) {
    if (Number(record.employeeId) !== Number(workerId)) continue;
    if (!isWorkedType(record.workType)) continue;
    const hoursWorked = Number(record.hoursWorked || 0);
    if (hoursWorked <= 0) continue;

    const projectId = Number(record.projectId);
    const shiftType = record.shiftType || "day";
    const daysTimes10 = Math.round(hoursWorked / 8);
    if (daysTimes10 <= 0) continue;

    const workDateKey = extractDateKey(record.workDate);
    const workDate = new Date(`${workDateKey}T00:00:00.000Z`);

    const key = `${projectId}:${shiftType}`;
    const bucket = laborBuckets.get(key) || { projectId, shiftType, daysTimes10: 0, sampleWorkDate: workDate };
    bucket.daysTimes10 += daysTimes10;
    laborBuckets.set(key, bucket);

    attendanceBreakdown.push({
      workDate: workDateKey,
      projectId,
      projectName: null,
      shiftType,
      workType: String(record.workType),
      days: daysTimes10 / 10,
    });
  }

  const items: WorkerInvoiceV2DraftItem[] = [];
  let laborAmount = 0;
  const projectNameCache = new Map<number, string | null>();
  const projectName = async (projectId: number) => {
    if (projectNameCache.has(projectId)) return projectNameCache.get(projectId) ?? null;
    const project = await db.getProjectById(projectId);
    const name = project?.name ?? null;
    projectNameCache.set(projectId, name);
    return name;
  };

  const sortedLaborKeys = Array.from(laborBuckets.keys()).sort();
  for (const key of sortedLaborKeys) {
    const bucket = laborBuckets.get(key)!;
    const name = await projectName(bucket.projectId);
    const days = bucket.daysTimes10 / 10;
    const shiftLabel = bucket.shiftType === "night" ? "夜勤" : "日勤";

    let unitPrice = 0;
    try {
      const resolved = await resolveWorkerPaymentRate({
        projectId: bucket.projectId,
        employeeId: workerId,
        shiftType: bucket.shiftType,
        workDate: bucket.sampleWorkDate,
      });
      unitPrice = Number(resolved.rate || 0);
    } catch (error: any) {
      warnings.push(`単価未設定: ${name || `現場${bucket.projectId}`} / ${shiftLabel}（管理者が単価を設定後に再生成してください）`);
    }

    const amount = Math.round((bucket.daysTimes10 / 10) * unitPrice);
    laborAmount += amount;
    items.push({
      category: "labor",
      itemType: "normal",
      label: `作業費 ${name || `現場${bucket.projectId}`}（${shiftLabel}）`,
      projectId: bucket.projectId,
      projectName: name,
      shiftType: bucket.shiftType,
      quantity: days,
      unit: "日",
      unitPrice,
      amount,
      taxRate: taxRates.labor,
      source: "attendance_auto",
      sortOrder: items.length,
    });
  }

  // 3) Transport / expense: only worker-fronted lines are billable to the company.
  type ExpenseBucket = { projectId: number | null; expenseType: string; amount: number };
  const expenseBuckets = new Map<string, ExpenseBucket>();
  const excludedExpenseLines: WorkerInvoiceV2ExcludedExpense[] = [];

  for (const line of expenseLines as any[]) {
    const amount = Number(line.amount || 0);
    const paymentMethod = String(line.paymentMethod || "");
    const expenseType = String(line.expenseType || "other");
    if (paymentMethod !== "paid_by_worker") {
      if (amount > 0) {
        excludedExpenseLines.push({
          id: line.id ?? null,
          projectId: line.projectId ?? null,
          amount,
          paymentMethod,
          expenseType,
          reason: "作業員の立替ではないため請求対象外（会社/取引先負担）",
        });
      }
      continue;
    }
    if (amount <= 0) continue;
    const projectId = line.projectId ?? null;
    const key = `${expenseType}:${projectId ?? "none"}`;
    const bucket = expenseBuckets.get(key) || { projectId, expenseType, amount: 0 };
    bucket.amount += amount;
    expenseBuckets.set(key, bucket);
  }

  let transportAmount = 0;
  let expenseAmount = 0;
  const sortedExpenseKeys = Array.from(expenseBuckets.keys()).sort();
  for (const key of sortedExpenseKeys) {
    const bucket = expenseBuckets.get(key)!;
    const isTransport = bucket.expenseType === "transportation";
    const category: WorkerInvoiceV2DraftCategory = isTransport ? "transport" : "expense";
    const name = bucket.projectId != null ? await projectName(bucket.projectId) : null;
    const baseLabel = isTransport ? "交通費" : "経費";
    if (isTransport) transportAmount += bucket.amount;
    else expenseAmount += bucket.amount;

    items.push({
      category,
      itemType: "normal",
      label: name ? `${baseLabel}（${name}）` : `${baseLabel}（現場未割当）`,
      projectId: bucket.projectId,
      projectName: name,
      shiftType: null,
      quantity: 1,
      unit: "式",
      unitPrice: bucket.amount,
      amount: bucket.amount,
      taxRate: isTransport ? taxRates.transport : taxRates.expense,
      source: "expense_v2",
      sortOrder: items.length,
    });
  }

  // Fill project names into the attendance breakdown for the 日報.
  for (const day of attendanceBreakdown) {
    day.projectName = await projectName(day.projectId);
  }
  attendanceBreakdown.sort((a, b) =>
    a.workDate.localeCompare(b.workDate) || a.projectId - b.projectId
  );

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = items.reduce((sum, item) => sum + Math.round((item.amount * item.taxRate) / 100), 0);
  const totalAmount = subtotal + taxAmount;

  return {
    workerId,
    targetMonth,
    submissionStatus: String(submission.status),
    items,
    laborAmount,
    transportAmount,
    expenseAmount,
    subtotal,
    taxAmount,
    totalAmount,
    attendanceBreakdown,
    excludedExpenseLines,
    warnings,
  };
}
