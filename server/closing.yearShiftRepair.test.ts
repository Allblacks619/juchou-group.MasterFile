import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const { projects, closingsByKey, attendanceRecords, submissionsByClosingId } = vi.hoisted(() => {
  const projects = [
    { id: 1, name: "いすゞ藤沢新築工場", clientId: 10, status: "active" },
    { id: 2, name: "正常な現場", clientId: 10, status: "active" },
  ];
  const closingsByKey = new Map<string, any>();
  const attendanceRecords: any[] = [];
  const submissionsByClosingId = new Map<number, any[]>();
  return { projects, closingsByKey, attendanceRecords, submissionsByClosingId };
});

vi.mock("./db", () => ({
  getAllProjects: vi.fn(async () => projects),
  getProjectClosingByProjectMonth: vi.fn(async (projectId: number, closingMonth: string) =>
    closingsByKey.get(`${projectId}:${closingMonth}`) || null
  ),
  getAttendanceByProject: vi.fn(async (projectId: number, start?: Date, end?: Date) =>
    attendanceRecords.filter((record) =>
      record.projectId === projectId &&
      (!start || record.workDate >= start) &&
      (!end || record.workDate <= end)
    )
  ),
  getClosingSubmissionsByClosing: vi.fn(async (closingId: number) =>
    submissionsByClosingId.get(closingId) || []
  ),
  updateProjectClosing: vi.fn(async (id: number, patch: any) => {
    const entry = Array.from(closingsByKey.entries()).find(([, closing]) => closing.id === id);
    if (!entry) return null;
    const [oldKey, closing] = entry;
    closingsByKey.delete(oldKey);
    const updated = { ...closing, ...patch };
    closingsByKey.set(`${updated.projectId}:${updated.closingMonth}`, updated);
    return updated;
  }),
  createAuditLog: vi.fn(async () => ({ id: 1 })),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "super-admin-1",
    email: "super@example.com",
    name: "Super Admin",
    loginMethod: "manus",
    role: "admin",
    appRole: "super_admin",
    loginId: "super",
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

function seedYearShiftCandidate() {
  closingsByKey.set("1:2025-04", { id: 101, projectId: 1, closingMonth: "2025-04", status: "open" });
  submissionsByClosingId.set(101, [
    { id: 1001, closingId: 101, employeeId: 201, status: "submitted" },
    { id: 1002, closingId: 101, employeeId: 202, status: "pending" },
  ]);
  attendanceRecords.push(
    { id: 2001, projectId: 1, employeeId: 201, workDate: new Date("2026-04-10T00:00:00.000Z") },
    { id: 2002, projectId: 1, employeeId: 202, workDate: new Date("2026-04-11T00:00:00.000Z") }
  );
}

describe("closing year-shift diagnostic and repair", () => {
  beforeEach(() => {
    closingsByKey.clear();
    attendanceRecords.splice(0, attendanceRecords.length);
    submissionsByClosingId.clear();
    vi.clearAllMocks();
  });

  it("identifies a 2025-04 closing with 2026-04 attendance and no 2026-04 closing as a year-shift candidate", async () => {
    seedYearShiftCandidate();
    const caller = appRouter.createCaller(createCtx(createUser()));

    const rows = await caller.closing.diagnoseYearShift();

    expect(rows).toContainEqual(expect.objectContaining({
      projectId: 1,
      projectName: "いすゞ藤沢新築工場",
      closingMonth: "2025-04",
      closingExists: true,
      closingId: 101,
      closingStatus: "open",
      attendanceCount: 0,
      closingSubmissionsCount: 2,
      isYearShiftCandidate: true,
    }));
    expect(rows).toContainEqual(expect.objectContaining({
      projectId: 1,
      closingMonth: "2026-04",
      closingExists: false,
      attendanceCount: 2,
      isYearShiftCandidate: false,
    }));
  });

  it("updates only project_closings.closingMonth, preserves closingId and submissions, and leaves attendance untouched", async () => {
    seedYearShiftCandidate();
    const beforeAttendance = attendanceRecords.map((record) => ({ ...record }));
    const beforeSubmissions = [...(submissionsByClosingId.get(101) || [])];
    const caller = appRouter.createCaller(createCtx(createUser()));

    const result = await caller.closing.repairYearShift({ projectId: 1, fromMonth: "2025-04", toMonth: "2026-04" });

    expect(result).toMatchObject({ success: true, projectId: 1, closingId: 101, fromMonth: "2025-04", toMonth: "2026-04" });
    expect(closingsByKey.get("1:2025-04")).toBeUndefined();
    expect(closingsByKey.get("1:2026-04")).toMatchObject({ id: 101, projectId: 1, closingMonth: "2026-04", status: "open" });
    expect(db.updateProjectClosing).toHaveBeenCalledTimes(1);
    expect(db.updateProjectClosing).toHaveBeenCalledWith(101, { closingMonth: "2026-04" });
    expect(submissionsByClosingId.get(101)).toEqual(beforeSubmissions);
    expect(attendanceRecords).toEqual(beforeAttendance);
  });

  it("refuses repair when a 2026-04 closing row already exists", async () => {
    seedYearShiftCandidate();
    closingsByKey.set("1:2026-04", { id: 202, projectId: 1, closingMonth: "2026-04", status: "open" });
    const caller = appRouter.createCaller(createCtx(createUser()));

    await expect(caller.closing.repairYearShift({ projectId: 1, fromMonth: "2025-04", toMonth: "2026-04" }))
      .rejects.toThrow("2026-04 の締め行が既に存在するため修復できません");
    expect(db.updateProjectClosing).not.toHaveBeenCalled();
  });

  it("refuses repair when 2026-04 attendance does not exist", async () => {
    seedYearShiftCandidate();
    attendanceRecords.splice(0, attendanceRecords.length);
    const caller = appRouter.createCaller(createCtx(createUser()));

    await expect(caller.closing.repairYearShift({ projectId: 1, fromMonth: "2025-04", toMonth: "2026-04" }))
      .rejects.toThrow("2026-04 の出面が存在しないため修復できません");
    expect(db.updateProjectClosing).not.toHaveBeenCalled();
  });

  it("refuses repair for non-super_admin", async () => {
    seedYearShiftCandidate();
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" as any })));

    await expect(caller.closing.repairYearShift({ projectId: 1, fromMonth: "2025-04", toMonth: "2026-04" }))
      .rejects.toThrow("統括管理者権限が必要です");
    expect(db.updateProjectClosing).not.toHaveBeenCalled();
  });
});
