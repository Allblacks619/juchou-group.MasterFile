import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import { DEFAULT_COMPANY_ID, isMultiTenantEnabled, resolveCompanyId } from "./tenancy";

/**
 * マルチテナント化 Phase 1a — テナント基盤（認証・マスタ）の検証
 * (docs/multitenant/PLAN_v1.md)
 *
 * - MULTI_TENANT フラグ off（既定）の間は常に既定会社=1 → 現行動作と完全互換
 * - フラグ on のときのみ users.companyId がテナント境界として効く
 * - マスタ系 list ルーターは ctx.companyId を db 層へ引き渡す（会社フィルタの呼び出し規約）
 */

const mockDb = vi.hoisted(() => ({
  getAllClients: vi.fn(async (_companyId?: number) => []),
  getAllProjects: vi.fn(async (_companyId?: number) => []),
  getAllEmployees: vi.fn(async (_companyId?: number) => []),
  getAllUsers: vi.fn(async (_companyId?: number) => []),
  getAllInvitations: vi.fn(async (_companyId?: number) => []),
  createInvitation: vi.fn(async (d: any) => d),
  createAuditLog: vi.fn(),
}));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "MTSIM_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function ctx(u: User, companyId?: number): TrpcContext {
  return { user: u, companyId, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

afterEach(() => { delete process.env.MULTI_TENANT; });

describe("tenancy: resolveCompanyId / isMultiTenantEnabled", () => {
  it("フラグ off（既定）では所属に関係なく常に既定会社=1（現行動作と完全互換）", () => {
    expect(isMultiTenantEnabled()).toBe(false);
    expect(resolveCompanyId(null)).toBe(DEFAULT_COMPANY_ID);
    expect(resolveCompanyId(createUser({ companyId: 2 }))).toBe(DEFAULT_COMPANY_ID);
  });

  it("フラグ on ではユーザーの所属会社を返し、未設定は既定会社へフォールバック（時限措置・審議#5）", () => {
    process.env.MULTI_TENANT = "true";
    expect(isMultiTenantEnabled()).toBe(true);
    expect(resolveCompanyId(createUser({ companyId: 2 }))).toBe(2);
    expect(resolveCompanyId(createUser({ companyId: undefined as any }))).toBe(DEFAULT_COMPANY_ID);
    expect(resolveCompanyId(null)).toBe(DEFAULT_COMPANY_ID);
    expect(resolveCompanyId({ companyId: 0 })).toBe(DEFAULT_COMPANY_ID);
  });
});

describe("マスタ系 list ルーターが ctx.companyId を db 層へ引き渡す", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clientInfo.list / employee.list / invitation.list が会社IDつきで呼ぶ", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 2));
    await caller.clientInfo.list();
    expect(mockDb.getAllClients).toHaveBeenCalledWith(2);
    await caller.employee.list();
    expect(mockDb.getAllEmployees).toHaveBeenCalledWith(2);
    await caller.invitation.list();
    expect(mockDb.getAllInvitations).toHaveBeenCalledWith(2);
  });

  it("project.list は projects/clients の両方を会社IDつきで呼ぶ", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 3));
    await caller.project.list();
    expect(mockDb.getAllProjects).toHaveBeenCalledWith(3);
    expect(mockDb.getAllClients).toHaveBeenCalledWith(3);
  });

  it("ctx.companyId が無い（旧セッション/旧テスト）場合は undefined のまま渡り、db 層は無フィルタ=現行動作", async () => {
    const caller = appRouter.createCaller(ctx(createUser()));
    await caller.clientInfo.list();
    expect(mockDb.getAllClients).toHaveBeenCalledWith(undefined);
  });
});

describe("招待の会社スコープ（招待は会社単位で発行される）", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invitation.create は発行者の ctx.companyId を招待に刻む", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ appRole: "super_admin" as any }), 2));
    await caller.invitation.create({ loginId: "mtsim.taro", tempPassword: "secret1", assignedRole: "worker" });
    expect(mockDb.createInvitation).toHaveBeenCalledTimes(1);
    expect(mockDb.createInvitation.mock.calls[0][0].companyId).toBe(2);
  });
});
