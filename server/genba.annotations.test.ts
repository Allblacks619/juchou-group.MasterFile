import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaFloorById: vi.fn(),
  listGenbaFloorAnnotations: vi.fn(),
  createGenbaFloorAnnotation: vi.fn(),
  getGenbaFloorAnnotationById: vi.fn(),
  deleteGenbaFloorAnnotation: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));

vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext {
  return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ id: 7, appRole: "worker" as any })));

const FLOOR = { id: "Genba_Beta_F1", siteId: "Genba_Beta_S1", name: "1F", imageKey: null, w: 1000, h: 800, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };

describe("genba.floors.annotations (図面マーキング)", () => {
  beforeEach(() => { vi.clearAllMocks(); mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR); });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("create: leader は矢印マーキングを作成できる / worker は FORBIDDEN", async () => {
    mockGenbaDb.createGenbaFloorAnnotation.mockImplementation(async (d: any) => d);
    const res = await leader().genba.floors.annotations.create({
      floorId: FLOOR.id, kind: "arrow", points: [{ x: 10, y: 20 }, { x: 100, y: 120 }], color: "#FF4B00", strokeWidth: 4,
    });
    const saved = mockGenbaDb.createGenbaFloorAnnotation.mock.calls[0][0];
    expect(saved).toMatchObject({ floorId: FLOOR.id, kind: "arrow", color: "#FF4B00", strokeWidth: 4, byUserId: 1 });
    expect(saved.points).toHaveLength(2);
    expect(res).toMatchObject({ kind: "arrow" });

    await expect(worker().genba.floors.annotations.create({ floorId: FLOOR.id, kind: "line", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] })).rejects.toThrow("現場編集権限がありません");
  });

  it("create: 図面が無ければ NOT_FOUND", async () => {
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(null);
    await expect(leader().genba.floors.annotations.create({ floorId: "x", kind: "freehand", points: [{ x: 1, y: 1 }] })).rejects.toThrow("図面が見つかりません");
  });

  it("list: worker も閲覧でき、点列を返す", async () => {
    mockGenbaDb.listGenbaFloorAnnotations.mockResolvedValue([
      { id: "a1", floorId: FLOOR.id, kind: "freehand", points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], color: "#FF4B00", strokeWidth: 3, text: null, byUserId: 1, createdAt: new Date(), updatedAt: new Date() },
    ]);
    const res = await worker().genba.floors.annotations.list({ floorId: FLOOR.id });
    expect(res[0]).toMatchObject({ id: "a1", kind: "freehand", strokeWidth: 3 });
    expect(res[0].points).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
  });

  it("remove: leader は削除できる / worker は FORBIDDEN", async () => {
    mockGenbaDb.getGenbaFloorAnnotationById.mockResolvedValue({ id: "a1", floorId: FLOOR.id });
    await expect(worker().genba.floors.annotations.remove({ id: "a1" })).rejects.toThrow("現場編集権限がありません");
    await leader().genba.floors.annotations.remove({ id: "a1" });
    expect(mockGenbaDb.deleteGenbaFloorAnnotation).toHaveBeenCalledWith("a1");
  });
});
