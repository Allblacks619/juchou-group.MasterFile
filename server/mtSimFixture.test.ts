import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeClientInvoiceDraft } from "./clientInvoiceV2Core";

const state = vi.hoisted(() => ({
  clients: [] as any[],
  employees: [] as any[],
  projects: [] as any[],
  rates: [] as any[],
  closing: undefined as any,
  projSeq: 500,
  empSeq: 600,
}));

const calls = vi.hoisted(() => ({
  createClient: vi.fn(async (d: any) => ({ id: 550, ...d })),
  createEmployee: vi.fn(async (d: any) => ({ id: ++state.empSeq, ...d })),
  createProject: vi.fn(async (d: any) => ({ id: ++state.projSeq, ...d })),
  updateEmployee: vi.fn(async (_id: number, _d: any) => ({})),
  deleteEmployeeRate: vi.fn(async (_id: number) => {}),
  createEmployeeRate: vi.fn(async (_d: any) => ({ id: 1 })),
  upsertAttendance: vi.fn(async (_d: any) => ({ id: 1 })),
  createProjectClosing: vi.fn(async (d: any) => ({ id: 701, ...d })),
  upsertClosingSubmission: vi.fn(async (d: any) => ({ id: 1, ...d })),
  addProjectMember: vi.fn(async (d: any) => ({ id: 1, ...d })),
  upsertMonthlyClosingV2ProjectReview: vi.fn(async (d: any) => ({ id: 1, ...d })),
  upsertMonthlyClosingV2ParticipantReview: vi.fn(async (d: any) => ({ id: 1, ...d })),
  upsertMonthlyClosingV2TransportationExpense: vi.fn(async (d: any) => ({ id: 1, ...d })),
}));

vi.mock("./db", () => ({
  getAllClients: vi.fn(async () => state.clients),
  getAllEmployees: vi.fn(async () => state.employees),
  getAllProjects: vi.fn(async () => state.projects),
  getAllEmployeeRates: vi.fn(async () => state.rates),
  getProjectClosingByProjectMonth: vi.fn(async () => state.closing),
  ...calls,
}));

import {
  seedMtSimFixture,
  buildOtsuToKonoInvoiceInput,
  buildHeidaToOtsuInvoiceInput,
  MTSIM_MONTH,
  MTSIM_COMPANIES,
  MTSIM_GUESTS,
} from "./mtSimFixture";

describe("seedMtSimFixture（3社チェーン・乙島視点のシード）", () => {
  beforeEach(() => {
    state.clients = []; state.employees = []; state.projects = []; state.rates = []; state.closing = undefined;
    state.projSeq = 500; state.empSeq = 600;
    Object.values(calls).forEach((fn) => fn.mockClear());
  });

  it("取引先=甲野電設・現場1・乙島従業員2を作成し、2025-02のデータ一式を投入する", async () => {
    const result = await seedMtSimFixture();

    expect(MTSIM_MONTH).toBe("2025-02");
    expect(calls.createClient).toHaveBeenCalledTimes(1);
    expect(calls.createClient.mock.calls[0][0].name).toBe(MTSIM_COMPANIES.KONO.name);
    expect(calls.createProject).toHaveBeenCalledTimes(1);
    expect(calls.createEmployee).toHaveBeenCalledTimes(2);
    expect(result.workers).toHaveLength(2);

    // 単価3パターン（E1 day/night, E2 day）
    expect(calls.createEmployeeRate).toHaveBeenCalledTimes(3);

    // 全エンティティ名が MTSIM 接頭辞（本番データと完全分離）
    expect(calls.createClient.mock.calls[0][0].name.startsWith("MTSIM ")).toBe(true);
    expect(calls.createProject.mock.calls[0][0].name.startsWith("MTSIM ")).toBe(true);
    for (const c of calls.createEmployee.mock.calls) {
      expect(c[0].nameKanji.startsWith("MTSIM ")).toBe(true);
    }
  });

  it("甲野職人をゲスト出面（guestName・employeeId なし）として投入する — P2パターンの入口", async () => {
    const result = await seedMtSimFixture();

    // 従業員出面 E1:12 + E2:8 = 20、ゲスト出面 5+3 = 8
    expect(result.attendanceRecords).toBe(20);
    expect(result.guestAttendanceRecords).toBe(8);
    expect(calls.upsertAttendance).toHaveBeenCalledTimes(28);

    const guestCalls = calls.upsertAttendance.mock.calls.filter((c) => c[0].guestName);
    expect(guestCalls).toHaveLength(8);
    for (const c of guestCalls) {
      expect(c[0].employeeId).toBeNull();
      expect(c[0].guestName.startsWith("MTSIM ")).toBe(true);
      expect((c[0].workDate as Date).toISOString().startsWith("2025-02-")).toBe(true);
    }
    const guestNames = new Set(guestCalls.map((c) => c[0].guestName));
    expect(guestNames).toEqual(new Set(MTSIM_GUESTS.map((g) => g.name)));
  });

  it("月締めは乙島従業員のみ対象（ゲストは提出・参加者レビューに含まれない）", async () => {
    await seedMtSimFixture();

    expect(calls.upsertMonthlyClosingV2ProjectReview).toHaveBeenCalledTimes(1);
    expect(calls.upsertMonthlyClosingV2ProjectReview.mock.calls[0][0].status).toBe("締め完了");

    // 提出・参加者レビュー・交通費は従業員2名分のみ（ゲスト2名は含まれない）
    expect(calls.upsertClosingSubmission).toHaveBeenCalledTimes(2);
    expect(calls.upsertMonthlyClosingV2ParticipantReview).toHaveBeenCalledTimes(2);
    expect(calls.upsertMonthlyClosingV2TransportationExpense).toHaveBeenCalledTimes(2);
    for (const c of calls.upsertMonthlyClosingV2TransportationExpense.mock.calls) {
      expect(c[0].clientBillable).toBe(true);
      expect(c[0].payerType).toBe("worker_paid");
    }
  });

  it("冪等: 既存 MTSIM エンティティがあれば再作成せず、本番想定の他レートを消さない", async () => {
    const first = await seedMtSimFixture();
    // 2回目: 1回目の作成物を「既存」として提示
    state.clients = [{ id: first.clientId, name: MTSIM_COMPANIES.KONO.name }];
    state.projects = [{ id: first.projectId, name: "MTSIM 甲野タワー新築工事" }];
    state.employees = first.workers.map((w) => ({ id: w.id, nameKanji: w.name }));
    // 本番想定のレート（別現場・別従業員）は削除されないこと
    state.rates = [{ id: 9999, projectId: 1, employeeId: 1 }];
    Object.values(calls).forEach((fn) => fn.mockClear());

    await seedMtSimFixture();
    expect(calls.createClient).not.toHaveBeenCalled();
    expect(calls.createProject).not.toHaveBeenCalled();
    expect(calls.createEmployee).not.toHaveBeenCalled();
    expect(calls.deleteEmployeeRate).not.toHaveBeenCalled();
  });
});

describe("P2: 乙島電業 → 甲野電設 請求計算（管理代行現場・ゲスト非請求）", () => {
  it("A/B/C単価順・深夜band・交通費0%を含む請求書を確定金額で再現する", () => {
    const out = computeClientInvoiceDraft(buildOtsuToKonoInvoiceInput());
    const normal = out.items.filter((i) => i.itemType === "normal");

    // A/B/C は請求単価が高い順（A=夜勤32,000 / B=昼24,000 / C=昼21,000）。数量は×10（20=2.0日）
    const gyo = normal.filter((i) => i.description.startsWith("電気工事業"));
    expect(gyo.map((i) => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([
      ["電気工事業A", 20, 32000, 64000],
      ["電気工事業B", 100, 24000, 240000],
      ["電気工事業C", 80, 21000, 168000],
    ]);

    // 昼勤6h残業 → 5h時間外(24,000/8×1.25=3,750) + 1h深夜(24,000/8×1.5=4,500)
    const reg = out.items.find((i) => i.description === "残業代（時間外）")!;
    const late = out.items.find((i) => i.description === "残業代（深夜）")!;
    expect([reg.quantity, reg.unitPrice, reg.amount]).toEqual([5, 3750, 18750]);
    expect([late.quantity, late.unitPrice, late.amount]).toEqual([1, 4500, 4500]);

    // 交通費は現場単位で0%の1行（12,000 + 8,000）
    const transport = out.items.find((i) => i.description === "交通費")!;
    expect([transport.amount, transport.itemTaxRate]).toEqual([20000, 0]);

    // 合計: 労務495,250 @10% + 交通費20,000 @0%
    expect(out.subtotal).toBe(515250);
    expect(out.taxAmount).toBe(49525);
    expect(out.totalAmount).toBe(564775);
  });

  it("甲野職人（ゲスト）の名前は請求書のどこにも現れない（作業員名は元々外部非表示・ゲストは労務にも入らない）", () => {
    const out = computeClientInvoiceDraft(buildOtsuToKonoInvoiceInput());
    const everything = JSON.stringify(out.items) + out.internalRateMemo;
    for (const g of MTSIM_GUESTS) {
      expect(everything.includes(g.name)).toBe(false);
    }
  });
});

describe("P1: 丙田工業 → 乙島電業 請求計算（免税事業者・多段チェーンの下段）", () => {
  it("インボイス未登録なので全行0%・同単価2名は1行に集約される", () => {
    const out = computeClientInvoiceDraft(buildHeidaToOtsuInvoiceInput());
    const normal = out.items.filter((i) => i.itemType === "normal");

    // 同単価（18,000）は1バケット = 電気工事業A に集約（12日+8日=20.0日）
    const gyo = normal.filter((i) => i.description.startsWith("電気工事業"));
    expect(gyo.map((i) => [i.description, i.quantity, i.unitPrice, i.amount])).toEqual([
      ["電気工事業A", 200, 18000, 360000],
    ]);

    // 免税 → 全行0%・税0円
    expect(normal.every((i) => i.itemTaxRate === 0)).toBe(true);
    expect(out.taxAmount).toBe(0);
    expect(out.subtotal).toBe(365000);
    expect(out.totalAmount).toBe(365000);
    expect(out.warnings.some((w) => w.includes("インボイス番号") && w.includes("0%"))).toBe(true);
  });
});

describe("P3: 多段チェーンの整合（丙田→乙島→甲野）", () => {
  it("下段請求の承認額は税を再計算せずそのまま原価参照し、上段請求との差が乙島の粗利になる", () => {
    // PLAN_v1.md §2.4-4: 取り込みは「原価参照」であり明細単位の税再計算をしない
    const heida = computeClientInvoiceDraft(buildHeidaToOtsuInvoiceInput());
    const otsu = computeClientInvoiceDraft(buildOtsuToKonoInvoiceInput());

    const costReference = heida.totalAmount; // 承認額をそのまま参照（再計算禁止）
    expect(costReference).toBe(365000);

    // 乙島の売上（対甲野）と外注原価（対丙田）の関係が決定的に再現できる
    expect(otsu.totalAmount).toBe(564775);
    expect(otsu.totalAmount - costReference).toBe(199775);
    expect(otsu.totalAmount - costReference).toBeGreaterThan(0);
  });
});
