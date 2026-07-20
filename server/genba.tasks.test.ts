import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  listGenbaTasksByZone: vi.fn(),
  getGenbaTaskById: vi.fn(),
  createGenbaTask: vi.fn(),
  updateGenbaTask: vi.fn(),
  deleteGenbaTaskCascade: vi.fn(),
  createGenbaTaskEvent: vi.fn(),
  listGenbaTaskEvents: vi.fn(),
  listGenbaTaskTemplates: vi.fn(),
  replaceGenbaTaskTemplates: vi.fn(),
  addTaskAssignee: vi.fn(),
  removeTaskAssignee: vi.fn(),
  addTaskTeam: vi.fn(),
  removeTaskTeam: vi.fn(),
  addGuestAssignee: vi.fn(),
  removeGuestAssignee: vi.fn(),
  getGenbaSiteWorkerById: vi.fn(),
  getGenbaTeamById: vi.fn(),
  listTaskAssigneesByTaskIds: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  listGuestAssigneesByTaskIds: vi.fn(),
  listUserNamesByIds: vi.fn(),
  listGenbaSiteWorkersByIds: vi.fn(),
  countGenbaTaskFilesByTaskIds: vi.fn(),
  listGenbaTaskFiles: vi.fn(),
  createGenbaTaskFile: vi.fn(),
  getGenbaTaskFileById: vi.fn(),
  deleteGenbaTaskFile: vi.fn(),
}));
const mockStorage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGet: vi.fn(), storageGetBytes: vi.fn() }));
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
    // listByZone が使う一覧系はデフォルト空 (個別テストで上書き)
    mockGenbaDb.listTaskAssigneesByTaskIds.mockResolvedValue([]);
    mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
    mockGenbaDb.listGuestAssigneesByTaskIds.mockResolvedValue([]);
    mockGenbaDb.listUserNamesByIds.mockResolvedValue(new Map());
    mockGenbaDb.listGenbaSiteWorkersByIds.mockResolvedValue([]);
    mockGenbaDb.countGenbaTaskFilesByTaskIds.mockResolvedValue(new Map());
    mockGenbaDb.listGenbaTaskFiles.mockResolvedValue([]);
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("listByZone は worker でも取得可 (担当者/班を同梱)", async () => {
    mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([TASK]);
    const res = await worker().genba.tasks.listByZone({ zoneId: ZONE.id });
    expect(res[0]).toMatchObject({ id: TASK.id, assigneeIds: [], teamIds: [] });
  });

  it("listByZone は担当者/ゲスト名をサーバ解決して返す (ゲスト閲覧で user#ID にならない)", async () => {
    mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([TASK]);
    mockGenbaDb.listTaskAssigneesByTaskIds.mockResolvedValue([{ taskId: TASK.id, userId: 810043 }]);
    mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([]);
    mockGenbaDb.listGuestAssigneesByTaskIds.mockResolvedValue([{ taskId: TASK.id, siteWorkerId: "sw1" }]);
    mockGenbaDb.listUserNamesByIds.mockResolvedValue(new Map([[810043, "野村ジェネソン"]]));
    mockGenbaDb.listGenbaSiteWorkersByIds.mockResolvedValue([{ id: "sw1", displayName: "応援太郎" }]);
    const res = await worker().genba.tasks.listByZone({ zoneId: ZONE.id });
    expect(res[0].assigneeNames).toEqual({ "810043": "野村ジェネソン" });
    expect(res[0].guestNames).toEqual({ sw1: "応援太郎" });
  });

  it("create は leader 可 / worker 403", async () => {
    mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
    mockGenbaDb.createGenbaTask.mockImplementation(async (d: any) => ({ ...TASK, ...d }));
    await expect(leader().genba.tasks.create({ zoneId: ZONE.id, name: "新規作業" })).resolves.toMatchObject({ name: "新規作業", status: "todo" });
    await expect(worker().genba.tasks.create({ zoneId: ZONE.id, name: "x" })).rejects.toThrow("現場編集権限がありません");
  });

  describe("move (親付け替え)", () => {
    const PARENT = { ...TASK, id: "Genba_Beta_Task_parent", name: "配管(メイン)", parentTaskId: null, sortOrder: 2 };
    const CHILD = { ...TASK, id: "Genba_Beta_Task_child", name: "ダクター", parentTaskId: PARENT.id, sortOrder: 0 };
    const LONE = { ...TASK, id: "Genba_Beta_Task_lone", name: "配管", parentTaskId: null, sortOrder: 5 };

    it("leader は作業を別のメイン作業の下へ移動できる (兄弟末尾へ)", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(LONE);
      mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([PARENT, CHILD, LONE]);
      mockGenbaDb.updateGenbaTask.mockImplementation(async (_id: string, patch: any) => ({ ...LONE, ...patch }));
      const res = await leader().genba.tasks.move({ id: LONE.id, parentTaskId: PARENT.id });
      expect(mockGenbaDb.updateGenbaTask).toHaveBeenCalledWith(LONE.id, { parentTaskId: PARENT.id, sortOrder: 1 });
      expect(res?.parentTaskId).toBe(PARENT.id);
    });

    it("トップ(親なし)へ戻せる", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(CHILD);
      mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([PARENT, CHILD, LONE]);
      mockGenbaDb.updateGenbaTask.mockImplementation(async (_id: string, patch: any) => ({ ...CHILD, ...patch }));
      const res = await leader().genba.tasks.move({ id: CHILD.id, parentTaskId: null });
      expect(res?.parentTaskId).toBeNull();
    });

    it("自分自身の下へは移動不可", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(PARENT);
      mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([PARENT, CHILD, LONE]);
      await expect(leader().genba.tasks.move({ id: PARENT.id, parentTaskId: PARENT.id })).rejects.toThrow("自分自身");
      expect(mockGenbaDb.updateGenbaTask).not.toHaveBeenCalled();
    });

    it("自分の子孫の下へは移動不可 (循環防止)", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(PARENT);
      mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([PARENT, CHILD, LONE]);
      await expect(leader().genba.tasks.move({ id: PARENT.id, parentTaskId: CHILD.id })).rejects.toThrow("自分の下");
      expect(mockGenbaDb.updateGenbaTask).not.toHaveBeenCalled();
    });

    it("worker は 403", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(LONE);
      await expect(worker().genba.tasks.move({ id: LONE.id, parentTaskId: PARENT.id })).rejects.toThrow("現場編集権限がありません");
    });
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

  describe("bulkAssign (まとめて配置)", () => {
    const ZONE2 = { ...ZONE, id: "Genba_Beta_Zone_02", name: "2工区" };
    const T1 = { ...TASK, id: "Genba_Beta_Task_A", zoneId: ZONE.id, name: "配線" };
    const T2 = { ...TASK, id: "Genba_Beta_Task_B", zoneId: ZONE2.id, name: "配線" };
    const FLOOR = { id: "f", siteId: "Genba_Beta_Site_01", name: "1F", imageKey: null, w: 100, h: 100, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };

    beforeEach(() => {
      mockGenbaDb.getGenbaTaskById.mockImplementation(async (id: string) => (id === T1.id ? T1 : id === T2.id ? T2 : null));
      mockGenbaDb.getGenbaZoneById.mockImplementation(async (id: string) => (id === ZONE.id ? ZONE : id === ZONE2.id ? ZONE2 : null));
      mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
    });

    it("複数エリアの作業へ userId を一括割当 (集約監査ログ1件)", async () => {
      const res = await leader().genba.tasks.bulkAssign({ taskIds: [T1.id, T2.id], userId: 7, on: true });
      expect(res).toMatchObject({ success: true, count: 2 });
      expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalledTimes(2);
      expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalledWith(expect.objectContaining({ taskId: T1.id, userId: 7 }));
      expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalledWith(expect.objectContaining({ taskId: T2.id, userId: 7 }));
      expect(mockDb.createAuditLog).toHaveBeenCalledTimes(1);
      expect(mockDb.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "genba.tasks.bulkAssign" }));
    });

    it("on:false で一括解除", async () => {
      await leader().genba.tasks.bulkAssign({ taskIds: [T1.id, T2.id], userId: 7, on: false });
      expect(mockGenbaDb.removeTaskAssignee).toHaveBeenCalledTimes(2);
      expect(mockGenbaDb.addTaskAssignee).not.toHaveBeenCalled();
    });

    it("ゲスト(siteWorkerId)一括割当は名簿の現場一致を検証", async () => {
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue({ id: "sw1", siteId: FLOOR.siteId, displayName: "応援太郎" });
      const res = await leader().genba.tasks.bulkAssign({ taskIds: [T1.id, T2.id], siteWorkerId: "sw1", on: true });
      expect(res.count).toBe(2);
      expect(mockGenbaDb.addGuestAssignee).toHaveBeenCalledTimes(2);
    });

    it("他現場の名簿ゲストは BAD_REQUEST", async () => {
      mockGenbaDb.getGenbaSiteWorkerById.mockResolvedValue({ id: "sw9", siteId: "OtherSite", displayName: "他現場" });
      await expect(leader().genba.tasks.bulkAssign({ taskIds: [T1.id], siteWorkerId: "sw9", on: true }))
        .rejects.toThrow("この現場の名簿に載っていない作業員です");
      expect(mockGenbaDb.addGuestAssignee).not.toHaveBeenCalled();
    });

    it("複数現場の作業が混在すると BAD_REQUEST", async () => {
      mockGenbaDb.getGenbaFloorById.mockImplementation(async (id: string) => ({ ...FLOOR, siteId: id === ZONE.floorId ? "SiteA" : "SiteB" }));
      // ZONE と ZONE2 は同じ floorId="f" なので、floorIdを分けるため T2 のゾーンを別フロアに
      mockGenbaDb.getGenbaZoneById.mockImplementation(async (id: string) => (id === ZONE.id ? ZONE : { ...ZONE2, floorId: "f2" }));
      mockGenbaDb.getGenbaFloorById.mockImplementation(async (id: string) => (id === "f" ? { ...FLOOR, siteId: "SiteA" } : { ...FLOOR, id: "f2", siteId: "SiteB" }));
      await expect(leader().genba.tasks.bulkAssign({ taskIds: [T1.id, T2.id], userId: 7, on: true }))
        .rejects.toThrow("複数の現場の作業は一括で配置できません");
    });

    it("worker は 403 / userIdとteamId両方指定は 400", async () => {
      await expect(worker().genba.tasks.bulkAssign({ taskIds: [T1.id], userId: 7, on: true })).rejects.toThrow("現場編集権限がありません");
      await expect(leader().genba.tasks.bulkAssign({ taskIds: [T1.id], userId: 7, teamId: "tm", on: true } as any)).rejects.toThrow();
    });
  });

  describe("files (作業ファイル)", () => {
    beforeEach(() => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/signed" });
    });

    it("list: upload は署名URLを都度発行、link は保存URLをそのまま返す (worker も閲覧可)", async () => {
      mockGenbaDb.listGenbaTaskFiles.mockResolvedValue([
        { id: "F1", taskId: TASK.id, kind: "upload", title: "強電図面", fileName: "d.pdf", storageKey: "genba/task/d.pdf", url: null, mimeType: "application/pdf", sizeBytes: 1234, sortOrder: 0, createdAt: new Date() },
        { id: "F2", taskId: TASK.id, kind: "link", title: null, fileName: null, storageKey: null, url: "https://drive.example/x", mimeType: null, sizeBytes: null, sortOrder: 1, createdAt: new Date() },
      ]);
      const res = await worker().genba.tasks.files.list({ taskId: TASK.id });
      expect(res[0]).toMatchObject({ id: "F1", kind: "upload", title: "強電図面", url: "https://r2/signed" });
      expect(res[1]).toMatchObject({ id: "F2", kind: "link", url: "https://drive.example/x" });
    });

    it("addLink: leader 可 / worker 403 / http以外は 400", async () => {
      mockGenbaDb.createGenbaTaskFile.mockImplementation(async (d: any) => ({ ...d }));
      await expect(leader().genba.tasks.files.addLink({ taskId: TASK.id, url: "https://drive.example/x", title: "図面" })).resolves.toMatchObject({ kind: "link" });
      await expect(worker().genba.tasks.files.addLink({ taskId: TASK.id, url: "https://drive.example/x" })).rejects.toThrow("現場編集権限がありません");
      await expect(leader().genba.tasks.files.addLink({ taskId: TASK.id, url: "ftp://x/y" as any })).rejects.toThrow();
    });

    it("upload: base64→R2、DBにはキーのみ。不正MIMEは 400", async () => {
      mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
      mockGenbaDb.createGenbaTaskFile.mockImplementation(async (d: any) => ({ ...d }));
      await leader().genba.tasks.files.upload({ taskId: TASK.id, base64: PNG, mimeType: "image/png", fileName: "zu.png" });
      expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
      const saved = mockGenbaDb.createGenbaTaskFile.mock.calls[0][0];
      expect(saved.kind).toBe("upload");
      expect(saved.storageKey).toContain("genba/task-");
      await expect(leader().genba.tasks.files.upload({ taskId: TASK.id, base64: PNG, mimeType: "text/plain", fileName: "x.txt" })).rejects.toThrow();
    });

    it("remove: leader 可 / worker 403", async () => {
      mockGenbaDb.getGenbaTaskFileById.mockResolvedValue({ id: "F1", taskId: TASK.id, kind: "link", url: "https://x", title: "t", fileName: null });
      await expect(leader().genba.tasks.files.remove({ id: "F1" })).resolves.toMatchObject({ success: true });
      expect(mockGenbaDb.deleteGenbaTaskFile).toHaveBeenCalledWith("F1");
      await expect(worker().genba.tasks.files.remove({ id: "F1" })).rejects.toThrow("現場編集権限がありません");
    });

    it("getBytes: upload の実体をbase64で返す (worker/ゲストも可=オフライン保存用)。link は 400", async () => {
      mockGenbaDb.getGenbaTaskFileById.mockResolvedValue({ id: "F1", taskId: TASK.id, kind: "upload", storageKey: "genba/task/d.pdf", mimeType: "application/pdf", fileName: "d.pdf" });
      mockStorage.storageGetBytes.mockResolvedValue(Buffer.from("PDFDATA"));
      const res = await worker().genba.tasks.files.getBytes({ id: "F1" });
      expect(res).toMatchObject({ mimeType: "application/pdf", fileName: "d.pdf" });
      expect(Buffer.from(res.base64, "base64").toString()).toBe("PDFDATA");

      mockGenbaDb.getGenbaTaskFileById.mockResolvedValue({ id: "F2", taskId: TASK.id, kind: "link", url: "https://x", storageKey: null });
      await expect(worker().genba.tasks.files.getBytes({ id: "F2" })).rejects.toThrow("外部リンク");
    });
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.tasks.listByZone({ zoneId: ZONE.id })).rejects.toThrow("現場ビジョンは無効化されています");
  });
});
