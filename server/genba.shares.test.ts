import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  listGenbaSharesBySite: vi.fn(),
  getGenbaShareById: vi.fn(),
  getGenbaShareByToken: vi.fn(),
  createGenbaShare: vi.fn(),
  deleteGenbaShare: vi.fn(),
  listGenbaFloorsBySite: vi.fn(),
  listGenbaZonesByFloorIds: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
  listTaskAssigneesByTaskIds: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  listAssignableUsers: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User | null): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const admin = () => appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
const anon = () => appRouter.createCaller(ctx(null)); // 非認証 (外部閲覧者)

const SITE = (o: any = {}) => ({ id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: "https://drive.google.com/DRIVE_LEAK", archived: false, createdAt: new Date(), updatedAt: new Date(), ...o });
const SHARE = (o: any = {}) => ({ id: "Genba_Beta_Share_01", siteId: SITE().id, name: "施主向け", token: "tok_abcdefghijklmnop", scopes: { map: true, tasks: true, dash: true }, expiresAt: null, createdAt: new Date(), updatedAt: new Date(), ...o });

describe("genba.shares (M4-C)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("create / list / revoke (field 専用)", () => {
    it("create はトークンを自動生成し scopes を保存", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.createGenbaShare.mockImplementation(async (d: any) => d);
      const res = await admin().genba.shares.create({ siteId: SITE().id, name: "施主向け", scopes: { map: true, dash: true } });
      const arg = mockGenbaDb.createGenbaShare.mock.calls[0][0];
      expect(arg.token).toBeTruthy();
      expect(arg.token.length).toBeGreaterThanOrEqual(24);
      expect(arg.scopes).toEqual({ map: true, dash: true });
      expect(res?.name).toBe("施主向け");
      expect(mockDb.createAuditLog).toHaveBeenCalled();
    });

    it("worker は create/list/revoke 不可 (403)", async () => {
      await expect(worker().genba.shares.create({ siteId: SITE().id, name: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.shares.list({ siteId: SITE().id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.shares.revoke({ id: "s1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("viewByToken (非認証・公開)", () => {
    const floors = [{ id: "f1", siteId: SITE().id, name: "1F", imageKey: null, w: 100, h: 80, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }];
    const zones = [{ id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, workStatus: null, createdAt: new Date(), updatedAt: new Date() }];
    const tasks = [{ id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: null, status: "progress", percent: 50, priority: null, issueText: "問題LEAK", startDate: null, dueDate: null, memo: "社内メモLEAK", memoVisible: true, linkUrl: "https://internal-LEAK", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }];

    function mockSiteData() {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE());
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue(floors);
      mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue(zones);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue(tasks);
    }

    it("非認証で scope 別データを返す (map/tasks/dash)", async () => {
      mockSiteData();
      const v = await anon().genba.shares.viewByToken({ token: "tok_abcdefghijklmnop" });
      expect(v.siteName).toBe("現場A");
      expect(v.map?.zones[0].id).toBe("z1");
      expect(v.tasks?.[0]).toMatchObject({ id: "t1", name: "配管", status: "progress", percent: 50 });
      expect(v.dash?.progress).toBe(50);
    });

    it("🔒 内部情報 (社内メモ・Driveリンク・問題本文・リンク) を返さない", async () => {
      mockSiteData();
      const v = await anon().genba.shares.viewByToken({ token: "tok_abcdefghijklmnop" });
      const s = JSON.stringify(v);
      expect(s).not.toContain("社内メモLEAK");
      expect(s).not.toContain("DRIVE_LEAK");
      expect(s).not.toContain("問題LEAK");
      expect(s).not.toContain("internal-LEAK");
      expect(s).not.toContain("driveUrl");
      expect(s).not.toContain("memo");
    });

    it("scope 外 (tasks 無効) はそのセクションを返さない", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE({ scopes: { map: true } }));
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue(floors);
      mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue(zones);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue(tasks);
      const v = await anon().genba.shares.viewByToken({ token: "tok_abcdefghijklmnop" });
      expect(v.map).toBeDefined();
      expect(v.tasks).toBeUndefined();
      expect(v.dash).toBeUndefined();
    });

    it("🔒 board scope でも作業員名を返さず件数のみ", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE({ scopes: { board: true } }));
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue(floors);
      mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue(zones);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue(tasks);
      mockGenbaDb.listTaskAssigneesByTaskIds.mockResolvedValue([{ taskId: "t1", userId: 10 }]);
      mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
      mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([]);
      mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 10, name: "山田LEAK", appRole: "worker" }]);
      mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([]);
      const v = await anon().genba.shares.viewByToken({ token: "tok_abcdefghijklmnop" });
      const s = JSON.stringify(v);
      expect(v.board?.[0].assignedCount).toBe(1);
      expect(s).not.toContain("山田LEAK");
    });

    it("存在しないトークンは NOT_FOUND", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(null);
      await expect(anon().genba.shares.viewByToken({ token: "tok_nonexistent_xxxxx" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("期限切れトークンは FORBIDDEN", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE({ expiresAt: new Date("2020-01-01") }));
      await expect(anon().genba.shares.viewByToken({ token: "tok_abcdefghijklmnop" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("GENBA_ENABLED=false は非認証ビューも遮断", async () => {
      process.env.GENBA_ENABLED = "false";
      await expect(anon().genba.shares.viewByToken({ token: "tok_abcdefghijklmnop" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
