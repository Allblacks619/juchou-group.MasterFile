import * as db from "./db";
import type { ClientInvoiceComputeInput } from "./clientInvoiceV2Core";

/**
 * MTSIM: マルチテナント化 Phase 0 シミュレーションフィクスチャ（docs/multitenant/PLAN_v1.md）
 *
 * 架空3社チェーン（実取引を模す・実名不使用）:
 * - 甲野電設（元請役・tier1）: 発注者。職人が乙島管理の現場にゲスト参加する（P2パターン）
 * - 乙島電業（自社役・tier2）: 現テナント。甲野の現場を管理代行し、甲野へ請求書を発行する
 * - 丙田工業（協力会社役・tier3）: 乙島へ請求書を発行する（P1/P3 多段チェーン）
 *
 * 方針（simulationFixture と同様）:
 * - 固定セット（名前に "MTSIM " 接頭辞）を毎回再利用。対象月は 2025-02（SIM=2025-01 / Beta=2024-01 と分離）。
 * - 冪等: 再実行しても MTSIM_* エンティティ + 2025-02 の子データのみ操作。本番データには触れない。
 * - シードするのは現テナント（乙島視点）のデータのみ。甲野・丙田はテナント未実装のため、
 *   甲野職人は attendance の guestName、丙田の請求は純データ入力（buildHeidaToOtsuInvoiceInput）で表現する。
 */

export const MTSIM_MONTH = "2025-02";
const NOTE = "MTSIM マルチテナント化シミュレーション用（本番データではありません）";
const effectiveFrom = new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0));

/** 架空3社の定義（純データ。companies テーブルは Phase 1 まで存在しないため DB には入れない） */
export const MTSIM_COMPANIES = {
  KONO: {
    key: "KONO",
    name: "MTSIM 甲野電設株式会社",
    tier: 1,
    role: "元請役（発注者。職人がゲスト参加する）",
    invoiceIssuerNumber: "T1000000000001",
  },
  OTSU: {
    key: "OTSU",
    name: "MTSIM 乙島電業株式会社",
    tier: 2,
    role: "自社役（現テナント。管理代行＋甲野へ請求）",
    invoiceIssuerNumber: "T2000000000002",
  },
  HEIDA: {
    key: "HEIDA",
    name: "MTSIM 丙田工業株式会社",
    tier: 3,
    role: "協力会社役（乙島へ請求。インボイス未登録=免税）",
    invoiceIssuerNumber: null,
  },
} as const;

const CLIENT_NAME = MTSIM_COMPANIES.KONO.name;
const PROJECT_NAME = "MTSIM 甲野タワー新築工事";

type WorkerKey = "E1" | "E2";
const WORKERS: {
  key: WorkerKey; nameKanji: string; nameRomaji: string;
  isInvoiceIssuer: boolean; invoiceIssuerNumber: string | null;
}[] = [
  { key: "E1", nameKanji: "MTSIM 乙島 一郎", nameRomaji: "MTSIM Ichiro Otsushima", isInvoiceIssuer: true, invoiceIssuerNumber: "T3000000000003" },
  { key: "E2", nameKanji: "MTSIM 乙島 二郎", nameRomaji: "MTSIM Jiro Otsushima", isInvoiceIssuer: false, invoiceIssuerNumber: null },
];

/** 甲野電設の職人（乙島管理現場にゲスト参加 = attendance.guestName のみで存在） */
export const MTSIM_GUESTS: { name: string; days: number[] }[] = [
  { name: "MTSIM 甲野 三郎", days: [3, 4, 5, 6, 7] },
  { name: "MTSIM 甲野 四郎", days: [10, 11, 12] },
];

// 単価: `${workerKey}:${shift}` = { 作業員支払, 取引先請求 }
// 24,000/8×1.25=3,750・×1.5=4,500 と割り切れる値を採用（band 検算を整数で固定するため）
const RATES: Record<string, { worker: number; client: number }> = {
  "E1:day": { worker: 19000, client: 24000 },
  "E1:night": { worker: 25000, client: 32000 },
  "E2:day": { worker: 18000, client: 21000 },
};

// 出面（乙島従業員）: E1=昼10日(うち1日 残業6.0h → 5h時間外+1h深夜) + 夜勤2日, E2=昼8日
const ATTENDANCE: Record<WorkerKey, { d: number; shift?: "day" | "night"; ot?: number }[]> = {
  E1: [
    { d: 3 }, { d: 4 }, { d: 5 }, { d: 6 }, { d: 7 },
    { d: 10, ot: 60 }, // 昼勤6.0h残業（5h時間外 + 1h深夜帯）
    { d: 11 }, { d: 12 }, { d: 13 }, { d: 14 },
    { d: 17, shift: "night" }, { d: 18, shift: "night" },
  ],
  E2: [
    { d: 3 }, { d: 4 }, { d: 5 }, { d: 6 }, { d: 7 },
    { d: 10 }, { d: 11 }, { d: 12 },
  ],
};

// 交通費（作業員立替 + 客先請求）
const TRANSPORT: Record<WorkerKey, number> = { E1: 12000, E2: 8000 };

export type MtSimFixtureResult = {
  clientId: number;
  projectId: number;
  targetMonth: string;
  workers: { id: number; name: string; invoice: boolean }[];
  guestNames: string[];
  attendanceRecords: number;
  guestAttendanceRecords: number;
};

async function findOrCreateByName<T extends { id?: any; name?: string; nameKanji?: string }>(
  list: T[], match: (x: T) => boolean, create: () => Promise<T>
): Promise<T> {
  const existing = list.find(match);
  return existing || (await create());
}

/** MTSIM シミュレーションデータを作成/リセット。何度実行しても安全（MTSIM_* + 2025-02 のみ操作）。 */
export async function seedMtSimFixture(): Promise<MtSimFixtureResult> {
  // 1) 取引先（甲野電設 = 乙島の請求先）
  const clients = await db.getAllClients();
  const client = await findOrCreateByName(clients as any[], (c) => c.name === CLIENT_NAME,
    () => db.createClient({ name: CLIENT_NAME, notes: NOTE } as any));
  const clientId = Number(client.id);

  // 2) 現場（乙島が管理代行する甲野の現場）
  const allProjects = await db.getAllProjects();
  const project = await findOrCreateByName(allProjects as any[], (x) => x.name === PROJECT_NAME,
    () => db.createProject({ name: PROJECT_NAME, clientId, status: "active", notes: NOTE } as any));
  const projectId = Number(project.id);

  // 3) 乙島従業員（プロフィール + インボイス設定）
  const allEmployees = await db.getAllEmployees();
  const workerByKey = new Map<WorkerKey, any>();
  for (const w of WORKERS) {
    const emp = await findOrCreateByName(allEmployees as any[], (e) => e.nameKanji === w.nameKanji,
      () => db.createEmployee({ nameKanji: w.nameKanji, nameRomaji: w.nameRomaji, notes: NOTE } as any));
    await db.updateEmployee(Number(emp.id), {
      isInvoiceIssuer: w.isInvoiceIssuer,
      invoiceIssuerNumber: w.invoiceIssuerNumber,
    } as any);
    workerByKey.set(w.key, emp);
  }
  const workerId = (k: WorkerKey) => Number(workerByKey.get(k)!.id);
  const simWorkerIds = new Set(WORKERS.map((w) => workerId(w.key)));

  // 4) 単価: MTSIM 現場×作業員の既存レートを削除してから再作成（冪等）
  const allRates = await db.getAllEmployeeRates();
  for (const rate of allRates as any[]) {
    if (Number(rate.projectId) === projectId && simWorkerIds.has(Number(rate.employeeId))) {
      await db.deleteEmployeeRate(Number(rate.id));
    }
  }
  for (const [key, r] of Object.entries(RATES)) {
    const [wk, shift] = key.split(":") as [WorkerKey, string];
    await db.createEmployeeRate({
      scopeType: "project", projectId, employeeId: workerId(wk), shiftType: shift,
      workerRate: r.worker, clientRate: r.client, effectiveFrom, effectiveUntil: null, notes: NOTE,
    } as any);
  }

  // 5) 出面（乙島従業員）
  let attendanceRecords = 0;
  for (const w of WORKERS) {
    for (const a of ATTENDANCE[w.key]) {
      const workDate = new Date(`${MTSIM_MONTH}-${String(a.d).padStart(2, "0")}T00:00:00.000Z`);
      await db.upsertAttendance({
        employeeId: workerId(w.key), projectId, workDate,
        hoursWorked: 80, overtimeHours: a.ot ?? 0, workType: "normal", shiftType: a.shift ?? "day",
      } as any);
      attendanceRecords++;
    }
  }

  // 6) 出面（甲野職人 = ゲスト。P2パターン: 元請の職人が乙島管理現場に入る）
  //    ゲストは乙島の請求・月締めの対象外（employeeId なし・単価なし・提出なし）。
  //    genba 名簿には syncSiteRosterFromAttendance 経由で自動反映される。
  let guestAttendanceRecords = 0;
  for (const g of MTSIM_GUESTS) {
    for (const d of g.days) {
      const workDate = new Date(`${MTSIM_MONTH}-${String(d).padStart(2, "0")}T00:00:00.000Z`);
      await db.upsertAttendance({
        employeeId: null, guestName: g.name, projectId, workDate,
        hoursWorked: 80, overtimeHours: 0, workType: "normal", shiftType: "day",
      } as any);
      guestAttendanceRecords++;
    }
  }

  // 7) 月締め: 締め完了 + 参加者確認 + V1提出 + 客先請求交通費（乙島従業員のみ）
  await db.upsertMonthlyClosingV2ProjectReview({ targetMonth: MTSIM_MONTH, projectId, status: "締め完了" });

  let closing = await db.getProjectClosingByProjectMonth(projectId, MTSIM_MONTH);
  if (!closing) {
    closing = (await db.createProjectClosing({ projectId, closingMonth: MTSIM_MONTH, status: "open" } as any)) as any;
  }

  for (const w of WORKERS) {
    const wid = workerId(w.key);
    const transport = TRANSPORT[w.key];

    await db.addProjectMember({ projectId, employeeId: wid, isActive: true } as any);

    await db.upsertClosingSubmission({
      closingId: Number(closing!.id), employeeId: wid, status: "submitted",
      transportAmount: transport, expenseAmount: 0,
    } as any);

    await db.upsertMonthlyClosingV2ParticipantReview({
      targetMonth: MTSIM_MONTH, projectId, participantKey: `worker:${wid}`, workerId: wid,
      individualStatus: "締め完了", transportationStatus: "確認済み", invoiceInfoStatus: "確認済み",
      isAggregationExcluded: false,
    });

    await db.upsertMonthlyClosingV2TransportationExpense({
      workerId: wid, projectId, targetMonth: MTSIM_MONTH, payerType: "worker_paid", clientBillable: true,
      amount: transport, memo: NOTE,
    });
  }

  return {
    clientId,
    projectId,
    targetMonth: MTSIM_MONTH,
    workers: WORKERS.map((w) => ({ id: workerId(w.key), name: w.nameKanji, invoice: w.isInvoiceIssuer })),
    guestNames: MTSIM_GUESTS.map((g) => g.name),
    attendanceRecords,
    guestAttendanceRecords,
  };
}

/**
 * P2パターン: 乙島電業（自社役）→ 甲野電設（元請役）への請求計算入力（純データ）。
 * 出面定義（ATTENDANCE/RATES/TRANSPORT）と同じ内容を computeClientInvoiceDraft の入力に写したもの。
 * 甲野職人（ゲスト）は乙島の請求に一切現れないことがこの入力の要点。
 */
export function buildOtsuToKonoInvoiceInput(projectId = 9101): ClientInvoiceComputeInput {
  const base = { projectId, projectName: PROJECT_NAME, clientRateSource: null } as const;
  return {
    targetMonth: MTSIM_MONTH,
    projectOrder: [projectId],
    projects: [{ projectId, projectName: PROJECT_NAME, transportTotal: TRANSPORT.E1 + TRANSPORT.E2 }],
    labor: [
      // E1 昼勤10日 + 残業6.0h（builder が日単位で band 分けした想定: 5h時間外 + 1h深夜）
      {
        ...base, workerId: 1, workerName: WORKERS[0].nameKanji, shiftType: "day",
        daysTimes10: 100, overtimeHoursTimes10: 60,
        overtimeRegularTimes10: 50, overtimeLateNightTimes10: 10,
        clientRate: RATES["E1:day"].client,
      },
      // E1 夜勤2日
      {
        ...base, workerId: 1, workerName: WORKERS[0].nameKanji, shiftType: "night",
        daysTimes10: 20, overtimeHoursTimes10: 0,
        clientRate: RATES["E1:night"].client,
      },
      // E2 昼勤8日
      {
        ...base, workerId: 2, workerName: WORKERS[1].nameKanji, shiftType: "day",
        daysTimes10: 80, overtimeHoursTimes10: 0,
        clientRate: RATES["E2:day"].client,
      },
    ],
    includeProjectSectionHeaders: false,
    issuerHasQualifiedInvoiceNumber: true, // 乙島はインボイス登録あり
  };
}

/**
 * P1/P3パターン: 丙田工業（三次役・インボイス未登録=免税）→ 乙島電業への請求計算入力（純データ）。
 * 丙田はテナント未実装のため DB には入れず、純関数コアの入力として3社目の視点を再現する。
 * マルチテナント化後は同じ計算コアが丙田テナントでもそのまま動くことの先行検証を兼ねる。
 */
export function buildHeidaToOtsuInvoiceInput(projectId = 9201): ClientInvoiceComputeInput {
  const projectName = `${PROJECT_NAME}（丙田担当区画）`;
  const base = { projectId, projectName, clientRateSource: null } as const;
  return {
    targetMonth: MTSIM_MONTH,
    projectOrder: [projectId],
    projects: [{ projectId, projectName, transportTotal: 5000 }],
    labor: [
      { ...base, workerId: 9001, workerName: "MTSIM 丙田 五郎", shiftType: "day", daysTimes10: 120, overtimeHoursTimes10: 0, clientRate: 18000 },
      { ...base, workerId: 9002, workerName: "MTSIM 丙田 六郎", shiftType: "day", daysTimes10: 80, overtimeHoursTimes10: 0, clientRate: 18000 },
    ],
    includeProjectSectionHeaders: false,
    issuerHasQualifiedInvoiceNumber: false, // 丙田は免税事業者 → 全行0%
  };
}
