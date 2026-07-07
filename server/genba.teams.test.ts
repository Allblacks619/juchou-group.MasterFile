import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  listGenbaTeamsBySite: vi.fn(),
  getGenbaTeamById: vi.fn(),
  createGenbaTeam: vi.fn(),
  updateGenbaTeam: vi.fn(),
  deleteGenbaTeamCascade: vi.fn(),
  listGenbaTeamMembers: vi.fn(),
  addGenbaTeamMember: vi.fn(),
  removeGenbaTeamMember: vi.fn(),
  listAssignableUsers: vi.fn(),
  getGenbaTaskById: vi.fn(),
  listGenbaTasksByZone: vi.fn(),
  listTaskAssigneesByTaskIds: vi.fn(),
  listTaskTeamsByTaskIds: vi.fn(),
  addTaskAssignee: vi.fn(),
  removeTaskAssignee: vi.fn(),
  addTaskTeam: vi.fn(),
  removeTaskTeam: vi.fn(),
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

const SITE = { id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date() };
const TEAM = { id: "Genba_Beta_Team_01", siteId: SITE.id, name: "1班", createdAt: new Date(), updatedAt: new Date() };
const TASK = { id: "Genba_Beta_Task_01", zoneId: "z", parentTaskId: null, name: "配管", romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };

describe("genba.teams / assignees (M3-A)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("teams", () => {
    it("listBySite は班にメンバーuserId配列を同梱", async () => {
      mockGenbaDb.listGenbaTeamsBySite.mockResolvedValue([TEAM]);
      mockGenbaDb.listGenbaTeamMembers.mockResolvedValue([
        { id: "m1", teamId: TEAM.id, userId: 2, createdAt: new Date(), updatedAt: new Date() },
        { id: "m2", teamId: TEAM.id, userId: 3, createdAt: new Date(), updatedAt: new Date() },
      ]);
      const res = await worker().genba.teams.listBySite({ siteId: SITE.id });
      expect(res[0].memberIds.sort()).toEqual([2, 3]);
    });

    it("create は leader 可 / worker 403", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE);
      mockGenbaDb.createGenbaTeam.mockImplementation(async (d: any) => ({ ...TEAM, ...d }));
      await expect(leader().genba.teams.create({ siteId: SITE.id, name: "2班" })).resolves.toMatchObject({ name: "2班" });
      await expect(worker().genba.teams.create({ siteId: SITE.id, name: "x" })).rejects.toThrow("現場編集権限がありません");
    });

    it("setMember はトグルで追加/解除する", async () => {
      mockGenbaDb.getGenbaTeamById.mockResolvedValue(TEAM);
      await leader().genba.teams.setMember({ teamId: TEAM.id, userId: 5, on: true });
      expect(mockGenbaDb.addGenbaTeamMember).toHaveBeenCalledWith(expect.objectContaining({ teamId: TEAM.id, userId: 5 }));
      await leader().genba.teams.setMember({ teamId: TEAM.id, userId: 5, on: false });
      expect(mockGenbaDb.removeGenbaTeamMember).toHaveBeenCalledWith(TEAM.id, 5);
    });

    it("remove は班・メンバー・タスク班割当ごと削除 (cascade)", async () => {
      mockGenbaDb.getGenbaTeamById.mockResolvedValue(TEAM);
      await expect(leader().genba.teams.remove({ id: TEAM.id })).resolves.toEqual({ success: true });
      expect(mockGenbaDb.deleteGenbaTeamCascade).toHaveBeenCalledWith(TEAM.id);
    });
  });

  describe("assignees", () => {
    it("tasks.listByZone は担当者/班を同梱", async () => {
      mockGenbaDb.listGenbaTasksByZone.mockResolvedValue([TASK]);
      mockGenbaDb.listTaskAssigneesByTaskIds.mockResolvedValue([{ id: "a1", taskId: TASK.id, userId: 7, createdAt: new Date(), updatedAt: new Date() }]);
      mockGenbaDb.listTaskTeamsByTaskIds.mockResolvedValue([{ id: "tt1", taskId: TASK.id, teamId: TEAM.id, createdAt: new Date(), updatedAt: new Date() }]);
      const res = await worker().genba.tasks.listByZone({ zoneId: "z" });
      expect(res[0].assigneeIds).toEqual([7]);
      expect(res[0].teamIds).toEqual([TEAM.id]);
    });

    it("assignUser はトグルで担当を追加/解除 (id生成付き)", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      await leader().genba.tasks.assignUser({ taskId: TASK.id, userId: 9, on: true });
      const arg = mockGenbaDb.addTaskAssignee.mock.calls[0][0];
      expect(typeof arg.id).toBe("string");
      expect(arg).toMatchObject({ taskId: TASK.id, userId: 9 });
      await leader().genba.tasks.assignUser({ taskId: TASK.id, userId: 9, on: false });
      expect(mockGenbaDb.removeTaskAssignee).toHaveBeenCalledWith(TASK.id, 9);
    });

    it("assignTeam はトグルで班を追加/解除", async () => {
      mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
      await leader().genba.tasks.assignTeam({ taskId: TASK.id, teamId: TEAM.id, on: true });
      expect(mockGenbaDb.addTaskTeam).toHaveBeenCalledWith(expect.objectContaining({ taskId: TASK.id, teamId: TEAM.id }));
    });

    it("worker は担当割当 不可 (FORBIDDEN)", async () => {
      await expect(worker().genba.tasks.assignUser({ taskId: TASK.id, userId: 1, on: true })).rejects.toThrow("現場編集権限がありません");
    });
  });

  it("users.listAssignable は割り当て可能ユーザーを返す", async () => {
    mockGenbaDb.listAssignableUsers.mockResolvedValue([{ id: 1, name: "山田", appRole: "worker" }]);
    const res = await worker().genba.users.listAssignable();
    expect(res).toEqual([{ id: 1, name: "山田", appRole: "worker" }]);
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(worker().genba.teams.listBySite({ siteId: SITE.id })).rejects.toThrow("現場ビジョンは無効化されています");
  });
});
