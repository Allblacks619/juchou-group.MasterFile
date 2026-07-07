/**
 * Demo: 月締め → 作業員請求書 → 取引先請求書 の一連フロー（DB不要・本番の計算コアを使用）。
 *
 * Run: npx tsx scripts/demo-monthly-flow.ts
 *
 * シナリオ: 取引先1・現場3・作業員2。単価設定/プロフィール/出面まで作り込み、
 * 本番と同じ計算コア（computeWorkerInvoiceDraft / computeClientInvoiceDraft）で
 * 実際の請求内容を算出して表示する。
 */
import { computeWorkerInvoiceDraft, type AttendanceRecordLike, type ExpenseLineLike } from "../server/workerInvoiceV2Core";
import { computeClientInvoiceDraft, type ClientInvoiceLaborInput } from "../server/clientInvoiceV2Core";

const yen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
const TARGET_MONTH = "2026-06";

// ───────────────────────── マスタ ─────────────────────────
const CLIENT = { id: 1, name: "株式会社 平安電工" };

const PROJECTS = [
  { id: 101, name: "読売ランド 新南山水族館", clientId: 1 },
  { id: 102, name: "品川 新築学校", clientId: 1 },
  { id: 103, name: "箱根 小涌園ホテル改修", clientId: 1 },
];
const projectName = (id: number) => PROJECTS.find((p) => p.id === id)?.name ?? `現場${id}`;

const WORKERS = [
  { id: 30, name: "大木 充", role: "管理者兼作業員", isInvoiceIssuer: true, invoiceIssuerNumber: "T6810341010660" },
  { id: 31, name: "大木 早苗", role: "作業員（免税事業者）", isInvoiceIssuer: false, invoiceIssuerNumber: null },
];

// 作業員支払単価（会社→作業員）: `${workerId}:${projectId}:${shift}` = 円/日
const WORKER_RATE: Record<string, number> = {
  "30:101:day": 20000, "30:101:night": 25000, "30:103:day": 22000,
  "31:101:day": 18000, "31:102:day": 19000,
};
// 取引先請求単価（会社→取引先）: `${projectId}:${shift}` = 円/日
const CLIENT_RATE: Record<string, number> = {
  "101:day": 25000, "101:night": 32000,
  "102:day": 21000,
  "103:day": 28000,
};

// 出面（出勤）: 作業員ごと。day=平日1.0日(80=8.0h)。ot は×10時間（40=4.0h）。
type Att = { day: number; project: number; shift?: "day" | "night"; ot?: number };
const ATTENDANCE: Record<number, Att[]> = {
  30: [
    { day: 1, project: 101 }, { day: 2, project: 101 }, { day: 3, project: 101 },
    { day: 4, project: 101 }, { day: 5, project: 101 },
    { day: 8, project: 101 }, { day: 9, project: 101 }, { day: 10, project: 101 },
    { day: 11, project: 101, shift: "night" }, { day: 12, project: 101, shift: "night" },
    { day: 15, project: 103, ot: 40 }, // 昼勤 4.0h残業（全て時間外）
    { day: 16, project: 103, ot: 60 }, // 昼勤 6.0h残業（4h時間外 + 2h深夜帯）
    { day: 17, project: 103 },
  ],
  31: [
    { day: 1, project: 101 }, { day: 2, project: 101 }, { day: 3, project: 101 },
    { day: 4, project: 101 }, { day: 5, project: 101 }, { day: 8, project: 101 },
    { day: 9, project: 102 }, { day: 10, project: 102 }, { day: 11, project: 102 },
    { day: 12, project: 102 }, { day: 15, project: 102 }, { day: 16, project: 102 },
  ],
};

// 交通費（作業員立替, 会社が作業員へ支払う）: `${workerId}:${projectId}` = 円/月
const WORKER_TRANSPORT: Record<string, number> = {
  "30:101": 24514, "30:103": 3000,
  "31:101": 6000, "31:102": 8000,
};
// 取引先請求交通費（会社→取引先, client-billable）: `${projectId}` = 円/月
const CLIENT_TRANSPORT: Record<number, number> = { 101: 30514, 102: 8000, 103: 3000 };

// ───────────────────────── ヘルパ ─────────────────────────
function attToRecords(workerId: number): AttendanceRecordLike[] {
  return (ATTENDANCE[workerId] || []).map((a) => ({
    employeeId: workerId,
    projectId: a.project,
    shiftType: a.shift || "day",
    workDate: `${TARGET_MONTH}-${String(a.day).padStart(2, "0")}`,
    hoursWorked: 80,
    overtimeHours: a.ot || 0,
    workType: "normal",
  }));
}
function transportLines(workerId: number): ExpenseLineLike[] {
  return Object.entries(WORKER_TRANSPORT)
    .filter(([k]) => k.startsWith(`${workerId}:`))
    .map(([k, amount]) => ({ projectId: Number(k.split(":")[1]), expenseType: "transportation", amount, paymentMethod: "paid_by_worker" }));
}

const line = (s = "─") => console.log(s.repeat(64));
const H = (t: string) => { console.log("\n" + "━".repeat(64) + "\n  " + t + "\n" + "━".repeat(64)); };

async function main() {
  H(`月締め〜請求書発行 シミュレーション（対象月 ${TARGET_MONTH}）`);

  // 0) マスタ
  console.log(`\n【取引先】 ${CLIENT.name}`);
  console.log(`【現場】`);
  PROJECTS.forEach((p) => console.log(`  - ${p.name}（${CLIENT.name}）`));
  console.log(`【作業員 / プロフィール】`);
  WORKERS.forEach((w) =>
    console.log(`  - ${w.name}（${w.role}）｜インボイス: ${w.isInvoiceIssuer ? `対応 ${w.invoiceIssuerNumber}` : "未対応（免税）→ 消費税0%"}`)
  );
  console.log(`【作業員支払単価（会社→作業員）】`);
  Object.entries(WORKER_RATE).forEach(([k, v]) => {
    const [wid, pid, sh] = k.split(":");
    console.log(`  - ${WORKERS.find((w) => w.id === +wid)?.name} / ${projectName(+pid)} / ${sh === "night" ? "夜勤" : "日勤"}: ${yen(v)}/日`);
  });
  console.log(`【取引先請求単価（会社→取引先）】`);
  Object.entries(CLIENT_RATE).forEach(([k, v]) => {
    const [pid, sh] = k.split(":");
    console.log(`  - ${projectName(+pid)} / ${sh === "night" ? "夜勤" : "日勤"}: ${yen(v)}/日`);
  });

  // 1) 月締め（現場×作業員の集計）
  H("STEP 1. 月締め（現場×作業員：出勤日数・交通費）");
  for (const p of PROJECTS) {
    const rows = WORKERS.map((w) => {
      const days = (ATTENDANCE[w.id] || []).filter((a) => a.project === p.id).length;
      const t = WORKER_TRANSPORT[`${w.id}:${p.id}`] || 0;
      return { w, days, t };
    }).filter((r) => r.days > 0);
    if (rows.length === 0) continue;
    console.log(`\n◆ ${p.name}`);
    rows.forEach((r) => console.log(`   ${r.w.name}：出勤 ${r.days}日 / 交通費 ${r.t > 0 ? yen(r.t) : "なし(0円)"} → 提出済み`));
  }
  console.log("\n→ 全現場・全作業員が「提出済み」= 全現場の月締め完了。請求書を発行できる状態。");

  // 2) 作業員請求書（各作業員：全現場まとめ・月1枚）
  for (const w of WORKERS) {
    H(`STEP 2. 作業員請求書（${w.name}）— 全現場まとめ・月1枚`);
    const draft = await computeWorkerInvoiceDraft({
      workerId: w.id,
      targetMonth: TARGET_MONTH,
      submissionStatus: "submitted",
      attendanceRecords: attToRecords(w.id),
      expenseLines: transportLines(w.id),
      resolveRate: ({ projectId, shiftType }) => WORKER_RATE[`${w.id}:${projectId}:${shiftType}`] ?? null,
      resolveProjectName: (projectId) => projectName(projectId),
      issuerHasQualifiedInvoiceNumber: w.isInvoiceIssuer,
      includeProjectSectionHeaders: true,
    });
    for (const it of draft.items) {
      if (it.itemType === "text") { console.log(`\n  ${it.label}`); continue; }
      console.log(`   ${it.label.padEnd(22)}  ${String(it.quantity).padStart(4)}${it.unit} × ${yen(it.unitPrice).padStart(9)} = ${yen(it.amount).padStart(11)}  (税${it.taxRate}%)`);
    }
    line();
    console.log(`   小計 ${yen(draft.subtotal)} ／ 消費税 ${yen(draft.taxAmount)} ／ 合計 ${yen(draft.totalAmount)}`);
    if (draft.warnings.length) { console.log(`   ⚠ 要確認:`); draft.warnings.forEach((x) => console.log(`     - ${x}`)); }
  }

  // 3) 取引先請求書（会社→取引先：現場ごと A/B/C ＋ 交通費）
  H(`STEP 3. 取引先請求書（${CLIENT.name}宛）— 現場ごと・電気工事業A/B/C`);
  const OT_DAY_CAP = 40; // 4.0h（作業員請求書と共通の band 分け）
  const labor: ClientInvoiceLaborInput[] = [];
  for (const w of WORKERS) {
    // (project, shift) 単位に日数・残業を集計。残業は日単位で時間外/深夜に分割してから積み上げる。
    const agg = new Map<string, { pid: number; shift: string; days10: number; reg10: number; late10: number }>();
    for (const a of ATTENDANCE[w.id] || []) {
      const shift = a.shift || "day";
      const key = `${a.project}:${shift}`;
      const cur = agg.get(key) || { pid: a.project, shift, days10: 0, reg10: 0, late10: 0 };
      cur.days10 += 10;
      const ot = a.ot || 0;
      if (ot > 0) {
        if (shift === "night") cur.late10 += ot;
        else { const reg = Math.min(ot, OT_DAY_CAP); cur.reg10 += reg; cur.late10 += ot - reg; }
      }
      agg.set(key, cur);
    }
    for (const g of agg.values()) {
      labor.push({
        projectId: g.pid,
        projectName: projectName(g.pid),
        workerId: w.id,
        workerName: w.name,
        shiftType: g.shift,
        daysTimes10: g.days10,
        overtimeHoursTimes10: g.reg10 + g.late10,
        overtimeRegularTimes10: g.reg10,
        overtimeLateNightTimes10: g.late10,
        clientRate: CLIENT_RATE[`${g.pid}:${g.shift}`] ?? null,
      });
    }
  }
  const client = computeClientInvoiceDraft({
    targetMonth: TARGET_MONTH,
    projectOrder: PROJECTS.map((p) => p.id),
    projects: PROJECTS.map((p) => ({ projectId: p.id, projectName: p.name, transportTotal: CLIENT_TRANSPORT[p.id] || 0 })),
    labor,
    issuerHasQualifiedInvoiceNumber: true, // 自社はインボイス登録あり
  });
  for (const it of client.items) {
    if (it.itemType === "text") { console.log(`\n  ${it.description}`); continue; }
    const q = it.unit === "日" ? it.quantity / 10 : it.quantity; // 日は×10保存
    console.log(`   ${it.description.padEnd(16)}  ${String(q).padStart(5)}${it.unit} × ${yen(it.unitPrice).padStart(9)} = ${yen(it.amount).padStart(11)}  (税${it.itemTaxRate}%)`);
  }
  line();
  console.log(`   小計 ${yen(client.subtotal)} ／ 消費税 ${yen(client.taxAmount)} ／ 合計 ${yen(client.totalAmount)}`);
  console.log(`   税率別内訳: ` + Object.entries(client.taxableByRate).map(([r, b]) => `${r}%対象 ${yen(b)}`).join(" ／ "));
  if (client.warnings.length) { console.log(`   ⚠ 要確認:`); client.warnings.forEach((x) => console.log(`     - ${x}`)); }
  if (client.internalRateMemo) console.log(`\n   [社内メモ・外部非表示]\n     ` + client.internalRateMemo.split("\n").join("\n     "));

  H("シミュレーション完了");
}

main().catch((e) => { console.error(e); process.exit(1); });
