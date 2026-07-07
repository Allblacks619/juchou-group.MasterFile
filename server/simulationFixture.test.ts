import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clients: [] as any[],
  employees: [] as any[],
  projects: [] as any[],
  rates: [] as any[],
  closing: undefined as any,
  projSeq: 300,
  empSeq: 200,
}));

const calls = vi.hoisted(() => ({
  createClient: vi.fn(async (d: any) => ({ id: 100, ...d })),
  createEmployee: vi.fn(async (d: any) => ({ id: ++state.empSeq, ...d })),
  createProject: vi.fn(async (d: any) => ({ id: ++state.projSeq, ...d })),
  updateEmployee: vi.fn(async (_id: number, _d: any) => ({})),
  deleteEmployeeRate: vi.fn(async (_id: number) => {}),
  createEmployeeRate: vi.fn(async (_d: any) => ({ id: 1 })),
  upsertAttendance: vi.fn(async (_d: any) => ({ id: 1 })),
  createProjectClosing: vi.fn(async (d: any) => ({ id: 401, ...d })),
  upsertClosingSubmission: vi.fn(async (d: any) => ({ id: 1, ...d })),
  addProjectMember: vi.fn(async (d: any) => ({ id: 1, ...d })),
  upsertMonthlyClosingV2ProjectReview: vi.fn(async (d: any) => ({ id: 1, ...d })),
  upsertMonthlyClosingV2ParticipantReview: vi.fn(async (d: any) => ({ id: 1, ...d })),
  upsertMonthlyClosingV2TransportationExpense: vi.fn(async (d: any) => ({ id: 1, ...d })),
}));

vi.mock("./db", () => ({
  getAllClients: vi.fn(async () => state.clients),
  getAllEmployees: vi.fn(async () => state.employees),
  getAllProjects: vi.fn(async () => state.projects),
  getAllEmployeeRates: vi.fn(async () => state.rates),
  getProjectClosingByProjectMonth: vi.fn(async () => state.closing),
  ...calls,
}));

import { seedSimulationFixture, SIM_MONTH } from "./simulationFixture";

describe("seedSimulationFixture", () => {
  beforeEach(() => {
    state.clients = []; state.employees = []; state.projects = []; state.rates = []; state.closing = undefined;
    state.projSeq = 300; state.empSeq = 200;
    Object.values(calls).forEach((fn) => fn.mockClear());
  });

  it("取引先1・現場3・作業員2を新規作成し、2025-01のデータ一式を投入する", async () => {
    const result = await seedSimulationFixture();

    expect(SIM_MONTH).toBe("2025-01");
    expect(calls.createClient).toHaveBeenCalledTimes(1);
    expect(calls.createProject).toHaveBeenCalledTimes(3);
    expect(calls.createEmployee).toHaveBeenCalledTimes(2);
    expect(result.projects).toHaveLength(3);
    expect(result.workers).toHaveLength(2);

    // 単価は5パターン（W1:P1 day/night, W1:P3 day, W2:P1 day, W2:P2 day）
    expect(calls.createEmployeeRate).toHaveBeenCalledTimes(5);
    // 各レートに workerRate と clientRate が入っている
    for (const c of calls.createEmployeeRate.mock.calls) {
      expect(c[0].workerRate).toBeGreaterThan(0);
      expect(c[0].clientRate).toBeGreaterThan(0);
    }

    // 出面は W1:13 + W2:12 = 25件、すべて 2025-01
    expect(calls.upsertAttendance).toHaveBeenCalledTimes(25);
    for (const c of calls.upsertAttendance.mock.calls) {
      expect((c[0].workDate as Date).toISOString().startsWith("2025-01-")).toBe(true);
    }
    expect(result.attendanceRecords).toBe(25);

    // 現場3つとも 締め完了 レビュー
    expect(calls.upsertMonthlyClosingV2ProjectReview).toHaveBeenCalledTimes(3);
    for (const c of calls.upsertMonthlyClosingV2ProjectReview.mock.calls) {
      expect(c[0].status).toBe("締め完了");
      expect(c[0].targetMonth).toBe("2025-01");
    }
  });

  it("インボイス設定を反映する（W1=対応/番号あり、W2=未対応/番号なし）", async () => {
    await seedSimulationFixture();
    const issuerFlags = calls.updateEmployee.mock.calls.map((c) => c[1].isInvoiceIssuer).sort();
    expect(issuerFlags).toEqual([false, true]);
    const withNumber = calls.updateEmployee.mock.calls.find((c) => c[1].isInvoiceIssuer);
    expect(withNumber?.[1].invoiceIssuerNumber).toBe("T6810341010660");
    const withoutNumber = calls.updateEmployee.mock.calls.find((c) => !c[1].isInvoiceIssuer);
    expect(withoutNumber?.[1].invoiceIssuerNumber).toBeNull();
  });

  it("客先請求交通費（clientBillable）とV1締め提出を作業員×現場ごとに投入する", async () => {
    await seedSimulationFixture();
    // 参加者レビュー = 稼働(作業員×現場)の数 = W1(P1,P3) + W2(P1,P2) = 4
    expect(calls.upsertMonthlyClosingV2ParticipantReview).toHaveBeenCalledTimes(4);
    expect(calls.upsertClosingSubmission).toHaveBeenCalledTimes(4);
    expect(calls.upsertMonthlyClosingV2TransportationExpense).toHaveBeenCalledTimes(4);
    for (const c of calls.upsertMonthlyClosingV2TransportationExpense.mock.calls) {
      expect(c[0].clientBillable).toBe(true);
      expect(c[0].payerType).toBe("worker_paid");
    }
  });
});
