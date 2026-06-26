/**
 * Demo: worker invoice (作業員請求書) + monthly work report (日報) built from
 * Monthly Closing V2 data, using sample data and NO database.
 *
 * Run: npx tsx scripts/demo-worker-invoice-v2.ts
 *
 * This exercises the pure core (server/workerInvoiceV2Core.ts) so you can see the
 * exact shape/numbers a worker invoice will produce before any UI is wired up.
 */
import {
  computeWorkerInvoiceDraft,
  type AttendanceRecordLike,
  type ExpenseLineLike,
} from "../server/workerInvoiceV2Core";

const WORKER_ID = 10;
const WORKER_NAME = "田中 太郎";
const TARGET_MONTH = "2026-04";

const PROJECT_NAMES: Record<number, string> = {
  101: "新宿ビル新築電気工事",
  102: "渋谷店舗改修工事",
};

const RATES: Record<string, number> = {
  "101:day": 18000,
  "101:night": 22000,
  "102:day": 17000,
};

const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");

// --- sample attendance (出面表) ---------------------------------------------
function days(project: number, shift: string, dates: string[]): AttendanceRecordLike[] {
  return dates.map((d) => ({
    employeeId: WORKER_ID,
    projectId: project,
    shiftType: shift,
    workDate: `${TARGET_MONTH}-${d}`,
    hoursWorked: 80, // stored as hours×10 → 8.0h = 1 day
    workType: "normal",
  }));
}

const attendanceRecords: AttendanceRecordLike[] = [
  ...days(101, "day", ["01", "02", "03", "04", "07", "08", "09", "10", "11", "14", "15", "16"]), // 12 days
  ...days(101, "night", ["17", "18", "21"]), // 3 nights
  ...days(102, "day", ["22", "23", "24", "25", "28"]), // 5 days
  // a day-off and another worker's record — must be ignored:
  { employeeId: WORKER_ID, projectId: 101, shiftType: "day", workDate: `${TARGET_MONTH}-29`, hoursWorked: 0, workType: "day_off" },
  { employeeId: 11, projectId: 101, shiftType: "day", workDate: `${TARGET_MONTH}-01`, hoursWorked: 80, workType: "normal" },
];

// --- sample V2 expense lines -------------------------------------------------
const expenseLines: ExpenseLineLike[] = [
  { id: 1, projectId: 101, expenseType: "transportation", amount: 8400, paymentMethod: "paid_by_worker" },
  { id: 2, projectId: 102, expenseType: "transportation", amount: 5200, paymentMethod: "paid_by_worker" },
  { id: 3, projectId: 101, expenseType: "other", amount: 3000, paymentMethod: "paid_by_worker" }, // 消耗品
  { id: 4, projectId: 102, expenseType: "transportation", amount: 6000, paymentMethod: "company_card" }, // 会社カード → 除外
];

const SHIFT_LABEL: Record<string, string> = { day: "日勤", night: "夜勤" };

async function main() {
  const draft = await computeWorkerInvoiceDraft({
    workerId: WORKER_ID,
    targetMonth: TARGET_MONTH,
    submissionStatus: "submitted", // 月締め提出済み
    attendanceRecords,
    expenseLines,
    resolveRate: ({ projectId, shiftType }) => RATES[`${projectId}:${shiftType}`] ?? null,
    resolveProjectName: (id) => PROJECT_NAMES[id] ?? null,
  });

  const out: string[] = [];
  const p = (s = "") => out.push(s);

  p("══════════════════════════════════════════════════════════");
  p("  作業員請求書（月締めV2から自動生成）");
  p("══════════════════════════════════════════════════════════");
  p(`  対象月   : ${draft.targetMonth}`);
  p(`  作業員   : ${WORKER_NAME}（ID: ${draft.workerId}）`);
  p(`  月締め状態: ${draft.submissionStatus}`);
  p("");
  p("  ── 明細 ─────────────────────────────────────────────");
  const catLabel: Record<string, string> = { labor: "労務費", transport: "交通費", expense: "経費" };
  for (const item of draft.items) {
    const qty = item.unit === "日" ? `${item.quantity}${item.unit}` : `${item.quantity}${item.unit}`;
    p(`  [${catLabel[item.category]}] ${item.label}`);
    p(`      ${qty} × ${yen(item.unitPrice)} = ${yen(item.amount)}  (税${item.taxRate}%)`);
  }
  p("  ─────────────────────────────────────────────────────");
  p(`  労務費計 : ${yen(draft.laborAmount)}`);
  p(`  交通費計 : ${yen(draft.transportAmount)}`);
  p(`  経費計   : ${yen(draft.expenseAmount)}`);
  p(`  小計     : ${yen(draft.subtotal)}`);
  p(`  消費税   : ${yen(draft.taxAmount)}`);
  p(`  合計     : ${yen(draft.totalAmount)}`);
  p("");

  if (draft.excludedExpenseLines.length) {
    p("  ── 請求対象外（会社/取引先負担として記録のみ）──────────");
    for (const ex of draft.excludedExpenseLines) {
      const name = ex.projectId ? PROJECT_NAMES[ex.projectId] ?? `現場${ex.projectId}` : "現場未割当";
      p(`  ・${name} / ${ex.expenseType} ${yen(ex.amount)}（支払=${ex.paymentMethod}）`);
    }
    p("");
  }

  if (draft.warnings.length) {
    p("  ── 警告 ─────────────────────────────────────────────");
    for (const w of draft.warnings) p(`  ⚠ ${w}`);
    p("");
  }

  // --- 日報（作業報告）作業員×月で1枚 ---
  p("══════════════════════════════════════════════════════════");
  p("  日報（作業報告）  作業員 × 月で1枚");
  p("══════════════════════════════════════════════════════════");
  p(`  ${WORKER_NAME} / ${draft.targetMonth}`);
  p("");
  const byProject = new Map<number, typeof draft.attendanceBreakdown>();
  for (const d of draft.attendanceBreakdown) {
    if (!byProject.has(d.projectId)) byProject.set(d.projectId, []);
    byProject.get(d.projectId)!.push(d);
  }
  let grandDays = 0;
  for (const [projectId, list] of byProject) {
    const total = list.reduce((s, d) => s + d.days, 0);
    grandDays += total;
    p(`  ◆ ${list[0].projectName ?? `現場${projectId}`}（計 ${total}日）`);
    for (const d of list) {
      p(`      ${d.workDate}  ${SHIFT_LABEL[d.shiftType] ?? d.shiftType}  ${d.days}日`);
    }
    p("");
  }
  p(`  ── 合計出面: ${grandDays}日 ──`);
  p("");
  p("  ※ 請求書の労務費（出面×単価）と、この日報の出面日数が一致していることが");
  p("     「いつ・どの現場・何日」の裏付けになります。");

  console.log(out.join("\n"));
}

main();
