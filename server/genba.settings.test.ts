import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaUserSettings: vi.fn(),
  upsertGenbaUserSettings: vi.fn(),
}));

vi.mock("./genba/db", async () => {
  const actual = await vi.importActual<any>("./genba/db");
  return { ...actual, ...mockGenbaDb };
});

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 7,
    openId: "genba-beta-open-id",
    email: "genba_beta@example.com",
    name: "Genba_Beta_User",
    loginMethod: "manus",
    role: "user",
    appRole: "worker" as any,
    loginId: "genba_beta_u7",
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

const BETA_SETTINGS = {
  userId: 7,
  color: "#ffcc00",
  theme: "dark",
  lang: "ja",
  guideSeen: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("genba.me / genba.settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("genba.me", () => {
    it("設定行が無ければデフォルトを生成して返す", async () => {
      mockGenbaDb.getGenbaUserSettings.mockResolvedValue(null);
      mockGenbaDb.upsertGenbaUserSettings.mockResolvedValue({ ...BETA_SETTINGS, color: null, guideSeen: false });

      const caller = appRouter.createCaller(ctx(createUser()));
      const me = await caller.genba.me();

      expect(me.userId).toBe(7);
      expect(me.name).toBe("Genba_Beta_User");
      expect(me.genbaRole).toBe("worker");
      expect(mockGenbaDb.upsertGenbaUserSettings).toHaveBeenCalledWith(7, {});
      expect(me.settings.guideSeen).toBe(false);
    });

    it("既存の設定行があればそれを返す (upsertしない)", async () => {
      mockGenbaDb.getGenbaUserSettings.mockResolvedValue(BETA_SETTINGS);
      const caller = appRouter.createCaller(ctx(createUser()));
      const me = await caller.genba.me();
      expect(me.settings).toEqual(BETA_SETTINGS);
      expect(mockGenbaDb.upsertGenbaUserSettings).not.toHaveBeenCalled();
    });

    it("DB未接続でもデフォルト値で応答する", async () => {
      mockGenbaDb.getGenbaUserSettings.mockResolvedValue(null);
      mockGenbaDb.upsertGenbaUserSettings.mockRejectedValue(new Error("Database not available"));
      const caller = appRouter.createCaller(ctx(createUser()));
      const me = await caller.genba.me();
      expect(me.settings.userId).toBe(7);
      expect(me.settings.guideSeen).toBe(false);
    });

    it("genbaRole は appRole から導出される", async () => {
      mockGenbaDb.getGenbaUserSettings.mockResolvedValue(BETA_SETTINGS);
      const adminMe = await appRouter.createCaller(ctx(createUser({ appRole: "super_admin" as any }))).genba.me();
      expect(adminMe.genbaRole).toBe("admin");
      const leaderMe = await appRouter.createCaller(ctx(createUser({ appRole: "manager" as any }))).genba.me();
      expect(leaderMe.genbaRole).toBe("leader");
      const guestMe = await appRouter.createCaller(ctx(createUser({ appRole: "guest" as any }))).genba.me();
      expect(guestMe.genbaRole).toBe("worker");
    });
  });

  describe("genba.settings.update", () => {
    it("worker でも自分の設定を upsert できる", async () => {
      mockGenbaDb.upsertGenbaUserSettings.mockResolvedValue(BETA_SETTINGS);
      const caller = appRouter.createCaller(ctx(createUser()));
      const result = await caller.genba.settings.update({ color: "#ffcc00", theme: "dark", lang: "ja", guideSeen: true });
      expect(result).toEqual(BETA_SETTINGS);
      expect(mockGenbaDb.upsertGenbaUserSettings).toHaveBeenCalledWith(7, {
        color: "#ffcc00",
        theme: "dark",
        lang: "ja",
        guideSeen: true,
      });
    });

    it("部分更新では指定フィールドのみ渡す", async () => {
      mockGenbaDb.upsertGenbaUserSettings.mockResolvedValue({ ...BETA_SETTINGS, guideSeen: true });
      const caller = appRouter.createCaller(ctx(createUser()));
      await caller.genba.settings.update({ guideSeen: true });
      expect(mockGenbaDb.upsertGenbaUserSettings).toHaveBeenCalledWith(7, { guideSeen: true });
    });

    it("不正な色形式を拒否する", async () => {
      const caller = appRouter.createCaller(ctx(createUser()));
      await expect(caller.genba.settings.update({ color: "red" })).rejects.toThrow();
      await expect(caller.genba.settings.update({ color: "#ff" })).rejects.toThrow();
      expect(mockGenbaDb.upsertGenbaUserSettings).not.toHaveBeenCalled();
    });
  });
});
