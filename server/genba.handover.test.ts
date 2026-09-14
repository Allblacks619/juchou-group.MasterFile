import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaUserRole: vi.fn(),
  getGenbaTaskById: vi.fn(),
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  listTaskIdsAssignedToUser: vi.fn(),
  addTaskAssignee: vi.fn(),
  removeTaskAssignee: vi.fn(),
  createGenbaTaskEvent: vi.fn(),
  createGenbaInstruction: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "worker" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const as = (o: Partial<User>) => appRouter.createCaller(ctx(createUser(o)));

const FLOOR = { id: "Genba_Beta_F1", siteId: "Genba_Beta_S1", name: "1F", imageKey: null, w: null, h: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const ZONE = { id: "Genba_Beta_Z1", floorId: FLOOR.id, parentZoneId: null, name: "1工区", polygon: [], priority: null, workStatus: null, color: null, fillOpacity: null, createdAt: new Date(), updatedAt: new Date() };
const TASK = { id: "Genba_Beta_T1", zoneId: ZONE.id, parentTaskId: null, name: "配管", romaji: null, status: "todo", percent: null, priority: null, issueText: null, startDate: null, dueDate: null, memo: null, memoVisible: false, linkUrl: null, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };

describe("genba.tasks.handover の担当ガード", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenbaDb.getGenbaUserRole.mockResolvedValue(null);
    mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
    mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("担当でない作業員は他人の作業を引き継がせられない", async () => {
    mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set<string>()); // 未担当
    await expect(as({ id: 5, appRole: "worker" as any }).genba.tasks.handover({ taskId: TASK.id, toUserId: 9 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    // 担当の付け替えも指示の自動生成も起きないこと
    expect(mockGenbaDb.addTaskAssignee).not.toHaveBeenCalled();
    expect(mockGenbaDb.createGenbaInstruction).not.toHaveBeenCalled();
  });

  it("担当の作業員は引き継げる (相手を追加し自分を外す)", async () => {
    mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set([TASK.id]));
    const res = await as({ id: 5, appRole: "worker" as any }).genba.tasks.handover({ taskId: TASK.id, toUserId: 9 });
    expect(res.success).toBe(true);
    expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalledWith(expect.objectContaining({ taskId: TASK.id, userId: 9 }));
    expect(mockGenbaDb.removeTaskAssignee).toHaveBeenCalledWith(TASK.id, 5);
    expect(mockGenbaDb.createGenbaInstruction).toHaveBeenCalled();
  });

  it("leader は未担当でも代理で引き継がせられる", async () => {
    mockGenbaDb.listTaskIdsAssignedToUser.mockResolvedValue(new Set<string>());
    const res = await as({ id: 1, appRole: "manager" as any }).genba.tasks.handover({ taskId: TASK.id, toUserId: 9 });
    expect(res.success).toBe(true);
    expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalled();
  });

  it("存在しない作業は NOT_FOUND", async () => {
    mockGenbaDb.getGenbaTaskById.mockResolvedValue(null);
    await expect(as({ id: 5, appRole: "worker" as any }).genba.tasks.handover({ taskId: "nope", toUserId: 9 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
