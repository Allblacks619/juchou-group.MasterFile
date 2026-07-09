import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import { handleGenbaShareView } from "./genba/publicShare";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  // roles
  getGenbaUserRole: vi.fn(),
  listGenbaUserRoles: vi.fn(),
  setGenbaUserRole: vi.fn(),
  deleteGenbaUserRole: vi.fn(),
  listAssignableUsers: vi.fn(),
  // site workers deps
  listGenbaFloorsBySite: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  listGenbaZonesByFloorIds: vi.fn(),
  listGenbaTasksByZoneIds: vi.fn(),
  listTaskAssigneesByTaskIds: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
  // shares
  listGenbaSharesBySite: vi.fn(),
  getGenbaShareById: vi.fn(),
  getGenbaShareByToken: vi.fn(),
  createGenbaShare: vi.fn(),
  deleteGenbaShare: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
const mockStorage = vi.hoisted(() => ({ storageGet: vi.fn(async () => ({ url: "https://signed.example/img" })) }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));
vi.mock("./storage", async () => ({ ...(await vi.importActual<any>("./storage")), ...mockStorage }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const admin = () => appRouter.createCaller(ctx(createUser({ id: 1, appRole: "admin" as any })));
const leader = () => appRouter.createCaller(ctx(createUser({ id: 2, appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ id: 3, appRole: "worker" as any })));

const SITE = { id: "Genba_Beta_Site_01", name: "現場A", projectId: 42, driveUrl: "https://drive.example/secret", archived: false, createdAt: new Date(), updatedAt: new Date() };

function baseGenba() {
  mockGenbaDb.getGenbaUserRole.mockResolvedValue(null);
  mockGenbaDb.listGenbaUserRoles.mockResolvedValue(new Map());
  mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
}

describe("genba.users role override (M4-C)", () => {
  beforeEach(() => { vi.clearAllMocks(); baseGenba(); });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("役割上書きが appRole より優先される (admin→worker に降格)", async () => {
    mockGenbaDb.getGenbaUserRole.mockResolvedValue({ userId: 1, role: "worker" });
    const me = await admin().genba.me();
    expect(me.genbaRole).toBe("worker");
  });

  it("setGenbaRole は admin のみ (worker/leader は 403)", async () => {
    mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 3, name: "山田", appRole: "worker" }]);
    await expect(worker().genba.users.setGenbaRole({ userId: 3, role: "leader" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(leader().genba.users.setGenbaRole({ userId: 3, role: "leader" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("setGenbaRole: appRole 由来と異なる役割は上書き保存", async () => {
    mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 3, name: "山田", appRole: "worker" }, { id: 1, name: "管理", appRole: "admin" }]);
    await admin().genba.users.setGenbaRole({ userId: 3, role: "leader" });
    expect(mockGenbaDb.setGenbaUserRole).toHaveBeenCalledWith(3, "leader", 1);
  });

  it("setGenbaRole: appRole 由来と同じ役割なら上書きを削除", async () => {
    mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 3, name: "山田", appRole: "worker" }, { id: 1, name: "管理", appRole: "admin" }]);
    await admin().genba.users.setGenbaRole({ userId: 3, role: "worker" });
    expect(mockGenbaDb.deleteGenbaUserRole).toHaveBeenCalledWith(3);
  });

  it("最後の管理者は降格できない (BAD_REQUEST)", async () => {
    // user1 が唯一の admin。worker へ変更しようとすると拒否
    mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 1, name: "管理", appRole: "admin" }, { id: 3, name: "山田", appRole: "worker" }]);
    await expect(admin().genba.users.setGenbaRole({ userId: 1, role: "worker" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("genba.shares router (M4-C)", () => {
  beforeEach(() => { vi.clearAllMocks(); baseGenba(); });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("create/list/revoke は worker 不可 (403)", async () => {
    await expect(worker().genba.shares.list({ siteId: SITE.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(worker().genba.shares.create({ siteId: SITE.id, name: "x", scopes: { map: true, tasks: false, board: false, dash: false, showWorkerNames: false } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(worker().genba.shares.revoke({ id: "s1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("create: スコープ0件は BAD_REQUEST", async () => {
    await expect(admin().genba.shares.create({ siteId: SITE.id, name: "x", scopes: { map: false, tasks: false, board: false, dash: false, showWorkerNames: false } }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("create: トークン生成しDB保存、list はトークン同梱", async () => {
    mockGenbaDb.createGenbaShare.mockImplementation(async (d: any) => ({ ...d, createdAt: new Date() }));
    const res = await admin().genba.shares.create({ siteId: SITE.id, name: "元請け共有", scopes: { map: true, tasks: false, board: false, dash: true, showWorkerNames: false } });
    expect(res?.token).toBeTruthy();
    expect(res?.token.length).toBeGreaterThanOrEqual(24);
    expect(mockGenbaDb.createGenbaShare).toHaveBeenCalled();
  });

  it("revoke: 物理削除 (deleteGenbaShare)。存在しないと NOT_FOUND", async () => {
    mockGenbaDb.getGenbaShareById.mockResolvedValueOnce({ id: "s1", name: "共有", siteId: SITE.id, scopes: {} });
    await admin().genba.shares.revoke({ id: "s1" });
    expect(mockGenbaDb.deleteGenbaShare).toHaveBeenCalledWith("s1");
    mockGenbaDb.getGenbaShareById.mockResolvedValueOnce(null);
    await expect(admin().genba.shares.revoke({ id: "nope" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("handleGenbaShareView 公開ペイロード (M4-C・漏洩防止)", () => {
  const FLOORS = [{ id: "f1", siteId: SITE.id, name: "1F", imageKey: "k1", w: 100, h: 80, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() }];
  const ZONES = [{ id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, workStatus: null, createdAt: new Date(), updatedAt: new Date() }];
  const TASKS = [{
    id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: "Haikan", status: "issue", percent: 30,
    priority: 1, issueText: "内部の問題メモ", startDate: "2026-07-01", dueDate: "2026-07-10",
    memo: "社内メモ機密", memoVisible: true, linkUrl: "https://drive.example/secret-drawing", sortOrder: 0, createdAt: new Date(), updatedAt: new Date(),
  }];
  function seed() {
    mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
    mockGenbaDb.listGenbaFloorsBySite.mockResolvedValue(FLOORS);
    mockGenbaDb.listGenbaZonesByFloorIds.mockResolvedValue(ZONES);
    mockGenbaDb.listGenbaTasksByZoneIds.mockResolvedValue(TASKS);
    mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([{ id: "g1", name: "1班" }]);
    mockGenbaDb.listTaskAssigneesByTaskIds.mockResolvedValue([{ taskId: "t1", userId: 3 }]);
    mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
    mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([]);
    mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 3, name: "山田太郎", appRole: "worker" }]);
  }
  beforeEach(() => { vi.clearAllMocks(); seed(); });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  const share = (scopes: any, extra: any = {}) => ({ id: "sh1", siteId: SITE.id, name: "元請け共有", token: "tok", scopes: { map: false, tasks: false, board: false, dash: false, showWorkerNames: false, ...scopes }, expiresAt: null, createdAt: new Date(), updatedAt: new Date(), ...extra });

  it("不明トークンは 404 (データなし)", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(null);
    const r = await handleGenbaShareView("nope");
    expect(r.status).toBe(404);
    expect(r.body.tasks).toBeUndefined();
  });

  it("期限切れは 403 (データなし)", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ map: true }, { expiresAt: new Date(Date.now() - 1000) }));
    const r = await handleGenbaShareView("tok");
    expect(r.status).toBe(403);
    expect(r.body.floors).toBeUndefined();
  });

  it("GENBA_ENABLED=false は 404", async () => {
    process.env.GENBA_ENABLED = "false";
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ map: true }));
    const r = await handleGenbaShareView("tok");
    expect(r.status).toBe(404);
  });

  it("tasks スコープ: memo/linkUrl/issueText/memoVisible を含めない", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ tasks: true }));
    const r = await handleGenbaShareView("tok");
    expect(r.status).toBe(200);
    const json = JSON.stringify(r.body);
    expect(r.body.tasks).toHaveLength(1);
    expect(r.body.tasks[0].name).toBe("配管");
    expect("memo" in r.body.tasks[0]).toBe(false);
    expect("linkUrl" in r.body.tasks[0]).toBe(false);
    expect("issueText" in r.body.tasks[0]).toBe(false);
    expect(json).not.toContain("社内メモ機密");
    expect(json).not.toContain("secret-drawing");
    expect(json).not.toContain("内部の問題メモ");
  });

  it("share.name (内部ラベル=作業員実名の恐れ) を公開しない", async () => {
    // 作業員向けリンクは share.name に実名が入る運用。showWorkerNames=false なら実名は出さない
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ map: true }, { name: "山田太郎" }));
    const r = await handleGenbaShareView("tok");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain("山田太郎");
    expect("name" in r.body.share).toBe(false);
  });

  it("site から driveUrl / projectId が漏れない", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ dash: true }));
    const r = await handleGenbaShareView("tok");
    const json = JSON.stringify(r.body);
    expect(r.body.site).toEqual({ id: SITE.id, name: SITE.name });
    expect(json).not.toContain("drive.example/secret");
    expect(json).not.toContain("42"); // projectId
  });

  it("スコープ外の画面は返さない (tasks=false なら tasks キーなし)", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ dash: true }));
    const r = await handleGenbaShareView("tok");
    expect(r.body.tasks).toBeUndefined();
    expect(r.body.floors).toBeUndefined();
    expect(r.body.board).toBeUndefined();
    expect(r.body.dash).toBeDefined();
  });

  it("board スコープ: 既定では実名を出さず作業員A等に匿名化・userId非公開", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ board: true }));
    const r = await handleGenbaShareView("tok");
    const json = JSON.stringify(r.body);
    expect(json).not.toContain("山田太郎");
    expect(json).not.toContain('"userId"');
    // 匿名ラベルが使われている
    expect(json).toMatch(/作業員[A-Z]/);
  });

  it("board スコープ: showWorkerNames=true のときのみ実名表示", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ board: true, showWorkerNames: true }));
    const r = await handleGenbaShareView("tok");
    const json = JSON.stringify(r.body);
    expect(json).toContain("山田太郎");
    expect(json).not.toContain('"userId"');
  });

  it("dash スコープ: 集計のみ (予算・原価を含めない)", async () => {
    mockGenbaDb.getGenbaShareByToken.mockResolvedValue(share({ dash: true }));
    const r = await handleGenbaShareView("tok");
    expect(r.body.dash).toHaveProperty("overallProgress");
    expect(r.body.dash).toHaveProperty("statusCounts");
    const json = JSON.stringify(r.body);
    expect(json).not.toMatch(/contractAmount|costPerManDay|monthlyExpense|budget/i);
  });
});
