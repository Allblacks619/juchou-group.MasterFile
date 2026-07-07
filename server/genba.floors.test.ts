import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  listGenbaFloorsBySite: vi.fn(),
  getGenbaFloorById: vi.fn(),
  createGenbaFloor: vi.fn(),
  updateGenbaFloor: vi.fn(),
  deleteGenbaFloor: vi.fn(),
}));

const mockStorage = vi.hoisted(() => ({
  storagePut: vi.fn(),
  storageGet: vi.fn(),
}));

const mockDb = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock("./genba/db", async () => {
  const actual = await vi.importActual<any>("./genba/db");
  return { ...actual, ...mockGenbaDb };
});

vi.mock("./storage", () => mockStorage);

vi.mock("./db", async () => {
  const actual = await vi.importActual<any>("./db");
  return { ...actual, ...mockDb };
});

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "genba-beta-open-id",
    email: "genba_beta@example.com",
    name: "Genba_Beta_User",
    loginMethod: "manus",
    role: "user",
    appRole: "manager" as any,
    loginId: "genba_beta_u1",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as User;
}

function ctx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

const BETA_SITE = {
  id: "Genba_Beta_Site_01",
  name: "Genba_Beta_現場A",
  projectId: null,
  driveUrl: null,
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const BETA_FLOOR = {
  id: "Genba_Beta_Floor_01",
  siteId: BETA_SITE.id,
  name: "1F",
  imageKey: `genba/${BETA_SITE.id}/floor-Genba_Beta_Floor_01-plan.png`,
  w: 1200,
  h: 850,
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// 1x1 PNG (base64) — validateFile を通す最小の実データ
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("genba.floors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.storagePut.mockResolvedValue({ key: BETA_FLOOR.imageKey, url: "https://r2.example/put-signed" });
    mockStorage.storageGet.mockResolvedValue({ key: BETA_FLOOR.imageKey, url: "https://r2.example/get-signed" });
  });

  afterEach(() => {
    delete process.env.GENBA_ENABLED;
  });

  const leaderCaller = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));

  describe("list", () => {
    it("フロア一覧に署名付き画像URLを同梱して返す", async () => {
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([BETA_FLOOR]);
      const result = await leaderCaller().genba.floors.list({ siteId: BETA_SITE.id });
      expect(result).toHaveLength(1);
      expect(result[0].imageUrl).toBe("https://r2.example/get-signed");
      expect(mockStorage.storageGet).toHaveBeenCalledWith(BETA_FLOOR.imageKey);
    });

    it("worker (閲覧) でも一覧取得できる", async () => {
      mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue([]);
      const workerCaller = appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
      await expect(workerCaller.genba.floors.list({ siteId: BETA_SITE.id })).resolves.toEqual([]);
    });
  });

  describe("create", () => {
    it("base64をR2へPUTしimageKeyのみDB保存する (base64はDBに渡さない)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(BETA_SITE);
      mockGenbaDb.createGenbaFloor.mockImplementation(async (data: any) => ({ ...BETA_FLOOR, ...data }));

      const result = await leaderCaller().genba.floors.create({
        id: BETA_FLOOR.id,
        siteId: BETA_SITE.id,
        name: "1F",
        base64: PNG_BASE64,
        mimeType: "image/png",
        fileName: "plan.png",
        w: 1200,
        h: 850,
      });

      // storagePut がバッファ + mimeType で呼ばれる
      expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
      const [key, buf, mime] = mockStorage.storagePut.mock.calls[0];
      expect(key).toContain(`genba/${BETA_SITE.id}/floor-${BETA_FLOOR.id}-`);
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(mime).toBe("image/png");

      // DBへ渡すのは imageKey のみ、base64 は含まない
      const savedArg = mockGenbaDb.createGenbaFloor.mock.calls[0][0];
      expect(savedArg.imageKey).toBe(key);
      expect(savedArg).not.toHaveProperty("base64");

      expect(result?.imageUrl).toBe("https://r2.example/get-signed");
      expect(mockDb.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "genba.floors.create", entityType: "genba" }));
    });

    it("存在しない現場では NOT_FOUND (R2へPUTしない)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(null);
      await expect(leaderCaller().genba.floors.create({
        siteId: "Genba_Beta_missing", name: "1F", base64: PNG_BASE64, mimeType: "image/png", fileName: "plan.png", w: 100, h: 100,
      })).rejects.toThrow("現場が見つかりません");
      expect(mockStorage.storagePut).not.toHaveBeenCalled();
    });

    it("不正なMIME/拡張子は validateFile で BAD_REQUEST (R2へPUTしない)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(BETA_SITE);
      await expect(leaderCaller().genba.floors.create({
        siteId: BETA_SITE.id, name: "1F", base64: PNG_BASE64, mimeType: "image/png", fileName: "plan.exe", w: 100, h: 100,
      })).rejects.toThrow();
      expect(mockStorage.storagePut).not.toHaveBeenCalled();
      expect(mockGenbaDb.createGenbaFloor).not.toHaveBeenCalled();
    });

    it("worker は figure編集不可 (FORBIDDEN)", async () => {
      const workerCaller = appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
      await expect(workerCaller.genba.floors.create({
        siteId: BETA_SITE.id, name: "1F", base64: PNG_BASE64, mimeType: "image/png", fileName: "plan.png", w: 100, h: 100,
      })).rejects.toThrow("現場編集権限がありません");
      expect(mockStorage.storagePut).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("フロアを削除する", async () => {
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(BETA_FLOOR);
      const result = await leaderCaller().genba.floors.remove({ id: BETA_FLOOR.id });
      expect(result).toEqual({ success: true });
      expect(mockGenbaDb.deleteGenbaFloor).toHaveBeenCalledWith(BETA_FLOOR.id);
    });

    it("存在しないフロアは NOT_FOUND", async () => {
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(null);
      await expect(leaderCaller().genba.floors.remove({ id: "Genba_Beta_missing" })).rejects.toThrow("フロアが見つかりません");
      expect(mockGenbaDb.deleteGenbaFloor).not.toHaveBeenCalled();
    });
  });

  describe("GENBA_ENABLED=false", () => {
    it("全手続きが FORBIDDEN", async () => {
      process.env.GENBA_ENABLED = "false";
      await expect(leaderCaller().genba.floors.list({ siteId: BETA_SITE.id })).rejects.toThrow("現場ビジョンは無効化されています");
    });
  });
});
