import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaFloorFileById: vi.fn(),
  getGenbaFloorById: vi.fn(),
  createGenbaFloorFile: vi.fn(),
  deleteGenbaFloorFile: vi.fn(),
}));
const mockStorage = vi.hoisted(() => ({ storagePut: vi.fn(), storageGet: vi.fn(), storageGetBytes: vi.fn() }));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));

vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./storage", () => mockStorage);
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "U", loginMethod: "manus", role: "user", appRole: "manager" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));

const FLOOR = { id: "Genba_Beta_F1", siteId: "Genba_Beta_S1", name: "1F", imageKey: null, w: 1, h: 1, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() };
function hdr(map: Record<string, string | null>) { return { get: (k: string) => map[k.toLowerCase()] ?? null }; }
function linkFile(url: string) { return { id: "lf1", floorId: FLOOR.id, kind: "link", url, title: "図面", fileName: null, storageKey: null, mimeType: null, sizeBytes: null }; }

describe("genba.floors.files.importLink (外部リンクの取り込み)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.storagePut.mockResolvedValue({ key: "k", url: "https://r2/put" });
    mockGenbaDb.getGenbaFloorById.mockResolvedValue(FLOOR);
    mockGenbaDb.createGenbaFloorFile.mockImplementation(async (d: any) => d);
  });
  afterEach(() => { delete process.env.GENBA_ENABLED; vi.unstubAllGlobals(); });

  it("画像URLを取り込み: DL→R2保存→uploadに置換(元リンク削除)", async () => {
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue(linkFile("https://example.com/drawing.jpg"));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, headers: hdr({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    })));
    const res = await leader().genba.floors.files.importLink({ id: "lf1" });
    expect(mockStorage.storagePut).toHaveBeenCalledTimes(1);
    const created = mockGenbaDb.createGenbaFloorFile.mock.calls[0][0];
    expect(created).toMatchObject({ kind: "upload", floorId: FLOOR.id, mimeType: "image/jpeg" });
    expect(created.storageKey).toContain("genba/floor-");
    expect(mockGenbaDb.deleteGenbaFloorFile).toHaveBeenCalledWith("lf1");
    expect(res).toMatchObject({ kind: "upload" });
  });

  it("HTMLビューア(Drive制限等)は分かりやすいエラー", async () => {
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue(linkFile("https://drive.google.com/file/d/ABC/view"));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, status: 200, headers: hdr({ "content-type": "text/html; charset=utf-8" }),
      arrayBuffer: async () => new Uint8Array([0]).buffer,
    })));
    await expect(leader().genba.floors.files.importLink({ id: "lf1" })).rejects.toThrow("ダウンロードして");
    expect(mockStorage.storagePut).not.toHaveBeenCalled();
  });

  it("プライベート/ローカル宛先(SSRF)は拒否", async () => {
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue(linkFile("http://127.0.0.1/secret.pdf"));
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await expect(leader().genba.floors.files.importLink({ id: "lf1" })).rejects.toThrow("取り込めません");
    expect(spy).not.toHaveBeenCalled();
  });

  it("worker は FORBIDDEN", async () => {
    mockGenbaDb.getGenbaFloorFileById.mockResolvedValue(linkFile("https://example.com/x.jpg"));
    await expect(worker().genba.floors.files.importLink({ id: "lf1" })).rejects.toThrow("現場編集権限がありません");
  });
});
