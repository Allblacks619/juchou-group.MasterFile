import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  updateGenbaSite: vi.fn(),
  listLinkableProjects: vi.fn(),
  getProjectPeriod: vi.fn(),
  listAssignableUsers: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));

const SITE = { id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date() };

describe("genba 現場↔案件リンク + 出面連動 (B)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("sites.listProjects", () => {
    it("案件一覧を YYYY-MM-DD に整形して返す (field)", async () => {
      mockGenbaDb.listLinkableProjects.mockResolvedValue([
        { id: 5, name: "読売ランド", status: "active", startDate: new Date("2026-05-01T00:00:00"), endDate: null },
      ]);
      const res = await leader().genba.sites.listProjects();
      expect(res[0]).toMatchObject({ id: 5, name: "読売ランド", status: "active", startDate: "2026-05-01", endDate: null });
    });
    it("worker は 403", async () => {
      await expect(worker().genba.sites.listProjects()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("sites.setProject", () => {
    it("案件を検証してリンクする", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      mockGenbaDb.getProjectPeriod.mockResolvedValue({ id: 5, name: "読売ランド", startDate: null, endDate: null });
      mockGenbaDb.updateGenbaSite.mockResolvedValue({ ...SITE, projectId: 5 });
      const res = await leader().genba.sites.setProject({ id: SITE.id, projectId: 5 });
      expect(res?.projectId).toBe(5);
      expect(mockGenbaDb.updateGenbaSite).toHaveBeenCalledWith(SITE.id, { projectId: 5 });
    });
    it("projectId=null で連携解除できる (案件検証不要)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue({ ...SITE, projectId: 5 });
      mockGenbaDb.updateGenbaSite.mockResolvedValue({ ...SITE, projectId: null });
      await leader().genba.sites.setProject({ id: SITE.id, projectId: null });
      expect(mockGenbaDb.updateGenbaSite).toHaveBeenCalledWith(SITE.id, { projectId: null });
      expect(mockGenbaDb.getProjectPeriod).not.toHaveBeenCalled();
    });
    it("存在しない案件は NOT_FOUND", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      mockGenbaDb.getProjectPeriod.mockResolvedValue(null);
      await expect(leader().genba.sites.setProject({ id: SITE.id, projectId: 999 }))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockGenbaDb.updateGenbaSite).not.toHaveBeenCalled();
    });
    it("worker は 403", async () => {
      await expect(worker().genba.sites.setProject({ id: SITE.id, projectId: 5 }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("users.listAssignable", () => {
    it("siteId を db.listAssignableUsers に渡す (出面連動)", async () => {
      mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 10, name: "山田", appRole: "worker" }]);
      const res = await leader().genba.users.listAssignable({ siteId: SITE.id });
      expect(res).toHaveLength(1);
      expect(mockGenbaDb.listAssignableUsers).toHaveBeenCalledWith(SITE.id, undefined);
    });
    it("siteId 未指定なら undefined (全ユーザー)", async () => {
      mockGenbaDb.listAssignableUsers.mockResolvedValue([]);
      await leader().genba.users.listAssignable();
      expect(mockGenbaDb.listAssignableUsers).toHaveBeenCalledWith(undefined, undefined);
    });
  });
});
