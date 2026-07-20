import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getAllInvoices: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn(),
  updateUserPermissionOverrides: vi.fn().mockResolvedValue(undefined),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "u-1",
    email: "u@example.com",
    name: "User",
    loginMethod: "manus",
    role: "user",
    appRole: "worker",
    loginId: "user",
    mustChangePassword: false,
    employeeId: null,
    permissionOverrides: null,
    companyId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as User;
}

function createCtx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any, companyId: 1 };
}

describe("個人別 表示/ブロック設定のルーター実効", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("取引先請求(billing)は manager でも既定 FORBIDDEN（管理者以上のみ）", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "manager" } as any)));
    await expect(caller.invoice.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("billing を allow された manager は請求書を呼べる", async () => {
    const caller = appRouter.createCaller(
      createCtx(createUser({ appRole: "manager", permissionOverrides: '{"billing":"allow"}' } as any)),
    );
    await expect(caller.invoice.list()).resolves.toEqual([]);
  });

  it("worker は既定で請求書不可、billing allow を付ければ呼べる", async () => {
    const denied = appRouter.createCaller(createCtx(createUser({ appRole: "worker" } as any)));
    await expect(denied.invoice.list()).rejects.toMatchObject({ code: "FORBIDDEN" });

    const allowed = appRouter.createCaller(
      createCtx(createUser({ appRole: "worker", permissionOverrides: '{"billing":"allow"}' } as any)),
    );
    await expect(allowed.invoice.list()).resolves.toEqual([]);
  });

  it("admin は deny があっても常に呼べる（設定する側のため）", async () => {
    const caller = appRouter.createCaller(
      createCtx(createUser({ appRole: "admin", permissionOverrides: '{"billing":"deny"}' } as any)),
    );
    await expect(caller.invoice.list()).resolves.toEqual([]);
  });

  it("permission.my: manager の既定は billing=false / payments=true", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "manager" } as any)));
    const result = await caller.permission.my();
    expect(result.areas.billing).toBe(false);
    expect(result.areas.payments).toBe(true);
  });

  it("permission.my は実効エリアを返す", async () => {
    const caller = appRouter.createCaller(
      createCtx(createUser({ appRole: "worker", permissionOverrides: '{"attendance":"allow"}' } as any)),
    );
    const result = await caller.permission.my();
    expect(result.role).toBe("worker");
    expect(result.areas.attendance).toBe(true);
    expect(result.areas.billing).toBe(false);
  });

  it("permission.setOverrides: admin が worker に設定でき、default キーは保存されない", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 5, appRole: "worker" } as any);
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" } as any)));
    const result = await caller.permission.setOverrides({
      userId: 5,
      overrides: { billing: "allow", rates: "default", closing: "deny" } as any,
    });
    expect(result.success).toBe(true);
    expect(db.updateUserPermissionOverrides).toHaveBeenCalledWith(5, JSON.stringify({ billing: "allow", closing: "deny" }));
  });

  it("permission.setOverrides: 全て default なら null で保存（ロール通りに戻す）", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 5, appRole: "manager" } as any);
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" } as any)));
    await caller.permission.setOverrides({ userId: 5, overrides: { billing: "default" } as any });
    expect(db.updateUserPermissionOverrides).toHaveBeenCalledWith(5, null);
  });

  it("permission.setOverrides: super_admin / admin は対象にできない", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 9, appRole: "admin" } as any);
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "super_admin" } as any)));
    await expect(
      caller.permission.setOverrides({ userId: 9, overrides: { billing: "deny" } as any }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateUserPermissionOverrides).not.toHaveBeenCalled();
  });

  it("permission.setOverrides: worker には権限がない", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "worker" } as any)));
    await expect(
      caller.permission.setOverrides({ userId: 5, overrides: { billing: "deny" } as any }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
