import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  // admin
  listGenbaWorkerLinksBySite: vi.fn(),
  listGenbaSiteWorkersByIds: vi.fn(),
  getGenbaWorkerLinkById: vi.fn(),
  getGenbaWorkerLinkBySiteWorker: vi.fn(),
  createGenbaWorkerLink: vi.fn(),
  updateGenbaWorkerLink: vi.fn(),
  deleteGenbaWorkerLink: vi.fn(),
  getGenbaSiteWorkerById: vi.fn(),
  // public
  getGenbaWorkerLinkByToken: vi.fn(),
  getGenbaSiteById: vi.fn(),
  touchGenbaWorkerLinkAccess: vi.fn(),
  listGenbaFloorsBySite: vi.fn(),
  listGenbaZonesByFloorIds: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
  listTaskIdsAssignedToGuest: vi.fn(),
  listTaskIdsAssignedToUser: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
  listGenbaInstructionsBySite: vi.fn(),
  getGenbaTaskById: vi.fn(),
  updateGenbaTask: vi.fn(),
  createGenbaTaskEvent: vi.fn(),
}));
const mockStorage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./storage", () => mockStorage);
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User | null): TrpcContext { return { user: u as any, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ id: 2, appRole: "worker" as any })));
const anon = () => appRouter.createCaller(ctx(null));

const SITE = { id: "Genba_Beta_Site_01", name: "現場A", projectId: 1, driveUrl: "https://drive.example/secret", archived: false, createdAt: new Date(), updatedAt: new Date() };
const SW_GUEST = { id: "Genba_Beta_SW_g1", siteId: SITE.id, userId: null, employeeId: null, guestName: "応援太郎", kind: "guest", displayName: "応援太郎", active: true, createdAt: new Date(), updatedAt: new Date() };
const LINK = (o: any = {}) => ({ id: "Genba_Beta_WL_01", siteId: SITE.id, siteWorkerId: SW_GUEST.id, token: "tok_Genba_Beta_0123456789abcdef", role: "worker", active: true, expiresAt: null, lastAccessAt: null, createdByUserId: 1, createdAt: new Date(), updatedAt: new Date(), ...o });
const FLOOR = { id: "Genba_Beta_F1", siteId: SITE.id, name: "1F", imageKey: "k", w: 100, h: 100, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const ZONE = { id: "Genba_Beta_Z1", floorId: FLOOR.id, parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], priority: 1, workStatus: null, color: null, fillOpacity: null, createdAt: new Date(), updatedAt: new Date() };
const T = (id: string, o: any = {}) => ({ id, zoneId: ZONE.id, parentTaskId: null, name: `task-${id}`, romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: "社内メモ(外部秘)", memoVisible: false, linkUrl: "https://internal.example/dwg", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...o });

function mockPublicHappyPath() {
  mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK());
  mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW_GUEST);
  mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
  mockGenbaDb.touchGenbaWorkerLinkAccess.mockResolvedValue(undefined);
  mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([FLOOR]);
  mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue([ZONE, { ...ZONE, id: "Genba_Beta_Z2", name: "2工区(他人)" }]);
  mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([T("t1"), T("t2"), T("t3", { zoneId: "Genba_Beta_Z2" })]);
  mockGenbaDb.listTaskIdsAssignedToGuest.mockResolvedValue(new Set(["t1"]));
  mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set());
  mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
  mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([]);
  mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([]);
  mockGenbaDb.listGenbaInstructionsBySite.mockResolvedValue([
    { id: "i1", siteId: SITE.id, text: "全員向け", targetKind: "all", targetId: null, zoneId: null, byUserId: 1, createdAt: new Date(), updatedAt: new Date() },
    { id: "i2", siteId: SITE.id, text: "個人宛(user 99)", targetKind: "worker", targetId: "99", zoneId: null, byUserId: 1, createdAt: new Date(), updatedAt: new Date() },
  ]);
  mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/get" });
  mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
}

describe("genba 作業員専用リンク (G2)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("管理 (workerLinks)", () => {
    it("issue: 新規発行 (token生成・作成)。worker は 403", async () => {
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW_GUEST);
      mockGenbaDb.getGenbaWorkerLinkBySiteWorker.mockResolvedValue(null);
      mockGenbaDb.createGenbaWorkerLink.mockImplementation(async (d: any) => LINK({ id: d.id, token: d.token }));
      const res = await leader().genba.workerLinks.issue({ siteWorkerId: SW_GUEST.id });
      expect(res?.token).toBeTruthy();
      const arg = mockGenbaDb.createGenbaWorkerLink.mock.calls[0][0];
      expect(arg.token.length).toBeGreaterThanOrEqual(32);
      expect(arg.active).toBe(true);
      await expect(worker().genba.workerLinks.issue({ siteWorkerId: SW_GUEST.id }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("issue: 既存リンクは token 差し替えで再発行 (旧URL無効化)", async () => {
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW_GUEST);
      mockGenbaDb.getGenbaWorkerLinkBySiteWorker.mockResolvedValue(LINK({ token: "old_token_value_0123456789abcdef" }));
      mockGenbaDb.updateGenbaWorkerLink.mockImplementation(async (_id: string, patch: any) => LINK(patch));
      const res = await leader().genba.workerLinks.issue({ siteWorkerId: SW_GUEST.id, expiresDays: 7 });
      const patch = mockGenbaDb.updateGenbaWorkerLink.mock.calls[0][1];
      expect(patch.token).not.toBe("old_token_value_0123456789abcdef");
      expect(patch.active).toBe(true);
      expect(patch.expiresAt).toBeInstanceOf(Date);
      expect(res?.token).toBe(patch.token);
      expect(mockGenbaDb.createGenbaWorkerLink).not.toHaveBeenCalled();
    });

    it("setActive: 無効化/有効化 (ソフト)。remove は物理削除", async () => {
      mockGenbaDb.getGenbaWorkerLinkById.mockResolvedValue(LINK());
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW_GUEST);
      mockGenbaDb.updateGenbaWorkerLink.mockResolvedValue(LINK({ active: false }));
      await leader().genba.workerLinks.setActive({ id: LINK().id, active: false });
      expect(mockGenbaDb.updateGenbaWorkerLink).toHaveBeenCalledWith(LINK().id, { active: false });
      await leader().genba.workerLinks.remove({ id: LINK().id });
      expect(mockGenbaDb.deleteGenbaWorkerLink).toHaveBeenCalledWith(LINK().id);
    });

    it("list: 名簿情報 (displayName/kind) を同梱", async () => {
      mockGenbaDb.listGenbaWorkerLinksBySite.mockResolvedValue([LINK()]);
      mockGenbaDb.listGenbaSiteWorkersByIds.mockResolvedValue([SW_GUEST]);
      const res = await leader().genba.workerLinks.list({ siteId: SITE.id });
      expect(res[0]).toMatchObject({ displayName: "応援太郎", kind: "guest", token: LINK().token });
    });
  });

  describe("公開 view (未ログイン・トークン認証)", () => {
    it("不明トークンは ok:false/invalid、無効化は disabled、期限切れは expired", async () => {
      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(null);
      let res = await anon().genba.workerLink.view({ token: "unknown_token_123" });
      expect(res).toEqual({ ok: false, reason: "invalid" });

      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ active: false }));
      res = await anon().genba.workerLink.view({ token: LINK().token });
      expect(res).toEqual({ ok: false, reason: "disabled" });

      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ expiresAt: new Date(Date.now() - 1000) }));
      res = await anon().genba.workerLink.view({ token: LINK().token });
      expect(res).toEqual({ ok: false, reason: "expired" });
    });

    it("アーカイブ済み現場は invalid (内容を出さない)", async () => {
      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK());
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW_GUEST);
      mockGenbaDb.getGenbaSiteById.mockResolvedValue({ ...SITE, archived: true });
      const res = await anon().genba.workerLink.view({ token: LINK().token });
      expect(res).toEqual({ ok: false, reason: "invalid" });
    });

    it("workerリンク: 自分の担当タスクだけ・自分のゾーンだけ・全員宛て指示のみ。lastAccess 打刻・内部情報は出ない", async () => {
      mockPublicHappyPath();
      const res = await anon().genba.workerLink.view({ token: LINK().token });
      if (!res.ok) throw new Error("expected ok");
      expect(res.me).toEqual({ displayName: "応援太郎", kind: "guest", role: "worker" });
      expect(res.myTasks.map((t) => t.id)).toEqual(["t1"]); // t2(未割当), t3(他ゾーン) は出ない
      // 図面はアプリ内と同様に全体が見える。自分の担当エリアは mine=true で示す
      expect(res.zones).toHaveLength(2);
      expect(res.zones.find((z) => z.id === ZONE.id)?.mine).toBe(true);
      expect(res.zones.find((z) => z.id === "Genba_Beta_Z2")?.mine).toBe(false);
      expect(res.instructions.map((i) => i.id)).toEqual(["i1"]); // 全員宛てのみ (個人宛user99は出ない)
      expect(mockGenbaDb.touchGenbaWorkerLinkAccess).toHaveBeenCalledWith(LINK().id);
      const raw = JSON.stringify(res);
      expect(raw).not.toContain("社内メモ"); // memo 非公開
      expect(raw).not.toContain("internal.example"); // linkUrl 非公開
      expect(raw).not.toContain("drive.example"); // driveUrl 非公開
    });

    it("leaderリンク: 現場の全葉タスクが更新対象・全ゾーンが mine", async () => {
      mockPublicHappyPath();
      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ role: "leader" }));
      const res = await anon().genba.workerLink.view({ token: LINK().token });
      if (!res.ok) throw new Error("expected ok");
      expect(res.myTasks.map((t) => t.id).sort()).toEqual(["t1", "t2", "t3"]);
      expect(res.zones.every((z) => z.mine)).toBe(true);
    });

    it("作業員向けメモ (memoVisible) は公開・非公開メモは返さない", async () => {
      mockPublicHappyPath();
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([
        T("t1", { memo: "作業員向けの手順メモ", memoVisible: true }),
        T("t2"),
        T("t3", { zoneId: "Genba_Beta_Z2" }),
      ]);
      const res = await anon().genba.workerLink.view({ token: LINK().token });
      if (!res.ok) throw new Error("expected ok");
      expect(res.myTasks[0].memo).toBe("作業員向けの手順メモ");
      const raw = JSON.stringify(res);
      expect(raw).not.toContain("社内メモ"); // memoVisible=false のメモ (t2/t3) は出ない
    });
  });

  describe("公開 setStatus / reply", () => {
    it("自分の担当は更新できる (done→100・イベント記名・監査ログ)", async () => {
      mockPublicHappyPath();
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(T("t1"));
      mockGenbaDb.updateGenbaTask.mockResolvedValue(T("t1", { status: "done", percent: 100 }));
      const res = await anon().genba.workerLink.setStatus({ token: LINK().token, taskId: "t1", status: "done" });
      expect(res?.status).toBe("done");
      expect(mockGenbaDb.updateGenbaTask).toHaveBeenCalledWith("t1", expect.objectContaining({ status: "done", percent: 100 }));
      const ev = mockGenbaDb.createGenbaTaskEvent.mock.calls[0][0];
      expect(ev.byUserId).toBeNull(); // ゲストは users.id を持たない
      expect(ev.text).toContain("応援太郎"); // 記名は text に残す
      expect(mockDb.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "genba.workerLink.setStatus" }));
    });

    it("workerリンクは他人の作業を更新できない (FORBIDDEN)", async () => {
      mockPublicHappyPath();
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(T("t2"));
      await expect(anon().genba.workerLink.setStatus({ token: LINK().token, taskId: "t2", status: "done" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockGenbaDb.updateGenbaTask).not.toHaveBeenCalled();
    });

    it("leaderリンクは現場内のどの葉タスクも更新できる", async () => {
      mockPublicHappyPath();
      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ role: "leader" }));
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(T("t2"));
      mockGenbaDb.updateGenbaTask.mockResolvedValue(T("t2", { status: "progress", percent: 25 }));
      const res = await anon().genba.workerLink.setStatus({ token: LINK().token, taskId: "t2", status: "progress", percent: 25 });
      expect(res?.percent).toBe(25);
    });

    it("無効化されたリンクからの更新は FORBIDDEN", async () => {
      mockGenbaDb.getGenbaWorkerLinkByToken.mockResolvedValue(LINK({ active: false }));
      await expect(anon().genba.workerLink.setStatus({ token: LINK().token, taskId: "t1", status: "done" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("問題報告は写真をR2へ保存しキーのみイベントへ", async () => {
      mockPublicHappyPath();
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(T("t1"));
      mockGenbaDb.updateGenbaTask.mockResolvedValue(T("t1", { status: "issue" }));
      await anon().genba.workerLink.setStatus({
        token: LINK().token, taskId: "t1", status: "issue", issueText: "配管が干渉",
        photos: [{ base64: Buffer.from("x").toString("base64"), mimeType: "image/jpeg", fileName: "p.jpg" }],
      });
      expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
      const ev = mockGenbaDb.createGenbaTaskEvent.mock.calls[0][0];
      expect(ev.kind).toBe("issue");
      expect(Array.isArray(ev.photoKeys)).toBe(true);
      expect(String(ev.photoKeys[0])).toContain("genba/task-t1/");
    });

    it("reply: 自分の担当にコメントできる", async () => {
      mockPublicHappyPath();
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(T("t1"));
      const res = await anon().genba.workerLink.reply({ token: LINK().token, taskId: "t1", text: "資材が足りません" });
      expect(res.success).toBe(true);
      const ev = mockGenbaDb.createGenbaTaskEvent.mock.calls[0][0];
      expect(ev.kind).toBe("reply");
      expect(ev.text).toContain("資材が足りません");
    });
  });

  it("GENBA_ENABLED=false で公開ビューも遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(anon().genba.workerLink.view({ token: "whatever_token" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
