/**
 * Demo: worker invoice (作業員請求書) + monthly work report (日報) built from
 * Monthly Closing V2 data, using sample data and NO database.
 *
 * Run: npx tsx scripts/demo-worker-invoice-v2.ts
 *
 * The 日報 (monthly work report) is rendered to match the real 出面表 layout:
 * one row per calendar day, site name only on worked days, plus overtime and
 * transport columns and a 昼勤/夜勤/残業 summary — "余計な情報を省く".
 *
 * Sample data reproduces 大木 充 / 2026年5月 (16 day-shifts, 0 night, 5h overtime).
 */
import {
  computeWorkerInvoiceDraft,
  type AttendanceRecordLike,
  type ExpenseLineLike,
} from "../server/workerInvoiceV2Core";

const WORKER_ID = 30;
const WORKER_NAME = "大木 充";
const COMPANY = "充寵グループ";
const TARGET_MONTH = "2026-05";

const PROJECT_NAMES: Record<number, string> = {
  201: "読売ランド　新南山水族館",
  202: "箱根　小涌園ホテル改修工事",
};
const RATES: Record<string, number> = {
  "201:day": 19000,
  "202:day": 19000,
};

const yen = (n: number) => "¥" + n.toLocaleString("ja-JP");
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const dow = (dateStr: string) => DOW[new Date(dateStr + "T00:00:00Z").getUTCDay()];
const daysInMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// --- sample attendance (出面表) — 読売ランド常駐、26/27のみ箱根で残業 ---------
type Day = { d: string; project: number; ot?: number };
const worked: Day[] = [
  { d: "07", project: 201 }, { d: "08", project: 201 },
  { d: "11", project: 201 }, { d: "12", project: 201 }, { d: "13", project: 201 },
  { d: "14", project: 201 }, { d: "15", project: 201 },
  { d: "18", project: 201 }, { d: "19", project: 201 },
  { d: "21", project: 201 }, { d: "22", project: 201 },
  { d: "25", project: 201 },
  { d: "26", project: 202, ot: 40 }, // 4.0h overtime
  { d: "27", project: 202, ot: 10 }, // 1.0h overtime
  { d: "28", project: 201 }, { d: "29", project: 201 },
];

const attendanceRecords: AttendanceRecordLike[] = worked.map((w) => ({
  employeeId: WORKER_ID,
  projectId: w.project,
  shiftType: "day",
  workDate: `${TARGET_MONTH}-${w.d}`,
  hoursWorked: 80,
  overtimeHours: w.ot ?? 0,
  workType: "normal",
}));

// --- transport: ONE monthly total per project (as V2 stores it). The core does the
//     日割り計算 across 読売ランドの出面日のみ → ¥1,751×13 + ¥1,752 (= ¥24,515 ÷ 14日). ----
const expenseLines: ExpenseLineLike[] = [
  { projectId: 201, expenseType: "transportation", amount: 24515, paymentMethod: "paid_by_worker" },
];

async function main() {
  const draft = await computeWorkerInvoiceDraft({
    workerId: WORKER_ID,
    targetMonth: TARGET_MONTH,
    submissionStatus: "submitted",
    attendanceRecords,
    expenseLines,
    resolveRate: ({ projectId, shiftType }) => RATES[`${projectId}:${shiftType}`] ?? null,
    resolveProjectName: (id) => PROJECT_NAMES[id] ?? null,
  });

  const out: string[] = [];
  const p = (s = "") => out.push(s);
  const byDate = new Map<string, typeof draft.attendanceBreakdown>();
  for (const day of draft.attendanceBreakdown) {
    if (!byDate.has(day.workDate)) byDate.set(day.workDate, []);
    byDate.get(day.workDate)!.push(day);
  }

  // ============== 日報（作業報告）== 出面表の清書 ==========================
  p("════════════════════════════════════════════════════════════════════");
  p(`  日報（作業報告）   ${COMPANY}      ${WORKER_NAME}        ${TARGET_MONTH.replace("-", "年")}月`);
  p("════════════════════════════════════════════════════════════════════");
  p("  日付 曜日  現場名                              残業時間   交通費");
  p("  ──────────────────────────────────────────────────────────────");
  let dayDays = 0, nightDays = 0, otTotal = 0, transportTotal = 0;
  for (let i = 1; i <= daysInMonth(TARGET_MONTH); i++) {
    const dd = String(i).padStart(2, "0");
    const dateStr = `${TARGET_MONTH}-${dd}`;
    const recs = byDate.get(dateStr) || [];
    const w = dow(dateStr);
    const head = `  ${String(i).padStart(2, " ")}日 ${w}`;
    if (recs.length === 0) {
      p(head);
      continue;
    }
    for (const r of recs) {
      if (r.shiftType === "night") nightDays += r.days; else dayDays += r.days;
      otTotal += r.overtimeHours;
      transportTotal += r.transport;
      const mark = r.shiftType === "night" ? "【夜】" : "";
      const site = `${mark}${r.projectName ?? `現場${r.projectId}`}`;
      const ot = `残業 ${r.overtimeHours}h`;
      const tr = r.transport ? `交通費 ¥${r.transport.toLocaleString("ja-JP")}` : "交通費 —";
      p(`${head}  ${site}　/　${ot}　/　${tr}`);
    }
  }
  p("  ──────────────────────────────────────────────────────────────");
  p(`  集計   昼勤出勤日数 ${dayDays}日    夜勤出勤日数 ${nightDays}日    残業時間(h) ${otTotal}`);
  p(`         交通費合計 ${yen(transportTotal)}`);
  p("");
  p("  → 締め提出と同時にこれが出るので、出勤状況をひと目で確認できます。");
  p("");
  p("");

  // ============== 作業員請求書（金額の書類。日報とは別物）================
  p("════════════════════════════════════════════════════════════════════");
  p(`  作業員請求書        ${WORKER_NAME}        ${TARGET_MONTH}`);
  p("════════════════════════════════════════════════════════════════════");
  const catLabel: Record<string, string> = { labor: "労務費", transport: "交通費", expense: "経費" };
  for (const item of draft.items) {
    p(`  [${catLabel[item.category]}] ${item.label}`);
    p(`      ${item.quantity}${item.unit} × ${yen(item.unitPrice)} = ${yen(item.amount)}  (税${item.taxRate}%)`);
  }
  p("  ──────────────────────────────────────────────────────────────");
  p(`  労務費計 ${yen(draft.laborAmount)}   交通費計 ${yen(draft.transportAmount)}   経費計 ${yen(draft.expenseAmount)}`);
  p(`  小計 ${yen(draft.subtotal)} → 消費税 ${yen(draft.taxAmount)} → 合計 ${yen(draft.totalAmount)}`);
  p("");
  p("  ※ 交通費計と日報の交通費合計が一致 → 金額の裏付けになる。");
  p(`  ※ 残業 ${otTotal}h は単価ルール未確定のため未計上（要・確認）。`);

  console.log(out.join("\n"));
}

main();
