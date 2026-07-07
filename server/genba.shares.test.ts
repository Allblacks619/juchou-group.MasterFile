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
  collectSiteGraph: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
const mockStorage = vi.hoisted(() => ({ storageGet: vi.fn(async () => ({ url: "signed://img" })), storagePut: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));
vi.mock("./storage", async () => ({ ...(await vi.importActual<any>("./storage")), ...mockStorage }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User | null): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));
const anon = () => appRouter.createCaller(ctx(null)); // 非認証 (公開ビュー用)

const SITE = (o: any = {}) => ({ id: "Genba_Beta_Site_01", name: "◯◯ビル", projectId: null, driveUrl: "https://drive.google.com/SECRET", archived: false, createdAt: new Date(), updatedAt: new Date(), ...o });
const SHARE = (o: any = {}) => ({ id: "Genba_Beta_Share_01", siteId: "Genba_Beta_Site_01", name: "施主様向け", token: "tok_public_123", scopes: ["map", "tasks", "dash"], expiresAt: null, createdAt: new Date(), updatedAt: new Date(), ...o });
const GRAPH = {
  floors: [{ id: "f1", siteId: "Genba_Beta_Site_01", name: "1F", imageKey: "k1", w: 1000, h: 800, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }],
  zones: [{ id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, workStatus: null, createdAt: new Date(), updatedAt: new Date() }],
  tasks: [{ id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: null, status: "progress", percent: 50, priority: null, issueText: "SECRET_ISSUE", startDate: null, dueDate: null, memo: "SECRET_MEMO", memoVisible: true, linkUrl: "https://drive.google.com/SECRET", sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }],
};

describe("genba.shares (M4-C)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("管理 (field)", () => {
    it("worker は list/create/revoke 403", async () => {
      await expect(worker().genba.shares.list({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.shares.create({ siteId: "Genba_Beta_Site_01", name: "x", scopes: ["map"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.shares.revoke({ id: "s1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("create は token 生成・scopes 保存", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.createGenbaShare.mockImplementation(async (d: any) => ({ ...d }));
      const res = await leader().genba.shares.create({ siteId: "Genba_Beta_Site_01", name: "施主様向け", scopes: ["map", "dash"] });
      const arg = mockGenbaDb.createGenbaShare.mock.calls[0][0];
      expect(arg.token).toBeTruthy();
      expect(arg.token.length).toBeGreaterThanOrEqual(24);
      expect(arg.scopes).toEqual(["map", "dash"]);
      expect(res?.name).toBe("施主様向け");
    });

    it("create は不正スコープを拒否", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      await expect(leader().genba.shares.create({ siteId: "Genba_Beta_Site_01", name: "x", scopes: ["evil" as any] })).rejects.toThrow();
    });

    it("expiresAt を Date で保存", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.createGenbaShare.mockImplementation(async (d: any) => ({ ...d }));
      await leader().genba.shares.create({ siteId: "Genba_Beta_Site_01", name: "x", scopes: ["map"], expiresAt: "2026-12-31T00:00:00.000Z" });
      expect(mockGenbaDb.createGenbaShare.mock.calls[0][0].expiresAt).toBeInstanceOf(Date);
    });
  });

  describe("publicView (★非認証・漏洩防止)", () => {
    it("ログイン不要でトークンから閲覧でき、秘匿情報を含まない", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE());
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.collectSiteGraph.mockResolvedValue(GRAPH);
      const res = await anon().genba.shares.publicView({ token: "tok_public_123" });
      expect(res.site.name).toBe("◯◯ビル");
      expect(res.scopes).toContain("map");
      const json = JSON.stringify(res);
      expect(json).not.toContain("SECRET_MEMO");
      expect(json).not.toContain("SECRET_ISSUE");
      expect(json).not.toContain("drive.google.com/SECRET");
      expect(json).not.toContain("driveUrl");
      expect(res.map?.floors[0].imageUrl).toBe("signed://img");
    });

    it("不正トークンは NOT_FOUND", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(null);
      await expect(anon().genba.shares.publicView({ token: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("期限切れは NOT_FOUND (存在を明かさない)", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE({ expiresAt: new Date(Date.now() - 1000) }));
      await expect(anon().genba.shares.publicView({ token: "tok_public_123" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(mockGenbaDb.collectSiteGraph).not.toHaveBeenCalled();
    });

    it("アーカイブ現場は NOT_FOUND", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE());
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ archived: true }));
      await expect(anon().genba.shares.publicView({ token: "tok_public_123" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("scope 外 (tasks 無し) のデータは返さない", async () => {
      mockGenbaDb.getGenbaShareByToken.mockResolvedValue(SHARE({ scopes: ["map"] }));
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.collectSiteGraph.mockResolvedValue(GRAPH);
      const res = await anon().genba.shares.publicView({ token: "tok_public_123" });
      expect(res.map).toBeDefined();
      expect(res.tasks).toBeUndefined();
      expect(res.dash).toBeUndefined();
    });

    it("GENBA_ENABLED=false なら公開ビューも遮断", async () => {
      process.env.GENBA_ENABLED = "false";
      await expect(anon().genba.shares.publicView({ token: "tok_public_123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
