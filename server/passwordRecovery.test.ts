import { createHash } from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const mockDb = vi.hoisted(() => ({
  getDb: vi.fn(),
  getUserByLoginId: vi.fn(),
  getEmployeeByUserId: vi.fn(),
  getAllEmployees: vi.fn(),
  getAllUsers: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<any>("./db");
  return { ...actual, ...mockDb };
});

function ctx(user: TrpcContext["user"] = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: { host: "example.test" } } as any,
    res: { clearCookie: vi.fn() } as any,
  };
}

function superAdmin() {
  return {
    id: 1,
    openId: "super",
    email: null,
    name: "Super Admin",
    loginMethod: null,
    role: "admin",
    appRole: "super_admin",
    loginId: "super",
    passwordHash: "$2a$12$dummy",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>;
}

describe("password recovery workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a generic public recovery request with birth date and phone verification", async () => {
    const values = vi.fn().mockResolvedValue([{ insertId: 123 }]);
    const insert = vi.fn().mockReturnValue({ values });
    mockDb.getDb.mockResolvedValue({ insert });
    mockDb.getUserByLoginId.mockResolvedValue({ id: 10, loginId: "worker1" });
    mockDb.getEmployeeByUserId.mockResolvedValue({ id: 20, dateOfBirth: new Date("1990-01-02T00:00:00.000Z"), phone: "090-1111-2222" });

    const result = await appRouter.createCaller(ctx()).passwordRecovery.request({
      loginId: "worker1",
      birthDate: "1990-01-02",
      phone: "09011112222",
    });

    expect(result.message).toBe("復旧依頼を送信しました。管理者の確認をお待ちください。");
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      userId: 10,
      employeeId: 20,
      loginId: "worker1",
      status: "pending",
      verificationMatched: true,
    }));
  });

  it("does not reveal incorrect recovery information to the public requester", async () => {
    const values = vi.fn().mockResolvedValue([{ insertId: 124 }]);
    mockDb.getDb.mockResolvedValue({ insert: vi.fn().mockReturnValue({ values }) });
    mockDb.getUserByLoginId.mockResolvedValue(undefined);

    const result = await appRouter.createCaller(ctx()).passwordRecovery.request({
      loginId: "missing",
      birthDate: "1990-01-02",
      phone: "000",
    });

    expect(result).toEqual({ success: true, message: "復旧依頼を送信しました。管理者の確認をお待ちください。" });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      employeeId: null,
      loginId: "missing",
      verificationMatched: false,
    }));
  });

  it("super_admin generates one-time reset links with only a token hash stored", async () => {
    const values = vi.fn().mockResolvedValue([{ insertId: 200 }]);
    const insert = vi.fn().mockReturnValue({ values });
    const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ id: 10, loginId: "admin1", appRole: "admin", employeeId: 20 }]) }) }) });
    mockDb.getDb.mockResolvedValue({ insert, select });
    mockDb.getEmployeeByUserId.mockResolvedValue({ id: 20, nameKanji: "Admin One" });

    const result = await appRouter.createCaller(ctx(superAdmin())).superAdmin.generateUserResetLink({ userId: 10, confirmPrivilegedReset: true });
    const token = result.resetLink.split("/").pop()!;
    const stored = values.mock.calls[0][0];

    expect(result.loginId).toBe("admin1");
    expect(result.resetLink).toContain("https://example.test/app/reset-password/");
    expect(result.warning).toBe("このリンクは一度だけ使用できます");
    expect(stored.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.status).toBe("approved");
  });

  it("uses a valid reset token once and clears mustChangePassword", async () => {
    const token = "reset-token-abcdefghijklmnopqrstuvwxyz123456";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const setUser = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
    const setRequest = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
    const update = vi.fn()
      .mockReturnValueOnce({ set: setUser })
      .mockReturnValueOnce({ set: setRequest });
    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 300, userId: 10, employeeId: 20, loginId: "worker1", status: "approved", tokenHash, tokenExpiresAt: new Date(Date.now() + 60000), tokenUsedAt: null }]),
        }),
      }),
    });
    mockDb.getDb.mockResolvedValue({ select, update });

    await expect(appRouter.createCaller(ctx()).passwordRecovery.resetWithToken({ token, newPassword: "NewPass123", confirmPassword: "NewPass123" })).resolves.toEqual({ success: true });

    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: expect.any(String), mustChangePassword: false }));
    expect(setUser.mock.calls[0][0].passwordHash).not.toBe("NewPass123");
    expect(setRequest).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", tokenUsedAt: expect.any(Date), completedAt: expect.any(Date) }));
  });
});
