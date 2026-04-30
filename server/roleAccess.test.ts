import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockDb = vi.hoisted(() => ({
  getDb: vi.fn(),
  getEmployeeById: vi.fn(),
  deleteEmployee: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<any>("./db");
  return { ...actual, ...mockDb };
});

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-open-id",
    email: "u@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    appRole: "worker" as any,
    loginId: "u1",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as User;
}

function ctx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("role access controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guest cannot edit/submit closing", async () => {
    const guest = createUser({ appRole: "guest" as any });
    const caller = appRouter.createCaller(ctx(guest));
    await expect(caller.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 1, expenseAmount: 0, notes: "x" })).rejects.toThrow("ゲスト権限では編集できません");
    await expect(caller.closing.submitMySubmission({ projectId: 1, closingMonth: "2026-04" })).rejects.toThrow("ゲスト権限では提出できません");
    await expect(caller.closing.uploadMyReceipt({ projectId: 1, closingMonth: "2026-04", base64: "Zg==", mimeType: "text/plain", fileName: "r.txt" })).rejects.toThrow("ゲスト権限では領収書をアップロードできません");
  });

  it("manager and admin cannot perform super_admin operations", async () => {
    const managerCaller = appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
    await expect(managerCaller.superAdmin.bulkChangeRoles({ userIds: [2], appRole: "worker" })).rejects.toThrow();

    const adminCaller = appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
    await expect(adminCaller.superAdmin.bulkDeleteEmployees({ employeeIds: [10], confirmText: "DELETE" })).rejects.toThrow();
  });

  it("guest cannot access leader/admin procedures", async () => {
    const guestCaller = appRouter.createCaller(ctx(createUser({ appRole: "guest" as any })));
    await expect(guestCaller.invitation.list()).rejects.toThrow();
    await expect(guestCaller.attendance.upsert({ projectId: 1, workDate: "2026-04-01", employeeId: 1, hoursWorked: 80, workType: "normal", shiftType: "day" })).rejects.toThrow();
  });

  it("super_admin can bulk role change and bulk delete, but cannot target super_admin", async () => {
    const superCaller = appRouter.createCaller(ctx(createUser({ appRole: "super_admin" as any, role: "admin" })));
    const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) });
    const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 2, appRole: "worker" }]) }) }) });
    mockDb.getDb.mockResolvedValue({ update, select });
    await expect(superCaller.superAdmin.bulkChangeRoles({ userIds: [2], appRole: "worker" })).resolves.toEqual({ success: true });

    mockDb.getEmployeeById.mockResolvedValue({ id: 10, userId: 99 });
    const selectSa = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 99, appRole: "super_admin" }]) }) }) });
    mockDb.getDb.mockResolvedValue({ update, select: selectSa });
    await expect(superCaller.superAdmin.bulkDeleteEmployees({ employeeIds: [10], confirmText: "DELETE" })).resolves.toEqual({ success: true });
    expect(mockDb.deleteEmployee).not.toHaveBeenCalled();
    await expect(superCaller.superAdmin.bulkDeleteEmployees({ employeeIds: [10], confirmText: "NOPE" })).rejects.toThrow("confirmText must be DELETE");
  });
});
