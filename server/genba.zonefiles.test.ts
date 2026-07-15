import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/** エリア(工区)ごとの図面ファイル (genba_zone_files)。作業ファイルと同方式・エリアに貼れば全作業に共通。 */
const mockGenbaDb = vi.hoisted(() => ({
  getGenbaZoneById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  listGenbaZoneFiles: vi.fn(),
  createGenbaZoneFile: vi.fn(),
  getGenbaZoneFileById: vi.fn(),
  deleteGenbaZoneFile: vi.fn(),
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

describe("genba.zones.files (エリアの図面)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenbaDb.getGenbaZoneById.mockResolvedValue(ZONE);
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
    mockStorage.storageGet.mockResolvedValue({ key: "k", url: "https://r2/signed" });
    mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  it("list: worker も閲覧可。upload は署名URL、link はそのまま", async () => {
    mockGenbaDb.listGenbaZoneFiles.mockResolvedValue([
      { id: "ZF1", zoneId: ZONE.id, kind: "upload", title: "強電図面", fileName: "d.pdf", storageKey: "genba/zone/d.pdf", url: null, mimeType: "application/pdf", sizeBytes: 1, sortOrder: 0, createdAt: new Date() },
      { id: "ZF2", zoneId: ZONE.id, kind: "link", title: null, fileName: null, storageKey: null, url: "https://drive.example/x", mimeType: null, sizeBytes: null, sortOrder: 1, createdAt: new Date() },
    ]);
    const res = await worker().genba.zones.files.list({ zoneId: ZONE.id });
    expect(res[0]).toMatchObject({ id: "ZF1", kind: "upload", url: "https://r2/signed" });
    expect(res[1]).toMatchObject({ id: "ZF2", kind: "link", url: "https://drive.example/x" });
  });

  it("addLink: leader 可 / worker 403 / http以外は 400", async () => {
    mockGenbaDb.createGenbaZoneFile.mockImplementation(async (d: any) => ({ ...d }));
    await expect(leader().genba.zones.files.addLink({ zoneId: ZONE.id, url: "https://drive.example/x", title: "図面" })).resolves.toMatchObject({ kind: "link" });
    await expect(worker().genba.zones.files.addLink({ zoneId: ZONE.id, url: "https://drive.example/x" })).rejects.toThrow("現場編集権限がありません");
    await expect(leader().genba.zones.files.addLink({ zoneId: ZONE.id, url: "ftp://x/y" as any })).rejects.toThrow();
  });

  it("upload: base64→R2 (zone-キー)、DBにはキーのみ", async () => {
    mockGenbaDb.createGenbaZoneFile.mockImplementation(async (d: any) => ({ ...d }));
    await leader().genba.zones.files.upload({ zoneId: ZONE.id, base64: PNG, mimeType: "image/png", fileName: "zu.png" });
    expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
    const saved = mockGenbaDb.createGenbaZoneFile.mock.calls[0][0];
    expect(saved.kind).toBe("upload");
    expect(saved.storageKey).toContain("genba/zone-");
  });

  it("getBytes: upload の実体をbase64で返す。link は 400", async () => {
    mockGenbaDb.getGenbaZoneFileById.mockResolvedValue({ id: "ZF1", zoneId: ZONE.id, kind: "upload", storageKey: "genba/zone/d.pdf", mimeType: "application/pdf", fileName: "d.pdf" });
    mockStorage.storageGetBytes.mockResolvedValue(Buffer.from("PDF"));
    const res = await worker().genba.zones.files.getBytes({ id: "ZF1" });
    expect(Buffer.from(res.base64, "base64").toString()).toBe("PDF");
    mockGenbaDb.getGenbaZoneFileById.mockResolvedValue({ id: "ZF2", zoneId: ZONE.id, kind: "link", url: "https://x", storageKey: null });
    await expect(worker().genba.zones.files.getBytes({ id: "ZF2" })).rejects.toThrow("外部リンク");
  });

  it("remove: leader 可 / worker 403", async () => {
    mockGenbaDb.getGenbaZoneFileById.mockResolvedValue({ id: "ZF1", zoneId: ZONE.id, kind: "link", url: "https://x", title: "t", fileName: null });
    await expect(leader().genba.zones.files.remove({ id: "ZF1" })).resolves.toMatchObject({ success: true });
    expect(mockGenbaDb.deleteGenbaZoneFile).toHaveBeenCalledWith("ZF1");
    await expect(worker().genba.zones.files.remove({ id: "ZF1" })).rejects.toThrow("現場編集権限がありません");
  });
});
