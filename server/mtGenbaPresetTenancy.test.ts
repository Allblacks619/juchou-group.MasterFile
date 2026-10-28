import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mock = vi.hoisted(() => ({
  getGenbaUserRole: vi.fn(async () => null),
  getGenbaSiteById: vi.fn(),
  getGenbaMaterialPresetById: vi.fn(),
  updateGenbaMaterialPreset: vi.fn(async (_id: string, patch: unknown) => patch),
  deleteGenbaMaterialPreset: vi.fn(async (_id: string) => {}),
  getGenbaWorkerLinkByToken: vi.fn(),
  getGenbaSiteWorkerById: vi.fn(),
  touchGenbaWorkerLinkAccess: vi.fn(async () => {}),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mock }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), createAuditLog: vi.fn() }));

const SITE = { id: "Genba_Beta_PresetSite_C2", companyId: 2, archived: false };
const PRESET = { id: "Genba_Beta_Preset_C2", companyId: 2, siteId: SITE.id as string | null, workName: "Genba_Beta_Materials", parts: ["PF管"] };
const WORKER = { id: "Genba_Beta_PresetWorker", siteId: SITE.id, userId: null, displayName: "Genba_Beta_Leader", role: "leader" };
const LINK = { id: "Genba_Beta_PresetLink", siteId: SITE.id, siteWorkerId: WORKER.id, token: "Genba_Beta_Preset_Token_0001", role: "leader", active: true, expiresAt: null };

function caller(companyId: number, viaLink = false) {
  return appRouter.createCaller({
    companyId: viaLink ? 1 : companyId,
    user: viaLink ? null : { id: 1, appRole: "admin", role: "admin", companyId } as User,
    req: { protocol: "https", headers: viaLink ? { "x-genba-link": LINK.token } : {} } as any,
    res: { clearCookie: vi.fn() } as any,
  } as TrpcContext);
}

type Operation = "update" | "delete";
function mutate(api: ReturnType<typeof caller>, operation: Operation, siteId?: string) {
  return operation === "update"
    ? api.genba.materials.savePreset({ id: PRESET.id, workName: "Genba_Beta_Changed", parts: ["PF管 16"], ...(siteId ? { siteId } : {}) })
    : api.genba.materials.removePreset({ id: PRESET.id });
}
function expectNoWrite() {
  expect(mock.updateGenbaMaterialPreset).not.toHaveBeenCalled();
  expect(mock.deleteGenbaMaterialPreset).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MULTI_TENANT = "true";
  mock.getGenbaSiteById.mockResolvedValue(SITE);
  mock.getGenbaMaterialPresetById.mockResolvedValue(PRESET);
  mock.getGenbaWorkerLinkByToken.mockResolvedValue(LINK);
  mock.getGenbaSiteWorkerById.mockResolvedValue(WORKER);
});
afterEach(() => { delete process.env.MULTI_TENANT; });

describe.each<Operation>(["update", "delete"])("資材プリセット %s の会社境界", (operation) => {
  it.each([null, SITE.id])("他社のプリセットは NOT_FOUND・書込なし（siteId=%s）", async (siteId) => {
    mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, siteId });
    await expect(mutate(caller(1), operation)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expectNoWrite();
  });

  it.each([null, SITE.id])("自社のプリセットは変更できる（siteId=%s）", async (siteId) => {
    mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, siteId });
    await expect(mutate(caller(2), operation)).resolves.toBeDefined();
    expect(operation === "update" ? mock.updateGenbaMaterialPreset : mock.deleteGenbaMaterialPreset).toHaveBeenCalledTimes(1);
  });

  it.each([
    [undefined, null], [undefined, SITE.id], ["false", null], ["false", SITE.id],
  ] as const)("off互換: MULTI_TENANT=%s / siteId=%s", async (flag, siteId) => {
    if (flag === undefined) delete process.env.MULTI_TENANT;
    else process.env.MULTI_TENANT = flag;
    mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, siteId });
    await expect(mutate(caller(1), operation)).resolves.toBeDefined();
    expect(operation === "update" ? mock.updateGenbaMaterialPreset : mock.deleteGenbaMaterialPreset).toHaveBeenCalledTimes(1);
  });

  it("会社2のリーダーリンクは会社2・自現場のプリセットを変更できる", async () => {
    await expect(mutate(caller(2, true), operation)).resolves.toBeDefined();
  });

  it("同じ会社でもリーダーリンクから別現場のプリセットは変更できない", async () => {
    mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, siteId: "Genba_Beta_OtherSite" });
    await expect(mutate(caller(2, true), operation)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWrite();
  });

  it("リーダーリンクから会社共通プリセットを変更できない既存制約を維持する", async () => {
    mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, siteId: null });
    await expect(mutate(caller(2, true), operation)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWrite();
  });

  it("行は自社でも紐付く現場が他社なら変更できない", async () => {
    mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, companyId: 1 });
    await expect(mutate(caller(1), operation)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWrite();
  });

  it("存在しないプリセットは NOT_FOUND・書込なし", async () => {
    mock.getGenbaMaterialPresetById.mockResolvedValue(null);
    await expect(mutate(caller(1), operation)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expectNoWrite();
  });
});

it("更新入力に自社現場IDを添えても他社の共通プリセットを変更できない", async () => {
  mock.getGenbaMaterialPresetById.mockResolvedValue({ ...PRESET, siteId: null });
  mock.getGenbaSiteById.mockResolvedValue({ ...SITE, companyId: 1 });
  await expect(mutate(caller(1), "update", SITE.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expectNoWrite();
});
