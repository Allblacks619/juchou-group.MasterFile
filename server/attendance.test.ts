import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock db module
vi.mock("./db", () => {
  const mockRecords = [
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

  return {
    getAttendanceByDateRange: vi.fn().mockResolvedValue(mockRecords),
    getAttendanceByEmployee: vi.fn().mockResolvedValue([mockRecords[0], mockRecords[2]]),
    getAttendanceByProject: vi.fn().mockResolvedValue(mockRecords),
    upsertAttendance: vi.fn().mockImplementation(async (data: any) => ({
      id: 99,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    deleteAttendance: vi.fn().mockResolvedValue(undefined),
    getEmployeeByUserId: vi.fn().mockResolvedValue({ id: 10, nameKanji: "テスト太郎", nameRomaji: "test-taro" }),
    getAllProjects: vi.fn().mockResolvedValue([
      { id: 1, name: "テスト現場", status: "active" },
      { id: 2, name: "完了現場", status: "completed" },
    ]),
    getAllEmployees: vi.fn().mockResolvedValue([
      { id: 10, nameKanji: "テスト太郎", nameRomaji: "test-taro" },
      { id: 20, nameKanji: "佐藤花子", nameRomaji: "sato-hanako" },
    ]),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

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
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

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
      const ctx = createWorkerContext();
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
      const ctx = createWorkerContext();
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
      const ctx = createWorkerContext();
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
      const ctx = createWorkerContext();
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
      const ctx = createWorkerContext();
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

  describe("attendance.batchUpsert", () => {
    it("saves multiple records at once", async () => {
      const ctx = createWorkerContext();
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
