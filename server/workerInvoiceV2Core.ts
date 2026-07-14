import { isWorkedType, extractDateKey } from "@shared/attendanceStatus";

/**
 * Worker Invoice draft — PURE computation core (no DB / no network).
 *
 * This module contains the business logic for turning Monthly Closing V2 data
 * (a worker's submission status, their attendance, and their expense lines) into
 * an editable worker-invoice draft plus a monthly-work-report (日報) breakdown.
 *
 * It is intentionally free of any `./db` or `./rateResolver` import so it can be
 * unit-tested and run as a standalone demo with sample data, without a database.
 *
 * Business rules:
 * - Gate: a draft can only be built AFTER the worker submitted their monthly
 *   closing (status !== "not_submitted").
 * - Labor is auto-filled from attendance (出面表) × worker payment rate, grouped
 *   per project + shift type. Auto-filled but later editable by the worker.
 * - Transport / expense come from monthly_closing_v2_expense_lines, but ONLY lines
 *   the worker fronted themselves (paymentMethod === "paid_by_worker"). Company-card
 *   / ETC / client-paid lines are NOT billed by the worker and are reported as excluded.
 * - Missing worker rate does not hard-fail; the labor line is emitted with amount 0
 *   and a warning so an admin can set the rate and regenerate.
 */

export type WorkerInvoiceV2DraftCategory = "labor" | "transport" | "expense";

export type WorkerInvoiceV2DraftItem = {
  category: WorkerInvoiceV2DraftCategory;
  /** "text" = 現場見出し等の区切り行（金額に含めない）。 */
  itemType: "normal" | "text";
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
  /** overtime hours for the day (1.0 = 1 hour) */
  overtimeHours: number;
  /** transport recorded for this day+project (¥), from V2 transportation expense lines with an expenseDate */
  transport: number;
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

export type AttendanceRecordLike = {
  employeeId: number | null;
  projectId: number;
  shiftType?: string | null;
  workDate: Date | string;
  hoursWorked?: number | null;
  /** overtime hours × 10 (e.g. 15 = 1.5h), matching attendance.overtimeHours */
  overtimeHours?: number | null;
  workType: string;
};

export type ExpenseLineLike = {
  id?: number | null;
  projectId?: number | null;
  expenseType?: string | null;
  expenseDate?: string | null;
  amount?: number | null;
  paymentMethod?: string | null;
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

/**
 * 昼勤の残業のうち、この時間（×10, = 5.0h）までは時間外（×1.25）。
 * それを超える分（＝6時間目以降）は深夜帯（×1.50）として自動判定する。夜勤の残業は全て深夜帯。
 * 例: 昼勤6時間残業 → 5時間=時間外 + 1時間=深夜帯。
 * （定時17:00終わり→残業5時間で22:00＝深夜帯の起点、という実務に合わせた境界）
 */
const DAY_OT_REGULAR_CAP_TIMES10 = 50;

export function monthRange(targetMonth: string): { start: Date; end: Date } {
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
 * Compute an editable worker-invoice draft from already-fetched Monthly Closing V2 data.
 *
 * `resolveRate` returns the worker's payment rate for a project/shift, or null when no
 * rate is configured (which produces a warning + amount-0 line instead of throwing).
 */
export async function computeWorkerInvoiceDraft(input: {
  workerId: number;
  targetMonth: string;
  submissionStatus: string | undefined;
  attendanceRecords: AttendanceRecordLike[];
  expenseLines: ExpenseLineLike[];
  resolveRate: (args: { projectId: number; shiftType: string; workDate: Date }) => Promise<number | null> | number | null;
  resolveProjectName: (projectId: number) => Promise<string | null> | string | null;
  taxRates?: WorkerInvoiceV2TaxRates;
  /** 残業1時間単価 = 日単価 ÷ 標準時間 × 割増倍率（既定1.25=時間外）。IMG_0293の基本式。 */
  overtimeMultiplier?: number;
  /** 深夜帯残業の割増倍率（既定1.50）。夜勤の残業／昼勤で5時間目以降の残業に適用。 */
  lateNightMultiplier?: number;
  /** 1日の標準労働時間（残業単価の算出に使用）。既定8。 */
  standardDayHours?: number;
  /**
   * 発行者（作業員）が適格請求書発行事業者番号（インボイス番号）を登録しているか。
   * インボイス制度: 未登録（免税事業者）が発行する請求書には消費税10%のルールを適用しない（0%）。
   * 既定true（＝従来どおり10%）。
   */
  issuerHasQualifiedInvoiceNumber?: boolean;
  /**
   * 現場ごとに【現場名】の見出し行（テキスト行）を差し込み、FREEEの見本のように
   * 現場単位で明細をまとめて表示する。既定は現場が2件以上のとき有効。
   */
  includeProjectSectionHeaders?: boolean;
}): Promise<WorkerInvoiceV2Draft> {
  const { workerId, targetMonth } = input;
  const taxRates = { ...DEFAULT_TAX_RATES, ...(input.taxRates || {}) };
  const overtimeMultiplier = input.overtimeMultiplier ?? 1.25;
  const lateNightMultiplier = input.lateNightMultiplier ?? 1.5;
  const standardDayHours = input.standardDayHours ?? 8;
  // インボイス番号未登録の発行者は消費税10%が適用されない（労務費・残業代の税率を0%に落とす）。
  const issuerQualified = input.issuerHasQualifiedInvoiceNumber ?? true;
  const effectiveLaborTax = issuerQualified ? taxRates.labor : 0;
  const warnings: string[] = [];
  if (!issuerQualified) {
    warnings.push("適格請求書発行事業者番号（インボイス番号）が未登録のため、消費税10%は適用していません（0%）。登録番号を登録すると10%で計算されます。");
  }

  // 1) Gate: the worker must have submitted their monthly closing (V2).
  if (!input.submissionStatus || !ALLOWED_SUBMISSION_STATUSES.has(input.submissionStatus)) {
    throw new WorkerMonthlyClosingNotSubmittedError();
  }

  const projectNameCache = new Map<number, string | null>();
  const projectName = async (projectId: number) => {
    if (projectNameCache.has(projectId)) return projectNameCache.get(projectId) ?? null;
    const name = (await input.resolveProjectName(projectId)) ?? null;
    projectNameCache.set(projectId, name);
    return name;
  };

  // 2) Labor: group worked attendance by project + shift type.
  type LaborBucket = {
    projectId: number;
    shiftType: string;
    dateKeys: Set<string>;
    sampleWorkDate: Date;
  };
  const laborBuckets = new Map<string, LaborBucket>();
  const attendanceBreakdown: WorkerInvoiceV2AttendanceDay[] = [];
  // 残業は現場ごとに月内合計。深夜帯(×1.50)判定のため band を分けて累積する。
  //  - 夜勤(night) の残業は全て深夜帯。
  //  - 昼勤(day) の残業はその日の5hまで=時間外(×1.25)、6時間目以降(5時間超)=深夜帯(×1.50)。
  // 日単価から時間単価を出すための代表日も現場ごとに保持。
  const regularOtTimes10ByProject = new Map<number, number>();
  const lateNightOtTimes10ByProject = new Map<number, number>();
  const projectSampleDate = new Map<number, Date>();

  const seenLaborDayKeys = new Set<string>();
  for (const record of input.attendanceRecords) {
    if (Number(record.employeeId) !== Number(workerId)) continue;
    if (!isWorkedType(record.workType)) continue;
    const hoursWorked = Number(record.hoursWorked || 0);
    if (hoursWorked <= 0) continue;

    const projectId = Number(record.projectId);
    const shiftType = record.shiftType || "day";

    const workDateKey = extractDateKey(record.workDate);
    const workDate = new Date(`${workDateKey}T00:00:00.000Z`);

    const key = `${projectId}:${shiftType}`;
    // 日数は出面（実働の重複なし日数）で数える。hoursWorked は将来の労基記録用で、日数換算には使わない。
    const bucket = laborBuckets.get(key) || { projectId, shiftType, dateKeys: new Set<string>(), sampleWorkDate: workDate };
    bucket.dateKeys.add(workDateKey);
    laborBuckets.set(key, bucket);

    // 残業時間(×10)を band 分けして現場ごとに累積（判定は日単位＝レコード単位）。
    const recordOtTimes10 = Math.max(0, Number(record.overtimeHours || 0));
    if (recordOtTimes10 > 0) {
      if (shiftType === "night") {
        // 夜勤: 残業は全て深夜帯(×1.50)。
        lateNightOtTimes10ByProject.set(projectId, (lateNightOtTimes10ByProject.get(projectId) || 0) + recordOtTimes10);
      } else {
        // 昼勤: その日の5hまでは時間外(×1.25)、6時間目以降(5時間超)は深夜帯(×1.50)。
        const regularTimes10 = Math.min(recordOtTimes10, DAY_OT_REGULAR_CAP_TIMES10);
        const lateNightTimes10 = recordOtTimes10 - regularTimes10;
        if (regularTimes10 > 0) regularOtTimes10ByProject.set(projectId, (regularOtTimes10ByProject.get(projectId) || 0) + regularTimes10);
        if (lateNightTimes10 > 0) lateNightOtTimes10ByProject.set(projectId, (lateNightOtTimes10ByProject.get(projectId) || 0) + lateNightTimes10);
      }
    }
    if (!projectSampleDate.has(projectId)) projectSampleDate.set(projectId, workDate);

    // 出面明細は (現場×勤務区分×日) の重複を除いて 1日=1行 で積む（交通費の日割りもこの出面日数で行う）。
    const dayKey = `${projectId}:${shiftType}:${workDateKey}`;
    if (!seenLaborDayKeys.has(dayKey)) {
      seenLaborDayKeys.add(dayKey);
      attendanceBreakdown.push({
        workDate: workDateKey,
        projectId,
        projectName: null,
        shiftType,
        workType: String(record.workType),
        days: 1,
        overtimeHours: Number(record.overtimeHours || 0) / 10,
        transport: 0, // filled by 日割り (daily proration) below
      });
    }
  }

  // 日報 transport: the worker submits one transport total per project; allocate it by
  // 日割り計算 (daily proration) across only that project's worked days. Base = floor(total/days),
  // and the remainder lands on the last worked day (matches the 出面表 rounding).
  const transportTotalPerProject = new Map<number, number>();
  for (const line of input.expenseLines) {
    if (String(line.expenseType || "other") !== "transportation") continue;
    if (line.paymentMethod !== "paid_by_worker" || line.projectId == null) continue;
    const amount = Number(line.amount || 0);
    if (amount <= 0) continue;
    transportTotalPerProject.set(line.projectId, (transportTotalPerProject.get(line.projectId) || 0) + amount);
  }
  const breakdownByProject = new Map<number, WorkerInvoiceV2AttendanceDay[]>();
  for (const day of attendanceBreakdown) {
    if (!breakdownByProject.has(day.projectId)) breakdownByProject.set(day.projectId, []);
    breakdownByProject.get(day.projectId)!.push(day);
  }
  for (const [projectId, total] of Array.from(transportTotalPerProject.entries())) {
    const projectDays = (breakdownByProject.get(projectId) || []).slice().sort((a, b) => a.workDate.localeCompare(b.workDate));
    if (projectDays.length === 0) {
      warnings.push(`交通費 ${total.toLocaleString("ja-JP")}円 の按分先（現場${projectId}の出面）がありません`);
      continue;
    }
    const base = Math.floor(total / projectDays.length);
    const remainder = total - base * projectDays.length;
    for (const day of projectDays) day.transport = base;
    projectDays[projectDays.length - 1].transport += remainder;
  }

  const items: WorkerInvoiceV2DraftItem[] = [];
  let laborAmount = 0;

  const sortedLaborKeys = Array.from(laborBuckets.keys()).sort();
  for (const key of sortedLaborKeys) {
    const bucket = laborBuckets.get(key)!;
    const name = await projectName(bucket.projectId);
    const days = bucket.dateKeys.size;
    const shiftLabel = bucket.shiftType === "night" ? "夜勤" : "日勤";

    const resolved = await input.resolveRate({
      projectId: bucket.projectId,
      shiftType: bucket.shiftType,
      workDate: bucket.sampleWorkDate,
    });
    let unitPrice = 0;
    if (resolved == null) {
      warnings.push(`単価未設定: ${name || `現場${bucket.projectId}`} / ${shiftLabel}（管理者が単価を設定後に再生成してください）`);
    } else {
      unitPrice = Number(resolved) || 0;
    }

    const amount = Math.round(days * unitPrice);
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
      taxRate: effectiveLaborTax,
      source: "attendance_auto",
      sortOrder: items.length,
    });
  }

  // 2.5) 残業代: 現場ごとに、時間外(×1.25)と深夜帯(×1.50)を別明細で自動計上する。
  //  band分け（上の集計）:
  //   - 夜勤の残業＝全て深夜帯。
  //   - 昼勤の残業＝その日の5hまで時間外・6時間目以降(5時間超)深夜帯。
  //  単価 = 日勤単価 ÷ 標準時間 × 割増倍率（IMG_0293の基本式、深夜帯は×1.50）。
  const overtimeProjectIds = Array.from(
    new Set<number>([...Array.from(regularOtTimes10ByProject.keys()), ...Array.from(lateNightOtTimes10ByProject.keys())])
  ).sort((a, b) => a - b);
  for (const projectId of overtimeProjectIds) {
    const name = await projectName(projectId);
    const sampleDate = projectSampleDate.get(projectId) || new Date(`${targetMonth}-01T00:00:00.000Z`);
    const dayRate = await input.resolveRate({ projectId, shiftType: "day", workDate: sampleDate });
    const dayRateNum = dayRate != null ? Number(dayRate) || 0 : null;

    const pushOvertime = (times10: number, multiplier: number, bandLabel: string) => {
      const hours = times10 / 10;
      if (hours <= 0) return;
      const otHourly = dayRateNum != null ? Math.round((dayRateNum / standardDayHours) * multiplier) : 0;
      const amount = Math.round(hours * otHourly);
      laborAmount += amount;
      if (otHourly === 0) {
        warnings.push(`残業代の単価が算出できません（${name || `現場${projectId}`}：日勤単価が未解決）。単価設定後に再生成してください。`);
      }
      items.push({
        category: "labor",
        itemType: "normal",
        label: `残業代（${bandLabel}） ${name || `現場${projectId}`}`,
        projectId,
        projectName: name,
        shiftType: null,
        quantity: hours,
        unit: "時間",
        unitPrice: otHourly,
        amount,
        taxRate: effectiveLaborTax,
        source: "attendance_auto",
        sortOrder: items.length,
      });
    };

    pushOvertime(regularOtTimes10ByProject.get(projectId) || 0, overtimeMultiplier, "時間外");
    pushOvertime(lateNightOtTimes10ByProject.get(projectId) || 0, lateNightMultiplier, "深夜");
  }
  if (lateNightOtTimes10ByProject.size > 0) {
    warnings.push("深夜帯残業(×1.50)は「夜勤の残業」と「昼勤で6時間目以降(5時間超)の残業」を自動判定して計上しています。実際の時間帯が異なる場合は明細をご確認ください。");
  }

  // 3) Transport / expense: only worker-fronted lines are billable to the company.
  type ExpenseBucket = { projectId: number | null; expenseType: string; amount: number };
  const expenseBuckets = new Map<string, ExpenseBucket>();
  const excludedExpenseLines: WorkerInvoiceV2ExcludedExpense[] = [];

  for (const line of input.expenseLines) {
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

  // Fill project names into the attendance breakdown for the 日報 (transport already prorated above).
  for (const day of attendanceBreakdown) {
    day.projectName = await projectName(day.projectId);
  }
  attendanceBreakdown.sort((a, b) =>
    a.workDate.localeCompare(b.workDate) || a.projectId - b.projectId
  );

  // 現場ごとにまとめ、FREEEの見本のように【現場名】見出し行（テキスト行）を差し込む。
  // 既定は現場が2件以上のとき有効。金額のある行はそのまま（見出しは amount=0）。
  const projectIdsWithItems = new Set<number>();
  for (const it of items) if (it.projectId != null) projectIdsWithItems.add(Number(it.projectId));
  const includeHeaders = input.includeProjectSectionHeaders ?? projectIdsWithItems.size > 1;

  let orderedItems = items;
  if (includeHeaders && items.length > 0) {
    // 現場の登場順を保持しつつ現場ID昇順で並べ、現場未割当(null)は末尾へ。
    const groupKeys: (number | null)[] = [];
    const seen = new Set<string>();
    for (const it of items) {
      const pid = it.projectId == null ? null : Number(it.projectId);
      const key = pid == null ? "null" : String(pid);
      if (!seen.has(key)) { seen.add(key); groupKeys.push(pid); }
    }
    groupKeys.sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b));

    const grouped: WorkerInvoiceV2DraftItem[] = [];
    for (const pid of groupKeys) {
      const groupItems = items.filter((it) => (it.projectId == null ? null : Number(it.projectId)) === pid);
      if (groupItems.length === 0) continue;
      const name = pid == null ? null : (groupItems.find((g) => g.projectName)?.projectName ?? `現場${pid}`);
      grouped.push({
        category: "labor",
        itemType: "text",
        label: pid == null ? "【現場未割当】" : `【${name}】`,
        projectId: pid,
        projectName: name,
        shiftType: null,
        quantity: 0,
        unit: "",
        unitPrice: 0,
        amount: 0,
        taxRate: 0,
        source: "attendance_auto",
        sortOrder: 0,
      });
      for (const g of groupItems) grouped.push(g);
    }
    grouped.forEach((it, idx) => (it.sortOrder = idx));
    orderedItems = grouped;
  }

  const subtotal = orderedItems.reduce((sum, item) => sum + item.amount, 0);
  const taxAmount = orderedItems.reduce((sum, item) => sum + Math.round((item.amount * item.taxRate) / 100), 0);
  const totalAmount = subtotal + taxAmount;

  return {
    workerId,
    targetMonth,
    submissionStatus: input.submissionStatus,
    items: orderedItems,
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
