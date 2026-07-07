import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  listGenbaInstructionsBySite: vi.fn(),
  getGenbaInstructionById: vi.fn(),
  createGenbaInstruction: vi.fn(),
  listGenbaInstructionReads: vi.fn(),
  addGenbaInstructionRead: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
  getGenbaTaskById: vi.fn(),
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  addTaskAssignee: vi.fn(),
  removeTaskAssignee: vi.fn(),
  createGenbaTaskEvent: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "worker" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const worker = (id = 1) => appRouter.createCaller(ctx(createUser({ id, appRole: "worker" as any })));
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));

const SITE = "Genba_Beta_Site_01";
const TEAM = "Genba_Beta_Team_01";
function inst(id: string, targetKind: string, targetId: string | null) {
  return { id, siteId: SITE, text: "指示" + id, targetKind, targetId, zoneId: null, byUserId: 9, createdAt: new Date(), updatedAt: new Date() };
}

describe("genba.instructions / handover (M3-B)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([{ id: TEAM, siteId: SITE, name: "1班", createdAt: new Date(), updatedAt: new Date() }]);
    // user #1 は 1班 のメンバー
    mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([{ id: "m1", teamId: TEAM, userId: 1, createdAt: new Date(), updatedAt: new Date() }]);
    mockGenbaDb.listGenbaInstructionReads.mockResolvedValue([]);
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("listForMe (対象フィルタ)", () => {
    it("worker は all / 自分の班 / 自分個人 のみ受信 (他人宛は除外)", async () => {
      mockGenbaDb.listGenbaInstructionsBySite.mockResolvedValue([
        inst("i1", "all", null),
        inst("i2", "team", TEAM),        // 自分の班
        inst("i3", "team", "other-team"), // 別の班 → 除外
        inst("i4", "worker", "1"),        // 自分個人
        inst("i5", "worker", "2"),        // 他人 → 除外
      ]);
      const res = await worker(1).genba.instructions.listForMe({ siteId: SITE });
      expect(res.map((i: any) => i.id).sort()).toEqual(["i1", "i2", "i4"]);
    });

    it("leader は全件見える", async () => {
      mockGenbaDb.listGenbaInstructionsBySite.mockResolvedValue([inst("i1", "worker", "999")]);
      const res = await leader().genba.instructions.listForMe({ siteId: SITE });
      expect(res).toHaveLength(1);
    });

    it("既読フラグ・既読者IDを付与", async () => {
      mockGenbaDb.listGenbaInstructionsBySite.mockResolvedValue([inst("i1", "all", null)]);
      mockGenbaDb.listGenbaInstructionReads.mockResolvedValue([{ id: "r1", instructionId: "i1", userId: 1, readAt: new Date(), createdAt: new Date(), updatedAt: new Date() }]);
      const res = await worker(1).genba.instructions.listForMe({ siteId: SITE });
      expect(res[0].read).toBe(true);
      expect(res[0].readerIds).toEqual([1]);
    });
  });

  it("unreadCount は自分宛ての未読数", async () => {
    mockGenbaDb.listGenbaInstructionsBySite.mockResolvedValue([inst("i1", "all", null), inst("i2", "worker", "2")]);
    const n = await worker(1).genba.instructions.unreadCount({ siteId: SITE });
    expect(n).toBe(1); // i1のみ自分宛て・未読
  });

  describe("create", () => {
    it("leader 可 / worker 403", async () => {
      mockGenbaDb.createGenbaInstruction.mockImplementation(async (d: any) => d);
      await expect(leader().genba.instructions.create({ siteId: SITE, text: "全員へ", targetKind: "all" })).resolves.toBeTruthy();
      await expect(worker().genba.instructions.create({ siteId: SITE, text: "x", targetKind: "all" })).rejects.toThrow("現場編集権限がありません");
    });
    it("team/worker は対象未指定でエラー", async () => {
      await expect(leader().genba.instructions.create({ siteId: SITE, text: "x", targetKind: "team" })).rejects.toThrow("対象を指定してください");
    });
  });

  it("markRead は worker 可・既読を追加", async () => {
    mockGenbaDb.getGenbaInstructionById.mockResolvedValue(inst("i1", "all", null));
    await expect(worker(1).genba.instructions.markRead({ instructionId: "i1" })).resolves.toEqual({ success: true });
    expect(mockGenbaDb.addGenbaInstructionRead).toHaveBeenCalledWith(expect.objectContaining({ instructionId: "i1", userId: 1 }));
  });

  describe("handover", () => {
    const TASK = { id: "Genba_Beta_Task_01", zoneId: "z1", parentTaskId: null, name: "配管", romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
    beforeEach(() => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      mockGenbaDb.getGenbaZoneById.mockResolvedValue({ id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [], priority: null, workStatus: null, createdAt: new Date(), updatedAt: new Date() });
      mockGenbaDb.getGenbaFloorById.mockResolvedValue({ id: "f1", siteId: SITE, name: "1F", imageKey: null, w: 1, h: 1, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    });

    it("worker も可: 担当付替 + handoverイベント + 相手宛て指示を自動生成", async () => {
      await worker(1).genba.tasks.handover({ taskId: TASK.id, toUserId: 2, note: "残り配線お願いします" });
      expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalledWith(expect.objectContaining({ taskId: TASK.id, userId: 2 }));
      expect(mockGenbaDb.removeTaskAssignee).toHaveBeenCalledWith(TASK.id, 1);
      expect(mockGenbaDb.createGenbaTaskEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: "handover", taskId: TASK.id }));
      const instArg = mockGenbaDb.createGenbaInstruction.mock.calls[0][0];
      expect(instArg).toMatchObject({ siteId: SITE, targetKind: "worker", targetId: "2", zoneId: "z1" });
      expect(instArg.text).toContain("引き継ぎ");
    });

    it("自分自身への引き継ぎは拒否", async () => {
      await expect(worker(1).genba.tasks.handover({ taskId: TASK.id, toUserId: 1 })).rejects.toThrow("自分自身には引き継げません");
    });
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.instructions.listForMe({ siteId: SITE })).rejects.toThrow("現場ビジョンは無効化されています");
  });
});
