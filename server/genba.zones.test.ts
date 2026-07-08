import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaFloorById: vi.fn(),
  listGenbaZonesByFloor: vi.fn(),
  getGenbaZoneById: vi.fn(),
  createGenbaZone: vi.fn(),
  updateGenbaZone: vi.fn(),
  deleteGenbaZoneCascade: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
  // M2-C: zone.create が作業テンプレートを自動適用するため
  listGenbaTaskTemplates: vi.fn(),
  createGenbaTasksBulk: vi.fn(),
}));

const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));

vi.mock("./genba/db", async () => {
  const actual = await vi.importActual<any>("./genba/db");
  return { ...actual, ...mockGenbaDb };
});
vi.mock("./db", async () => {
  const actual = await vi.importActual<any>("./db");
  return { ...actual, ...mockDb };
});

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1, openId: "genba-beta-open-id", email: "genba_beta@example.com", name: "Genba_Beta_User",
    loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "genba_beta_u1",
    mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    ...overrides,
  } as User;
}
function ctx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

const FLOOR = { id: "Genba_Beta_Floor_01", siteId: "Genba_Beta_Site_01", name: "1F", imageKey: null, w: 1200, h: 850, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const POLY = [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 100 }];
const ZONE = { id: "Genba_Beta_Zone_01", floorId: FLOOR.id, parentZoneId: null, name: "1工区", polygon: POLY, priority: 1, workStatus: null, createdAt: new Date(), updatedAt: new Date() };

describe("genba.zones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 既定: テンプレート未設定 → zone.create の自動適用は既定テンプレを一括作成 (noop mock)
    mockGenbaDb.listGenbaTaskTemplates.mockResolvedValue([]);
    mockGenbaDb.createGenbaTasksBulk.mockResolvedValue(undefined);
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));

  describe("listByFloor", () => {
    it("ゾーンに進捗/問題数を同梱して返す (タスクから集計)", async () => {
      mockGenbaDb.listGenbaZonesByFloor.mockResolvedValue([ZONE]);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([
        { id: "T1", zoneId: ZONE.id, parentTaskId: null, status: "done", percent: null },
        { id: "T2", zoneId: ZONE.id, parentTaskId: null, status: "issue", percent: null },
      ]);
      const res = await leader().genba.zones.listByFloor({ floorId: FLOOR.id });
      expect(res).toHaveLength(1);
      expect(res[0].progress).toBe(50); // (100 + 0) / 2
      expect(res[0].issues).toBe(1);
      expect(res[0].polygon).toEqual(POLY);
    });

    it("worker (閲覧) でも取得できる", async () => {
      mockGenbaDb.listGenbaZonesByFloor.mockResolvedValue([]);
      mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue([]);
      const worker = appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
      await expect(worker.genba.zones.listByFloor({ floorId: FLOOR.id })).resolves.toEqual([]);
    });
  });

  describe("create", () => {
    it("ポリゴンを検証して作成する", async () => {
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
      mockGenbaDb.createGenbaZone.mockImplementation(async (d: any) => ({ ...ZONE, ...d }));
      const res = await leader().genba.zones.create({ floorId: FLOOR.id, name: "1工区", polygon: POLY, priority: 1 });
      expect(res?.name).toBe("1工区");
      const arg = mockGenbaDb.createGenbaZone.mock.calls[0][0];
      expect(arg.polygon).toEqual(POLY);
      expect(mockDb.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "genba.zones.create" }));
    });

    it("頂点が3点未満は拒否 (作成しない)", async () => {
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
      await expect(leader().genba.zones.create({ floorId: FLOOR.id, name: "x", polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })).rejects.toThrow();
      expect(mockGenbaDb.createGenbaZone).not.toHaveBeenCalled();
    });

    it("存在しないフロアは NOT_FOUND", async () => {
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(null);
      await expect(leader().genba.zones.create({ floorId: "Genba_Beta_missing", name: "x", polygon: POLY })).rejects.toThrow("フロアが見つかりません");
    });

    it("worker は作成不可 (FORBIDDEN)", async () => {
      const worker = appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
      await expect(worker.genba.zones.create({ floorId: FLOOR.id, name: "x", polygon: POLY })).rejects.toThrow("現場編集権限がありません");
    });
  });

  describe("update / remove", () => {
    it("優先度・ポリゴンを更新できる", async () => {
      mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
      mockGenbaDb.updateGenbaZone.mockResolvedValue({ ...ZONE, priority: 2 });
      const res = await leader().genba.zones.update({ id: ZONE.id, priority: 2 });
      expect(res?.priority).toBe(2);
      expect(mockGenbaDb.updateGenbaZone).toHaveBeenCalledWith(ZONE.id, { priority: 2 });
    });

    it("workStatus を null にして稼働へ戻せる", async () => {
      mockGenbaDb.getGenbaZoneById.mockResolvedValue({ ...ZONE, workStatus: "paused" });
      mockGenbaDb.updateGenbaZone.mockResolvedValue({ ...ZONE, workStatus: null });
      await leader().genba.zones.update({ id: ZONE.id, workStatus: null });
      expect(mockGenbaDb.updateGenbaZone).toHaveBeenCalledWith(ZONE.id, { workStatus: null });
    });

    it("削除はサブエリア・配下作業ごと (cascade)", async () => {
      mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
      const res = await leader().genba.zones.remove({ id: ZONE.id });
      expect(res).toEqual({ success: true });
      expect(mockGenbaDb.deleteGenbaZoneCascade).toHaveBeenCalledWith(ZONE.id);
    });

    it("存在しないエリアの更新は NOT_FOUND", async () => {
      mockGenbaDb.getGenbaZoneById.mockResolvedValue(null);
      await expect(leader().genba.zones.update({ id: "Genba_Beta_missing", name: "x" })).rejects.toThrow("エリアが見つかりません");
    });

    it("塗り色と不透明度を更新できる (色は #RRGGBB)", async () => {
      mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
      mockGenbaDb.updateGenbaZone.mockResolvedValue({ ...ZONE, color: "#005AFF", fillOpacity: 40 });
      const res = await leader().genba.zones.update({ id: ZONE.id, color: "#005AFF", fillOpacity: 40 });
      expect(res).toMatchObject({ color: "#005AFF", fillOpacity: 40 });
      expect(mockGenbaDb.updateGenbaZone).toHaveBeenCalledWith(ZONE.id, { color: "#005AFF", fillOpacity: 40 });
    });

    it("色 null で優先度色に戻せる", async () => {
      mockGenbaDb.getGenbaZoneById.mockResolvedValue({ ...ZONE, color: "#005AFF" });
      mockGenbaDb.updateGenbaZone.mockResolvedValue({ ...ZONE, color: null, fillOpacity: null });
      await leader().genba.zones.update({ id: ZONE.id, color: null, fillOpacity: null });
      expect(mockGenbaDb.updateGenbaZone).toHaveBeenCalledWith(ZONE.id, { color: null, fillOpacity: null });
    });

    it("不正な色形式・範囲外の不透明度は拒否", async () => {
      await expect(leader().genba.zones.update({ id: ZONE.id, color: "red" as any })).rejects.toThrow();
      await expect(leader().genba.zones.update({ id: ZONE.id, color: "#12345" as any })).rejects.toThrow();
      await expect(leader().genba.zones.update({ id: ZONE.id, fillOpacity: 101 })).rejects.toThrow();
      await expect(leader().genba.zones.update({ id: ZONE.id, fillOpacity: -1 })).rejects.toThrow();
      expect(mockGenbaDb.updateGenbaZone).not.toHaveBeenCalled();
    });
  });

  describe("GENBA_ENABLED=false", () => {
    it("全手続きが FORBIDDEN", async () => {
      process.env.GENBA_ENABLED = "false";
      await expect(leader().genba.zones.listByFloor({ floorId: FLOOR.id })).rejects.toThrow("現場ビジョンは無効化されています");
    });
  });
});
