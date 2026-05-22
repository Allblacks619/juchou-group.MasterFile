import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const fixture = vi.hoisted(() => {
  const employees = [
    { id: 100, userId: 10, nameKanji: "作業員A", nameRomaji: "A" },
    { id: 101, userId: 11, nameKanji: "作業員B", nameRomaji: "B" },
    { id: 102, userId: null, nameKanji: "退職者", nameRomaji: "Retired" },
  ];
  const projects = [
    { id: 1, name: "案件1", clientId: 1 },
    { id: 2, name: "案件2", clientId: 1 },
  ];
  const attendance = [
    { id: 1, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-01"), hoursWorked: 80, overtimeHours: 20 },
    { id: 2, projectId: 2, employeeId: 100, guestName: null, workDate: new Date("2026-05-02"), hoursWorked: 70, overtimeHours: 10 },
    { id: 3, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2025-05-01"), hoursWorked: 99, overtimeHours: 99 },
    { id: 4, projectId: 1, employeeId: null, guestName: "ゲスト", workDate: new Date("2026-05-03"), hoursWorked: 80, overtimeHours: 0 },
    { id: 5, projectId: 1, employeeId: 102, guestName: null, workDate: new Date("2026-05-04"), hoursWorked: 80, overtimeHours: 0 },
  ];
  return { employees, projects, attendance };
});

vi.mock("./db", () => ({
  getEmployeeByUserId: vi.fn(async (userId: number) => fixture.employees.find((e) => e.userId === userId) || null),
  getEmployeeById: vi.fn(async (id: number) => fixture.employees.find((e) => e.id === id) || null),
  getAttendanceByDateRange: vi.fn(async (start: Date, end: Date) => fixture.attendance.filter((r) => r.workDate >= start && r.workDate <= end)),
  getAllProjects: vi.fn(async () => fixture.projects),
  getProjectClosingByProjectMonth: vi.fn(async () => null),
  getClosingSubmissionByClosingEmployee: vi.fn(async () => null),
}));

import { appRouter } from "./routers";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 99, openId: "o", email: "e", name: "n", loginMethod: "manus", role: "user", appRole: "worker", loginId: "l", mustChangePassword: false, employeeId: null,
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...overrides,
  } as User;
}
const ctx = (user: User): TrpcContext => ({ user, req: {} as any, res: {} as any });

describe("closing.workerMonthlyOverview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("worker with attendance in selected month is target and multi-project lines", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 10, appRole: "worker" as any })));
    const res = await caller.closing.workerMonthlyOverview({ closingMonth: "2026-05" });
    expect(res.isTarget).toBe(true);
    expect(res.projectLines).toHaveLength(2);
    expect(res.projectLines.map((v: any) => v.projectId).sort()).toEqual([1, 2]);
  });

  it("worker with no attendance is not target", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 11, appRole: "worker" as any })));
    const res = await caller.closing.workerMonthlyOverview({ closingMonth: "2026-05" });
    expect(res.isTarget).toBe(false);
  });

  it("does not mix 2025 and 2026", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 10, appRole: "worker" as any })));
    const res = await caller.closing.workerMonthlyOverview({ closingMonth: "2025-05" });
    expect(res.projectLines).toHaveLength(1);
    expect(res.projectLines[0].totalHours).toBe(9.9);
  });

  it("guest attendance does not create target", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 11, appRole: "worker" as any })));
    const res = await caller.closing.workerMonthlyOverview({ closingMonth: "2026-05", projectId: 1 });
    expect(res.isTarget).toBe(false);
  });

  it("manager delegated request without employeeId returns clear error", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 1, appRole: "manager" as any })));
    await expect(caller.closing.workerMonthlyOverview({ closingMonth: "2026-05" })).rejects.toThrow("target employee required for delegated monthly closing");
  });

  it("worker cannot request another worker overview", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 10, appRole: "worker" as any })));
    await expect(caller.closing.workerMonthlyOverview({ closingMonth: "2026-05", employeeId: 101 })).rejects.toThrow();
  });

  it("inactive removed employee with historical attendance can still be target", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ id: 1, appRole: "manager" as any })));
    const res = await caller.closing.workerMonthlyOverview({ closingMonth: "2026-05", employeeId: 102 });
    expect(res.isTarget).toBe(true);
    expect(res.employeeId).toBe(102);
  });
});
