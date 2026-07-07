import * as db from "./db";

/**
 * Simulation fixture (本格シミュレーション用シード) — 取引先1・現場3・作業員2の一連フローを
 * 実際の画面でクリックして確認するための、再現可能なシード/リセット。
 *
 * 方針（betaFixture と同様）:
 * - 固定セット（名前に "SIM " 接頭辞）を毎回再利用。対象月は 2025-01。
 * - 冪等: 再実行すると名前で既存を見つけ、SIM_* エンティティ + 2025-01 の子データだけを
 *   ベースラインにリセットする。本番データには触れない。
 *
 * 投入内容（両請求書を画面で確認できる完全セット）:
 * - 作業員プロフィール（インボイス対応/未対応=免税で0%を実演）
 * - 単価（作業員支払単価 + 取引先請求単価, 現場×作業員×シフト）
 * - 出面（日勤/夜勤 + 残業。昼勤6h残業=5h時間外+1h深夜を含む）
 * - 月締めV2: 現場レビュー「締め完了」+ 参加者レビュー「締め完了」+ 客先請求交通費
 * - V1 締め提出（submitted）: 作業員請求書の生成ゲート
 */

export const SIM_MONTH = "2025-01";
const NOTE = "シミュレーション検証用（本番データではありません）";
const effectiveFrom = new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0));

const CLIENT_NAME = "SIM 株式会社 平安電工";

type ProjKey = "P1" | "P2" | "P3";
const PROJECTS: { key: ProjKey; name: string }[] = [
  { key: "P1", name: "SIM 読売ランド水族館" },
  { key: "P2", name: "SIM 品川新築学校" },
  { key: "P3", name: "SIM 箱根小涌園改修" },
];

type WorkerKey = "W1" | "W2";
const WORKERS: {
  key: WorkerKey; nameKanji: string; nameRomaji: string;
  isInvoiceIssuer: boolean; invoiceIssuerNumber: string | null;
}[] = [
  { key: "W1", nameKanji: "SIM 大木 充", nameRomaji: "SIM Mitsuru Oki", isInvoiceIssuer: true, invoiceIssuerNumber: "T6810341010660" },
  { key: "W2", nameKanji: "SIM 大木 早苗", nameRomaji: "SIM Sanae Oki", isInvoiceIssuer: false, invoiceIssuerNumber: null },
];

// 単価: `${workerKey}:${projectKey}:${shift}` = { 作業員支払, 取引先請求 }
const RATES: Record<string, { worker: number; client: number }> = {
  "W1:P1:day": { worker: 20000, client: 25000 },
  "W1:P1:night": { worker: 25000, client: 32000 },
  "W1:P3:day": { worker: 22000, client: 28000 },
  "W2:P1:day": { worker: 18000, client: 25000 },
  "W2:P2:day": { worker: 19000, client: 21000 },
};

// 出面: workerKey → [{ 日, 現場, shift?, ot(×10時間)? }]
const ATTENDANCE: Record<WorkerKey, { d: number; p: ProjKey; shift?: "day" | "night"; ot?: number }[]> = {
  W1: [
    { d: 6, p: "P1" }, { d: 7, p: "P1" }, { d: 8, p: "P1" }, { d: 9, p: "P1" }, { d: 10, p: "P1" },
    { d: 14, p: "P1" }, { d: 15, p: "P1" }, { d: 16, p: "P1" },
    { d: 20, p: "P1", shift: "night" }, { d: 21, p: "P1", shift: "night" },
    { d: 27, p: "P3", ot: 40 }, // 昼勤 4.0h残業（全て時間外・5h以内）
    { d: 28, p: "P3", ot: 60 }, // 昼勤 6.0h残業（5h時間外 + 1h深夜帯）
    { d: 29, p: "P3" },
  ],
  W2: [
    { d: 6, p: "P1" }, { d: 7, p: "P1" }, { d: 8, p: "P1" }, { d: 9, p: "P1" }, { d: 10, p: "P1" }, { d: 14, p: "P1" },
    { d: 15, p: "P2" }, { d: 16, p: "P2" }, { d: 17, p: "P2" }, { d: 20, p: "P2" }, { d: 21, p: "P2" }, { d: 22, p: "P2" },
  ],
};

// 交通費（作業員立替 = 会社→作業員、かつ 客先請求 = 会社→取引先）: `${workerKey}:${projectKey}` = 円
const TRANSPORT: Record<string, number> = {
  "W1:P1": 24514, "W1:P3": 3000,
  "W2:P1": 6000, "W2:P2": 8000,
};

export type SimulationFixtureResult = {
  clientId: number;
  targetMonth: string;
  workers: { id: number; name: string; invoice: boolean }[];
  projects: { id: number; name: string }[];
  attendanceRecords: number;
};

async function findOrCreateByName<T extends { id?: any; name?: string; nameKanji?: string }>(
  list: T[], match: (x: T) => boolean, create: () => Promise<T>
): Promise<T> {
  const existing = list.find(match);
  return existing || (await create());
}

/** SIM シミュレーションデータを作成/リセット。何度実行しても安全（SIM_* + 2025-01 のみ操作）。 */
export async function seedSimulationFixture(): Promise<SimulationFixtureResult> {
  // 1) 取引先
  const clients = await db.getAllClients();
  const client = await findOrCreateByName(clients as any[], (c) => c.name === CLIENT_NAME,
    () => db.createClient({ name: CLIENT_NAME, notes: NOTE } as any));
  const clientId = Number(client.id);

  // 2) 現場
  const allProjects = await db.getAllProjects();
  const projectByKey = new Map<ProjKey, any>();
  for (const p of PROJECTS) {
    const proj = await findOrCreateByName(allProjects as any[], (x) => x.name === p.name,
      () => db.createProject({ name: p.name, clientId, status: "active", notes: NOTE } as any));
    projectByKey.set(p.key, proj);
  }
  const projectId = (k: ProjKey) => Number(projectByKey.get(k)!.id);

  // 3) 作業員（プロフィール + インボイス設定）
  const allEmployees = await db.getAllEmployees();
  const workerByKey = new Map<WorkerKey, any>();
  for (const w of WORKERS) {
    const emp = await findOrCreateByName(allEmployees as any[], (e) => e.nameKanji === w.nameKanji,
      () => db.createEmployee({ nameKanji: w.nameKanji, nameRomaji: w.nameRomaji, notes: NOTE } as any));
    // インボイス対応/未対応を反映（免税=未登録なら消費税0%になる）
    await db.updateEmployee(Number(emp.id), {
      isInvoiceIssuer: w.isInvoiceIssuer,
      invoiceIssuerNumber: w.invoiceIssuerNumber,
    } as any);
    workerByKey.set(w.key, emp);
  }
  const workerId = (k: WorkerKey) => Number(workerByKey.get(k)!.id);

  const simWorkerIds = new Set(WORKERS.map((w) => workerId(w.key)));
  const simProjectIds = new Set(PROJECTS.map((p) => projectId(p.key)));

  // 4) 単価: SIM の作業員×現場の既存レートを削除してから再作成（冪等）
  const allRates = await db.getAllEmployeeRates();
  for (const rate of allRates as any[]) {
    if (simProjectIds.has(Number(rate.projectId)) && simWorkerIds.has(Number(rate.employeeId))) {
      await db.deleteEmployeeRate(Number(rate.id));
    }
  }
  for (const [key, r] of Object.entries(RATES)) {
    const [wk, pk, shift] = key.split(":") as [WorkerKey, ProjKey, string];
    await db.createEmployeeRate({
      scopeType: "project", projectId: projectId(pk), employeeId: workerId(wk), shiftType: shift,
      workerRate: r.worker, clientRate: r.client, effectiveFrom, effectiveUntil: null, notes: NOTE,
    } as any);
  }

  // 5) 出面
  let attendanceRecords = 0;
  for (const w of WORKERS) {
    for (const a of ATTENDANCE[w.key]) {
      const workDate = new Date(`${SIM_MONTH}-${String(a.d).padStart(2, "0")}T00:00:00.000Z`);
      await db.upsertAttendance({
        employeeId: workerId(w.key), projectId: projectId(a.p), workDate,
        hoursWorked: 80, overtimeHours: a.ot ?? 0, workType: "normal", shiftType: a.shift ?? "day",
      } as any);
      attendanceRecords++;
    }
  }

  // 6) 月締め: 現場ごとに 締め完了 + 参加者確認 + V1提出 + 客先請求交通費
  for (const p of PROJECTS) {
    const pid = projectId(p.key);
    // どの作業員がこの現場で稼働したか
    const workersOnProject = WORKERS.filter((w) => ATTENDANCE[w.key].some((a) => a.p === p.key));
    if (workersOnProject.length === 0) continue;

    // V2 現場レビュー: 締め完了 → 取引先請求の対象
    await db.upsertMonthlyClosingV2ProjectReview({ targetMonth: SIM_MONTH, projectId: pid, status: "締め完了" });

    // V1 締め（作業員請求書の生成ゲート）
    let closing = await db.getProjectClosingByProjectMonth(pid, SIM_MONTH);
    if (!closing) {
      closing = (await db.createProjectClosing({ projectId: pid, closingMonth: SIM_MONTH, status: "open" } as any)) as any;
    }

    for (const w of workersOnProject) {
      const wid = workerId(w.key);
      const transport = TRANSPORT[`${w.key}:${p.key}`] || 0;

      await db.addProjectMember({ projectId: pid, employeeId: wid, isActive: true } as any);

      await db.upsertClosingSubmission({
        closingId: Number(closing!.id), employeeId: wid, status: "submitted",
        transportAmount: transport, expenseAmount: 0,
      } as any);

      await db.upsertMonthlyClosingV2ParticipantReview({
        targetMonth: SIM_MONTH, projectId: pid, participantKey: `worker:${wid}`, workerId: wid,
        individualStatus: "締め完了", transportationStatus: "確認済み", invoiceInfoStatus: "確認済み",
        isAggregationExcluded: false,
      });

      // 客先請求交通費（作業員立替 + 客先請求）→ 両請求書の交通費0%行
      await db.upsertMonthlyClosingV2TransportationExpense({
        workerId: wid, projectId: pid, targetMonth: SIM_MONTH, payerType: "worker_paid", clientBillable: true,
        amount: transport, memo: NOTE,
      });
    }
  }

  return {
    clientId,
    targetMonth: SIM_MONTH,
    workers: WORKERS.map((w) => ({ id: workerId(w.key), name: w.nameKanji, invoice: w.isInvoiceIssuer })),
    projects: PROJECTS.map((p) => ({ id: projectId(p.key), name: p.name })),
    attendanceRecords,
  };
}
