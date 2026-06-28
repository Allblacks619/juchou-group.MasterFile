import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clients: [] as any[],
  employees: [] as any[],
  projects: [] as any[],
  rates: [] as any[],
  closing: undefined as any,
}));

const calls = vi.hoisted(() => ({
  createClient: vi.fn(async (d: any) => ({ id: 101, ...d })),
  createEmployee: vi.fn(async (d: any) => ({ id: 201, ...d })),
  createProject: vi.fn(async (d: any) => ({ id: 301, ...d })),
  deleteEmployeeRate: vi.fn(async (_id: number) => {}),
  createEmployeeRate: vi.fn(async (_d: any) => ({ id: 1 })),
  upsertAttendance: vi.fn(async (_d: any) => ({ id: 1 })),
  createProjectClosing: vi.fn(async (d: any) => ({ id: 401, ...d })),
  upsertClosingSubmission: vi.fn(async (d: any) => ({ id: 1, ...d })),
}));

vi.mock("./db", () => ({
  getAllClients: vi.fn(async () => state.clients),
  getAllEmployees: vi.fn(async () => state.employees),
  getAllProjects: vi.fn(async () => state.projects),
  getAllEmployeeRates: vi.fn(async () => state.rates),
  getProjectClosingByProjectMonth: vi.fn(async () => state.closing),
  ...calls,
}));

import { seedBetaFixture, BETA_TEST_MONTH, BETA_WORKER_NAME } from "./betaFixture";

describe("seedBetaFixture", () => {
  beforeEach(() => {
    state.clients = []; state.employees = []; state.projects = []; state.rates = []; state.closing = undefined;
    Object.values(calls).forEach((fn) => fn.mockClear());
  });

  it("作成: Betaのclient/worker/projectを名前付きで新規作成し、2024-01のデータを投入する", async () => {
    const result = await seedBetaFixture();

    expect(calls.createClient).toHaveBeenCalledWith(expect.objectContaining({ name: "Beta_Client_01" }));
    expect(calls.createEmployee).toHaveBeenCalledWith(expect.objectContaining({ nameKanji: BETA_WORKER_NAME }));
    expect(calls.createProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Beta_Project_01", clientId: 101 }));

    // day + night rates
    expect(calls.createEmployeeRate).toHaveBeenCalledTimes(2);
    const shifts = calls.createEmployeeRate.mock.calls.map((c) => c[0].shiftType).sort();
    expect(shifts).toEqual(["day", "night"]);

    // 15 baseline attendance days, all in 2024-01
    expect(calls.upsertAttendance).toHaveBeenCalledTimes(15);
    for (const c of calls.upsertAttendance.mock.calls) {
      expect((c[0].workDate as Date).toISOString().startsWith("2024-01-")).toBe(true);
    }

    // closing + submitted submission with transport/expense
    expect(calls.createProjectClosing).toHaveBeenCalledWith(expect.objectContaining({ closingMonth: "2024-01" }));
    expect(calls.upsertClosingSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ status: "submitted", transportAmount: 24000, expenseAmount: 3000 })
    );

    expect(result).toMatchObject({ targetMonth: BETA_TEST_MONTH, attendanceDays: 15, projectId: 301, workerId: 201 });
  });

  it("冪等: 既存のBetaエンティティは再利用し、重複プロフィールを作らない", async () => {
    state.clients = [{ id: 11, name: "Beta_Client_01" }];
    state.employees = [{ id: 22, nameKanji: BETA_WORKER_NAME }];
    state.projects = [{ id: 33, name: "Beta_Project_01" }];
    state.rates = [{ id: 99, projectId: 33, employeeId: 22, shiftType: "day", workerRate: 18000 }];
    state.closing = { id: 44, projectId: 33, closingMonth: "2024-01" };

    const result = await seedBetaFixture();

    expect(calls.createClient).not.toHaveBeenCalled();
    expect(calls.createEmployee).not.toHaveBeenCalled();
    expect(calls.createProject).not.toHaveBeenCalled();
    // existing project+worker rate is reset before recreating
    expect(calls.deleteEmployeeRate).toHaveBeenCalledWith(99);
    expect(calls.createProjectClosing).not.toHaveBeenCalled();
    expect(calls.upsertClosingSubmission).toHaveBeenCalledWith(expect.objectContaining({ closingId: 44, status: "submitted" }));
    expect(result).toMatchObject({ projectId: 33, workerId: 22 });
  });

  it("本番データを消さない: deleteは対象プロジェクト×Beta作業員の単価のみ", async () => {
    state.projects = [{ id: 33, name: "Beta_Project_01" }];
    state.clients = [{ id: 11, name: "Beta_Client_01" }];
    state.employees = [{ id: 22, nameKanji: BETA_WORKER_NAME }];
    state.rates = [
      { id: 99, projectId: 33, employeeId: 22, shiftType: "day" },   // Beta — should be deleted
      { id: 100, projectId: 999, employeeId: 888, shiftType: "day" }, // production — must NOT be deleted
    ];
    await seedBetaFixture();
    expect(calls.deleteEmployeeRate).toHaveBeenCalledTimes(1);
    expect(calls.deleteEmployeeRate).toHaveBeenCalledWith(99);
  });
});
