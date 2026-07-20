import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import { compareAttendance, computeApprovedAmount } from "./connect/invoice";

/**
 * マルチテナント化 Phase 3 — 会社間 請求書提出＋出面確認＋査定承認＋買掛 の架空3社E2E
 * (docs/multitenant/PLAN_v1.md §2.4)
 *
 * 乙島電業(=1) → 甲野電設(=2) へ請求提出。甲野側で出面突合→査定（協力会費控除）承認→
 * 買掛が承認額で自動起票→支払済みが乙島の提出箱に見える、までを通しで検証。
 * 多段チェーン: 甲野は承認済み受領請求を「原価参照」として税再計算なしで取り込める。
 */

const mem = vi.hoisted(() => ({
  links: [] as any[], maps: [] as any[],
  invSubs: [] as any[], payables: [] as any[],
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
  // roster 系（この試験では未使用だが router 参照のためダミー実装）
  createRosterSubmission: vi.fn(), getRosterSubmissionById: vi.fn(), updateRosterSubmission: vi.fn(),
  listRosterInbox: vi.fn(async () => []), listRosterOutbox: vi.fn(async () => []),
  addRosterWorker: vi.fn(), listRosterWorkers: vi.fn(async () => []), getRosterWorkerById: vi.fn(), updateRosterWorker: vi.fn(),
  // invoice submissions
  createInvoiceSubmission: vi.fn(async (d: any) => { const row = { id: ++mem.seq, approvedAmount: null, adjustmentsJson: null, returnReason: null, createdAt: new Date(), ...d }; mem.invSubs.push(row); return row; }),
  getInvoiceSubmissionById: vi.fn(async (id: number) => mem.invSubs.find((s) => s.id === id)),
  updateInvoiceSubmission: vi.fn(async (id: number, d: any) => { Object.assign(mem.invSubs.find((s) => s.id === id)!, d); }),
  listInvoiceInbox: vi.fn(async (c: number) => mem.invSubs.filter((s) => s.toCompanyId === c)),
  listInvoiceOutbox: vi.fn(async (c: number) => mem.invSubs.filter((s) => s.fromCompanyId === c)),
  listApprovedInvoiceSubmissions: vi.fn(async (c: number) => mem.invSubs.filter((s) => s.toCompanyId === c && s.status === "approved")),
  // payables
  createPartnerPayable: vi.fn(async (d: any) => { mem.payables.push({ id: ++mem.seq, paidAt: null, paidBy: null, scheduledDate: null, createdAt: new Date(), ...d }); }),
  getPartnerPayableBySubmission: vi.fn(async (sid: number) => mem.payables.find((p) => p.submissionId === sid)),
  listPartnerPayables: vi.fn(async (c: number) => mem.payables.filter((p) => p.companyId === c)),
  updatePartnerPayable: vi.fn(async (id: number, d: any) => { Object.assign(mem.payables.find((p) => p.id === id)!, d); }),
}));

const mockDb = vi.hoisted(() => ({
  getClientById: vi.fn(async (_id: number): Promise<any> => undefined),
  getInvoiceById: vi.fn(async (_id: number): Promise<any> => undefined),
  getInvoiceItemsByInvoice: vi.fn(async (_id: number): Promise<any[]> => []),
  getAttendanceByDateRange: vi.fn(async (): Promise<any[]> => []),
  getAllEmployees: vi.fn(async (_c?: number): Promise<any[]> => []),
  getProjectById: vi.fn(async (_id: number): Promise<any> => undefined),
  createAuditLog: vi.fn(),
}));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return {
    id: 1, openId: "o", email: "e", name: "MTSIM_User", loginMethod: "custom", role: "admin",
    appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null,
    companyId: 1, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o,
  } as User;
}
function callerFor(companyId: number) {
  const ctx: TrpcContext = {
    user: createUser({ id: companyId * 100, companyId }), companyId,
    req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any,
  };
  return appRouter.createCaller(ctx);
}

const OTSU = 1, KONO = 2;

// 乙島の請求書（P2シナリオの確定値: 総額564,775円）。内部メモに機密センチネル
const INVOICE = {
  id: 701, companyId: OTSU, invoiceNumber: "INV-2025-02-001", subject: "2月分請求書 甲野タワー新築工事",
  periodStart: new Date("2025-02-01"), periodEnd: new Date("2025-02-28"),
  issueDate: new Date("2025-03-01"), dueDate: new Date("2025-03-31"),
  subtotal: 515250, taxAmount: 49525, totalAmount: 564775, projectId: 801,
  internalMemo: "SECRET_PROJECT_IDS_MEMO", notes: "SECRET_NOTES",
};
const ITEMS = [
  { itemType: "normal", description: "電気工事業A", quantity: 20, unit: "日", unitPrice: 32000, amount: 64000, itemTaxRate: 10, sortOrder: 1, notes: "SECRET_ITEM_NOTE" },
  { itemType: "normal", description: "交通費", quantity: 1, unit: "式", unitPrice: 20000, amount: 20000, itemTaxRate: 0, sortOrder: 9 },
];
const OTSU_ATTENDANCE = [
  { employeeId: 601, projectId: 801, workDate: new Date("2025-02-03"), hoursWorked: 80, overtimeHours: 0, shiftType: "day", workType: "normal" },
  { employeeId: 601, projectId: 801, workDate: new Date("2025-02-10"), hoursWorked: 80, overtimeHours: 60, shiftType: "day", workType: "normal" },
];

async function establishLink(): Promise<number> {
  mockDb.getClientById.mockResolvedValue({ id: 501, name: "MTSIM 甲野電設株式会社", companyId: OTSU });
  const inv = await callerFor(OTSU).connect.partner.invite({ clientId: 501 });
  const acc = await callerFor(KONO).connect.partner.accept({ token: inv.token });
  return acc.linkId;
}

async function submitInvoice(linkId: number) {
  mockDb.getInvoiceById.mockResolvedValue(INVOICE);
  mockDb.getInvoiceItemsByInvoice.mockResolvedValue(ITEMS);
  mockDb.getAttendanceByDateRange.mockResolvedValue(OTSU_ATTENDANCE);
  mockDb.getAllEmployees.mockResolvedValue([{ id: 601, nameKanji: "MTSIM 乙島 一郎" }]);
  return callerFor(OTSU).connect.invoice.submit({ partnerLinkId: linkId, invoiceId: 701 });
}

beforeEach(() => {
  vi.clearAllMocks();
  mem.links.length = 0; mem.maps.length = 0; mem.invSubs.length = 0; mem.payables.length = 0; mem.seq = 0;
  process.env.MULTI_TENANT = "true";
});
afterEach(() => { delete process.env.MULTI_TENANT; });

describe("connect.invoice: 提出スナップショット", () => {
  it("請求書+明細+出面明細が凍結され、内部メモ等の機密センチネルは一切含まれない", async () => {
    const linkId = await establishLink();
    const res = await submitInvoice(linkId);
    expect(res.submittedAmount).toBe(564775);

    const sub = mem.invSubs.find((s) => s.id === res.submissionId)!;
    const snap = sub.snapshotJson;
    expect(snap.invoiceNumber).toBe("INV-2025-02-001");
    expect(snap.totalAmount).toBe(564775);
    expect(snap.items).toHaveLength(2);
    expect(snap.attendance).toHaveLength(2);
    expect(snap.attendance[0].workerName).toBe("MTSIM 乙島 一郎");
    expect(JSON.stringify(snap)).not.toContain("SECRET");
    expect(sub.billingPeriodFrom).toBe("2025-02-01");
    expect(sub.billingPeriodTo).toBe("2025-02-28");
  });

  it("他社の請求書は提出できない（NOT_FOUND）", async () => {
    const linkId = await establishLink();
    mockDb.getInvoiceById.mockResolvedValue({ ...INVOICE, companyId: KONO });
    await expect(callerFor(OTSU).connect.invoice.submit({ partnerLinkId: linkId, invoiceId: 701 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("connect.invoice: 出面突合（甲野側）", () => {
  it("氏名×日付で照合し、時間の不一致と片側欠落を明示する", async () => {
    const linkId = await establishLink();
    const res = await submitInvoice(linkId);
    await callerFor(KONO).connect.invoice.markReceived({ submissionId: res.submissionId });

    // 甲野側の出面記録: 2/3は一致、2/10は残業時間が違う、2/17は甲野側にしかない
    mockDb.getProjectById.mockResolvedValue({ id: 901, name: "甲野側の同現場", companyId: KONO });
    mockDb.getAttendanceByDateRange.mockResolvedValue([
      { employeeId: 701, projectId: 901, workDate: new Date("2025-02-03"), hoursWorked: 80, overtimeHours: 0, shiftType: "day", workType: "normal" },
      { employeeId: 701, projectId: 901, workDate: new Date("2025-02-10"), hoursWorked: 80, overtimeHours: 40, shiftType: "day", workType: "normal" },
      { employeeId: 701, projectId: 901, workDate: new Date("2025-02-17"), hoursWorked: 80, overtimeHours: 0, shiftType: "day", workType: "normal" },
    ]);
    mockDb.getAllEmployees.mockResolvedValue([{ id: 701, nameKanji: "MTSIM 乙島 一郎" }]);

    const cmp = await callerFor(KONO).connect.invoice.attendanceComparison({ submissionId: res.submissionId, projectId: 901 });
    expect(cmp.rows.find((r) => r.workDate === "2025-02-03")?.result).toBe("match");
    const mismatch = cmp.rows.find((r) => r.workDate === "2025-02-10")!;
    expect(mismatch.result).toBe("hours_mismatch");
    expect(mismatch.submitted?.overtimeHoursTimes10).toBe(60);
    expect(mismatch.receiver?.overtimeHoursTimes10).toBe(40);
    expect(cmp.rows.find((r) => r.workDate === "2025-02-17")?.result).toBe("missing_in_submitter");
    expect(cmp.matchCount).toBe(1);
    expect(cmp.mismatchCount).toBe(2);
  });
});

describe("connect.invoice: 査定承認→買掛→支払の対称表示", () => {
  it("協力会費を控除した承認額で買掛が自動起票され、支払済みが乙島の提出箱に見える", async () => {
    const linkId = await establishLink();
    const res = await submitInvoice(linkId);

    const approved = await callerFor(KONO).connect.invoice.approve({
      submissionId: res.submissionId,
      adjustments: [{ label: "協力会費", amount: 5000 }, { label: "安全協力費", amount: 3000 }],
    });
    expect(approved.approvedAmount).toBe(564775 - 8000);

    // 買掛は甲野側に承認額で起票
    const payables = await callerFor(KONO).connect.payable.list();
    expect(payables).toHaveLength(1);
    expect(payables[0]).toMatchObject({ companyId: KONO, counterpartyCompanyId: OTSU, amount: 556775, status: "unpaid" });

    // 甲野が支払済みに → 乙島の提出箱に payableStatus=paid が見える
    await callerFor(KONO).connect.payable.setStatus({ payableId: payables[0].id, status: "paid" });
    const outbox = await callerFor(OTSU).connect.invoice.outbox();
    expect(outbox[0].payableStatus).toBe("paid");
    expect(outbox[0].status).toBe("approved");
    expect(outbox[0].approvedAmount).toBe(556775);
  });

  it("控除が申告額を超える承認は拒否／差戻しは理由必須で、再提出は新版・承認済みは差替え不可", async () => {
    const linkId = await establishLink();
    const res = await submitInvoice(linkId);
    await expect(callerFor(KONO).connect.invoice.approve({
      submissionId: res.submissionId, adjustments: [{ label: "過大控除", amount: 999999999 }],
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await callerFor(KONO).connect.invoice.returnSubmission({ submissionId: res.submissionId, reason: "出面が合いません（2/10）" });
    expect(mem.invSubs.find((s) => s.id === res.submissionId)!.status).toBe("returned");

    const v2 = await submitInvoiceWithSupersede(linkId, res.submissionId);
    expect(v2.version).toBe(2);
    expect(mem.invSubs.find((s) => s.id === res.submissionId)!.status).toBe("superseded");

    // v2 を承認 → 以後の差替えは不可
    await callerFor(KONO).connect.invoice.approve({ submissionId: v2.submissionId });
    await expect(submitInvoiceWithSupersede(linkId, v2.submissionId)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

async function submitInvoiceWithSupersede(linkId: number, supersedesId: number) {
  mockDb.getInvoiceById.mockResolvedValue(INVOICE);
  mockDb.getInvoiceItemsByInvoice.mockResolvedValue(ITEMS);
  mockDb.getAttendanceByDateRange.mockResolvedValue(OTSU_ATTENDANCE);
  mockDb.getAllEmployees.mockResolvedValue([{ id: 601, nameKanji: "MTSIM 乙島 一郎" }]);
  return callerFor(OTSU).connect.invoice.submit({ partnerLinkId: linkId, invoiceId: 701, supersedesId });
}

describe("connect.invoice: 多段チェーンの原価参照（P3）", () => {
  it("甲野は承認済み受領請求を承認額そのまま（税再計算なし）で原価参照できる", async () => {
    const linkId = await establishLink();
    const res = await submitInvoice(linkId);
    await callerFor(KONO).connect.invoice.approve({
      submissionId: res.submissionId, adjustments: [{ label: "協力会費", amount: 5000 }],
    });

    const refs = await callerFor(KONO).connect.invoice.costReferences();
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      fromCompanyId: OTSU,
      invoiceNumber: "INV-2025-02-001",
      costAmount: 564775 - 5000, // 承認額をそのまま参照。明細の税を再計算しない
    });
  });
});

describe("純関数の境界値", () => {
  it("computeApprovedAmount / compareAttendance の空・同値ケース", () => {
    expect(computeApprovedAmount(1000, [])).toBe(1000);
    const same = { workerName: "A", workDate: "2025-02-01", shiftType: "day", hoursWorkedTimes10: 80, overtimeHoursTimes10: 0 };
    const cmp = compareAttendance([same], [same]);
    expect(cmp.matchCount).toBe(1);
    expect(cmp.mismatchCount).toBe(0);
  });
});
