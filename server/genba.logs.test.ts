import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  listGenbaActivityLogs: vi.fn(),
  collectSiteGraph: vi.fn(),
  listGenbaTaskTemplates: vi.fn(),
  listGenbaMaterialPresets: vi.fn(),
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

describe("genba.logs / insights (M4-D)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("list は field 限定 (worker 403)", async () => {
    await expect(worker().genba.logs.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("list は直近ログを返す", async () => {
    mockGenbaDb.listGenbaActivityLogs.mockResolvedValue([{ id: 2, type: "material", byUserId: 1, payload: { name: "x" }, createdAt: new Date() }]);
    const res = await leader().genba.logs.list({ limit: 10 });
    expect(res).toHaveLength(1);
    expect(mockGenbaDb.listGenbaActivityLogs).toHaveBeenCalledWith(undefined, 10);
  });

  it("insights は field 限定 (worker 403)", async () => {
    await expect(worker().genba.logs.insights({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("insights はログ+現場データから提案/統計を集計", async () => {
    mockGenbaDb.listGenbaActivityLogs.mockResolvedValue([
      { id: 1, type: "material", byUserId: 1, payload: { siteId: "Genba_Beta_Site_01", name: "アイボルト M10", qty: 5, unit: "個", freeInput: true }, createdAt: new Date() },
      { id: 2, type: "material", byUserId: 1, payload: { siteId: "Genba_Beta_Site_01", name: "アイボルト M10", qty: 3, unit: "個", freeInput: true }, createdAt: new Date() },
      { id: 3, type: "issue", byUserId: 1, payload: { zoneId: "z1" }, createdAt: new Date() },
    ]);
    mockGenbaDb.collectSiteGraph.mockResolvedValue({
      floors: [], zones: [{ id: "z1", name: "1工区" }], tasks: [{ name: "配管" }],
    });
    mockGenbaDb.listGenbaTaskTemplates.mockResolvedValue([
      { id: "tpl1", parentId: null, name: "配管" }, { id: "tpl2", parentId: null, name: "未使用作業" },
    ]);
    mockGenbaDb.listGenbaMaterialPresets.mockResolvedValue([]);
    const res = await leader().genba.logs.insights({ siteId: "Genba_Beta_Site_01" });
    expect(res.promoteCandidates).toEqual([{ name: "アイボルト M10", count: 2 }]);
    expect(res.unusedTemplates).toEqual(["未使用作業"]);
    expect(res.stats.issueCount).toBe(1);
    expect(res.topMaterials[0]).toEqual({ name: "アイボルト M10", qty: 8 });
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(leader().genba.logs.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
