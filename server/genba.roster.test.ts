import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  syncSiteRosterFromAttendance: vi.fn(),
  listAssignableUsers: vi.fn(),
  getGenbaTaskById: vi.fn(),
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  getGenbaSiteWorkerById: vi.fn(),
  addGuestAssignee: vi.fn(),
  removeGuestAssignee: vi.fn(),
  listGenbaTasksByZone: vi.fn(),
  listTaskAssigneesByTaskIds: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGuestAssigneesByTaskIds: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ id: 2, appRole: "worker" as any })));

const TASK = { id: "Genba_Beta_Task_01", zoneId: "Genba_Beta_Zone_01", parentTaskId: null, name: "配管", romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const ZONE = { id: "Genba_Beta_Zone_01", floorId: "Genba_Beta_Floor_01", parentZoneId: null, name: "1工区", polygon: [], priority: null, workStatus: null, color: null, fillOpacity: null, createdAt: new Date(), updatedAt: new Date() };
const FLOOR = { id: "Genba_Beta_Floor_01", siteId: "Genba_Beta_Site_01", name: "1F", imageKey: null, w: null, h: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const SW = (o: any = {}) => ({ id: "Genba_Beta_SW_01", siteId: "Genba_Beta_Site_01", userId: null, employeeId: null, guestName: "応援 太郎", kind: "guest", displayName: "応援 太郎", active: true, createdAt: new Date(), updatedAt: new Date(), ...o });

describe("genba 現場名簿 / ゲスト割当 (G1)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("users.siteRoster", () => {
    it("案件連携済み現場は出面由来の名簿 (登録+ゲスト) を linked=true で返す", async () => {
      mockGenbaDb.syncSiteRosterFromAttendance.mockResolvedValue([
        { siteWorkerId: "Genba_Beta_SW_u", kind: "registered", userId: 10, employeeId: 5, displayName: "山田", appRole: "worker" },
        { siteWorkerId: "Genba_Beta_SW_g", kind: "guest", userId: null, employeeId: null, displayName: "応援 太郎", appRole: null },
      ]);
      const res = await worker().genba.users.siteRoster({ siteId: "Genba_Beta_Site_01" });
      expect(res.linked).toBe(true);
      expect(res.roster).toHaveLength(2);
      expect(res.roster.find((r) => r.kind === "guest")?.displayName).toBe("応援 太郎");
      // 出面フィルタが働くこと = listAssignableUsers(全件) へフォールバックしない
      expect(mockGenbaDb.listAssignableUsers).not.toHaveBeenCalled();
    });

    it("案件未連携 (sync が null) は全ユーザーへフォールバックし linked=false", async () => {
      mockGenbaDb.syncSiteRosterFromAttendance.mockResolvedValue(null);
      mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 10, name: "山田", appRole: "worker" }]);
      const res = await worker().genba.users.siteRoster({ siteId: "Genba_Beta_Site_01" });
      expect(res.linked).toBe(false);
      expect(res.roster[0]).toMatchObject({ userId: 10, kind: "registered", siteWorkerId: null, displayName: "山田" });
    });
  });

  describe("tasks.assignGuest", () => {
    function mockChainOk() {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
    }

    it("同一現場の名簿行なら割当できる (id生成・監査ログ)", async () => {
      mockChainOk();
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW());
      const res = await leader().genba.tasks.assignGuest({ taskId: TASK.id, siteWorkerId: "Genba_Beta_SW_01", on: true });
      expect(res.success).toBe(true);
      const arg = mockGenbaDb.addGuestAssignee.mock.calls[0][0];
      expect(arg.taskId).toBe(TASK.id);
      expect(arg.siteWorkerId).toBe("Genba_Beta_SW_01");
      expect(arg.id).toBeTruthy();
      expect(mockDb.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "genba.tasks.assignGuest" }));
    });

    it("off で解除できる", async () => {
      mockChainOk();
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW());
      await leader().genba.tasks.assignGuest({ taskId: TASK.id, siteWorkerId: "Genba_Beta_SW_01", on: false });
      expect(mockGenbaDb.removeGuestAssignee).toHaveBeenCalledWith(TASK.id, "Genba_Beta_SW_01");
      expect(mockGenbaDb.addGuestAssignee).not.toHaveBeenCalled();
    });

    it("別現場の名簿行は BAD_REQUEST (現場一致の検証)", async () => {
      mockChainOk();
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(SW({ siteId: "Genba_Beta_Site_OTHER" }));
      await expect(leader().genba.tasks.assignGuest({ taskId: TASK.id, siteWorkerId: "Genba_Beta_SW_01", on: true }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockGenbaDb.addGuestAssignee).not.toHaveBeenCalled();
    });

    it("名簿に無い id は NOT_FOUND / worker は FORBIDDEN", async () => {
      mockChainOk();
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue(null);
      await expect(leader().genba.tasks.assignGuest({ taskId: TASK.id, siteWorkerId: "nope", on: true }))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(worker().genba.tasks.assignGuest({ taskId: TASK.id, siteWorkerId: "Genba_Beta_SW_01", on: true }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("tasks.listByZone のゲスト同梱", () => {
    it("各作業に guestAssigneeIds を同梱する", async () => {
      mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([TASK]);
      mockGenbaDb.listTaskAssigneesByTaskIds.mockResolvedValue([]);
      mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
      mockGenbaDb.listGuestAssigneesByTaskIds.mockResolvedValue([
        { id: "x", taskId: TASK.id, siteWorkerId: "Genba_Beta_SW_01", createdAt: new Date(), updatedAt: new Date() },
      ]);
      const res = await worker().genba.tasks.listByZone({ zoneId: ZONE.id });
      expect(res[0].guestAssigneeIds).toEqual(["Genba_Beta_SW_01"]);
      expect(res[0].assigneeIds).toEqual([]);
    });
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.users.siteRoster({ siteId: "Genba_Beta_Site_01" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
