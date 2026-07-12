import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * マルチテナント化 Phase 1b — 業務テーブルのテナント境界（配線検証）
 * (docs/multitenant/PLAN_v1.md)
 *
 * 業務系の広域クエリ（請求書一覧・作業員固定単価・作業員請求書レビュー）が
 * ctx.companyId を db 層へ引き渡すことを検証する。db 層の会社フィルタ自体は
 * migration-test（列の存在）と 1a と同一パターンで担保される。
 */

const mockDb = vi.hoisted(() => ({
  getAllInvoices: vi.fn(async (_companyId?: number) => []),
  getAllWorkerBaseRates: vi.fn(async (_companyId?: number) => []),
  listWorkerInvoicesForReview: vi.fn(async (_companyId?: number) => []),
  createAuditLog: vi.fn(),
}));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "MT_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function ctx(u: User, companyId?: number): TrpcContext {
  return { user: u, companyId, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

afterEach(() => { delete process.env.MULTI_TENANT; });
beforeEach(() => vi.clearAllMocks());

describe("業務系 list ルーターが ctx.companyId を db 層へ引き渡す", () => {
  it("invoice.list → getAllInvoices(companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 2));
    await caller.invoice.list();
    expect(mockDb.getAllInvoices).toHaveBeenCalledWith(2);
  });

  it("workerBaseRate.listAll → getAllWorkerBaseRates(companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 3));
    await caller.workerBaseRate.listAll();
    expect(mockDb.getAllWorkerBaseRates).toHaveBeenCalledWith(3);
  });

  it("workerInvoice.listForReview → listWorkerInvoicesForReview(companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser({ appRole: "manager" as any }), 4));
    await caller.workerInvoice.listForReview();
    expect(mockDb.listWorkerInvoicesForReview).toHaveBeenCalledWith(4);
  });

  it("ctx.companyId 未設定（旧セッション）なら undefined を渡す＝db層は無フィルタ=現行動作", async () => {
    const caller = appRouter.createCaller(ctx(createUser()));
    await caller.invoice.list();
    expect(mockDb.getAllInvoices).toHaveBeenCalledWith(undefined);
  });
});
