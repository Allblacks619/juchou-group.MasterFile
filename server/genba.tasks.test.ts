import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaZoneById: vi.fn(),
  listGenbaTasksByZone: vi.fn(),
  getGenbaTaskById: vi.fn(),
  createGenbaTask: vi.fn(),
  updateGenbaTask: vi.fn(),
  deleteGenbaTaskCascade: vi.fn(),
  createGenbaTaskEvent: vi.fn(),
  listGenbaTaskEvents: vi.fn(),
  listGenbaTaskTemplates: vi.fn(),
  replaceGenbaTaskTemplates: vi.fn(),
}));
const mockStorage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));

vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./storage", () => mockStorage);
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext {
  return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));

const ZONE = { id: "Genba_Beta_Zone_01", floorId: "f", parentZoneId: null, name: "1工区", polygon: [], priority: null, workStatus: null, createdAt: new Date(), updatedAt: new Date() };
const TASK = { id: "Genba_Beta_Task_01", zoneId: ZONE.id, parentTaskId: null, name: "配管", romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("genba.tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
    mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/get" });
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("listByZone は worker でも取得可", async () => {
    mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([TASK]);
    await expect(worker().genba.tasks.listByZone({ zoneId: ZONE.id })).resolves.toEqual([TASK]);
  });

  it("create は leader 可 / worker 403", async () => {
    mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
    mockGenbaDb.createGenbaTask.mockImplementation(async (d: any) => ({ ...TASK, ...d }));
    await expect(leader().genba.tasks.create({ zoneId: ZONE.id, name: "新規作業" })).resolves.toMatchObject({ name: "新規作業", status: "todo" });
    await expect(worker().genba.tasks.create({ zoneId: ZONE.id, name: "x" })).rejects.toThrow("現場編集権限がありません");
  });

  describe("setStatus (worker も可 = 現場入力)", () => {
    beforeEach(() => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      mockGenbaDb.updateGenbaTask.mockImplementation(async (_id: string, patch: any) => ({ ...TASK, ...patch }));
    });

    it("done は percent=100 / todo は percent=null / progress は指定percent", async () => {
      await worker().genba.tasks.setStatus({ id: TASK.id, status: "done" });
      expect(mockGenbaDb.updateGenbaTask).toHaveBeenCalledWith(TASK.id, expect.objectContaining({ status: "done", percent: 100 }));

      await worker().genba.tasks.setStatus({ id: TASK.id, status: "progress", percent: 25 });
      expect(mockGenbaDb.updateGenbaTask).toHaveBeenCalledWith(TASK.id, expect.objectContaining({ status: "progress", percent: 25 }));

      await worker().genba.tasks.setStatus({ id: TASK.id, status: "todo" });
      expect(mockGenbaDb.updateGenbaTask).toHaveBeenCalledWith(TASK.id, expect.objectContaining({ status: "todo", percent: null }));
    });

    it("status変更で履歴イベント(kind=status)を作成 (id はクライアント生成)", async () => {
      await worker().genba.tasks.setStatus({ id: TASK.id, status: "done" });
      const evt = mockGenbaDb.createGenbaTaskEvent.mock.calls[0][0];
      // id が無いと task_events (varchar PK, autoincrementでない) の insert が失敗する
      expect(typeof evt.id).toBe("string");
      expect(evt.id.length).toBeGreaterThan(0);
      expect(evt).toMatchObject({ taskId: TASK.id, kind: "status" });
    });

    it("問題報告: 写真をR2へPUTし、キーのみイベントに保存 (base64はDBに渡さない)", async () => {
      await worker().genba.tasks.setStatus({
        id: TASK.id, status: "issue", issueText: "スリーブ位置相違",
        photos: [{ base64: PNG, mimeType: "image/png", fileName: "photo.png" }],
      });
      expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
      const evt = mockGenbaDb.createGenbaTaskEvent.mock.calls[0][0];
      expect(evt.kind).toBe("issue");
      expect(evt.text).toBe("スリーブ位置相違");
      expect(Array.isArray(evt.photoKeys)).toBe(true);
      expect(evt.photoKeys[0]).toContain("genba/task-");
      expect(JSON.stringify(evt)).not.toContain(PNG);
      expect(mockGenbaDb.updateGenbaTask).toHaveBeenCalledWith(TASK.id, expect.objectContaining({ status: "issue", issueText: "スリーブ位置相違" }));
    });

    it("問題写真の不正MIMEは BAD_REQUEST (PUTしない)", async () => {
      await expect(worker().genba.tasks.setStatus({
        id: TASK.id, status: "issue", photos: [{ base64: PNG, mimeType: "image/png", fileName: "bad.exe" }],
      })).rejects.toThrow();
      expect(mockStorage.storagePut).not.toHaveBeenCalled();
    });
  });

  it("events は写真に署名URLを付与して返す", async () => {
    mockGenbaDb.listGenbaTaskEvents.mockResolvedValue([
      { id: 1, taskId: TASK.id, kind: "issue", byUserId: 1, text: "x", photoKeys: ["k1", "k2"], createdAt: new Date() },
    ]);
    const res = await worker().genba.tasks.events({ taskId: TASK.id });
    expect(res[0].photoUrls).toEqual(["https://r2/get", "https://r2/get"]);
  });

  it("remove は子孫ごと削除 (cascade)", async () => {
    mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
    await expect(leader().genba.tasks.remove({ id: TASK.id })).resolves.toEqual({ success: true });
    expect(mockGenbaDb.deleteGenbaTaskCascade).toHaveBeenCalledWith(TASK.id);
  });

  describe("templates", () => {
    it("get は未設定なら既定テンプレートを返す", async () => {
      mockGenbaDb.listGenbaTaskTemplates.mockResolvedValue([]);
      const res = await leader().genba.templates.get();
      expect(res.isDefault).toBe(true);
      expect(res.tree.some((n: any) => n.name === "配線")).toBe(true);
    });

    it("saveTree はツリーを平坦化して置換保存", async () => {
      mockGenbaDb.listGenbaTaskTemplates.mockResolvedValue([]);
      const res = await leader().genba.templates.saveTree({ tree: [{ name: "親", children: [{ name: "子" }] }] });
      expect(res).toMatchObject({ success: true, count: 2 });
      const rows = mockGenbaDb.replaceGenbaTaskTemplates.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows.find((r: any) => r.name === "子").parentId).toBe(rows.find((r: any) => r.name === "親").id);
    });

    it("saveTree は worker 403", async () => {
      await expect(worker().genba.templates.saveTree({ tree: [{ name: "x" }] })).rejects.toThrow("現場編集権限がありません");
    });
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.tasks.listByZone({ zoneId: ZONE.id })).rejects.toThrow("現場ビジョンは無効化されています");
  });
});
