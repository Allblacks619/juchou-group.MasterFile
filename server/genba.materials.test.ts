import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  listGenbaMaterialRequestsBySite: vi.fn(),
  listGenbaMaterialRequestItems: vi.fn(),
  createGenbaMaterialRequest: vi.fn(),
  getGenbaMaterialRequestById: vi.fn(),
  updateGenbaMaterialRequest: vi.fn(),
  deleteGenbaMaterialRequestCascade: vi.fn(),
  aggregateGenbaMaterials: vi.fn(),
  listGenbaMaterialPresets: vi.fn(),
  getGenbaMaterialPresetById: vi.fn(),
  createGenbaMaterialPreset: vi.fn(),
  updateGenbaMaterialPreset: vi.fn(),
  deleteGenbaMaterialPreset: vi.fn(),
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
const REQ = (o: any = {}) => ({ id: "Genba_Beta_Req_01", siteId: SITE.id, byUserId: 2, status: "pending", note: null, orderedAt: null, deliveredAt: null, createdAt: new Date(), updatedAt: new Date(), ...o });

describe("genba.materials (M4-A)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("listRequests", () => {
    it("依頼に明細(items)を同梱して返す", async () => {
      mockGenbaDb.listGenbaMaterialRequestsBySite.mockResolvedValue([REQ()]);
      mockGenbaDb.listGenbaMaterialRequestItems.mockResolvedValue([
        { id: "i1", requestId: "Genba_Beta_Req_01", name: "PF管 16", qty: 3, unit: "巻" },
        { id: "i2", requestId: "Genba_Beta_Req_01", name: "ビニテ 黒", qty: 2, unit: "箱" },
      ]);
      const res = await worker().genba.materials.listRequests({ siteId: SITE.id });
      expect(res).toHaveLength(1);
      expect(res[0].items.map((i) => i.name)).toEqual(["PF管 16", "ビニテ 黒"]);
      expect(res[0].items[0]).toMatchObject({ qty: 3, unit: "巻" });
    });
  });

  describe("createRequest (worker 可)", () => {
    it("worker が依頼を作成でき、item にid付与・unit既定=個", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      mockGenbaDb.createGenbaMaterialRequest.mockImplementation(async (r: any) => REQ({ id: r.id, byUserId: r.byUserId }));
      const res = await worker(7).genba.materials.createRequest({
        siteId: SITE.id,
        note: "1-1建て込み分",
        items: [{ name: "スライドボックス", qty: 10 }, { name: "PF管", qty: 2, unit: "巻" }],
      });
      const call = mockGenbaDb.createGenbaMaterialRequest.mock.calls[0];
      const [reqArg, itemsArg] = call;
      expect(reqArg.byUserId).toBe(7);
      expect(reqArg.status).toBe("pending");
      expect(itemsArg).toHaveLength(2);
      expect(itemsArg[0].id).toBeTruthy();
      expect(itemsArg[0].unit).toBe("個"); // 未指定は個
      expect(itemsArg[1].unit).toBe("巻");
      expect(res?.items).toHaveLength(2);
      expect(mockDb.createAuditLog).toHaveBeenCalled();
    });

    it("存在しない現場は NOT_FOUND", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(null);
      await expect(worker().genba.materials.createRequest({ siteId: "nope", items: [{ name: "x", qty: 1 }] }))
        .rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("updateRequestStatus (field のみ)", () => {
    it("ordered で orderedAt を打刻", async () => {
      mockGenbaDb.getGenbaMaterialRequestById.mockResolvedValue(REQ({ status: "pending", orderedAt: null }));
      mockGenbaDb.updateGenbaMaterialRequest.mockResolvedValue(REQ({ status: "ordered" }));
      await leader().genba.materials.updateRequestStatus({ id: "Genba_Beta_Req_01", status: "ordered" });
      const patch = mockGenbaDb.updateGenbaMaterialRequest.mock.calls[0][1];
      expect(patch.status).toBe("ordered");
      expect(patch.orderedAt).toBeInstanceOf(Date);
    });

    it("delivered で deliveredAt を打刻", async () => {
      mockGenbaDb.getGenbaMaterialRequestById.mockResolvedValue(REQ({ status: "ordered", orderedAt: new Date(), deliveredAt: null }));
      mockGenbaDb.updateGenbaMaterialRequest.mockResolvedValue(REQ({ status: "delivered" }));
      await leader().genba.materials.updateRequestStatus({ id: "Genba_Beta_Req_01", status: "delivered" });
      const patch = mockGenbaDb.updateGenbaMaterialRequest.mock.calls[0][1];
      expect(patch.deliveredAt).toBeInstanceOf(Date);
    });

    it("worker は 403", async () => {
      await expect(worker().genba.materials.updateRequestStatus({ id: "Genba_Beta_Req_01", status: "ordered" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("cancelRequest", () => {
    it("worker は自分の依頼中を取り消せる", async () => {
      mockGenbaDb.getGenbaMaterialRequestById.mockResolvedValue(REQ({ byUserId: 2, status: "pending" }));
      const res = await worker(2).genba.materials.cancelRequest({ id: "Genba_Beta_Req_01" });
      expect(res.success).toBe(true);
      expect(mockGenbaDb.deleteGenbaMaterialRequestCascade).toHaveBeenCalledWith("Genba_Beta_Req_01");
    });

    it("worker は他人の依頼を取り消せない (403)", async () => {
      mockGenbaDb.getGenbaMaterialRequestById.mockResolvedValue(REQ({ byUserId: 99, status: "pending" }));
      await expect(worker(2).genba.materials.cancelRequest({ id: "Genba_Beta_Req_01" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockGenbaDb.deleteGenbaMaterialRequestCascade).not.toHaveBeenCalled();
    });

    it("worker は発注済(自分)を取り消せない (403)", async () => {
      mockGenbaDb.getGenbaMaterialRequestById.mockResolvedValue(REQ({ byUserId: 2, status: "ordered" }));
      await expect(worker(2).genba.materials.cancelRequest({ id: "Genba_Beta_Req_01" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("field は他人の依頼も取り消せる", async () => {
      mockGenbaDb.getGenbaMaterialRequestById.mockResolvedValue(REQ({ byUserId: 99, status: "ordered" }));
      const res = await leader().genba.materials.cancelRequest({ id: "Genba_Beta_Req_01" });
      expect(res.success).toBe(true);
    });
  });

  describe("aggregate (field のみ・Σ集計)", () => {
    it("集計行を返す。worker は 403", async () => {
      mockGenbaDb.aggregateGenbaMaterials.mockResolvedValue([
        { name: "PF管 16", unit: "巻", qty: 12, count: 3 },
        { name: "ビニテ 黒", unit: "箱", qty: 4, count: 2 },
      ]);
      const res = await leader().genba.materials.aggregate({ siteId: SITE.id, period: "week", pendingOnly: true });
      expect(res.rows[0].qty).toBe(12);
      expect(mockGenbaDb.aggregateGenbaMaterials).toHaveBeenCalledWith(SITE.id, expect.any(Date), true);
      await expect(worker().genba.materials.aggregate({ siteId: SITE.id }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("period=all は境界 null", async () => {
      mockGenbaDb.aggregateGenbaMaterials.mockResolvedValue([]);
      await leader().genba.materials.aggregate({ siteId: SITE.id, period: "all", pendingOnly: false });
      expect(mockGenbaDb.aggregateGenbaMaterials).toHaveBeenCalledWith(SITE.id, null, false);
    });
  });

  describe("presets", () => {
    it("listPresets は共通+現場を返す", async () => {
      mockGenbaDb.listGenbaMaterialPresets.mockResolvedValue([
        { id: "p1", siteId: null, workName: "よく使う材料", parts: ["ビニテ 黒"], createdAt: new Date(), updatedAt: new Date() },
      ]);
      const res = await worker().genba.materials.listPresets({ siteId: SITE.id });
      expect(res[0].parts).toEqual(["ビニテ 黒"]);
      expect(mockGenbaDb.listGenbaMaterialPresets).toHaveBeenCalledWith(SITE.id, undefined);
    });

    it("savePreset 新規作成 (field)", async () => {
      mockGenbaDb.createGenbaMaterialPreset.mockImplementation(async (d: any) => ({ ...d, createdAt: new Date(), updatedAt: new Date() }));
      const res = await leader().genba.materials.savePreset({ workName: "建て込みセット", parts: ["SB", "SBW"] });
      expect(res?.workName).toBe("建て込みセット");
      expect(mockGenbaDb.createGenbaMaterialPreset).toHaveBeenCalled();
    });

    it("savePreset id指定で更新", async () => {
      mockGenbaDb.getGenbaMaterialPresetById.mockResolvedValue({ id: "p1", siteId: null, workName: "旧", parts: ["a"] });
      mockGenbaDb.updateGenbaMaterialPreset.mockResolvedValue({ id: "p1", siteId: null, workName: "新", parts: ["a", "b"] });
      const res = await leader().genba.materials.savePreset({ id: "p1", workName: "新", parts: ["a", "b"] });
      expect(res?.workName).toBe("新");
      expect(mockGenbaDb.updateGenbaMaterialPreset).toHaveBeenCalledWith("p1", { workName: "新", parts: ["a", "b"] });
    });

    it("worker は savePreset/removePreset 不可 (403)", async () => {
      await expect(worker().genba.materials.savePreset({ workName: "x", parts: ["a"] }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.materials.removePreset({ id: "p1" }))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("GENBA_ENABLED=false で全遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.materials.listRequests({ siteId: SITE.id }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
