import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaUserRole: vi.fn(),
  listGenbaUserRoles: vi.fn(),
  setGenbaUserRole: vi.fn(),
  deleteGenbaUserRole: vi.fn(),
  listAppAdminUserIds: vi.fn(),
  // listMine / mySummary
  listGenbaSites: vi.fn(),
  listGenbaFloorsBySite: vi.fn(),
  listGenbaZonesByFloorIds: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
  listTaskIdsAssignedToUser: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
  // me
  getGenbaUserSettings: vi.fn(),
  upsertGenbaUserSettings: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "worker" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const as = (o: Partial<User>) => appRouter.createCaller(ctx(createUser(o)));

const FLOOR = { id: "Genba_Beta_F1", siteId: "Genba_Beta_S1", name: "1F", imageKey: null, w: null, h: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const ZONE = { id: "Genba_Beta_Z1", floorId: FLOOR.id, parentZoneId: null, name: "1工区", polygon: [], priority: null, workStatus: null, color: null, fillOpacity: null, createdAt: new Date(), updatedAt: new Date() };
const T = (id: string, o: any = {}) => ({ id, zoneId: ZONE.id, parentTaskId: null, name: `task-${id}`, romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date(), ...o });

describe("genba G3: 役割上書き / 自分の作業 / サマリ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenbaDb.getGenbaUserRole.mockResolvedValue(null);
    mockGenbaDb.listGenbaUserRoles.mockResolvedValue([]);
    mockGenbaDb.getGenbaUserSettings.mockResolvedValue(null);
    mockGenbaDb.upsertGenbaUserSettings.mockResolvedValue(null);
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("役割上書き (resolveGenbaRole)", () => {
    it("上書きが appRole より優先される (worker → admin)", async () => {
      mockGenbaDb.getGenbaUserRole.mockResolvedValue({ userId: 1, role: "admin", updatedByUserId: 9, createdAt: new Date(), updatedAt: new Date() });
      const me = await as({ appRole: "worker" as any }).genba.me();
      expect(me.genbaRole).toBe("admin");
    });

    it("上書きで降格もできる (admin appRole → worker)", async () => {
      mockGenbaDb.getGenbaUserRole.mockResolvedValue({ userId: 1, role: "worker", updatedByUserId: 9, createdAt: new Date(), updatedAt: new Date() });
      await expect(as({ appRole: "admin" as any, role: "admin" }).genba.sites.archive({ id: "Genba_Beta_S1", archived: true }))
        .rejects.toMatchObject({ code: "FORBIDDEN" }); // adminProcedure が worker として拒否
    });

    it("不正な role 値は無視して appRole から導出", async () => {
      mockGenbaDb.getGenbaUserRole.mockResolvedValue({ userId: 1, role: "superduper", updatedByUserId: 9, createdAt: new Date(), updatedAt: new Date() });
      const me = await as({ appRole: "manager" as any }).genba.me();
      expect(me.genbaRole).toBe("leader");
    });

    it("参照失敗は worker へフェイルクローズ", async () => {
      mockGenbaDb.getGenbaUserRole.mockRejectedValue(new Error("db down"));
      const me = await as({ appRole: "admin" as any, role: "admin" }).genba.me();
      expect(me.genbaRole).toBe("worker");
    });
  });

  describe("users.setGenbaRole (admin専用)", () => {
    const admin = () => as({ id: 1, appRole: "admin" as any, role: "admin" });

    it("上書きを保存できる。leader/worker は 403", async () => {
      mockGenbaDb.listAppAdminUserIds.mockResolvedValue([1]);
      mockGenbaDb.listGenbaUserRoles.mockResolvedValue([]);
      const res = await admin().genba.users.setGenbaRole({ userId: 5, role: "leader" });
      expect(res.success).toBe(true);
      expect(mockGenbaDb.setGenbaUserRole).toHaveBeenCalledWith(5, "leader", 1);
      await expect(as({ appRole: "manager" as any }).genba.users.setGenbaRole({ userId: 5, role: "leader" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("role=null で上書き解除", async () => {
      mockGenbaDb.listAppAdminUserIds.mockResolvedValue([1]);
      mockGenbaDb.listGenbaUserRoles.mockResolvedValue([{ userId: 5, role: "leader" }]);
      await admin().genba.users.setGenbaRole({ userId: 5, role: null });
      expect(mockGenbaDb.deleteGenbaUserRole).toHaveBeenCalledWith(5);
    });

    it("最後の管理者は降格できない (事前チェック)", async () => {
      mockGenbaDb.listAppAdminUserIds.mockResolvedValue([1]); // 実効adminは自分だけ
      mockGenbaDb.listGenbaUserRoles.mockResolvedValue([]);
      await expect(admin().genba.users.setGenbaRole({ userId: 1, role: "worker" }))
        .rejects.toThrow("最後の管理者は降格できません");
      expect(mockGenbaDb.setGenbaUserRole).not.toHaveBeenCalled();
    });

    it("他に実効adminが居れば降格できる", async () => {
      mockGenbaDb.listAppAdminUserIds.mockResolvedValue([1, 2]);
      mockGenbaDb.listGenbaUserRoles
        .mockResolvedValueOnce([])                              // before
        .mockResolvedValueOnce([{ userId: 1, role: "worker" }]); // after (自分降格済み・2が残る)
      const res = await admin().genba.users.setGenbaRole({ userId: 1, role: "worker" });
      expect(res.success).toBe(true);
    });

    it("書き込み後に admin が0なら復旧して拒否 (レース対策)", async () => {
      mockGenbaDb.listAppAdminUserIds.mockResolvedValue([1, 2]);
      mockGenbaDb.listGenbaUserRoles
        .mockResolvedValueOnce([{ userId: 2, role: "worker" }])  // before: 2は既に降格済みだが自分視点では残1...
        .mockResolvedValueOnce([{ userId: 2, role: "worker" }, { userId: 1, role: "worker" }]); // after: 0
      await expect(admin().genba.users.setGenbaRole({ userId: 1, role: "worker" }))
        .rejects.toThrow("最後の管理者は降格できません");
    });
  });

  describe("tasks.listMine / users.mySummary", () => {
    function mockSiteData() {
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([FLOOR]);
      mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue([ZONE]);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([
        T("t1"), T("t2", { status: "issue" }), T("t3"), T("parent"), T("child", { parentTaskId: "parent" }),
      ]);
      mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set(["t1"]));
      mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([{ id: "g1", siteId: "Genba_Beta_S1", name: "1班", createdAt: new Date(), updatedAt: new Date() }]);
      mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([{ id: "m1", teamId: "g1", userId: 1, createdAt: new Date(), updatedAt: new Date() }]);
      mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([{ id: "tt1", taskId: "t2", teamId: "g1", createdAt: new Date(), updatedAt: new Date() }]);
    }

    it("listMine: 直接割当 + 班経由の葉タスクのみ (他人・親は除外)", async () => {
      mockSiteData();
      const res = await as({ id: 1, appRole: "worker" as any }).genba.tasks.listMine({ siteId: "Genba_Beta_S1" });
      expect(res.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
      expect(res[0].zoneName).toBe("1工区");
    });

    it("mySummary: 担当のある現場だけ返し issue を数える", async () => {
      mockGenbaDb.listGenbaSites.mockResolvedValue([
        { id: "Genba_Beta_S1", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date() },
      ]);
      mockSiteData();
      const res = await as({ id: 1, appRole: "worker" as any }).genba.users.mySummary();
      expect(res).toHaveLength(1);
      expect(res[0]).toMatchObject({ siteId: "Genba_Beta_S1", siteName: "現場A", taskCount: 2, issueCount: 1 });
    });

    it("mySummary: 担当ゼロの現場は返さない", async () => {
      mockGenbaDb.listGenbaSites.mockResolvedValue([
        { id: "Genba_Beta_S1", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date() },
      ]);
      mockSiteData();
      mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set());
      mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
      const res = await as({ id: 1, appRole: "worker" as any }).genba.users.mySummary();
      expect(res).toEqual([]);
    });
  });

  describe("tasks.listBySite (まとめて配置用): サブエリアの親情報つき葉タスク", () => {
    const SUBZONE = { ...ZONE, id: "Genba_Beta_Z1_sub", parentZoneId: ZONE.id, name: "1-1工区" };
    it("葉タスクに parentZoneId を付けて返す (親エリア選択で配下を対象にできる)", async () => {
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([FLOOR]);
      mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue([ZONE, SUBZONE]);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([
        { ...T("root1"), zoneId: ZONE.id },
        { ...T("subLeaf"), zoneId: SUBZONE.id },
        { ...T("subParent"), zoneId: SUBZONE.id },
        { ...T("subChild", { parentTaskId: "subParent" }), zoneId: SUBZONE.id },
      ]);
      const res = await as({ id: 1, appRole: "manager" as any }).genba.tasks.listBySite({ siteId: "Genba_Beta_S1" });
      const byId = new Map(res.map((t: any) => [t.id, t]));
      // 親作業(subParent)は除外され、葉のみ。サブエリアの葉は parentZoneId=親エリア
      expect(byId.has("subParent")).toBe(false);
      expect((byId.get("subLeaf") as any).parentZoneId).toBe(ZONE.id);
      expect((byId.get("subChild") as any).parentZoneId).toBe(ZONE.id);
      expect((byId.get("root1") as any).parentZoneId).toBeNull();
    });
  });
});
