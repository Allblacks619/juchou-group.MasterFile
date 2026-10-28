import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import type { InsertGenbaTaskTemplate } from "../drizzle/schema.genba";

/**
 * マルチテナント有効化のブロッカー3件の回帰テスト
 * (genba セキュリティ監査 2026-07-31 / MT セッションと合意した有効化前提条件)
 *
 *  1. 作業員リンク・共有リンクの操作が会社境界を越えられる (siteWorkerId / id が
 *     resolveInputSiteIds の解決対象外で assertUserCompanyScope が効かなかった)
 *  2. テンプレート保存が全会社の行を削除する / プリセット・活動ログが companyId 無しで挿入される
 *  3. リンクセッションの companyId が常に既定会社(1)になる
 *     (tenancy.ts は触らず、アクセス先の site.companyId で解決する方針で合意)
 */

const SITE_C2 = { id: "Genba_Beta_Site_C2", name: "他社現場", companyId: 2, archived: false, projectId: null, driveUrl: null, createdAt: new Date(), updatedAt: new Date() };
const WORKER_C2 = { id: "Genba_Beta_SW_C2", siteId: SITE_C2.id, displayName: "他社作業員", userId: null, role: "worker", createdAt: new Date(), updatedAt: new Date() };
const SHARE_C2 = { id: "Genba_Beta_Share_C2", siteId: SITE_C2.id, name: "他社共有", token: "t".repeat(32), scopes: ["map"], expiresAt: null, createdAt: new Date(), updatedAt: new Date() };
const LINK_C2 = { id: "Genba_Beta_Link_C2", siteId: SITE_C2.id, siteWorkerId: WORKER_C2.id, token: "l".repeat(32), role: "worker", active: true, expiresAt: null, createdByUserId: 9, lastAccessAt: null, createdAt: new Date(), updatedAt: new Date() };

const genbaDbMock = vi.hoisted(() => ({
  getGenbaUserRole: vi.fn(async () => null),
  getGenbaSiteById: vi.fn(),
  getGenbaSiteWorkerById: vi.fn(),
  getGenbaShareById: vi.fn(),
  getGenbaWorkerLinkById: vi.fn(),
  getGenbaWorkerLinkBySiteWorker: vi.fn(async () => null),
  createGenbaWorkerLink: vi.fn(async (d: any) => d),
  updateGenbaWorkerLink: vi.fn(async (_id: string, d: any) => d),
  updateGenbaSiteWorkerRole: vi.fn(async () => {}),
  deleteGenbaWorkerLink: vi.fn(async () => {}),
  deleteGenbaShare: vi.fn(async () => {}),
  replaceGenbaTaskTemplates: vi.fn(async (_rows: InsertGenbaTaskTemplate[], _companyId?: number) => {}),
  getGenbaWorkerLinkByToken: vi.fn(),
  touchGenbaWorkerLinkAccess: vi.fn(async () => {}),
  listGenbaTaskTemplates: vi.fn(async (_companyId?: number) => []),
  createGenbaMaterialPreset: vi.fn(async (d: any) => d),
  getGenbaMaterialPresetById: vi.fn(async () => null),
  getGenbaTaskById: vi.fn(),
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  listGenbaFloorsBySite: vi.fn(),
  listGenbaZonesByFloorIds: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
  updateGenbaTask: vi.fn(),
  createGenbaTaskEvent: vi.fn(async () => {}),
  addGenbaActivityLog: vi.fn(async () => {}),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...genbaDbMock }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), createAuditLog: vi.fn() }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "Genba_Beta_MT_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function ctx(companyId: number): TrpcContext {
  return { user: createUser(), companyId, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
/** 会社1のユーザーとして呼ぶ (対象は会社2のデータ) */
const asCompany1 = () => appRouter.createCaller(ctx(1));

beforeEach(() => {
  vi.clearAllMocks();
  genbaDbMock.getGenbaUserRole.mockResolvedValue(null);
  genbaDbMock.getGenbaSiteById.mockResolvedValue(SITE_C2 as any);
  genbaDbMock.getGenbaSiteWorkerById.mockResolvedValue(WORKER_C2 as any);
  genbaDbMock.getGenbaShareById.mockResolvedValue(SHARE_C2 as any);
  genbaDbMock.getGenbaWorkerLinkById.mockResolvedValue(LINK_C2 as any);
  process.env.MULTI_TENANT = "true";
});
afterEach(() => { delete process.env.MULTI_TENANT; delete process.env.GENBA_ENABLED; });

describe("ブロッカー1: 作業員リンク/共有リンクが会社境界を越えない", () => {
  it("他社の名簿に対する作業員リンク発行は FORBIDDEN (トークンを作らない)", async () => {
    await expect(asCompany1().genba.workerLinks.issue({ siteWorkerId: WORKER_C2.id }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(genbaDbMock.createGenbaWorkerLink).not.toHaveBeenCalled();
    expect(genbaDbMock.updateGenbaWorkerLink).not.toHaveBeenCalled();
  });

  it("他社の共有リンクは失効させられない", async () => {
    await expect(asCompany1().genba.shares.revoke({ id: SHARE_C2.id }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(genbaDbMock.deleteGenbaShare).not.toHaveBeenCalled();
  });

  it("他社の作業員リンクは無効化・削除できない", async () => {
    await expect(asCompany1().genba.workerLinks.setActive({ id: LINK_C2.id, active: false }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(asCompany1().genba.workerLinks.remove({ id: LINK_C2.id }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(genbaDbMock.updateGenbaWorkerLink).not.toHaveBeenCalled();
    expect(genbaDbMock.deleteGenbaWorkerLink).not.toHaveBeenCalled();
  });

  it("MULTI_TENANT off なら従来どおり通る (既定の単一テナント動作を壊さない)", async () => {
    delete process.env.MULTI_TENANT;
    await expect(asCompany1().genba.shares.revoke({ id: SHARE_C2.id })).resolves.toEqual({ success: true });
  });

  it("他社の作業員リンクの権限は変更できず、リンクも名簿も更新しない", async () => {
    await expect(asCompany1().genba.workerLinks.setRole({ id: LINK_C2.id, role: "leader" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(genbaDbMock.updateGenbaWorkerLink).not.toHaveBeenCalled();
    expect(genbaDbMock.updateGenbaSiteWorkerRole).not.toHaveBeenCalled();
  });

  it("自社の作業員リンクの権限変更は名簿へ同期できる", async () => {
    genbaDbMock.getGenbaSiteById.mockResolvedValue({ ...SITE_C2, companyId: 1 });
    await asCompany1().genba.workerLinks.setRole({ id: LINK_C2.id, role: "leader" });
    expect(genbaDbMock.updateGenbaWorkerLink).toHaveBeenCalledWith(LINK_C2.id, { role: "leader" });
    expect(genbaDbMock.updateGenbaSiteWorkerRole).toHaveBeenCalledWith(WORKER_C2.id, "leader");
  });

  it("MULTI_TENANT off ならリンク権限変更も従来どおり許可する", async () => {
    process.env.MULTI_TENANT = "false";
    await asCompany1().genba.workerLinks.setRole({ id: LINK_C2.id, role: "leader" });
    expect(genbaDbMock.updateGenbaWorkerLink).toHaveBeenCalledWith(LINK_C2.id, { role: "leader" });
  });

  it("siteWorkerId を鍵とする名簿変更・削除も他社なら更新前に拒否する", async () => {
    const caller = asCompany1();
    await expect(caller.genba.workerLinks.setWorkerRole({ siteWorkerId: WORKER_C2.id, role: "leader" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.genba.workerLinks.renameWorker({ siteWorkerId: WORKER_C2.id, displayName: "Genba_Beta_Rename" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.genba.workerLinks.deleteWorker({ siteWorkerId: WORKER_C2.id }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(genbaDbMock.updateGenbaSiteWorkerRole).not.toHaveBeenCalled();
  });
});

describe("ブロッカー2: 全社横断テーブルの書き込みが会社スコープを持つ", () => {
  it("templates.saveTree は自社の行だけを入れ替える", async () => {
    await asCompany1().genba.templates.saveTree({ tree: [{ name: "配管", children: [] }] as any });
    expect(genbaDbMock.replaceGenbaTaskTemplates).toHaveBeenCalledWith(expect.any(Array), 1);
    const rows = genbaDbMock.replaceGenbaTaskTemplates.mock.calls[0][0] as any[];
    expect(rows.every((r) => r.companyId === 1)).toBe(true);
  });

  it("materials.savePreset は companyId 付きで作成する", async () => {
    await asCompany1().genba.materials.savePreset({ siteId: null, workName: "よく使う", parts: ["PF管"] });
    expect(genbaDbMock.createGenbaMaterialPreset).toHaveBeenCalledWith(expect.objectContaining({ companyId: 1 }));
  });
});

describe("ブロッカー3: リンクセッションの会社は現場から解決する", () => {
  /** ログイン無し・x-genba-link ヘッダのみのセッション (会社2の現場のリンク) */
  function linkCaller() {
    genbaDbMock.getGenbaWorkerLinkByToken.mockResolvedValue(LINK_C2 as any);
    return appRouter.createCaller({
      user: null,
      companyId: 1, // resolveCompanyId(user=null) が返す既定会社。これに引きずられてはいけない
      req: { protocol: "https", headers: { "x-genba-link": LINK_C2.token } } as any,
      res: { clearCookie: vi.fn() } as any,
    } as TrpcContext);
  }

  it("既定会社(1)ではなく現場の会社(2)で解決される", async () => {
    await linkCaller().genba.templates.get();
    expect(genbaDbMock.listGenbaTaskTemplates).toHaveBeenCalledWith(2);
  });

  it.each([undefined, "false"])("MULTI_TENANT=%s ならリンクでも既定会社(1)を維持する", async (flag) => {
    if (flag === undefined) delete process.env.MULTI_TENANT;
    else process.env.MULTI_TENANT = flag;
    await linkCaller().genba.templates.get();
    expect(genbaDbMock.listGenbaTaskTemplates).toHaveBeenCalledWith(1);
  });

  it("会社2のリーダーリンクから保存するプリセットにも会社2を付与する", async () => {
    const caller = linkCaller();
    genbaDbMock.getGenbaWorkerLinkByToken.mockResolvedValue({ ...LINK_C2, role: "leader" });
    await caller.genba.materials.savePreset({ siteId: SITE_C2.id, workName: "Genba_Beta_Preset", parts: ["PF管"] });
    expect(genbaDbMock.createGenbaMaterialPreset).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2 }));
  });

  function mockTask() {
    const task = { id: "Genba_Beta_Task_C2", zoneId: "Genba_Beta_Zone_C2", parentTaskId: null, name: "Genba_Beta_Task", percent: null };
    const floor = { id: "Genba_Beta_Floor_C2", siteId: SITE_C2.id };
    const zone = { id: task.zoneId, floorId: floor.id };
    genbaDbMock.getGenbaTaskById.mockResolvedValue(task);
    genbaDbMock.getGenbaZoneById.mockResolvedValue(zone);
    genbaDbMock.getGenbaFloorById.mockResolvedValue(floor);
    genbaDbMock.listGenbaFloorsBySite.mockResolvedValue([floor]);
    genbaDbMock.listGenbaZonesByFloorIds.mockResolvedValue([zone]);
    genbaDbMock.listGenbaTasksByZoneIds.mockResolvedValue([task]);
    genbaDbMock.updateGenbaTask.mockResolvedValue(task);
    return task;
  }

  it("ログイン経由とヘッダーリンク経由の活動ログを会社2へ保存する", async () => {
    const task = mockTask();
    const loggedIn = appRouter.createCaller(ctx(2));
    await loggedIn.genba.tasks.setStatus({ id: task.id, status: "done" });
    expect(genbaDbMock.addGenbaActivityLog).toHaveBeenLastCalledWith("status", 1, expect.any(Object), 2);
    const caller = linkCaller();
    genbaDbMock.getGenbaWorkerLinkByToken.mockResolvedValue({ ...LINK_C2, role: "leader" });
    await caller.genba.tasks.setStatus({ id: task.id, status: "done" });
    expect(genbaDbMock.addGenbaActivityLog).toHaveBeenLastCalledWith("status", null, expect.any(Object), 2);
  });

  it.each([["true", 2], ["false", undefined]] as const)("公開リンクの活動ログ: MULTI_TENANT=%s", async (flag, expectedCompanyId) => {
    process.env.MULTI_TENANT = flag;
    const task = mockTask();
    genbaDbMock.getGenbaWorkerLinkByToken.mockResolvedValue({ ...LINK_C2, role: "leader" });
    const caller = appRouter.createCaller({ ...ctx(1), user: null });
    await caller.genba.workerLink.setStatus({ token: LINK_C2.token, taskId: task.id, status: "done" });
    expect(genbaDbMock.addGenbaActivityLog).toHaveBeenCalledWith("status", null, expect.any(Object), expectedCompanyId);
  });
});
