import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * マルチテナント化 Phase 1c — genba のテナント境界（配線検証）
 * (docs/multitenant/PLAN_v1.md)
 *
 * genba 階層は genbaSites をルートに siteId で辿るため、会社境界の正本は
 * genbaSites.companyId のみ。site に属さない全社横断テーブル（taskTemplates /
 * materialPresets の null-site / activityLogs）にのみ companyId を直付けした。
 * ここでは list ルーターが ctx.companyId を db 層へ引き渡すことを検証する。
 */

const genbaDbMock = vi.hoisted(() => ({
  listGenbaSites: vi.fn(async (_companyId?: number) => []),
  listGenbaSitesArchived: vi.fn(async (_companyId?: number) => []),
  listGenbaTaskTemplates: vi.fn(async (_companyId?: number) => []),
  listGenbaMaterialPresets: vi.fn(async (_siteId?: string | null, _companyId?: number) => []),
  listGenbaActivityLogs: vi.fn(async (_type?: string, _limit?: number, _companyId?: number) => []),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...genbaDbMock }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "Genba_Beta_MT_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function ctx(u: User, companyId?: number): TrpcContext {
  return { user: u, companyId, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => { delete process.env.GENBA_ENABLED; });

describe("genba list ルーターが ctx.companyId を db 層へ引き渡す", () => {
  it("sites.list → listGenbaSites(companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 2));
    await caller.genba.sites.list();
    expect(genbaDbMock.listGenbaSites).toHaveBeenCalledWith(2);
  });

  it("sites.listArchived → listGenbaSitesArchived(companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 3));
    await caller.genba.sites.listArchived();
    expect(genbaDbMock.listGenbaSitesArchived).toHaveBeenCalledWith(3);
  });

  it("templates.get → listGenbaTaskTemplates(companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 4));
    await caller.genba.templates.get();
    expect(genbaDbMock.listGenbaTaskTemplates).toHaveBeenCalledWith(4);
  });

  it("materials.listPresets → listGenbaMaterialPresets(siteId, companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 5));
    await caller.genba.materials.listPresets({ siteId: null });
    expect(genbaDbMock.listGenbaMaterialPresets).toHaveBeenCalledWith(null, 5);
  });

  it("logs.list → listGenbaActivityLogs(type, limit, companyId)", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 6));
    await caller.genba.logs.list({ limit: 50 });
    expect(genbaDbMock.listGenbaActivityLogs).toHaveBeenCalledWith(undefined, 50, 6);
  });

  it("ctx.companyId 未設定（旧セッション）なら undefined を渡す＝現行動作", async () => {
    const caller = appRouter.createCaller(ctx(createUser()));
    await caller.genba.sites.list();
    expect(genbaDbMock.listGenbaSites).toHaveBeenCalledWith(undefined);
  });
});
