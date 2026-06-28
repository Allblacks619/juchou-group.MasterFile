import * as db from "./db";

/**
 * Beta test fixture (固定Betaセット) — reproducible seed/reset for verification.
 *
 * Strategy (agreed):
 * - One fixed Beta set, reused every time: Beta_Client_01 / Beta_Worker_01 / Beta_Project_01,
 *   fixed test month 2024-01 (pre-2025 so it never mixes with production data).
 * - Idempotent: re-running finds the existing Beta entities (by name) and resets their
 *   2024-01 child data to a known baseline — it never creates duplicate profiles, and it
 *   only ever touches Beta_* entities + month 2024-01. Production data is never touched.
 *
 * The seeded data is complete enough to exercise the worker invoice V2 + 日報 end to end:
 * attendance (day/night + overtime), worker rates (単価), and a submitted V1 closing with
 * transport/expense (which the V2 builder bridges).
 */

export const BETA_CLIENT_NAME = "Beta_Client_01";
export const BETA_WORKER_NAME = "Beta_Worker_01";
export const BETA_PROJECT_NAME = "Beta_Project_01";
export const BETA_TEST_MONTH = "2024-01";
const BETA_NOTE = "Beta検証用（本番データではありません）";
const BETA_DAY_RATE = 18000;
const BETA_NIGHT_RATE = 22000;
const BETA_CLIENT_DAY_RATE = 25000;
const BETA_CLIENT_NIGHT_RATE = 30000;
const BETA_TRANSPORT_TOTAL = 24000;
const BETA_EXPENSE_TOTAL = 3000;

/** Baseline attendance for Beta_Worker_01 at Beta_Project_01 in 2024-01 (day = 1.0d, ot in ×10 hours). */
const BETA_ATTENDANCE: { day: number; shift?: "day" | "night"; ot?: number }[] = [
  { day: 9 }, { day: 10 }, { day: 11 }, { day: 12 },
  { day: 15 }, { day: 16, ot: 40 }, { day: 17, ot: 10 }, { day: 18 }, { day: 19 },
  { day: 22 }, { day: 23 }, { day: 24 }, { day: 25 },
  { day: 29, shift: "night" }, { day: 30, shift: "night" },
];

const effectiveFrom = new Date(Date.UTC(2023, 0, 1, 0, 0, 0, 0));

async function findOrCreateBetaClient() {
  const clients = await db.getAllClients();
  const existing = (clients as any[]).find((c) => c.name === BETA_CLIENT_NAME);
  if (existing) return existing;
  return db.createClient({ name: BETA_CLIENT_NAME, notes: BETA_NOTE } as any);
}

async function findOrCreateBetaWorker() {
  const employees = await db.getAllEmployees();
  const existing = (employees as any[]).find((e) => e.nameKanji === BETA_WORKER_NAME);
  if (existing) return existing;
  return db.createEmployee({ nameKanji: BETA_WORKER_NAME, nameRomaji: "Beta Worker 01", notes: BETA_NOTE } as any);
}

async function findOrCreateBetaProject(clientId: number) {
  const projects = await db.getAllProjects();
  const existing = (projects as any[]).find((p) => p.name === BETA_PROJECT_NAME);
  if (existing) return existing;
  return db.createProject({ name: BETA_PROJECT_NAME, clientId, status: "active", notes: BETA_NOTE } as any);
}

export type BetaFixtureResult = {
  clientId: number;
  workerId: number;
  workerName: string;
  projectId: number;
  targetMonth: string;
  attendanceDays: number;
};

/**
 * Create or reset the fixed Beta fixture. Safe to run repeatedly.
 * Only operates on the Beta_* entities (found/created by name) and month 2024-01.
 */
export async function seedBetaFixture(): Promise<BetaFixtureResult> {
  const client = await findOrCreateBetaClient();
  const worker = await findOrCreateBetaWorker();
  const project = await findOrCreateBetaProject(Number(client.id));
  const workerId = Number(worker.id);
  const projectId = Number(project.id);

  // Rates: reset this project's worker rates for the Beta worker, then recreate day + night.
  const allRates = await db.getAllEmployeeRates();
  for (const rate of allRates as any[]) {
    if (Number(rate.projectId) === projectId && Number(rate.employeeId) === workerId) {
      await db.deleteEmployeeRate(Number(rate.id));
    }
  }
  await db.createEmployeeRate({
    scopeType: "project", projectId, employeeId: workerId, shiftType: "day",
    workerRate: BETA_DAY_RATE, clientRate: BETA_CLIENT_DAY_RATE, effectiveFrom, effectiveUntil: null, notes: BETA_NOTE,
  } as any);
  await db.createEmployeeRate({
    scopeType: "project", projectId, employeeId: workerId, shiftType: "night",
    workerRate: BETA_NIGHT_RATE, clientRate: BETA_CLIENT_NIGHT_RATE, effectiveFrom, effectiveUntil: null, notes: BETA_NOTE,
  } as any);

  // Attendance: upsert the baseline days for 2024-01 (idempotent via the emp+proj+date unique key).
  for (const record of BETA_ATTENDANCE) {
    const workDate = new Date(`${BETA_TEST_MONTH}-${String(record.day).padStart(2, "0")}T00:00:00.000Z`);
    await db.upsertAttendance({
      employeeId: workerId, projectId, workDate,
      hoursWorked: 80, overtimeHours: record.ot ?? 0, workType: "normal", shiftType: record.shift ?? "day",
    } as any);
  }

  // V1 closing + submission (submitted) so the worker-invoice V2 bridge can generate.
  let closing = await db.getProjectClosingByProjectMonth(projectId, BETA_TEST_MONTH);
  if (!closing) {
    closing = await db.createProjectClosing({ projectId, closingMonth: BETA_TEST_MONTH, status: "open" } as any) as any;
  }
  await db.upsertClosingSubmission({
    closingId: Number(closing!.id), employeeId: workerId, status: "submitted",
    transportAmount: BETA_TRANSPORT_TOTAL, expenseAmount: BETA_EXPENSE_TOTAL,
  } as any);

  return {
    clientId: Number(client.id),
    workerId,
    workerName: BETA_WORKER_NAME,
    projectId,
    targetMonth: BETA_TEST_MONTH,
    attendanceDays: BETA_ATTENDANCE.length,
  };
}
