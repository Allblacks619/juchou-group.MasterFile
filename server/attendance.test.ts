import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";

const mockDbState = vi.hoisted(() => ({
  records: [] as any[],
  nextId: 100,
  reset() {
    this.nextId = 100;
    this.records = [
    {
      id: 1,
      employeeId: 10,
      guestName: null,
      projectId: 1,
      workDate: new Date("2026-04-01"),
      hoursWorked: 80,
      overtimeHours: 0,
      workType: "normal",
      shiftType: "day",
      notes: null,
      enteredBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      employeeId: null,
      guestName: "田中太郎",
      projectId: 1,
      workDate: new Date("2026-04-01"),
      hoursWorked: 80,
      overtimeHours: 20,
      workType: "overtime",
      shiftType: "day",
      notes: null,
      enteredBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      employeeId: 10,
      guestName: null,
      projectId: 1,
      workDate: new Date("2026-04-02"),
      hoursWorked: 80,
      overtimeHours: 15, // 1.5h overtime (0.5 increment)
      workType: "normal",
      shiftType: "night",
      notes: null,
      enteredBy: 2,
      createdAt: new Date(),
      updatedAt: new Date("2026-04-02T10:00:00Z"),
    },
    ];
  },
}));

mockDbState.reset();

function sameDate(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

// Mock db module
vi.mock("./db", () => ({
  getAttendanceByDateRange: vi.fn(async (start: Date, end: Date, projectId?: number) =>
    mockDbState.records.filter((record) =>
      record.workDate >= start &&
      record.workDate <= end &&
      (!projectId || record.projectId === projectId)
    )
  ),
  getAttendanceByEmployee: vi.fn(async (employeeId: number, start?: Date, end?: Date) =>
    mockDbState.records.filter((record) =>
      record.employeeId === employeeId &&
      (!start || record.workDate >= start) &&
      (!end || record.workDate <= end)
    )
  ),
  getAttendanceByProject: vi.fn(async (projectId: number, start?: Date, end?: Date) =>
    mockDbState.records.filter((record) =>
      record.projectId === projectId &&
      (!start || record.workDate >= start) &&
      (!end || record.workDate <= end)
    )
  ),
  upsertAttendance: vi.fn(async (data: any) => {
    const existing = mockDbState.records.find((record) =>
      record.projectId === data.projectId &&
      record.employeeId === data.employeeId &&
      record.guestName === data.guestName &&
      sameDate(record.workDate, data.workDate)
    );
    if (existing) {
      Object.assign(existing, data, { updatedAt: new Date() });
      return existing;
    }
    const inserted = {
      id: mockDbState.nextId++,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDbState.records.push(inserted);
    return inserted;
  }),
  deleteAttendance: vi.fn().mockResolvedValue(undefined),
  deleteAttendanceByKey: vi.fn(async (data: any) => {
    mockDbState.records = mockDbState.records.filter((record) =>
      !(record.projectId === data.projectId &&
        record.employeeId === data.employeeId &&
        record.guestName === data.guestName &&
        sameDate(record.workDate, data.workDate))
    );
  }),
  getEmployeeByUserId: vi.fn(async (userId: number) => (
    userId === 2
      ? { id: 10, nameKanji: "テスト太郎", nameRomaji: "test-taro" }
      : userId === 3
        ? { id: 20, nameKanji: "佐藤花子", nameRomaji: "sato-hanako" }
        : userId === 4
          ? null
          : { id: 1, nameKanji: "管理者", nameRomaji: "admin" }
  )),
  getProjectsByEmployee: vi.fn(async (employeeId: number) => (
    employeeId === 10
      ? [{ id: 1, projectId: 1, employeeId: 10, isActive: true }]
      : [{ id: 2, projectId: 2, employeeId: 20, isActive: true }]
  )),
  getAllProjects: vi.fn().mockResolvedValue([
    { id: 1, name: "テスト現場", status: "active" },
    { id: 2, name: "別現場", status: "active" },
    { id: 3, name: "完了現場", status: "completed" },
    { id: 4, name: "テスト現場", status: "completed" },
  ]),
  getAllEmployees: vi.fn().mockResolvedValue([
    { id: 10, nameKanji: "テスト太郎", nameRomaji: "test-taro" },
    { id: 20, nameKanji: "佐藤花子", nameRomaji: "sato-hanako" },
  ]),
  getProjectMembers: vi.fn(async (projectId: number) => (
    projectId === 1
      ? [
        { id: 1, projectId: 1, employeeId: 10, isActive: true },
        { id: 2, projectId: 1, employeeId: 20, isActive: false },
      ]
      : []
  )),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    appRole: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as any;

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createManagerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 4,
    openId: "manager-user",
    email: "manager@example.com",
    name: "Manager User",
    loginMethod: "manus",
    role: "user",
    appRole: "manager",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as any;

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createWorkerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "worker-user",
    email: "worker@example.com",
    name: "Worker User",
    loginMethod: "manus",
    role: "user",
    appRole: "worker",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as any;

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  mockDbState.reset();
  vi.mocked(db.upsertAttendance).mockClear();
  vi.mocked(db.getAttendanceByDateRange).mockClear();
  vi.mocked(db.getAttendanceByProject).mockClear();
  vi.mocked(db.getProjectsByEmployee).mockClear();
  vi.mocked(db.getEmployeeByUserId).mockClear();
  vi.mocked(db.deleteAttendance).mockClear();
  vi.mocked(db.deleteAttendanceByKey).mockClear();
});

describe("attendance", () => {
  describe("attendance.myAttendance", () => {
    it("returns attendance records for the logged-in employee", async () => {
      const ctx = createWorkerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.myAttendance({
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it("filters by projectId when provided", async () => {
      const ctx = createWorkerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.myAttendance({
        startDate: "2026-04-01",
        endDate: "2026-04-30",
        projectId: 1,
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("attendance.myProjects", () => {
    it("returns active projects for the logged-in employee", async () => {
      const ctx = createWorkerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.myProjects();

      expect(Array.isArray(result)).toBe(true);
      for (const p of result) {
        expect(p.status).toBe("active");
      }
    });

    it("returns active projects for manager-like users without requiring an employee profile", async () => {
      const ctx = createManagerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.myProjects();

      expect(result.map((project) => project.id).sort()).toEqual([1, 2]);
      expect(db.getEmployeeByUserId).not.toHaveBeenCalled();
    });
  });


  describe("attendance.monthProjectOptions", () => {
    it("includes selected-month attendance projects for manager-like users even when the project is not active", async () => {
      mockDbState.records.push({
        id: 60,
        employeeId: 20,
        guestName: null,
        projectId: 4,
        workDate: new Date("2026-04-15"),
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
        notes: null,
        enteredBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const caller = appRouter.createCaller(createManagerContext());

      const result = await caller.attendance.monthProjectOptions({
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      expect(result.find((project: any) => project.id === 4)).toMatchObject({
        id: 4,
        name: "テスト現場",
        status: "completed",
        hasMonthlyAttendance: true,
        attendanceCount: 1,
        activeMemberCount: 0,
      });
      expect(db.getEmployeeByUserId).not.toHaveBeenCalled();
    });

    it("sorts duplicate project names so the selected-month attendance-backed project is preferred", async () => {
      vi.mocked(db.getAllProjects).mockResolvedValueOnce([
        { id: 5, name: "重複現場", status: "active" },
        { id: 6, name: "重複現場", status: "completed" },
      ] as any);
      vi.mocked(db.getProjectMembers).mockImplementationOnce(async (projectId: number) => (
        projectId === 5 ? [{ id: 50, projectId, employeeId: 10, isActive: true }] : []
      ) as any);
      mockDbState.records.push({
        id: 61,
        employeeId: 20,
        guestName: null,
        projectId: 6,
        workDate: new Date("2026-05-02"),
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
        notes: null,
        enteredBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const caller = appRouter.createCaller(createManagerContext());

      const result = await caller.attendance.monthProjectOptions({
        startDate: "2026-05-01",
        endDate: "2026-05-31",
      });

      expect(result.map((project: any) => project.id)).toEqual([6, 5]);
      expect(result[0]).toMatchObject({ hasMonthlyAttendance: true, attendanceCount: 1 });
      expect(result[1]).toMatchObject({ hasMonthlyAttendance: false, activeMemberCount: 1 });
    });
  });

  describe("attendance.lastProject", () => {
    it("returns the last project from most recent attendance", async () => {
      const ctx = createWorkerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.lastProject();

      // Should return a project (based on mock data, employee 10 has records for project 1)
      expect(result).toBeDefined();
      if (result) {
        expect(result.id).toBe(1);
        expect(result.name).toBe("テスト現場");
      }
    });

    it("returns the exact project id from attendance when duplicate project names exist", async () => {
      mockDbState.records.push({
        id: 53,
        employeeId: 10,
        guestName: null,
        projectId: 4,
        workDate: new Date("2026-05-01"),
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
        notes: null,
        enteredBy: 1,
        createdAt: new Date(),
        updatedAt: new Date("2026-05-01T10:00:00Z"),
      });
      const caller = appRouter.createCaller(createWorkerContext());

      const result = await caller.attendance.lastProject();

      expect(result).toMatchObject({ id: 4, name: "テスト現場" });
    });
  });

  describe("attendance.projectTeamData", () => {
    it("returns members and records for a project", async () => {
      const ctx = createWorkerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.projectTeamData({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.members)).toBe(true);
      expect(Array.isArray(result.records)).toBe(true);
      // Should include employee member and guest member
      const empMember = result.members.find(m => m.type === "employee");
      const guestMember = result.members.find(m => m.type === "guest");
      expect(empMember).toBeDefined();
      expect(guestMember).toBeDefined();
      expect(guestMember?.nameKanji).toBe("田中太郎");
    });

    it("keeps inactive project members visible when they have attendance records", async () => {
      mockDbState.records.push({
        id: 50,
        employeeId: 20,
        guestName: null,
        projectId: 1,
        workDate: new Date("2026-04-03"),
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
        notes: null,
        enteredBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const caller = appRouter.createCaller(createAdminContext());
      const result = await caller.attendance.projectTeamData({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      const list = await caller.attendance.list({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      expect(result.members.find((m) => m.type === "employee" && m.id === 20)).toBeDefined();
      expect(result.records.find((record) => record.employeeId === 20)).toBeDefined();
      expect(list.find((record) => record.employeeId === 20)).toBeDefined();
      expect(db.deleteAttendance).not.toHaveBeenCalled();
      expect(db.deleteAttendanceByKey).not.toHaveBeenCalled();
    });

    it("does not hide historical guest attendance after a guest removal marker exists", async () => {
      mockDbState.records.push({
        id: 51,
        employeeId: null,
        guestName: "__attendance_removed_guest__:marker",
        projectId: 1,
        workDate: new Date("1900-01-01"),
        hoursWorked: 0,
        overtimeHours: 0,
        workType: "absence",
        shiftType: "day",
        notes: "attendance_removed_guest:田中太郎",
        enteredBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const caller = appRouter.createCaller(createAdminContext());
      const list = await caller.attendance.list({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });
      const teamData = await caller.attendance.projectTeamData({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      expect(list.find((record) => record.guestName === "田中太郎")).toBeDefined();
      expect(list.some((record) => String(record.guestName || "").startsWith("__attendance_removed_guest__:"))).toBe(false);
      expect(teamData.members.find((m) => m.type === "guest" && m.nameKanji === "田中太郎")).toBeDefined();
      expect(teamData.records.find((record) => record.guestName === "田中太郎")).toBeDefined();
    });

    it("returns the same historical attendance identities through list and projectTeamData", async () => {
      mockDbState.records.push({
        id: 52,
        employeeId: 20,
        guestName: null,
        projectId: 1,
        workDate: new Date("2026-04-04"),
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
        notes: null,
        enteredBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const caller = appRouter.createCaller(createAdminContext());
      const list = await caller.attendance.list({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });
      const teamData = await caller.attendance.projectTeamData({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });

      const listIdentities = new Set(list.map((record) => record.employeeId ? `emp-${record.employeeId}` : `guest-${record.guestName}`));
      const teamIdentities = new Set(teamData.records.map((record) => record.employeeId ? `emp-${record.employeeId}` : `guest-${record.guestName}`));
      expect(teamIdentities).toEqual(listIdentities);
      expect(teamData.members).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "employee", id: 20 }),
        expect.objectContaining({ type: "guest", nameKanji: "田中太郎" }),
      ]));
    });
  });

  describe("attendance.myEmployeeInfo", () => {
    it("returns employee info for the logged-in user", async () => {
      const ctx = createWorkerContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.myEmployeeInfo();

      expect(result).toBeDefined();
      if (result) {
        expect(result.id).toBe(10);
        expect(result.nameKanji).toBe("テスト太郎");
      }
    });
  });

  describe("attendance.upsert", () => {
    it("creates an attendance record with employee ID", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.upsert({
        employeeId: 10,
        projectId: 1,
        workDate: "2026-04-02",
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
      });

      expect(result).toBeDefined();
      expect(result.projectId).toBe(1);
    });

    it("creates an attendance record with guest name", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.upsert({
        guestName: "ゲスト太郎",
        projectId: 1,
        workDate: "2026-04-02",
        hoursWorked: 80,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
      });

      expect(result).toBeDefined();
    });

    it("supports night shift type", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.upsert({
        employeeId: 10,
        projectId: 1,
        workDate: "2026-04-02",
        hoursWorked: 80,
        overtimeHours: 20,
        workType: "overtime",
        shiftType: "night",
      });

      expect(result).toBeDefined();
    });

    it("supports 0.5 increment overtime (e.g. 1.5h = 15)", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.upsert({
        employeeId: 10,
        projectId: 1,
        workDate: "2026-04-03",
        hoursWorked: 80,
        overtimeHours: 15, // 1.5 hours
        workType: "normal",
        shiftType: "day",
      });

      expect(result).toBeDefined();
      expect(result.overtimeHours).toBe(15);
    });

    it("supports up to 12h overtime (120)", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.upsert({
        employeeId: 10,
        projectId: 1,
        workDate: "2026-04-04",
        hoursWorked: 80,
        overtimeHours: 120, // 12 hours
        workType: "normal",
        shiftType: "day",
      });

      expect(result).toBeDefined();
      expect(result.overtimeHours).toBe(120);
    });
  });


  describe("attendance.myBatchUpsert consistency", () => {
    it("lets a worker save their own project attendance and admin list/projectTeamData read the same updated record", async () => {
      const workerCaller = appRouter.createCaller(createWorkerContext());
      const adminCaller = appRouter.createCaller(createAdminContext());

      await workerCaller.attendance.myBatchUpsert({
        records: [{
          projectId: 1,
          workDate: "2026-04-15",
          hoursWorked: 80,
          overtimeHours: 10,
          workType: "normal",
          shiftType: "day",
          notes: "worker save",
        }],
      });

      await workerCaller.attendance.myBatchUpsert({
        records: [{
          projectId: 1,
          workDate: "2026-04-15",
          hoursWorked: 40,
          overtimeHours: 0,
          workType: "half_day",
          shiftType: "day",
          notes: "worker update",
        }],
      });

      const adminList = await adminCaller.attendance.list({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });
      const saved = adminList.find((record) => record.employeeId === 10 && record.projectId === 1 && new Date(record.workDate).toISOString().startsWith("2026-04-15"));
      expect(saved).toMatchObject({
        hoursWorked: 40,
        overtimeHours: 0,
        workType: "half_day",
        notes: "worker update",
      });

      const teamData = await adminCaller.attendance.projectTeamData({
        projectId: 1,
        startDate: "2026-04-01",
        endDate: "2026-04-30",
      });
      expect(teamData.records).toEqual(expect.arrayContaining([expect.objectContaining({
        employeeId: 10,
        projectId: 1,
        hoursWorked: 40,
        workType: "half_day",
      })]));
    });

    it("rejects worker saves for projects where they are not a member", async () => {
      const workerCaller = appRouter.createCaller(createWorkerContext());

      await expect(workerCaller.attendance.myBatchUpsert({
        records: [{
          projectId: 2,
          workDate: "2026-04-15",
          hoursWorked: 80,
          overtimeHours: 0,
          workType: "normal",
          shiftType: "day",
        }],
      })).rejects.toThrow("この現場のメンバーではありません");
    });

    it("uses month date filters so the worker-saved record appears only in the expected month", async () => {
      const workerCaller = appRouter.createCaller(createWorkerContext());
      const adminCaller = appRouter.createCaller(createAdminContext());

      await workerCaller.attendance.myBatchUpsert({
        records: [{
          projectId: 1,
          workDate: "2026-05-01",
          hoursWorked: 80,
          overtimeHours: 0,
          workType: "normal",
          shiftType: "day",
        }],
      });

      const april = await adminCaller.attendance.list({ projectId: 1, startDate: "2026-04-01", endDate: "2026-04-30" });
      const may = await adminCaller.attendance.list({ projectId: 1, startDate: "2026-05-01", endDate: "2026-05-31" });

      expect(april.some((record) => record.employeeId === 10 && new Date(record.workDate).toISOString().startsWith("2026-05-01"))).toBe(false);
      expect(may.some((record) => record.employeeId === 10 && new Date(record.workDate).toISOString().startsWith("2026-05-01"))).toBe(true);
    });
  });

  describe("attendance.batchUpsert", () => {
    it("saves multiple records at once", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.attendance.batchUpsert({
        records: [
          {
            employeeId: 10,
            projectId: 1,
            workDate: "2026-04-01",
            hoursWorked: 80,
            overtimeHours: 0,
            workType: "normal",
            shiftType: "day",
          },
          {
            guestName: "ゲスト太郎",
            projectId: 1,
            workDate: "2026-04-01",
            hoursWorked: 80,
            overtimeHours: 20,
            workType: "overtime",
            shiftType: "day",
          },
        ],
      });

      expect(result.count).toBe(2);
    });
  });
});
