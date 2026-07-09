import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  getGenbaTaskById: vi.fn(),
  createGenbaDispatch: vi.fn(),
  getGenbaDispatchById: vi.fn(),
  listGenbaDispatchesBySite: vi.fn(),
  listGenbaDispatchAssignees: vi.fn(),
  updateGenbaDispatch: vi.fn(),
  deleteGenbaDispatchCascade: vi.fn(),
  listGenbaFloorsBySite: vi.fn(),
  listGenbaZonesByFloorIds: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ id: 1, appRole: "manager" as any })));
const worker = (id = 2) => appRouter.createCaller(ctx(createUser({ id, appRole: "worker" as any })));

const SITE = { id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date() };
const TASK = { id: "Genba_Beta_Task_01", zoneId: "Genba_Beta_Zone_01", name: "配管", status: "todo" };
const DISP = (o: any = {}) => ({ id: "Genba_Beta_Disp_01", siteId: SITE.id, zoneId: "Genba_Beta_Zone_01", taskId: TASK.id, date: "2026-07-09", memo: null, byUserId: 1, done: false, createdAt: new Date(), updatedAt: new Date(), ...o });

describe("genba.dispatches 今日の急ぎ手配 (C)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("create (field)", () => {
    it("エリア・作業・担当を検証して手配を作成 (id/担当自動生成・当日既定)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      mockGenbaDb.createGenbaDispatch.mockImplementation(async (d: any) => DISP({ id: d.id, memo: d.memo, date: d.date }));
      const res = await leader().genba.dispatches.create({
        siteId: SITE.id, zoneId: TASK.zoneId, taskId: TASK.id, memo: "急ぎ対応", userIds: [10, 20, 10],
      });
      const [dispArg, assigneesArg] = mockGenbaDb.createGenbaDispatch.mock.calls[0];
      expect(dispArg.byUserId).toBe(1);
      expect(dispArg.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); // 当日既定
      expect(assigneesArg).toHaveLength(2); // 重複10は排除
      expect(assigneesArg[0].id).toBeTruthy();
      expect(res?.assigneeIds.sort()).toEqual([10, 20]);
      expect(mockDb.createAuditLog).toHaveBeenCalled();
    });

    it("作業とエリアが一致しないと BAD_REQUEST", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      mockGenbaDb.getGenbaTaskById.mockResolvedValue({ ...TASK, zoneId: "OTHER_ZONE" });
      await expect(leader().genba.dispatches.create({ siteId: SITE.id, zoneId: "Genba_Beta_Zone_01", taskId: TASK.id, userIds: [10] }))
        .rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("担当ゼロは拒否 / worker は 403", async () => {
      await expect(leader().genba.dispatches.create({ siteId: SITE.id, zoneId: "z", taskId: "t", userIds: [] }))
        .rejects.toThrow();
      await expect(worker().genba.dispatches.create({ siteId: SITE.id, zoneId: "z", taskId: "t", userIds: [10] }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("list", () => {
    it("担当ID・エリア名・作業名を同梱", async () => {
      mockGenbaDb.listGenbaDispatchesBySite.mockResolvedValue([DISP()]);
      mockGenbaDb.listGenbaDispatchAssignees.mockResolvedValue([
        { id: "a1", dispatchId: "Genba_Beta_Disp_01", userId: 10 },
        { id: "a2", dispatchId: "Genba_Beta_Disp_01", userId: 20 },
      ]);
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([{ id: "f1", name: "1F" }]);
      mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue([{ id: "Genba_Beta_Zone_01", floorId: "f1", name: "1工区", parentZoneId: null }]);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([TASK]);
      const res = await worker().genba.dispatches.list({ siteId: SITE.id });
      expect(res[0]).toMatchObject({ zoneName: "1工区", taskName: "配管" });
      expect(res[0].assigneeIds.sort()).toEqual([10, 20]);
    });
  });

  describe("setDone", () => {
    it("field は任意の手配を対応済みにできる", async () => {
      mockGenbaDb.getGenbaDispatchById.mockResolvedValue(DISP());
      mockGenbaDb.updateGenbaDispatch.mockResolvedValue(DISP({ done: true }));
      const res = await leader().genba.dispatches.setDone({ id: "Genba_Beta_Disp_01", done: true });
      expect(res?.done).toBe(true);
    });
    it("担当作業員は自分の手配を対応済みにできる", async () => {
      mockGenbaDb.getGenbaDispatchById.mockResolvedValue(DISP());
      mockGenbaDb.listGenbaDispatchAssignees.mockResolvedValue([{ id: "a1", dispatchId: "Genba_Beta_Disp_01", userId: 2 }]);
      mockGenbaDb.updateGenbaDispatch.mockResolvedValue(DISP({ done: true }));
      const res = await worker(2).genba.dispatches.setDone({ id: "Genba_Beta_Disp_01", done: true });
      expect(res?.done).toBe(true);
    });
    it("担当外の worker は 403", async () => {
      mockGenbaDb.getGenbaDispatchById.mockResolvedValue(DISP());
      mockGenbaDb.listGenbaDispatchAssignees.mockResolvedValue([{ id: "a1", dispatchId: "Genba_Beta_Disp_01", userId: 99 }]);
      await expect(worker(2).genba.dispatches.setDone({ id: "Genba_Beta_Disp_01", done: true }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("remove", () => {
    it("field は削除できる / worker は 403", async () => {
      mockGenbaDb.getGenbaDispatchById.mockResolvedValue(DISP());
      const res = await leader().genba.dispatches.remove({ id: "Genba_Beta_Disp_01" });
      expect(res.success).toBe(true);
      expect(mockGenbaDb.deleteGenbaDispatchCascade).toHaveBeenCalledWith("Genba_Beta_Disp_01");
      await expect(worker().genba.dispatches.remove({ id: "Genba_Beta_Disp_01" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("GENBA_ENABLED=false で全遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.dispatches.list({ siteId: SITE.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
