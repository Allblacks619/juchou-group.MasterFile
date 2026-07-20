import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaFloorById: vi.fn(),
  listGenbaFloorPinsByFloor: vi.fn(),
  createGenbaFloorPin: vi.fn(),
  getGenbaFloorPinById: vi.fn(),
  updateGenbaFloorPin: vi.fn(),
  deleteGenbaFloorPin: vi.fn(),
  listUserNamesByIds: vi.fn(),
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
const worker = () => appRouter.createCaller(ctx(createUser({ id: 7, appRole: "worker" as any })));

const FLOOR = { id: "Genba_Beta_F1", siteId: "Genba_Beta_S1", name: "1F", imageKey: null, w: 1000, h: 800, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("genba.floors.pins (図面上の位置ピン問題報告)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
    mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/get" });
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
    mockGenbaDb.listUserNamesByIds.mockResolvedValue(new Map());
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("create: worker(現場入力)が座標+写真で報告できる。写真はR2キーのみ保存(base64はDBに渡さない)", async () => {
    mockGenbaDb.createGenbaFloorPin.mockImplementation(async (d: any) => d);
    const res = await worker().genba.floors.pins.create({
      floorId: FLOOR.id, x: 120, y: 340, text: "スリーブ位置相違",
      photos: [{ base64: PNG, mimeType: "image/png", fileName: "p.png" }],
    });
    expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
    const saved = mockGenbaDb.createGenbaFloorPin.mock.calls[0][0];
    expect(saved).toMatchObject({ floorId: FLOOR.id, x: 120, y: 340, status: "open", byUserId: 7 });
    expect(Array.isArray(saved.photoKeys)).toBe(true);
    expect(saved.photoKeys[0]).toContain("genba/floor-");
    expect(JSON.stringify(saved)).not.toContain(PNG);
    expect(res).toMatchObject({ x: 120, y: 340 });
  });

  it("create: 図面が無ければ NOT_FOUND", async () => {
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(null);
    await expect(worker().genba.floors.pins.create({ floorId: "missing", x: 1, y: 2 })).rejects.toThrow("図面が見つかりません");
    expect(mockGenbaDb.createGenbaFloorPin).not.toHaveBeenCalled();
  });

  it("list: ピンに署名写真URLと報告者名を付けて返す", async () => {
    mockGenbaDb.listGenbaFloorPinsByFloor.mockResolvedValue([
      { id: "p1", floorId: FLOOR.id, zoneId: null, x: 10, y: 20, kind: "issue", text: "問題", status: "open", byUserId: 7, resolvedByUserId: null, photoKeys: ["genba/floor-F1/pin-x.png"], createdAt: new Date(), updatedAt: new Date() },
    ]);
    mockGenbaDb.listUserNamesByIds.mockResolvedValue(new Map([[7, "現場太郎"]]));
    const res = await worker().genba.floors.pins.list({ floorId: FLOOR.id });
    expect(res[0]).toMatchObject({ id: "p1", x: 10, y: 20, byUserName: "現場太郎" });
    expect(res[0].photoUrls).toEqual(["https://r2/get"]);
  });

  it("resolve: worker は FORBIDDEN / leader は解決できる", async () => {
    mockGenbaDb.getGenbaFloorPinById.mockResolvedValue({ id: "p1", floorId: FLOOR.id });
    await expect(worker().genba.floors.pins.resolve({ id: "p1", resolved: true })).rejects.toThrow("現場編集権限がありません");
    mockGenbaDb.updateGenbaFloorPin.mockResolvedValue({ id: "p1", status: "resolved" });
    const res = await leader().genba.floors.pins.resolve({ id: "p1", resolved: true });
    expect(res?.status).toBe("resolved");
    expect(mockGenbaDb.updateGenbaFloorPin).toHaveBeenCalledWith("p1", expect.objectContaining({ status: "resolved" }));
  });

  it("remove: leader は削除できる / worker は FORBIDDEN", async () => {
    mockGenbaDb.getGenbaFloorPinById.mockResolvedValue({ id: "p1", floorId: FLOOR.id });
    await expect(worker().genba.floors.pins.remove({ id: "p1" })).rejects.toThrow("現場編集権限がありません");
    await leader().genba.floors.pins.remove({ id: "p1" });
    expect(mockGenbaDb.deleteGenbaFloorPin).toHaveBeenCalledWith("p1");
  });
});
