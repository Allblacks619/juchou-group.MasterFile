import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  listGenbaSites: vi.fn(),
  getGenbaSiteById: vi.fn(),
  createGenbaSite: vi.fn(),
  updateGenbaSite: vi.fn(),
}));

const mockDb = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

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
    id: 1,
    openId: "genba-beta-open-id",
    email: "genba_beta@example.com",
    name: "Genba_Beta_User",
    loginMethod: "manus",
    role: "user",
    appRole: "worker" as any,
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

describe("genba.sites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.GENBA_ENABLED;
  });

  describe("正常系 (manager = leader権限)", () => {
    const caller = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));

    it("list はアーカイブ済みを除く現場一覧を返す", async () => {
      mockGenbaDb.listGenbaSites.mockResolvedValue([BETA_SITE]);
      const result = await caller().genba.sites.list();
      expect(result).toEqual([BETA_SITE]);
      expect(mockGenbaDb.listGenbaSites).toHaveBeenCalledOnce();
    });

    it("create は現場を作成し監査ログを残す", async () => {
      mockGenbaDb.createGenbaSite.mockResolvedValue(BETA_SITE);
      const result = await caller().genba.sites.create({ id: BETA_SITE.id, name: "Genba_Beta_現場A" });
      expect(result).toEqual(BETA_SITE);
      expect(mockGenbaDb.createGenbaSite).toHaveBeenCalledWith({
        id: BETA_SITE.id,
        name: "Genba_Beta_現場A",
        projectId: null,
        driveUrl: null,
      });
      expect(mockDb.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        action: "genba.sites.create",
        entityType: "genba",
        performedBy: 1,
      }));
    });

    it("create は id 省略時にサーバー側でuidを生成する", async () => {
      mockGenbaDb.createGenbaSite.mockImplementation(async (data: any) => ({ ...BETA_SITE, ...data }));
      const result = await caller().genba.sites.create({ name: "Genba_Beta_現場B" });
      expect(result?.id).toBeTruthy();
      expect(String(result?.id).length).toBeLessThanOrEqual(24);
    });

    it("rename は現場名を変更する", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(BETA_SITE);
      mockGenbaDb.updateGenbaSite.mockResolvedValue({ ...BETA_SITE, name: "Genba_Beta_現場A改" });
      const result = await caller().genba.sites.rename({ id: BETA_SITE.id, name: "Genba_Beta_現場A改" });
      expect(result?.name).toBe("Genba_Beta_現場A改");
      expect(mockGenbaDb.updateGenbaSite).toHaveBeenCalledWith(BETA_SITE.id, { name: "Genba_Beta_現場A改" });
    });

    it("rename は存在しない現場で NOT_FOUND", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(null);
      await expect(caller().genba.sites.rename({ id: "Genba_Beta_missing", name: "x" })).rejects.toThrow("現場が見つかりません");
    });

    it("setDriveUrl は https URL を設定できる", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(BETA_SITE);
      mockGenbaDb.updateGenbaSite.mockResolvedValue({ ...BETA_SITE, driveUrl: "https://drive.google.com/x" });
      const result = await caller().genba.sites.setDriveUrl({ id: BETA_SITE.id, driveUrl: "https://drive.google.com/x" });
      expect(result?.driveUrl).toBe("https://drive.google.com/x");
    });

    it("setDriveUrl は空文字で解除 (null 保存) できる", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(BETA_SITE);
      mockGenbaDb.updateGenbaSite.mockResolvedValue(BETA_SITE);
      await caller().genba.sites.setDriveUrl({ id: BETA_SITE.id, driveUrl: "" });
      expect(mockGenbaDb.updateGenbaSite).toHaveBeenCalledWith(BETA_SITE.id, { driveUrl: null });
    });

    it("setDriveUrl は http(s) 以外のURLを拒否する", async () => {
      await expect(caller().genba.sites.setDriveUrl({ id: BETA_SITE.id, driveUrl: "ftp://example.com" })).rejects.toThrow();
      await expect(caller().genba.sites.setDriveUrl({ id: BETA_SITE.id, driveUrl: "javascript:alert(1)" })).rejects.toThrow();
      expect(mockGenbaDb.updateGenbaSite).not.toHaveBeenCalled();
    });

    it("create は空の現場名を拒否する", async () => {
      await expect(caller().genba.sites.create({ name: "" })).rejects.toThrow();
      expect(mockGenbaDb.createGenbaSite).not.toHaveBeenCalled();
    });
  });

  describe("権限", () => {
    it("worker は編集系 (create/rename/setDriveUrl) で FORBIDDEN", async () => {
      const workerCaller = appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
      await expect(workerCaller.genba.sites.create({ name: "Genba_Beta_X" })).rejects.toThrow("現場編集権限がありません");
      await expect(workerCaller.genba.sites.rename({ id: BETA_SITE.id, name: "x" })).rejects.toThrow("現場編集権限がありません");
      await expect(workerCaller.genba.sites.setDriveUrl({ id: BETA_SITE.id, driveUrl: "" })).rejects.toThrow("現場編集権限がありません");
      expect(mockGenbaDb.createGenbaSite).not.toHaveBeenCalled();
      expect(mockGenbaDb.updateGenbaSite).not.toHaveBeenCalled();
    });

    it("guest も編集系で FORBIDDEN (workerと同格)", async () => {
      const guestCaller = appRouter.createCaller(ctx(createUser({ appRole: "guest" as any })));
      await expect(guestCaller.genba.sites.create({ name: "Genba_Beta_X" })).rejects.toThrow("現場編集権限がありません");
    });

    it("worker でも list (閲覧) は可能", async () => {
      mockGenbaDb.listGenbaSites.mockResolvedValue([]);
      const workerCaller = appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
      await expect(workerCaller.genba.sites.list()).resolves.toEqual([]);
    });

    it("archive は admin のみ (manager は FORBIDDEN)", async () => {
      const managerCaller = appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
      await expect(managerCaller.genba.sites.archive({ id: BETA_SITE.id, archived: true })).rejects.toThrow("管理者権限が必要です");

      mockGenbaDb.getGenbaSiteById.mockResolvedValue(BETA_SITE);
      mockGenbaDb.updateGenbaSite.mockResolvedValue({ ...BETA_SITE, archived: true });
      const adminCaller = appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
      const result = await adminCaller.genba.sites.archive({ id: BETA_SITE.id, archived: true });
      expect(result?.archived).toBe(true);
    });

    it("未ログインは UNAUTHORIZED", async () => {
      const anonCaller = appRouter.createCaller({ user: null, req: { headers: {} } as any, res: {} as any } as any);
      await expect(anonCaller.genba.sites.list()).rejects.toThrow();
    });
  });

  describe("GENBA_ENABLED フラグ", () => {
    it("GENBA_ENABLED=false で全手続きが FORBIDDEN", async () => {
      process.env.GENBA_ENABLED = "false";
      const adminCaller = appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
      await expect(adminCaller.genba.sites.list()).rejects.toThrow("現場ビジョンは無効化されています");
      await expect(adminCaller.genba.sites.create({ name: "Genba_Beta_X" })).rejects.toThrow("現場ビジョンは無効化されています");
      await expect(adminCaller.genba.me()).rejects.toThrow("現場ビジョンは無効化されています");
    });

    it("GENBA_ENABLED 未設定 (default) では有効", async () => {
      mockGenbaDb.listGenbaSites.mockResolvedValue([]);
      const adminCaller = appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
      await expect(adminCaller.genba.sites.list()).resolves.toEqual([]);
    });
  });

  describe("M2-B以降のスタブ", () => {
    it("zones.listByFloor は NOT_IMPLEMENTED を返す (M2-Bで実装予定)", async () => {
      const adminCaller = appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
      await expect(adminCaller.genba.zones.listByFloor({ floorId: "Genba_Beta_Floor_01" })).rejects.toThrow("M2以降で実装");
    });
  });
});
