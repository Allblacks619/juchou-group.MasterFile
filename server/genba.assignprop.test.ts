import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaTaskById: vi.fn(),
  addTaskAssignee: vi.fn(),
  removeTaskAssignee: vi.fn(),
  getGenbaZoneById: vi.fn(),
  listGenbaZonesByFloor: vi.fn(),
  listGenbaTasksByZone: vi.fn(),
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

const PARENT = "Genba_Beta_Zone_parent";
const TASK = { id: "Genba_Beta_Task_01", zoneId: PARENT, name: "配管", status: "todo" };

describe("genba.tasks.assignUser サブエリア伝播", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenbaDb.getGenbaTaskById.mockResolvedValue(TASK);
    mockGenbaDb.getGenbaZoneById.mockResolvedValue({ id: PARENT, floorId: "F1", parentZoneId: null });
    mockGenbaDb.listGenbaZonesByFloor.mockResolvedValue([
      { id: PARENT, floorId: "F1", parentZoneId: null },
      { id: "childA", floorId: "F1", parentZoneId: PARENT },
      { id: "childB", floorId: "F1", parentZoneId: PARENT },
      { id: "other", floorId: "F1", parentZoneId: null }, // 別ゾーンは対象外
    ]);
    mockGenbaDb.listGenbaTasksByZone.mockImplementation(async (zoneId: string) => {
      if (zoneId === "childA") return [{ id: "ca1", name: "配管" }, { id: "ca2", name: "配線" }];
      if (zoneId === "childB") return [{ id: "cb1", name: "配管" }];
      return [];
    });
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("親エリアで割当→サブエリアの同名作業へ自動付与 (propagated=2)", async () => {
    const res = await leader().genba.tasks.assignUser({ taskId: TASK.id, userId: 10, on: true });
    expect(res.propagated).toBe(2);
    const assigned = mockGenbaDb.addTaskAssignee.mock.calls.map((c) => c[0].taskId).sort();
    expect(assigned).toEqual(["Genba_Beta_Task_01", "ca1", "cb1"]); // 配線(ca2)・別ゾーンは除外
    mockGenbaDb.addTaskAssignee.mock.calls.forEach((c) => expect(c[0].userId).toBe(10));
  });

  it("propagate=false なら伝播しない", async () => {
    const res = await leader().genba.tasks.assignUser({ taskId: TASK.id, userId: 10, on: true, propagate: false });
    expect(res.propagated).toBe(0);
    expect(mockGenbaDb.addTaskAssignee).toHaveBeenCalledTimes(1);
  });

  it("解除(on=false)は伝播しない", async () => {
    const res = await leader().genba.tasks.assignUser({ taskId: TASK.id, userId: 10, on: false });
    expect(res.propagated).toBe(0);
    expect(mockGenbaDb.removeTaskAssignee).toHaveBeenCalledTimes(1);
    expect(mockGenbaDb.addTaskAssignee).not.toHaveBeenCalled();
  });

  it("worker は 403", async () => {
    await expect(worker().genba.tasks.assignUser({ taskId: TASK.id, userId: 10, on: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
