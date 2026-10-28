import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const f = vi.hoisted(() => {
  const make = (n: number) => {
    const site = { id: `Genba_Beta_S${n}`, companyId: n, name: `Genba_Beta_Company${n}`, archived: false, driveUrl: "PRIVATE_DRIVE" };
    const floor = { id: `Genba_Beta_F${n}`, siteId: site.id, name: "Genba_Beta_Floor", imageKey: `Genba_Beta_Image${n}`, w: 100, h: 100 };
    const zone = { id: `Genba_Beta_Z${n}`, floorId: floor.id, parentZoneId: null, name: "Genba_Beta_Zone", polygon: [], priority: null, workStatus: null };
    const task = { id: `Genba_Beta_T${n}`, zoneId: zone.id, parentTaskId: null, name: "Genba_Beta_Task", romaji: null, status: "todo", percent: null, dueDate: null, issueText: "Genba_Beta_Issue", memo: "PRIVATE_MEMO", memoVisible: false, linkUrl: "PRIVATE_LINK", privateFutureColumn: "PRIVATE_FUTURE" };
    const worker = { id: `Genba_Beta_W${n}`, siteId: site.id, userId: null, displayName: "Genba_Beta_Worker", kind: "guest" };
    const link = { id: `Genba_Beta_L${n}`, siteId: site.id, siteWorkerId: worker.id, token: `Genba_Beta_Worker_Token_${n}`, role: "worker", active: true, expiresAt: null as Date | null };
    const share = { id: `Genba_Beta_SHARE${n}`, siteId: site.id, token: `Genba_Beta_Share_Token_${n}`, scopes: ["map", "tasks", "board", "dash"], expiresAt: null as Date | null };
    return { site, floor, zone, task, worker, link, share };
  };
  const state = { companies: [make(1), make(2)], changes: [] as string[] };
  // Simulate a database collation that may match case variants. The capability check must still be exact.
  const tokenMatch = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const db = {
    getGenbaShareByToken: vi.fn(async (token: string) => state.companies.map(c => c.share).find(s => tokenMatch(s.token, token)) ?? null),
    getGenbaWorkerLinkByToken: vi.fn(async (token: string) => state.companies.map(c => c.link).find(l => tokenMatch(l.token, token)) ?? null),
    getGenbaSiteById: vi.fn(async (id: string) => state.companies.map(c => c.site).find(s => s.id === id) ?? null),
    getGenbaSiteWorkerById: vi.fn(async (id: string) => state.companies.map(c => c.worker).find(w => w.id === id) ?? null),
    getGenbaTaskById: vi.fn(async (id: string) => state.companies.map(c => c.task).find(t => t.id === id) ?? null),
    collectSiteGraph: vi.fn(async (id: string) => { const c = state.companies.find(c => c.site.id === id)!; return { floors: [c.floor], zones: [c.zone], tasks: [c.task] }; }),
    listGenbaFloorsBySite: vi.fn(async (id: string) => state.companies.filter(c => c.site.id === id).map(c => c.floor)),
    listGenbaZonesByFloorIds: vi.fn(async (ids: string[]) => state.companies.filter(c => ids.includes(c.floor.id)).map(c => c.zone)),
    listGenbaTasksByZoneIds: vi.fn(async (ids: string[]) => state.companies.filter(c => ids.includes(c.zone.id)).map(c => c.task)),
    listTaskIdsAssignedToGuest: vi.fn(async (ids: string[], workerId: string) => new Set(state.companies.filter(c => c.worker.id === workerId && ids.includes(c.task.id)).map(c => c.task.id))),
    listGenbaInstructionsBySite: vi.fn(async () => []),
    touchGenbaWorkerLinkAccess: vi.fn(async () => {}),
    updateGenbaTask: vi.fn(async (id: string, patch: any) => { state.changes.push("task"); return { ...state.companies.find(c => c.task.id === id)!.task, ...patch }; }),
    createGenbaTaskEvent: vi.fn(async () => { state.changes.push("event"); }),
    addGenbaActivityLog: vi.fn(async () => {}),
  };
  return { make, state, db };
});
const storage = vi.hoisted(() => ({ storageGet: vi.fn(async (key: string) => ({ url: `https://fixture.invalid/${key}` })), storagePut: vi.fn(async () => ({})) }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...f.db }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), createAuditLog: vi.fn() }));
vi.mock("./storage", () => storage);

const NOW = new Date("2026-10-28T00:00:00Z");
function caller(companyId = 1) {
  return appRouter.createCaller({ user: null, companyId, req: { headers: {}, protocol: "https" }, res: {} } as unknown as TrpcContext);
}
function write(route: "setStatus" | "reply", token = f.state.companies[0].link.token, taskId = f.state.companies[0].task.id) {
  return route === "setStatus"
    ? caller().genba.workerLink.setStatus({ token, taskId, status: "done" })
    : caller().genba.workerLink.reply({ token, taskId, text: "Genba_Beta_Reply" });
}
async function errorOf(promise: Promise<unknown>) {
  try { await promise; throw new Error("Expected denial"); }
  catch (e: any) { if (!e.code) throw e; return { code: e.code, message: e.message }; }
}
beforeEach(() => {
  vi.clearAllMocks(); f.state.companies = [f.make(1), f.make(2)]; f.state.changes.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
});
afterEach(() => { vi.useRealTimers(); delete process.env.MULTI_TENANT; delete process.env.GENBA_ENABLED; });

describe.each(["true", "false"])("公開token契約 MULTI_TENANT=%s", flag => {
  beforeEach(() => { process.env.MULTI_TENANT = flag; });
  it("shareはtokenの会社2に固定され、caller会社や追加siteIdで切り替わらない", async () => {
    const c = f.state.companies[1];
    const view = await caller(1).genba.shares.publicView({ token: c.share.token, siteId: f.state.companies[0].site.id } as any);
    expect(view.site.name).toBe("Genba_Beta_Company2");
    expect(view.tasks?.tasks.map(t => t.id)).toEqual(["Genba_Beta_T2"]);
    expect(JSON.stringify(view)).not.toMatch(/PRIVATE_|companyId|token/);
    expect(f.db.collectSiteGraph).toHaveBeenCalledWith("Genba_Beta_S2");
  });
  it("share scope外のデータや画像URLを返さない", async () => {
    const c = f.state.companies[0]; c.share.scopes = ["tasks"];
    const view = await caller().genba.shares.publicView({ token: c.share.token });
    expect(view.tasks).toBeDefined(); expect(view.map).toBeUndefined(); expect(view.board).toBeUndefined(); expect(view.dash).toBeUndefined();
    expect(storage.storageGet).not.toHaveBeenCalled();
  });
  it.each(["unknown", "deleted", "expired", "deadline", "missingSite", "archived", "caseVariant"])("share無効条件は同じNOT_FOUND: %s", async kind => {
    const c = f.state.companies[0]; let token = c.share.token;
    if (kind === "unknown") token = "Genba_Beta_Unknown_Token";
    if (kind === "deleted") c.share.token = "Genba_Beta_Deleted_Token";
    if (kind === "expired") c.share.expiresAt = new Date(NOW.getTime() - 1);
    if (kind === "deadline") c.share.expiresAt = new Date(NOW);
    if (kind === "missingSite") c.share.siteId = "Genba_Beta_MissingSite";
    if (kind === "archived") c.site.archived = true;
    if (kind === "caseVariant") token = token.toUpperCase();
    const error = await errorOf(caller().genba.shares.publicView({ token }));
    expect(error).toEqual({ code: "NOT_FOUND", message: "共有リンクが見つからないか、期限切れです" });
    expect(f.db.collectSiteGraph).not.toHaveBeenCalled(); expect(storage.storageGet).not.toHaveBeenCalled();
  });
  it("share再発行後は古いtokenが拒否され、新tokenは同じ資源だけを返す", async () => {
    const c = f.state.companies[0]; const old = c.share.token; c.share.token = "Genba_Beta_Reissued_Share";
    expect((await errorOf(caller().genba.shares.publicView({ token: old }))).code).toBe("NOT_FOUND");
    expect((await caller().genba.shares.publicView({ token: c.share.token })).site.name).toBe(c.site.name);
  });
  it("worker viewはtoken会社2の担当と許可項目だけを返す", async () => {
    const c = f.state.companies[1]; const view = await caller(1).genba.workerLink.view({ token: c.link.token });
    if (!view.ok) throw new Error("Expected valid fixture");
    expect(view.site.name).toBe("Genba_Beta_Company2"); expect(view.myTasks.map(t => t.id)).toEqual(["Genba_Beta_T2"]);
    expect(JSON.stringify(view)).not.toMatch(/PRIVATE_|companyId|siteWorkerId|token/);
  });
  it.each(["unknown", "deleted", "disabled", "expired", "deadline", "missingWorker", "missingSite", "archived", "mismatchedSite", "caseVariant"])("worker token無効条件: %s", async kind => {
    const c = f.state.companies[0]; let token = c.link.token; let reason = "invalid";
    if (kind === "unknown") token = "Genba_Beta_Unknown_Token";
    if (kind === "deleted") c.link.token = "Genba_Beta_Deleted_Token";
    if (kind === "disabled") { c.link.active = false; reason = "disabled"; }
    if (kind === "expired") { c.link.expiresAt = new Date(NOW.getTime() - 1); reason = "expired"; }
    if (kind === "deadline") { c.link.expiresAt = new Date(NOW); reason = "expired"; }
    if (kind === "missingWorker") c.link.siteWorkerId = "Genba_Beta_MissingWorker";
    if (kind === "missingSite") c.worker.siteId = c.link.siteId = "Genba_Beta_MissingSite";
    if (kind === "archived") c.site.archived = true;
    if (kind === "mismatchedSite") c.link.siteWorkerId = f.state.companies[1].worker.id;
    if (kind === "caseVariant") token = token.toUpperCase();
    expect(await caller().genba.workerLink.view({ token })).toEqual({ ok: false, reason });
    for (const route of ["setStatus", "reply"] as const) {
      expect(await errorOf(write(route, token, kind === "mismatchedSite" ? f.state.companies[1].task.id : undefined))).toEqual({ code: "FORBIDDEN", message: "このリンクは無効です。管理者に確認してください。" });
    }
    expect(f.state.changes).toEqual([]); expect(f.db.touchGenbaWorkerLinkAccess).not.toHaveBeenCalled();
    expect(storage.storageGet).not.toHaveBeenCalled(); expect(storage.storagePut).not.toHaveBeenCalled();
  });
  it("worker再発行後は旧tokenの全3操作が拒否され、新tokenのみ有効", async () => {
    const c = f.state.companies[0]; const old = c.link.token; c.link.token = "Genba_Beta_Reissued_Worker";
    expect(await caller().genba.workerLink.view({ token: old })).toEqual({ ok: false, reason: "invalid" });
    expect((await errorOf(write("setStatus", old))).code).toBe("FORBIDDEN");
    expect((await errorOf(write("reply", old))).code).toBe("FORBIDDEN");
    expect((await caller().genba.workerLink.view({ token: c.link.token })).ok).toBe(true);
  });
  it("期限の直前はshare閲覧とworkerの3操作を許可する", async () => {
    const c = f.state.companies[0]; c.share.expiresAt = c.link.expiresAt = new Date(NOW.getTime() + 1);
    expect((await caller().genba.shares.publicView({ token: c.share.token })).site.name).toBe(c.site.name);
    expect((await caller().genba.workerLink.view({ token: c.link.token })).ok).toBe(true);
    await expect(write("setStatus")).resolves.toBeDefined(); await expect(write("reply")).resolves.toEqual({ success: true });
  });
  it.each(["setStatus", "reply"] as const)("%sは他社taskと存在しないtaskを同じ応答で拒否", async route => {
    const foreign = await errorOf(write(route, undefined, f.state.companies[1].task.id));
    const absent = await errorOf(write(route, undefined, "Genba_Beta_AbsentTask"));
    expect(foreign).toEqual({ code: "FORBIDDEN", message: "この作業はあなたの担当ではありません" }); expect(absent).toEqual(foreign);
    expect(f.state.changes).toEqual([]); expect(storage.storagePut).not.toHaveBeenCalled();
  });
  it.each(["setStatus", "reply"] as const)("%sは有効な会社2tokenで会社2の担当のみ変更できる", async route => {
    const c = f.state.companies[1]; await expect(write(route, c.link.token, c.task.id)).resolves.toBeDefined();
    expect(f.state.changes).toContain("event");
  });
  it("setStatusの返却も非公開列を漏らさない", async () => {
    const result = await write("setStatus"); expect(result).toMatchObject({ id: "Genba_Beta_T1", status: "done", percent: 100 });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|linkUrl|privateFutureColumn/);
  });
  it("setStatusでは公開指定のmemoだけを返す", async () => {
    const c = f.state.companies[0]; c.task.memoVisible = true; c.task.memo = "Genba_Beta_PublicMemo";
    expect(await write("setStatus")).toMatchObject({ memo: "Genba_Beta_PublicMemo" });
  });
  it("GENBA_ENABLED=falseで4公開経路すべてを遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    expect((await errorOf(caller().genba.shares.publicView({ token: f.state.companies[0].share.token }))).code).toBe("FORBIDDEN");
    expect((await errorOf(caller().genba.workerLink.view({ token: f.state.companies[0].link.token }))).code).toBe("FORBIDDEN");
    expect((await errorOf(write("setStatus"))).code).toBe("FORBIDDEN"); expect((await errorOf(write("reply"))).code).toBe("FORBIDDEN");
    expect(f.state.changes).toEqual([]);
  });
});
