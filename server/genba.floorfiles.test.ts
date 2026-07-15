import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/** フロア(図面)ごとの共通ファイル (genba_floor_files) = 全エリア共通。クライアントは zoneId を渡し、サーバーが所属フロアを解決する。 */
const mockGenbaDb = vi.hoisted(() => ({
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  listGenbaFloorFiles: vi.fn(),
  createGenbaFloorFile: vi.fn(),
  getGenbaFloorFileById: vi.fn(),
  deleteGenbaFloorFile: vi.fn(),
}));
const mockStorage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGet: vi.fn(), storageGetBytes: vi.fn() }));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./storage", () => mockStorage);
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));

const ZONE = { id: "Genba_Beta_Zone_01", floorId: "F1", name: "1工区" };
const FLOOR = { id: "F1", siteId: "Genba_Beta_Site_01", name: "1F" };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

describe("genba.floors.files (全エリア共通の図面)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
    mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/signed" });
    mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("list: zoneId から所属フロアを解決して一覧。worker も閲覧可 (upload は署名URL)", async () => {
    mockGenbaDb.listGenbaFloorFiles.mockResolvedValue([
      { id: "FF1", floorId: FLOOR.id, kind: "upload", title: "全体平面図", fileName: "p.pdf", storageKey: "genba/floor/p.pdf", url: null, mimeType: "application/pdf", sizeBytes: 1, sortOrder: 0, createdAt: new Date() },
      { id: "FF2", floorId: FLOOR.id, kind: "link", title: null, fileName: null, storageKey: null, url: "https://drive.example/x", mimeType: null, sizeBytes: null, sortOrder: 1, createdAt: new Date() },
    ]);
    const res = await worker().genba.floors.files.list({ zoneId: ZONE.id });
    expect(mockGenbaDb.listGenbaFloorFiles).toHaveBeenCalledWith(FLOOR.id);
    expect(res[0]).toMatchObject({ id: "FF1", kind: "upload", url: "https://r2/signed" });
    expect(res[1]).toMatchObject({ id: "FF2", kind: "link", url: "https://drive.example/x" });
  });

  it("addLink: leader 可 (floorId 保存) / worker 403 / http以外は 400", async () => {
    mockGenbaDb.createGenbaFloorFile.mockImplementation(async (d: any) => ({ ...d }));
    await expect(leader().genba.floors.files.addLink({ zoneId: ZONE.id, url: "https://drive.example/x", title: "図面" })).resolves.toMatchObject({ kind: "link", floorId: FLOOR.id });
    await expect(worker().genba.floors.files.addLink({ zoneId: ZONE.id, url: "https://drive.example/x" })).rejects.toThrow("現場編集権限がありません");
    await expect(leader().genba.floors.files.addLink({ zoneId: ZONE.id, url: "ftp://x/y" as any })).rejects.toThrow();
  });

  it("upload: base64→R2 (floor-キー)、DBにはキーのみ", async () => {
    mockGenbaDb.createGenbaFloorFile.mockImplementation(async (d: any) => ({ ...d }));
    await leader().genba.floors.files.upload({ zoneId: ZONE.id, base64: PNG, mimeType: "image/png", fileName: "fu.png" });
    expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
    const saved = mockGenbaDb.createGenbaFloorFile.mock.calls[0][0];
    expect(saved.kind).toBe("upload");
    expect(saved.floorId).toBe(FLOOR.id);
    expect(saved.storageKey).toContain("genba/floor-");
  });

  it("getBytes: upload の実体をbase64で返す。link は 400", async () => {
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue({ id: "FF1", floorId: FLOOR.id, kind: "upload", storageKey: "genba/floor/p.pdf", mimeType: "application/pdf", fileName: "p.pdf" });
    mockStorage.storageGetBytes.mockResolvedValue(Buffer.from("PDF"));
    const res = await worker().genba.floors.files.getBytes({ id: "FF1" });
    expect(Buffer.from(res.base64, "base64").toString()).toBe("PDF");
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue({ id: "FF2", floorId: FLOOR.id, kind: "link", url: "https://x", storageKey: null });
    await expect(worker().genba.floors.files.getBytes({ id: "FF2" })).rejects.toThrow("外部リンク");
  });

  it("remove: leader 可 / worker 403", async () => {
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue({ id: "FF1", floorId: FLOOR.id, kind: "link", url: "https://x", title: "t", fileName: null });
    await expect(leader().genba.floors.files.remove({ id: "FF1" })).resolves.toMatchObject({ success: true });
    expect(mockGenbaDb.deleteGenbaFloorFile).toHaveBeenCalledWith("FF1");
    await expect(worker().genba.floors.files.remove({ id: "FF1" })).rejects.toThrow("現場編集権限がありません");
  });
});
