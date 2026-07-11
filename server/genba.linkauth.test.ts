import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * G-full: 作業員リンクトークン (x-genba-link ヘッダ) で本体 genba API を使う認証層のテスト。
 * - リンクセッションは自現場のみ・デニーリスト手続きは不可
 * - workerリンクは自分の担当のみ更新 / leaderリンクは現場全体
 * - オーナー (super_admin) の権限は誰からも変更不可
 * - 名簿役割 (site_workers.role) の変更は admin のみ・発行時に引き継ぐ
 */

const mockGenbaDb = vi.hoisted(() => ({
  // リンク解決
  getGenbaWorkerLinkByToken: vi.fn(),
  getGenbaSiteWorkerById: vi.fn(),
  getGenbaSiteById: vi.fn(),
  touchGenbaWorkerLinkAccess: vi.fn(),
  // スコープ解決 (assertLinkRefScope / assertLinkTaskScope)
  getGenbaFloorById: vi.fn(),
  getGenbaZoneById: vi.fn(),
  getGenbaTaskById: vi.fn(),
  getGenbaTeamById: vi.fn(),
  getGenbaInstructionById: vi.fn(),
  // 一覧・更新
  listGenbaFloorsBySite: vi.fn(),
  listTaskIdsAssignedToGuest: vi.fn(),
  listTaskIdsAssignedToUser: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
  updateGenbaTask: vi.fn(),
  createGenbaTaskEvent: vi.fn(),
  getGenbaUserSettings: vi.fn(),
  // 役割
  getGenbaUserRole: vi.fn(),
  getUserAppRoleById: vi.fn(),
  updateGenbaSiteWorkerRole: vi.fn(),
  getGenbaWorkerLinkBySiteWorker: vi.fn(),
  getGenbaWorkerLinkById: vi.fn(),
  updateGenbaWorkerLink: vi.fn(),
  createGenbaWorkerLink: vi.fn(),
}));
const mockStorage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./storage", () => mockStorage);
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function userCtx(u: User | null): TrpcContext {
  return { user: u as any, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
function linkCtx(token: string): TrpcContext {
  return { user: null as any, req: { protocol: "https", headers: { "x-genba-link": token } } as any, res: { clearCookie: vi.fn() } as any };
}
const admin = () => appRouter.createCaller(userCtx(createUser({ appRole: "admin" as any, role: "admin" })));
const leader = () => appRouter.createCaller(userCtx(createUser({ appRole: "manager" as any })));
const viaLink = (token = TOKEN) => appRouter.createCaller(linkCtx(token));

const TOKEN = "tok_Genba_Beta_linkauth_0123456789";
const SITE = { id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date() };
const SW_GUEST = { id: "Genba_Beta_SW_g1", siteId: SITE.id, userId: null, employeeId: null, guestName: "応援太郎", kind: "guest", displayName: "応援太郎", role: "worker", active: true, createdAt: new Date(), updatedAt: new Date() };
const LINK = (o: any = {}) => ({ id: "Genba_Beta_WL_01", siteId: SITE.id, siteWorkerId: SW_GUEST.id, token: TOKEN, role: "worker", active: true, expiresAt: null, lastAccessAt: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date(), ...o });
const FLOOR = { id: "Genba_Beta_F1", siteId: SITE.id, name: "1F", imageKey: "k", w: 100, h: 100, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const OTHER_FLOOR = { ...FLOOR, id: "Genba_Beta_F9", siteId: "Genba_Beta_Site_99" };
const ZONE = { id: "Genba_Beta_Z1", floorId: FLOOR.id, parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], priority: 1, workStatus: null, color: null, fillOpacity: null, createdAt: new Date(), updatedAt: new Date() };
const TASK = (id: string, o: any = {}) => ({ id, zoneId: ZONE.id, parentTaskId: null, name: `task-${id}`, romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...o });

function mockLinkHappyPath(linkOverrides: any = {}, workerOverrides: any = {}) {
  mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK(linkOverrides));
  mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue({ ...SW_GUEST, ...workerOverrides });
  mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
  mockGenbaDb.touchGenbaWorkerLinkAccess.mockResolvedValue(undefined);
  mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
  mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
  mockGenbaDb.listTaskIdsAssignedToGuest.mockResolvedValue(new Set());
  mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set());
  mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
  mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([]);
  mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([]);
  mockGenbaDb.getGenbaUserRole.mockResolvedValue(null);
  mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/get" });
}

describe("genba リンク認証で本体APIを使う (G-full)", () => {
  beforeEach(() => { vi.clearAllMocks(); mockLinkHappyPath(); });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("認証と me", () => {
    it("ゲストリンク: me は userId=null / kind=guest / role=worker と現場を返す", async () => {
      const me = await viaLink().genba.me();
      expect(me.userId).toBeNull();
      expect(me.name).toBe("応援太郎");
      expect(me.genbaRole).toBe("worker");
      expect(me.link).toEqual({ siteId: SITE.id, kind: "guest" });
    });

    it("登録作業員リンク: kind=registered で設定はDBから読む", async () => {
      mockLinkHappyPath({ role: "leader" }, { userId: 5, kind: "registered", displayName: "鈴木ジュン" });
      mockGenbaDb.getGenbaUserSettings.mockResolvedValue({ userId: 5, theme: "dark", lang: "ja", color: null, guideSeen: true });
      const me = await viaLink().genba.me();
      expect(me).toMatchObject({ userId: 5, name: "鈴木ジュン", genbaRole: "leader", link: { siteId: SITE.id, kind: "registered" } });
      expect(me.settings.guideSeen).toBe(true);
    });

    it("トークン無し・未ログインは UNAUTHORIZED", async () => {
      const anon = appRouter.createCaller(userCtx(null));
      await expect(anon.genba.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("無効/無効化/期限切れトークンはそれぞれのメッセージで UNAUTHORIZED", async () => {
      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(null);
      await expect(viaLink().genba.me()).rejects.toThrow("リンクが無効です");

      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ active: false }));
      await expect(viaLink().genba.me()).rejects.toThrow("このリンクは無効化されています");

      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(viaLink().genba.me()).rejects.toThrow("有効期限が切れています");
    });

    it("アーカイブ済み現場のリンクは UNAUTHORIZED (内容を出さない)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue({ ...SITE, archived: true });
      await expect(viaLink().genba.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });
  });

  describe("現場スコープ", () => {
    it("sites.list はリンクの現場だけを返す", async () => {
      const res = await viaLink().genba.sites.list();
      expect(res).toEqual([SITE]);
    });

    it("floors.list: 自現場は取得可・他現場の siteId は FORBIDDEN", async () => {
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([FLOOR]);
      const res = await viaLink().genba.floors.list({ siteId: SITE.id });
      expect(res).toHaveLength(1);
      await expect(viaLink().genba.floors.list({ siteId: "Genba_Beta_Site_99" }))
        .rejects.toThrow("この現場のリンクでは操作できません");
    });

    it("他現場のタスクは leaderリンクでも更新できない", async () => {
      mockLinkHappyPath({ role: "leader" });
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK("t9", { zoneId: "Genba_Beta_Z9" }));
      mockGenbaDb.getGenbaZoneById.mockResolvedValue({ ...ZONE, id: "Genba_Beta_Z9", floorId: OTHER_FLOOR.id });
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(OTHER_FLOOR);
      await expect(viaLink().genba.tasks.setStatus({ id: "t9", status: "done" }))
        .rejects.toThrow("この現場のリンクでは操作できません");
      expect(mockGenbaDb.updateGenbaTask).not.toHaveBeenCalled();
    });
  });

  describe("デニーリスト (リンクから使えない手続き)", () => {
    it("workerLinks.list / sites.create / logs.list は FORBIDDEN", async () => {
      await expect(viaLink().genba.workerLinks.list({ siteId: SITE.id }))
        .rejects.toThrow("この操作は作業員リンクからは行えません");
      await expect(viaLink().genba.sites.create({ name: "Genba_Beta_X" }))
        .rejects.toThrow("この操作は作業員リンクからは行えません");
      await expect(viaLink().genba.logs.list())
        .rejects.toThrow("この操作は作業員リンクからは行えません");
    });
  });

  describe("tasks.setStatus (リンク経由)", () => {
    it("workerリンクは自分の担当 (ゲスト割当) を更新できる。イベントは byUserId=null で記録", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK("t1"));
      mockGenbaDb.listTaskIdsAssignedToGuest.mockResolvedValue(new Set(["t1"]));
      mockGenbaDb.updateGenbaTask.mockResolvedValue(TASK("t1", { status: "done", percent: 100 }));
      const res = await viaLink().genba.tasks.setStatus({ id: "t1", status: "done" });
      expect(res?.status).toBe("done");
      const ev = mockGenbaDb.createGenbaTaskEvent.mock.calls[0][0];
      expect(ev.byUserId).toBeNull();
    });

    it("workerリンクは他人の担当を更新できない (FORBIDDEN)", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK("t2"));
      await expect(viaLink().genba.tasks.setStatus({ id: "t2", status: "done" }))
        .rejects.toThrow("この作業はあなたの担当ではありません");
      expect(mockGenbaDb.updateGenbaTask).not.toHaveBeenCalled();
    });

    it("leaderリンクは自現場のどのタスクも更新できる", async () => {
      mockLinkHappyPath({ role: "leader" });
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK("t2"));
      mockGenbaDb.updateGenbaTask.mockResolvedValue(TASK("t2", { status: "progress", percent: 25 }));
      const res = await viaLink().genba.tasks.setStatus({ id: "t2", status: "progress", percent: 25 });
      expect(res?.percent).toBe(25);
    });
  });

  describe("権限変更の保護", () => {
    it("setGenbaRole: オーナー (super_admin) は admin からも変更できない", async () => {
      mockGenbaDb.getUserAppRoleById.mockResolvedValue("super_admin");
      await expect(admin().genba.users.setGenbaRole({ userId: 999, role: "worker" }))
        .rejects.toThrow("オーナーの権限は変更できません");
    });

    it("setWorkerRole: admin は名簿役割を変更し既存リンクへ同期。leader は FORBIDDEN", async () => {
      mockGenbaDb.getGenbaWorkerLinkBySiteWorker.mockResolvedValue(LINK());
      mockGenbaDb.updateGenbaWorkerLink.mockResolvedValue(LINK({ role: "leader" }));
      await admin().genba.workerLinks.setWorkerRole({ siteWorkerId: SW_GUEST.id, role: "leader" });
      expect(mockGenbaDb.updateGenbaSiteWorkerRole).toHaveBeenCalledWith(SW_GUEST.id, "leader");
      expect(mockGenbaDb.updateGenbaWorkerLink).toHaveBeenCalledWith(LINK().id, { role: "leader" });

      await expect(leader().genba.workerLinks.setWorkerRole({ siteWorkerId: SW_GUEST.id, role: "leader" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("setRole (リンク権限) も admin のみ。名簿役割も同期する", async () => {
      mockGenbaDb.getGenbaWorkerLinkById.mockResolvedValue(LINK());
      mockGenbaDb.updateGenbaWorkerLink.mockResolvedValue(LINK({ role: "leader" }));
      await admin().genba.workerLinks.setRole({ id: LINK().id, role: "leader" });
      expect(mockGenbaDb.updateGenbaSiteWorkerRole).toHaveBeenCalledWith(SW_GUEST.id, "leader");

      await expect(leader().genba.workerLinks.setRole({ id: LINK().id, role: "leader" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("issue: 非admin (leader) の role 指定は無視され名簿役割に従う。admin は指定できる", async () => {
      mockGenbaDb.getGenbaWorkerLinkBySiteWorker.mockResolvedValue(null);
      mockGenbaDb.createGenbaWorkerLink.mockImplementation(async (d: any) => LINK({ id: d.id, token: d.token, role: d.role }));

      await leader().genba.workerLinks.issue({ siteWorkerId: SW_GUEST.id, role: "leader" });
      expect(mockGenbaDb.createGenbaWorkerLink.mock.calls[0][0].role).toBe("worker"); // 名簿は worker

      vi.clearAllMocks(); mockLinkHappyPath();
      mockGenbaDb.getGenbaWorkerLinkBySiteWorker.mockResolvedValue(null);
      mockGenbaDb.createGenbaWorkerLink.mockImplementation(async (d: any) => LINK({ id: d.id, token: d.token, role: d.role }));
      await admin().genba.workerLinks.issue({ siteWorkerId: SW_GUEST.id, role: "leader" });
      expect(mockGenbaDb.createGenbaWorkerLink.mock.calls[0][0].role).toBe("leader");
    });

    it("issue: role 省略時は名簿役割 (leader) を引き継ぐ", async () => {
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue({ ...SW_GUEST, role: "leader" });
      mockGenbaDb.getGenbaWorkerLinkBySiteWorker.mockResolvedValue(null);
      mockGenbaDb.createGenbaWorkerLink.mockImplementation(async (d: any) => LINK({ id: d.id, token: d.token, role: d.role }));
      await leader().genba.workerLinks.issue({ siteWorkerId: SW_GUEST.id });
      expect(mockGenbaDb.createGenbaWorkerLink.mock.calls[0][0].role).toBe("leader");
    });
  });

  it("GENBA_ENABLED=false でリンク認証も遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(viaLink().genba.me()).rejects.toThrow("現場ビジョンは無効化されています");
  });
});
