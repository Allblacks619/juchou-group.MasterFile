import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * マルチテナント化 Phase 2 — コネクト層の架空3社E2E
 * (docs/multitenant/PLAN_v1.md §2.3-§2.6)
 *
 * 乙島電業(=1・自社役) / 甲野電設(=2・元請役) / 丙田工業(=3) を MULTI_TENANT=on で走らせ、
 * 連携招待→承諾→名簿提出→受領→作業員単位の受理/差戻し→genba名寄せ を通しで検証する。
 * connect/db はインメモリ実装に差し替え（実DBなしで状態遷移を検証）。
 */

const mem = vi.hoisted(() => ({
  links: [] as any[],
  maps: [] as any[],
  subs: [] as any[],
  workers: [] as any[],
  seq: 0,
}));

vi.mock("./connect/db", () => ({
  createPartnerLink: vi.fn(async (d: any) => { const row = { id: ++mem.seq, status: "invited", addresseeCompanyId: null, pairMinCompanyId: null, pairMaxCompanyId: null, acceptedAt: null, createdAt: new Date(), ...d }; mem.links.push(row); return row; }),
  getPartnerLinkById: vi.fn(async (id: number) => mem.links.find((l) => l.id === id)),
  getPartnerLinkByToken: vi.fn(async (t: string) => mem.links.find((l) => l.token === t)),
  findPartnerLinkBetween: vi.fn(async (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return mem.links.find((l) => l.pairMinCompanyId === lo && l.pairMaxCompanyId === hi);
  }),
  listPartnerLinksByCompany: vi.fn(async (c: number) => mem.links.filter((l) => l.requesterCompanyId === c || l.addresseeCompanyId === c)),
  updatePartnerLink: vi.fn(async (id: number, d: any) => { Object.assign(mem.links.find((l) => l.id === id)!, d); }),
  addPartnerLinkClientMap: vi.fn(async (d: any) => { mem.maps.push({ id: ++mem.seq, ...d }); }),
  listPartnerLinkClientMaps: vi.fn(async (id: number) => mem.maps.filter((m) => m.partnerLinkId === id)),
  createRosterSubmission: vi.fn(async (d: any) => { const row = { id: ++mem.seq, createdAt: new Date(), ...d }; mem.subs.push(row); return row; }),
  getRosterSubmissionById: vi.fn(async (id: number) => mem.subs.find((s) => s.id === id)),
  updateRosterSubmission: vi.fn(async (id: number, d: any) => { Object.assign(mem.subs.find((s) => s.id === id)!, d); }),
  listRosterInbox: vi.fn(async (c: number) => mem.subs.filter((s) => s.toCompanyId === c)),
  listRosterOutbox: vi.fn(async (c: number) => mem.subs.filter((s) => s.fromCompanyId === c)),
  addRosterWorker: vi.fn(async (d: any) => { mem.workers.push({ id: ++mem.seq, ...d }); }),
  listRosterWorkers: vi.fn(async (id: number) => mem.workers.filter((w) => w.submissionId === id)),
  getRosterWorkerById: vi.fn(async (id: number) => mem.workers.find((w) => w.id === id)),
  updateRosterWorker: vi.fn(async (id: number, d: any) => { Object.assign(mem.workers.find((w) => w.id === id)!, d); }),
}));

const mockDb = vi.hoisted(() => ({
  getClientById: vi.fn(async (_id: number): Promise<any> => undefined),
  getEmployeeById: vi.fn(async (_id: number): Promise<any> => undefined),
  getQualificationsByEmployee: vi.fn(async (_id: number): Promise<any[]> => []),
  getDocumentsByEmployee: vi.fn(async (_id: number): Promise<any[]> => []),
  createAuditLog: vi.fn(),
}));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

const genbaDbMock = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(async (_id: string): Promise<any> => undefined),
  listGenbaSiteWorkersBySite: vi.fn(async (_id: string): Promise<any[]> => []),
  getGenbaSiteWorkerById: vi.fn(async (_id: string): Promise<any> => undefined),
  updateGenbaSiteWorkerExternalRef: vi.fn(async () => {}),
}));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...genbaDbMock }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "MTSIM_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function callerFor(companyId: number, userId = companyId * 100) {
  const ctx: TrpcContext = {
    user: createUser({ id: userId, companyId }),
    companyId,
    req: { protocol: "https", headers: {} } as any,
    res: { clearCookie: vi.fn() } as any,
  };
  return appRouter.createCaller(ctx);
}

const OTSU = 1, KONO = 2, HEIDA = 3;

beforeEach(() => {
  vi.clearAllMocks();
  mem.links.length = 0; mem.maps.length = 0; mem.subs.length = 0; mem.workers.length = 0; mem.seq = 0;
  process.env.MULTI_TENANT = "true";
});
afterEach(() => { delete process.env.MULTI_TENANT; });

describe("connect.partner: 連携の招待→承諾", () => {
  it("フラグ off では全手続き FORBIDDEN（本番無影響）", async () => {
    delete process.env.MULTI_TENANT;
    await expect(callerFor(OTSU).connect.partner.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("乙島が取引先行を招待→甲野が承諾→両社の一覧に accepted で現れる", async () => {
    mockDb.getClientById.mockResolvedValue({ id: 501, name: "MTSIM 甲野電設株式会社", companyId: OTSU });
    const inv = await callerFor(OTSU).connect.partner.invite({ clientId: 501 });
    expect(inv.token).toBeTruthy();

    const acc = await callerFor(KONO).connect.partner.accept({ token: inv.token });
    expect(acc.status).toBe("accepted");

    const otsuList = await callerFor(OTSU).connect.partner.list();
    expect(otsuList[0]).toMatchObject({ status: "accepted", isRequester: true, counterpartyCompanyId: KONO });
    const konoList = await callerFor(KONO).connect.partner.list();
    expect(konoList[0]).toMatchObject({ status: "accepted", isRequester: false, counterpartyCompanyId: OTSU });
  });

  it("自社の招待は承諾できない／同一ペアの二重連携は拒否", async () => {
    mockDb.getClientById.mockResolvedValue({ id: 501, name: "x", companyId: OTSU });
    const inv = await callerFor(OTSU).connect.partner.invite({ clientId: 501 });
    await expect(callerFor(OTSU).connect.partner.accept({ token: inv.token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await callerFor(KONO).connect.partner.accept({ token: inv.token });

    const inv2 = await callerFor(OTSU).connect.partner.invite({ clientId: 501 });
    await expect(callerFor(KONO).connect.partner.accept({ token: inv2.token })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("他社の取引先行では招待できない（NOT_FOUND）", async () => {
    mockDb.getClientById.mockResolvedValue({ id: 502, name: "他社の行", companyId: KONO });
    await expect(callerFor(OTSU).connect.partner.invite({ clientId: 502 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

async function establishLink(): Promise<number> {
  mockDb.getClientById.mockResolvedValue({ id: 501, name: "MTSIM 甲野電設株式会社", companyId: OTSU });
  const inv = await callerFor(OTSU).connect.partner.invite({ clientId: 501 });
  const acc = await callerFor(KONO).connect.partner.accept({ token: inv.token });
  return acc.linkId;
}

const EMP_ICHIRO = {
  id: 601, companyId: OTSU, nameKanji: "MTSIM 乙島 一郎", nameKana: "オツシマ イチロウ", nameRomaji: "Ichiro",
  careerUpNumber: "CCUS00000001", nationality: "日本",
  // 機密センチネル（提出物に絶対に含まれてはいけない）
  notes: "SECRET_INTERNAL_MEMO", invoiceIssuerNumber: "SECRET_T_NUMBER", bankAccountNumber: "SECRET_BANK",
};
const EMP_JIRO = { id: 602, companyId: OTSU, nameKanji: "MTSIM 乙島 二郎", careerUpNumber: null, notes: "SECRET_2" };

describe("connect.roster: 名簿提出→受領→受理/差戻し→genba名寄せ (E2E)", () => {
  it("提出スナップショットはホワイトリストDTOのみ（機密センチネルが漏れない）", async () => {
    const linkId = await establishLink();
    mockDb.getEmployeeById.mockImplementation(async (id: number) => (id === 601 ? EMP_ICHIRO : id === 602 ? EMP_JIRO : undefined));
    mockDb.getQualificationsByEmployee.mockResolvedValue([
      { name: "第二種電気工事士", obtainedDate: new Date("2020-04-01"), certificateNumber: "DK-1234", certificateFileUrl: "SECRET_URL" },
    ]);
    mockDb.getDocumentsByEmployee.mockResolvedValue([
      { documentType: "residence_card_front", expiryDate: new Date("2027-01-31"), docStatus: "valid", fileUrl: "SECRET_FILE_URL" },
    ]);

    const res = await callerFor(OTSU).connect.roster.submit({
      partnerLinkId: linkId, employeeIds: [601, 602], projectRef: "MTSIM 甲野タワー新築工事",
    });
    expect(res.workerCount).toBe(2);

    const sub = mem.subs.find((s) => s.id === res.submissionId)!;
    const json = JSON.stringify(sub.workerSetJson);
    expect(json).toContain("CCUS00000001");
    expect(json).toContain("第二種電気工事士");
    expect(json).not.toContain("SECRET"); // メモ・銀行・インボイス番号・ファイルURLの全センチネル
  });

  it("他社の従業員IDは提出できない（NOT_FOUND）", async () => {
    const linkId = await establishLink();
    mockDb.getEmployeeById.mockResolvedValue({ id: 999, companyId: HEIDA, nameKanji: "丙田の人" });
    await expect(callerFor(OTSU).connect.roster.submit({ partnerLinkId: linkId, employeeIds: [999] }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("受領→CCUS/氏名で名寄せ候補→受理で genba ゲスト行が他社所属に格上げ→全員受理で registered", async () => {
    const linkId = await establishLink();
    mockDb.getEmployeeById.mockImplementation(async (id: number) => (id === 601 ? EMP_ICHIRO : id === 602 ? EMP_JIRO : undefined));
    const res = await callerFor(OTSU).connect.roster.submit({ partnerLinkId: linkId, employeeIds: [601, 602], toGenbaSiteId: "Genba_Beta_MT_Site" });

    // 甲野の受領箱に着信
    const inbox = await callerFor(KONO).connect.roster.inbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0].workers).toHaveLength(2);
    await callerFor(KONO).connect.roster.markReceived({ submissionId: res.submissionId });

    // 名寄せ候補（甲野の自社現場のゲスト行と突合）
    genbaDbMock.getGenbaSiteById.mockResolvedValue({ id: "Genba_Beta_MT_Site", companyId: KONO, archived: false });
    genbaDbMock.listGenbaSiteWorkersBySite.mockResolvedValue([
      { id: "Genba_Beta_SW_1", siteId: "Genba_Beta_MT_Site", guestName: "MTSIM 乙島 一郎", displayName: "MTSIM 乙島 一郎", ccusNumber: null },
    ]);
    const cands = await callerFor(KONO).connect.roster.matchCandidates({ submissionId: res.submissionId, siteId: "Genba_Beta_MT_Site" });
    const ichiro = cands.find((c) => c.displayName === "MTSIM 乙島 一郎")!;
    expect(ichiro.candidates[0]).toMatchObject({ siteWorkerId: "Genba_Beta_SW_1", matchType: "name" });

    // 一郎を受理（名寄せ付き）→ genba 行が乙島所属 (externalCompanyId=1) へ格上げ
    genbaDbMock.getGenbaSiteWorkerById.mockResolvedValue({ id: "Genba_Beta_SW_1", siteId: "Genba_Beta_MT_Site" });
    const r1 = await callerFor(KONO).connect.roster.reviewWorker({
      rosterWorkerId: ichiro.rosterWorkerId, action: "registered", matchSiteWorkerId: "Genba_Beta_SW_1",
    });
    expect(genbaDbMock.updateGenbaSiteWorkerExternalRef).toHaveBeenCalledWith("Genba_Beta_SW_1", {
      externalCompanyId: OTSU, externalEmployeeRef: 601, ccusNumber: "CCUS00000001",
    });
    expect(r1.submissionStatus).toBe("received"); // まだ二郎が pending

    // 二郎は書類不備で差戻し（理由必須）→ submission は returned
    const jiro = cands.find((c) => c.displayName === "MTSIM 乙島 二郎")!;
    await expect(callerFor(KONO).connect.roster.reviewWorker({ rosterWorkerId: jiro.rosterWorkerId, action: "returned" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    const r2 = await callerFor(KONO).connect.roster.reviewWorker({
      rosterWorkerId: jiro.rosterWorkerId, action: "returned", returnReason: "資格証書が不鮮明です",
    });
    expect(r2.submissionStatus).toBe("returned");

    // 再確認で受理に変更 → 全員 registered で submission も registered
    const r3 = await callerFor(KONO).connect.roster.reviewWorker({ rosterWorkerId: jiro.rosterWorkerId, action: "registered" });
    expect(r3.submissionStatus).toBe("registered");

    // 乙島の提出箱にも状態が見える
    const outbox = await callerFor(OTSU).connect.roster.outbox();
    expect(outbox[0].status).toBe("registered");
  });

  it("再提出はイミュータブル: 旧版は superseded・新版は version+1", async () => {
    const linkId = await establishLink();
    mockDb.getEmployeeById.mockImplementation(async (id: number) => (id === 601 ? EMP_ICHIRO : undefined));
    const v1 = await callerFor(OTSU).connect.roster.submit({ partnerLinkId: linkId, employeeIds: [601] });
    const v2 = await callerFor(OTSU).connect.roster.submit({ partnerLinkId: linkId, employeeIds: [601], supersedesId: v1.submissionId });
    expect(v2.version).toBe(2);
    expect(mem.subs.find((s) => s.id === v1.submissionId)!.status).toBe("superseded");
  });

  it("停止済みリンクへは提出できない／無関係の丙田は受領箱を覗けない", async () => {
    const linkId = await establishLink();
    await callerFor(KONO).connect.partner.suspend({ linkId });
    mockDb.getEmployeeById.mockResolvedValue(EMP_ICHIRO);
    await expect(callerFor(OTSU).connect.roster.submit({ partnerLinkId: linkId, employeeIds: [601] }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await callerFor(HEIDA).connect.roster.inbox()).toHaveLength(0);
  });
});
