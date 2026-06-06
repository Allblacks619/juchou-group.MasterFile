import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const fixture = vi.hoisted(() => ({
  employees: [
    { id: 100, nameKanji: "大木テリキ", nameRomaji: "Teriki" },
    { id: 101, nameKanji: "大木充", nameRomaji: "Mitsuru" },
    { id: 102, nameKanji: "大木早苗", nameRomaji: "Sanae" },
  ],
  clients: [
    { id: 10, name: "長山建設" },
  ],
  projects: [
    { id: 1, name: "長山 新築マンション", clientId: 10 },
    { id: 2, name: "SHIRAHAMA", clientId: null },
  ],
  attendance: [
    { id: 1, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-01") },
    { id: 2, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-02") },
    { id: 3, projectId: 1, employeeId: 101, guestName: null, workDate: new Date("2026-05-03") },
    { id: 4, projectId: 1, employeeId: 102, guestName: null, workDate: new Date("2026-05-04") },
    { id: 5, projectId: 1, employeeId: null, guestName: "応援ゲスト", workDate: new Date("2026-05-05") },
    { id: 6, projectId: 2, employeeId: 100, guestName: null, workDate: new Date("2026-05-06") },
    { id: 7, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-04-30") },
  ],
  submissions: [
    { workerId: 100, targetMonth: "2026-05", status: "accepted", sendBackReason: null },
    { workerId: 102, targetMonth: "2026-05", status: "sent_back", sendBackReason: "出面を確認してください" },
  ],
}));

vi.mock("./db", () => ({
  getAttendanceByDateRange: vi.fn(async (start: Date, end: Date) =>
    fixture.attendance.filter((record) => record.workDate >= start && record.workDate <= end)
  ),
  getAllEmployees: vi.fn(async () => fixture.employees),
  getAllProjects: vi.fn(async () => fixture.projects),
  getAllClients: vi.fn(async () => fixture.clients),
  getMonthlyClosingV2WorkerSubmissionsByMonth: vi.fn(async (targetMonth: string) =>
    fixture.submissions.filter((submission) => submission.targetMonth === targetMonth)
  ),
}));

import { appRouter } from "./routers";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "admin-1",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    appRole: "manager",
    loginId: "admin",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as User;
}

function createCtx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("monthlyClosingV2.dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a project/site-first dashboard with participants nested under each project", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });

    expect(result.rows.map((row) => row.projectName)).toEqual(["長山 新築マンション", "SHIRAHAMA"]);
    expect(result.rows[0]).toMatchObject({
      targetMonth: "2026-05",
      clientName: "長山建設",
      projectName: "長山 新築マンション",
      participantCount: 3,
      attendanceCount: 5,
      closingStatus: "差し戻しあり",
      warningCount: 2,
    });
    expect(result.rows[0].participants.map((participant: any) => participant.workerName)).toEqual([
      "大木テリキ",
      "大木充",
      "大木早苗",
      "応援ゲスト",
    ]);
  });

  it("displays guest attendance as excluded from aggregation and warnings", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });
    const guest = result.rows[0].participants.find((participant: any) => participant.isGuest);

    expect(guest).toMatchObject({
      category: "ゲスト / 集計対象外",
      isAggregationExcluded: true,
      transportationStatus: "集計対象外",
      invoiceInfoStatus: "集計対象外",
      missingInfo: "ゲストのため集計対象外",
      warningCount: 0,
    });
    expect(result.rows[0].participantCount).toBe(3);
    expect(result.rows[0].warningCount).toBe(2);
  });
});
