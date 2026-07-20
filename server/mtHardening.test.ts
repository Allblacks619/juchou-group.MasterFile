import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * マルチテナント化 Phase 1d — フラグ有効化前の締め上げ検証
 * (docs/multitenant/PLAN_v1.md)
 *
 * - 他社IDの直接指定: マスタ get/update/delete は assertCompanyScope で NOT_FOUND
 *   （他社に存在を明かさない）。genba は入力の参照IDを site へ遡り FORBIDDEN。
 * - 新規作成時の会社スタンプ: create 系が ctx.companyId を行に刻む。
 * - MULTI_TENANT off（既定）/ ctx.companyId 未設定は全て素通し＝現行動作。
 */

const mockDb = vi.hoisted(() => ({
  getClientById: vi.fn(async (_id: number): Promise<any> => undefined),
  getProjectById: vi.fn(async (_id: number): Promise<any> => undefined),
  getEmployeeById: vi.fn(async (_id: number): Promise<any> => undefined),
  createClient: vi.fn(async (d: any) => ({ id: 1, ...d })),
  createProject: vi.fn(async (d: any) => ({ id: 1, ...d })),
  createEmployee: vi.fn(async (d: any) => ({ id: 1, ...d })),
  updateClient: vi.fn(async (_id: number, d: any) => ({ id: _id, ...d })),
  deleteClient: vi.fn(async (_id: number) => {}),
  createAuditLog: vi.fn(),
}));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

const genbaDbMock = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(async (_id: string): Promise<any> => undefined),
  getGenbaUserRole: vi.fn(async (_userId: number): Promise<any> => undefined),
  listGenbaMaterialPresets: vi.fn(async (_siteId?: string | null, _companyId?: number) => []),
  createGenbaSite: vi.fn(async (d: any) => ({ ...d })),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...genbaDbMock }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "MT_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function ctx(u: User, companyId?: number): TrpcContext {
  return { user: u, companyId, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => { delete process.env.MULTI_TENANT; delete process.env.GENBA_ENABLED; });

describe("マスタの他社ID直接指定は NOT_FOUND（assertCompanyScope）", () => {
  it("clientInfo.get: 他社の取引先は NOT_FOUND、同一会社は返す", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 1));
    mockDb.getClientById.mockResolvedValue({ id: 9, name: "他社取引先", companyId: 2 });
    await expect(caller.clientInfo.get({ id: 9 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    mockDb.getClientById.mockResolvedValue({ id: 10, name: "自社取引先", companyId: 1 });
    await expect(caller.clientInfo.get({ id: 10 })).resolves.toMatchObject({ id: 10 });
  });

  it("clientInfo.update / delete も他社行なら NOT_FOUND で操作されない", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 1));
    mockDb.getClientById.mockResolvedValue({ id: 9, companyId: 2 });
    await expect(caller.clientInfo.update({ id: 9, name: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.updateClient).not.toHaveBeenCalled();
    await expect(caller.clientInfo.delete({ id: 9 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.deleteClient).not.toHaveBeenCalled();
  });

  it("project.get / employee.get も他社行なら NOT_FOUND", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 1));
    mockDb.getProjectById.mockResolvedValue({ id: 5, name: "他社現場", clientId: null, companyId: 3 });
    await expect(caller.project.get({ id: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    mockDb.getEmployeeById.mockResolvedValue({ id: 7, userId: 99, companyId: 3 });
    await expect(caller.employee.get({ id: 7 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ctx.companyId 未設定（旧セッション）や行に companyId 無しは素通し＝現行動作", async () => {
    const caller = appRouter.createCaller(ctx(createUser()));
    mockDb.getClientById.mockResolvedValue({ id: 9, name: "従来行", companyId: 2 });
    await expect(caller.clientInfo.get({ id: 9 })).resolves.toMatchObject({ id: 9 });
    const caller1 = appRouter.createCaller(ctx(createUser(), 1));
    mockDb.getClientById.mockResolvedValue({ id: 11, name: "companyId無し" });
    await expect(caller1.clientInfo.get({ id: 11 })).resolves.toMatchObject({ id: 11 });
  });
});

describe("新規作成時の会社スタンプ", () => {
  it("clientInfo.create / project.create / employee.create が ctx.companyId を刻む", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 2));
    await caller.clientInfo.create({ name: "新規取引先" });
    expect(mockDb.createClient.mock.calls[0][0].companyId).toBe(2);
    await caller.project.create({ name: "新規現場", status: "active" });
    expect(mockDb.createProject.mock.calls[0][0].companyId).toBe(2);
    await caller.employee.create({ nameKanji: "新規 太郎" } as any);
    expect(mockDb.createEmployee.mock.calls[0][0].companyId).toBe(2);
  });

  it("genba sites.create も ctx.companyId を刻む", async () => {
    const caller = appRouter.createCaller(ctx(createUser(), 2));
    await caller.genba.sites.create({ name: "Genba_Beta_MT_Site" });
    expect(genbaDbMock.createGenbaSite.mock.calls[0][0].companyId).toBe(2);
  });
});

describe("genba: 他社現場への参照は FORBIDDEN（assertUserCompanyScope）", () => {
  it("MULTI_TENANT on: 他社 site を指す siteId 入力は FORBIDDEN", async () => {
    process.env.MULTI_TENANT = "true";
    genbaDbMock.getGenbaSiteById.mockResolvedValue({ id: "Genba_Beta_MT_S2", name: "他社現場", companyId: 2, archived: false });
    const caller = appRouter.createCaller(ctx(createUser(), 1));
    await expect(caller.genba.materials.listPresets({ siteId: "Genba_Beta_MT_S2" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(genbaDbMock.listGenbaMaterialPresets).not.toHaveBeenCalled();
  });

  it("MULTI_TENANT on: 自社 site なら通る", async () => {
    process.env.MULTI_TENANT = "true";
    genbaDbMock.getGenbaSiteById.mockResolvedValue({ id: "Genba_Beta_MT_S1", name: "自社現場", companyId: 1, archived: false });
    const caller = appRouter.createCaller(ctx(createUser(), 1));
    await expect(caller.genba.materials.listPresets({ siteId: "Genba_Beta_MT_S1" })).resolves.toEqual([]);
  });

  it("MULTI_TENANT off（既定）: 照合なし・site 取得すら行わない＝追加クエリゼロ", async () => {
    genbaDbMock.getGenbaSiteById.mockResolvedValue({ id: "Genba_Beta_MT_S2", companyId: 2, archived: false });
    const caller = appRouter.createCaller(ctx(createUser(), 1));
    await expect(caller.genba.materials.listPresets({ siteId: "Genba_Beta_MT_S2" })).resolves.toEqual([]);
    expect(genbaDbMock.getGenbaSiteById).not.toHaveBeenCalled();
  });
});
