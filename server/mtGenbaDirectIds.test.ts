import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Real router/middleware, synthetic persistence and object storage only.
const fixture = vi.hoisted(() => {
  const changes: string[] = [];
  const missing = new Set<string>();
  const site = (n: number) => ({ id: `Genba_Beta_S${n}`, companyId: n, name: `Genba_Beta_S${n}`, archived: false, projectId: null });
  const floor = (n: number) => ({ id: `Genba_Beta_F${n}`, siteId: site(n).id, name: "Genba_Beta_Floor", imageKey: null, w: 100, h: 100, sortOrder: 0 });
  const zone = (n: number) => ({ id: `Genba_Beta_Z${n}`, floorId: floor(n).id, parentZoneId: null, name: "Genba_Beta_Zone", polygon: [], sortOrder: 0 });
  const task = (n: number) => ({ id: `Genba_Beta_T${n}`, zoneId: zone(n).id, parentTaskId: null, name: "Genba_Beta_Task", status: "todo", percent: null, sortOrder: 0 });
  const team = (n: number) => ({ id: `Genba_Beta_TEAM${n}`, siteId: site(n).id, name: "Genba_Beta_Team" });
  const worker = (n: number) => ({ id: `Genba_Beta_W${n}`, siteId: site(n).id, kind: "guest", userId: null, displayName: "Genba_Beta_Worker" });
  const instruction = (n: number) => ({ id: `Genba_Beta_I${n}`, siteId: site(n).id, targetKind: "all", targetId: null });
  const lookup = (make: (n: number) => any) => vi.fn(async (id: string) => missing.has(id) ? null : [make(1), make(2)].find(r => r.id === id) ?? null);
  const write = (name: string, result: any = {}) => vi.fn(async (..._args: any[]) => { changes.push(name); return result; });
  const file = { id: "Genba_Beta_FILE2", floorId: floor(2).id, zoneId: zone(2).id, taskId: task(2).id, kind: "upload", storageKey: "Genba_Beta_File", url: "https://fixture.invalid/file.pdf", mimeType: "application/pdf", fileName: "Genba_Beta.pdf" };
  const getFile = vi.fn(async (id: string) => id === file.id ? file : null);
  const child = { id: "Genba_Beta_CHILD2", floorId: floor(2).id, siteId: site(2).id, status: "pending", name: "Genba_Beta_Child", byUserId: 1 };
  const getChild = vi.fn(async (id: string) => id === child.id ? child : null);
  const db = {
    getGenbaUserRole: vi.fn(async () => null),
    getGenbaSiteById: lookup(site), getGenbaFloorById: lookup(floor), getGenbaZoneById: lookup(zone), getGenbaTaskById: lookup(task),
    getGenbaTeamById: lookup(team), getGenbaSiteWorkerById: lookup(worker), getGenbaInstructionById: lookup(instruction),
    getGenbaFloorFileById: getFile, getGenbaZoneFileById: getFile, getGenbaTaskFileById: getFile,
    getGenbaFloorPinById: getChild, getGenbaFloorAnnotationById: getChild, getGenbaMaterialRequestById: getChild,
    getGenbaBudgetAttendanceById: getChild, getGenbaDispatchById: getChild,
    updateGenbaSite: write("site"), updateGenbaFloor: write("floor", floor(2)), deleteGenbaFloor: write("floor.delete"),
    updateGenbaZone: write("zone"), deleteGenbaZoneCascade: write("zone.delete"),
    updateGenbaTask: write("task", task(2)), deleteGenbaTaskCascade: write("task.delete"),
    deleteGenbaFloorFile: write("floorFile.delete"), deleteGenbaZoneFile: write("zoneFile.delete"), deleteGenbaTaskFile: write("taskFile.delete"),
    createGenbaFloorFile: write("floorFile.create"), createGenbaZoneFile: write("zoneFile.create"), createGenbaTaskFile: write("taskFile.create"),
    updateGenbaFloorPin: write("pin"), deleteGenbaFloorPin: write("pin.delete"), deleteGenbaFloorAnnotation: write("annotation.delete"),
    updateGenbaTeam: write("team"), deleteGenbaTeamCascade: write("team.delete"),
    updateGenbaMaterialRequest: write("request"), deleteGenbaMaterialRequestCascade: write("request.delete"),
    deleteGenbaBudgetAttendance: write("attendance.delete"), updateGenbaDispatch: write("dispatch"), deleteGenbaDispatchCascade: write("dispatch.delete"),
    addTaskAssignee: write("assignee"), removeTaskAssignee: write("assignee.delete"), addGenbaTeamMember: write("member"), removeGenbaTeamMember: write("member.delete"),
    setGenbaUserRole: write("role"), deleteGenbaUserRole: write("role.delete"), createGenbaSite: write("site.create"),
    createGenbaDispatch: write("dispatch.create"), createGenbaInstruction: write("instruction"), createGenbaTask: write("task.create"),
    createGenbaTaskEvent: write("event"), addGenbaActivityLog: write("activity"), addGenbaInstructionRead: write("read"), updateGenbaSiteWorkerName: write("worker"),
    listGenbaTasksByZone: vi.fn(async () => [task(2)]), listGenbaFloorsBySite: vi.fn(async () => [floor(2)]),
    listGenbaZonesByFloor: vi.fn(async () => [zone(2)]), listGenbaTasksByZoneIds: vi.fn(async () => [task(2)]),
    listTaskAssigneesByTaskIds: vi.fn(async () => []), listTaskTeamsByTaskIds: vi.fn(async () => []), listGuestAssigneesByTaskIds: vi.fn(async () => []),
    listGenbaSiteWorkersByIds: vi.fn(async () => []), listGenbaSiteWorkersBySite: vi.fn(async () => []), listAssignableUsers: vi.fn(async () => []),
    listGenbaTeamsBySite: vi.fn(async () => [team(2)]), listGenbaTeamMembers: vi.fn(async () => []), listGenbaTaskEvents: vi.fn(async () => []),
    getUserAppRoleById: vi.fn(async () => "worker"), listAppAdminUserIds: vi.fn(async () => [1]), listGenbaUserRoles: vi.fn(async () => []),
    getProjectPeriod: vi.fn(async () => ({ id: 22, name: "Genba_Beta_Project", startDate: null, endDate: null })),
  };
  return { changes, missing, db, file, site, floor, zone, task, team, worker };
});
const storage = vi.hoisted(() => ({
  storageGetBytes: vi.fn(async () => Buffer.from("Genba_Beta_File")),
  storagePut: vi.fn(async () => ({ key: "Genba_Beta_Upload", url: "https://fixture.invalid/upload" })),
  storageGet: vi.fn(async () => ({ url: "https://fixture.invalid/download" })),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...fixture.db }));
vi.mock("./storage", () => storage);
vi.mock("./db", async () => ({
  ...(await vi.importActual<any>("./db")), createAuditLog: vi.fn(),
  getUserById: vi.fn(async (id: number) => ({ id, companyId: id === 22 ? 2 : 1 })),
  getProjectById: vi.fn(async (id: number) => ({ id, companyId: id === 22 ? 2 : 1 })),
}));

function caller(companyId = 1) {
  return appRouter.createCaller({ companyId, user: { id: 1, appRole: "admin", role: "admin", companyId }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
}
function invoke(path: string, input: unknown, companyId = 1) {
  return path.split(".").reduce((api, key) => api[key], caller(companyId).genba as any)(input);
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.changes.length = 0; fixture.missing.clear(); fixture.file.kind = "upload";
  process.env.MULTI_TENANT = "true";
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("%PDF-Genba_Beta"), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=Genba_Beta.pdf" } })));
});
afterEach(() => { delete process.env.MULTI_TENANT; vi.unstubAllGlobals(); });

const sourceCases: [string, Record<string, unknown>][] = [
  ["sites.rename", { id: "Genba_Beta_S2", name: "Genba_Beta_Changed" }],
  ["sites.archive", { id: "Genba_Beta_S2", archived: true }],
  ["sites.setDriveUrl", { id: "Genba_Beta_S2", driveUrl: "" }],
  ["sites.setProject", { id: "Genba_Beta_S2", projectId: null }],
  ["floors.update", { id: "Genba_Beta_F2", name: "Genba_Beta_Changed" }], ["floors.remove", { id: "Genba_Beta_F2" }],
  ["zones.update", { id: "Genba_Beta_Z2", name: "Genba_Beta_Changed" }], ["zones.remove", { id: "Genba_Beta_Z2" }],
  ["tasks.update", { id: "Genba_Beta_T2", name: "Genba_Beta_Changed" }], ["tasks.move", { id: "Genba_Beta_T2", parentTaskId: null }],
  ["tasks.setStatus", { id: "Genba_Beta_T2", status: "done" }], ["tasks.remove", { id: "Genba_Beta_T2" }],
  ["teams.rename", { id: "Genba_Beta_TEAM2", name: "Genba_Beta_Changed" }], ["teams.remove", { id: "Genba_Beta_TEAM2" }],
  ["floors.pins.resolve", { id: "Genba_Beta_CHILD2", resolved: true }], ["floors.pins.remove", { id: "Genba_Beta_CHILD2" }],
  ["floors.annotations.remove", { id: "Genba_Beta_CHILD2" }],
  ["materials.updateRequestStatus", { id: "Genba_Beta_CHILD2", status: "ordered" }], ["materials.cancelRequest", { id: "Genba_Beta_CHILD2" }],
  ["budgets.removeManualAttendance", { id: "Genba_Beta_CHILD2" }],
  ["dispatches.setDone", { id: "Genba_Beta_CHILD2", done: true }], ["dispatches.remove", { id: "Genba_Beta_CHILD2" }],
  ["tasks.bulkAssign", { taskIds: ["Genba_Beta_T2"], userId: 22, on: true }],
  ...["floors", "zones", "tasks"].flatMap(prefix => ["getBytes", "remove", "importLink"].map(operation => [`${prefix}.files.${operation}`, { id: "Genba_Beta_FILE2" }] as [string, Record<string, unknown>])),
];
describe.each(sourceCases)("直接対象 %s", (path, input) => {
  function setup() { if (path.endsWith("importLink")) fixture.file.kind = "link"; }
  it("他社なら書込・ファイル取得・外部取得より前に拒否", async () => {
    setup(); await expect(invoke(path, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.changes).toEqual([]); expect(storage.storageGetBytes).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("自社の対象は利用できる", async () => { setup(); await expect(invoke(path, input, 2)).resolves.toBeDefined(); });
  it.each([undefined, "false"])("off互換 %s", async flag => {
    setup(); if (flag === undefined) delete process.env.MULTI_TENANT; else process.env.MULTI_TENANT = flag;
    await expect(invoke(path, input)).resolves.toBeDefined();
  });
});

const referenceCases: [string, Record<string, unknown>][] = [
  ["users.setGenbaRole", { userId: 22, role: "worker" }], ["users.setGenbaRole", { userId: 22, role: null }],
  ["sites.create", { name: "Genba_Beta_New", projectId: 22 }], ["sites.setProject", { id: "Genba_Beta_S1", projectId: 22 }],
  ["tasks.assignUser", { taskId: "Genba_Beta_T1", userId: 22, on: true, propagate: false }],
  ["tasks.bulkAssign", { taskIds: ["Genba_Beta_T1"], userId: 22, on: true }],
  ["tasks.handover", { taskId: "Genba_Beta_T1", toUserId: 22 }],
  ["teams.setMember", { teamId: "Genba_Beta_TEAM1", userId: 22, on: true }],
  ["dispatches.create", { siteId: "Genba_Beta_S1", zoneId: "Genba_Beta_Z1", taskId: "Genba_Beta_T1", userIds: [22] }],
  ["dispatches.create", { siteId: "Genba_Beta_S1", zoneId: "Genba_Beta_Z1", taskId: "Genba_Beta_T1", userIds: [11, 22] }],
  ["instructions.create", { siteId: "Genba_Beta_S1", text: "Genba_Beta_Instruction", targetKind: "worker", targetId: "22" }],
  ["instructions.create", { siteId: "Genba_Beta_S1", text: "Genba_Beta_Instruction", targetKind: "team", targetId: "Genba_Beta_TEAM2" }],
];
describe.each(referenceCases)("参照先 %s %j", (path, input) => {
  it("他社参照先への操作は拒否して書き込まない", async () => {
    await expect(invoke(path, input)).rejects.toMatchObject({ code: input.targetKind === "team" ? "FORBIDDEN" : "NOT_FOUND" }); expect(fixture.changes).toEqual([]);
  });
  it("自社の参照先なら利用できる", async () => {
    const own = structuredClone(input);
    for (const key of ["userId", "toUserId", "projectId"]) if (own[key] === 22) own[key] = 11;
    if (own.userIds) own.userIds = [11];
    if (own.targetId === "22") own.targetId = "11";
    if (own.targetId === "Genba_Beta_TEAM2") own.targetId = "Genba_Beta_TEAM1";
    await expect(invoke(path, own)).resolves.toBeDefined();
  });
  it.each([undefined, "false"])("off互換 %s", async flag => {
    if (flag === undefined) delete process.env.MULTI_TENANT; else process.env.MULTI_TENANT = flag;
    await expect(invoke(path, input)).resolves.toBeDefined();
  });
});

const whitespaceCases: [string, Record<string, unknown>][] = [
  ["floors.list", { siteId: " Genba_Beta_S2 " }], ["zones.listByFloor", { floorId: " Genba_Beta_F2 " }],
  ["tasks.listByZone", { zoneId: " Genba_Beta_Z2 " }], ["tasks.events", { taskId: " Genba_Beta_T2 " }],
  ["teams.setMember", { teamId: " Genba_Beta_TEAM2 ", userId: 11, on: true }],
  ["instructions.markRead", { instructionId: " Genba_Beta_I2 " }],
  ["workerLinks.renameWorker", { siteWorkerId: " Genba_Beta_W2 ", displayName: "Genba_Beta_Rename" }],
];
it.each(whitespaceCases)("空白付きIDでも会社を照合する: %s", async (path, input) => {
  await expect(invoke(path, input)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(fixture.changes).toEqual([]);
});

it("作業作成の親taskIdも他社なら保存前に拒否する", async () => {
  await expect(invoke("tasks.create", { zoneId: "Genba_Beta_Z1", parentTaskId: "Genba_Beta_T2", name: "Genba_Beta_New" }))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(fixture.changes).toEqual([]);
});

const orphanCases: [string, string, Record<string, unknown>][] = [
  ["Genba_Beta_F2", "floors.files.getBytes", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_Z2", "zones.files.getBytes", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_T2", "tasks.files.getBytes", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_Z2", "tasks.files.getBytes", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_F2", "tasks.files.getBytes", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_S2", "tasks.files.getBytes", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_F2", "floors.files.remove", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_T2", "tasks.files.remove", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_T2", "tasks.files.importLink", { id: "Genba_Beta_FILE2" }],
  ["Genba_Beta_F2", "zones.listByFloor", { floorId: "Genba_Beta_F2" }],
  ["Genba_Beta_Z2", "tasks.listByZone", { zoneId: "Genba_Beta_Z2" }],
  ["Genba_Beta_T2", "tasks.events", { taskId: "Genba_Beta_T2" }],
  ["Genba_Beta_Z2", "tasks.events", { taskId: "Genba_Beta_T2" }],
  ["Genba_Beta_S2", "materials.updateRequestStatus", { id: "Genba_Beta_CHILD2", status: "ordered" }],
];
describe.each(orphanCases)("親欠落 %s → %s", (missing, path, input) => {
  function setup() { fixture.missing.add(missing); if (path.endsWith("importLink")) fixture.file.kind = "link"; }
  it("会社を解決できない対象は取得・書込前に NOT_FOUND", async () => {
    setup(); await expect(invoke(path, input, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fixture.changes).toEqual([]); expect(storage.storageGetBytes).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([undefined, "false"])("off互換 %s", async flag => {
    setup(); if (flag === undefined) delete process.env.MULTI_TENANT; else process.env.MULTI_TENANT = flag;
    await expect(invoke(path, input, 2)).resolves.toBeDefined();
  });
});
