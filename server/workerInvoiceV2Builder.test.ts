import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  submission: undefined as any,
  attendance: [] as any[],
  expenseLines: [] as any[],
  v1Submissions: [] as any[],
  workerInvoiceIssuerNumber: "T1234567890123" as string | null,
}));

vi.mock("./db", () => ({
  getMonthlyClosingV2WorkerSubmission: vi.fn(async () => state.submission),
  getAttendanceByDateRange: vi.fn(async () => state.attendance),
  getMonthlyClosingV2ExpenseLinesByWorkerMonth: vi.fn(async () => state.expenseLines),
  getClosingSubmissionsByEmployeeMonth: vi.fn(async () => state.v1Submissions),
  getEmployeeById: vi.fn(async (id: number) => ({
    id,
    isInvoiceIssuer: state.workerInvoiceIssuerNumber != null,
    invoiceIssuerNumber: state.workerInvoiceIssuerNumber,
  })),
  getProjectById: vi.fn(async (id: number) =>
    id === 1 ? { id: 1, name: "現場A", clientId: 77 } : id === 2 ? { id: 2, name: "現場B", clientId: 77 } : undefined
  ),
}));

vi.mock("./rateResolver", () => ({
  resolveWorkerPaymentRate: vi.fn(async ({ projectId, shiftType }: any) => {
    if (projectId === 1 && shiftType === "day") return { rate: 15000, source: "project_variable" };
    if (projectId === 1 && shiftType === "night") return { rate: 18000, source: "project_variable" };
    throw new Error("作業員支払単価が未設定です");
  }),
}));

import { buildWorkerInvoiceDraftFromV2, WorkerMonthlyClosingNotSubmittedError } from "./workerInvoiceV2Builder";

const build = (opts?: { includeProjectSectionHeaders?: boolean }) =>
  buildWorkerInvoiceDraftFromV2({
    workerId: 10,
    targetMonth: "2026-04",
    includeProjectSectionHeaders: opts?.includeProjectSectionHeaders ?? false,
  });

describe("buildWorkerInvoiceDraftFromV2", () => {
  beforeEach(() => {
    state.submission = { workerId: 10, targetMonth: "2026-04", status: "submitted" };
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-02", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "night", workDate: "2026-04-03", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 2, shiftType: "day", workDate: "2026-04-04", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-05", hoursWorked: 0, workType: "day_off" },
      { employeeId: 11, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, workType: "normal" },
    ];
    state.expenseLines = [
      { id: 1, workerId: 10, targetMonth: "2026-04", projectId: 1, expenseType: "transportation", amount: 3000, paymentMethod: "paid_by_worker" },
      { id: 2, workerId: 10, targetMonth: "2026-04", projectId: 2, expenseType: "transportation", amount: 5000, paymentMethod: "company_card" },
      { id: 3, workerId: 10, targetMonth: "2026-04", projectId: 1, expenseType: "other", amount: 2000, paymentMethod: "paid_by_worker" },
      { id: 4, workerId: 10, targetMonth: "2026-04", projectId: null, expenseType: "transportation", amount: 1000, paymentMethod: "paid_by_worker" },
    ];
    state.v1Submissions = [];
    state.workerInvoiceIssuerNumber = "T1234567890123";
  });

  it("月締め未提出（not_submitted）では生成不可", async () => {
    state.submission = { workerId: 10, targetMonth: "2026-04", status: "not_submitted" };
    await expect(build()).rejects.toBeInstanceOf(WorkerMonthlyClosingNotSubmittedError);
  });

  it("提出レコードが無い場合も生成不可", async () => {
    state.submission = undefined;
    await expect(build()).rejects.toBeInstanceOf(WorkerMonthlyClosingNotSubmittedError);
  });

  it("出面×単価で労務費を現場・シフト別に自動計上する", async () => {
    const draft = await build();
    const labor = draft.items.filter((i) => i.category === "labor");
    const day = labor.find((i) => i.projectId === 1 && i.shiftType === "day")!;
    const night = labor.find((i) => i.projectId === 1 && i.shiftType === "night")!;
    expect(day.quantity).toBe(2);
    expect(day.unitPrice).toBe(15000);
    expect(day.amount).toBe(30000);
    expect(day.taxRate).toBe(10);
    expect(night.quantity).toBe(1);
    expect(night.amount).toBe(18000);
    expect(draft.laborAmount).toBe(48000);
  });

  it("他作業員の出面と休日（day_off）は集計しない", async () => {
    const draft = await build();
    expect(draft.attendanceBreakdown).toHaveLength(4);
    expect(draft.attendanceBreakdown.every((d) => d.workType !== "day_off")).toBe(true);
    // breakdown carries project names and is sorted by date
    expect(draft.attendanceBreakdown[0].workDate).toBe("2026-04-01");
    expect(draft.attendanceBreakdown[0].projectName).toBe("現場A");
  });

  it("単価未設定の現場はエラーにせず警告＋金額0で明細化する", async () => {
    const draft = await build();
    const proj2 = draft.items.find((i) => i.category === "labor" && i.projectId === 2)!;
    expect(proj2.unitPrice).toBe(0);
    expect(proj2.amount).toBe(0);
    expect(draft.warnings.some((w) => w.includes("単価未設定"))).toBe(true);
  });

  it("作業員立替（paid_by_worker）の交通費・経費のみ計上し、会社カード等は除外する", async () => {
    const draft = await build();
    expect(draft.transportAmount).toBe(4000); // 3000 + 1000
    expect(draft.expenseAmount).toBe(2000);
    expect(draft.excludedExpenseLines).toHaveLength(1);
    expect(draft.excludedExpenseLines[0].paymentMethod).toBe("company_card");
    expect(draft.excludedExpenseLines[0].amount).toBe(5000);
  });

  it("小計・消費税・合計を正しく計算する", async () => {
    const draft = await build();
    expect(draft.subtotal).toBe(54000);
    expect(draft.taxAmount).toBe(4800); // labor 10% only
    expect(draft.totalAmount).toBe(58800);
  });

  it("作業員がインボイス番号未登録なら労務費の消費税10%を適用しない（0%）", async () => {
    state.workerInvoiceIssuerNumber = null; // 適格請求書発行事業者番号 未登録
    const draft = await build();
    const labor = draft.items.filter((i) => i.category === "labor");
    expect(labor.length).toBeGreaterThan(0);
    expect(labor.every((i) => i.taxRate === 0)).toBe(true);
    expect(draft.taxAmount).toBe(0);
    expect(draft.totalAmount).toBe(draft.subtotal);
    expect(draft.warnings.some((w) => w.includes("インボイス番号") && w.includes("0%"))).toBe(true);
  });

  it("作業員がインボイス番号を登録済みなら労務費は10%", async () => {
    state.workerInvoiceIssuerNumber = "T9876543210987";
    const draft = await build();
    const labor = draft.items.filter((i) => i.category === "labor");
    expect(labor.every((i) => i.taxRate === 10)).toBe(true);
    expect(draft.taxAmount).toBe(4800);
  });

  it("交通費は現場ごとに出面日数で日割り按分し、端数は最終日に乗せる", async () => {
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-02", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-03", hoursWorked: 80, workType: "normal" },
    ];
    // one monthly transport total for project 1 (¥10,000) → ¥3,333 ×2 + ¥3,334 on the last day
    state.expenseLines = [
      { id: 1, workerId: 10, targetMonth: "2026-04", projectId: 1, expenseType: "transportation", amount: 10000, paymentMethod: "paid_by_worker" },
    ];
    const draft = await build();
    const byDate = Object.fromEntries(draft.attendanceBreakdown.map((d) => [d.workDate, d.transport]));
    expect(byDate["2026-04-01"]).toBe(3333);
    expect(byDate["2026-04-02"]).toBe(3333);
    expect(byDate["2026-04-03"]).toBe(3334); // remainder on the last worked day
    // sum of prorated per-day == invoice transport total
    const perDaySum = draft.attendanceBreakdown.reduce((s, d) => s + d.transport, 0);
    expect(perDaySum).toBe(10000);
    expect(draft.transportAmount).toBe(10000);
  });

  it("日報の出面内訳に残業時間を持つ", async () => {
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, overtimeHours: 40, workType: "normal" },
    ];
    state.expenseLines = [];
    const draft = await build();
    expect(draft.attendanceBreakdown[0].overtimeHours).toBe(4); // 40 / 10 = 4.0h
  });

  it("昼勤の残業は4hまで時間外(×1.25)で自動計上する", async () => {
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, overtimeHours: 40, workType: "normal" },
    ];
    state.expenseLines = [];
    const draft = await build();
    const ot = draft.items.filter((i: any) => i.label.startsWith("残業代"));
    // 4h ちょうど → 全て時間外、深夜帯は発生しない
    expect(ot).toHaveLength(1);
    expect(ot[0].label).toContain("時間外");
    expect(ot[0].unit).toBe("時間");
    expect(ot[0].quantity).toBe(4);
    // 15000 / 8 * 1.25 = 2343.75 -> 2344 ; × 4h = 9,376
    expect(ot[0].unitPrice).toBe(2344);
    expect(ot[0].amount).toBe(9376);
  });

  it("昼勤の残業は5時間目以降を深夜帯(×1.50)で自動計上する", async () => {
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, overtimeHours: 60, workType: "normal" },
    ];
    state.expenseLines = [];
    const draft = await build();
    const regular = draft.items.find((i: any) => i.label.includes("残業代（時間外）"))!;
    const late = draft.items.find((i: any) => i.label.includes("残業代（深夜）"))!;
    // 6h の残業 → 4h 時間外 + 2h 深夜帯
    expect(regular.quantity).toBe(4);
    expect(regular.unitPrice).toBe(2344); // 15000/8*1.25
    expect(regular.amount).toBe(9376);
    expect(late.quantity).toBe(2);
    expect(late.unitPrice).toBe(2813); // 15000/8*1.5 = 2812.5 -> 2813
    expect(late.amount).toBe(5626); // 2813 × 2h
    expect(draft.warnings.some((w: string) => w.includes("深夜帯残業"))).toBe(true);
  });

  it("夜勤の残業は全て深夜帯(×1.50)で自動計上する", async () => {
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "night", workDate: "2026-04-03", hoursWorked: 80, overtimeHours: 30, workType: "normal" },
    ];
    state.expenseLines = [];
    const draft = await build();
    const ot = draft.items.filter((i: any) => i.label.startsWith("残業代"));
    expect(ot).toHaveLength(1);
    expect(ot[0].label).toContain("深夜");
    expect(ot[0].quantity).toBe(3); // 3h 全て深夜帯
    expect(ot[0].unitPrice).toBe(2813); // 日勤単価 15000/8*1.5
    expect(ot[0].amount).toBe(8439); // 2813 × 3h
  });

  it("includeProjectSectionHeaders=trueで現場ごとに【現場名】見出し行を差し込む", async () => {
    const draft = await build({ includeProjectSectionHeaders: true });
    const headers = draft.items.filter((i: any) => i.itemType === "text");
    // 現場A・現場B＋現場未割当（projectId=nullの交通費）の見出し
    expect(headers.map((h: any) => h.label)).toEqual(["【現場A】", "【現場B】", "【現場未割当】"]);
    // 見出しは金額に影響しない
    expect(headers.every((h: any) => h.amount === 0)).toBe(true);
    // 最初の明細は現場Aの見出し
    expect(draft.items[0].itemType).toBe("text");
    expect(draft.items[0].label).toBe("【現場A】");
    // 見出しを入れても小計は変わらない
    expect(draft.subtotal).toBe(54000);
  });

  it("V2提出があるときは submissionSource=v2", async () => {
    const draft = await build();
    expect(draft.submissionSource).toBe("v2");
  });

  it("V2未提出でもV1（旧月締め）提出があればブリッジして生成する", async () => {
    state.submission = undefined; // no V2 submission
    state.expenseLines = []; // no V2 expense lines
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-02", hoursWorked: 80, workType: "normal" },
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-03", hoursWorked: 80, workType: "normal" },
    ];
    state.v1Submissions = [
      { submissionId: 1, projectId: 1, status: "submitted", transportAmount: 10000, expenseAmount: 2000 },
    ];
    const draft = await build();
    expect(draft.submissionSource).toBe("v1_bridge");
    expect(draft.warnings.some((w) => w.includes("V1"))).toBe(true);
    expect(draft.laborAmount).toBe(45000); // 3日 × 15000
    expect(draft.transportAmount).toBe(10000); // V1 transport bridged + 日割り
    expect(draft.expenseAmount).toBe(2000); // V1 expense bridged
    // 交通費 prorated across the 3 days: 3333 + 3333 + 3334
    const byDate = Object.fromEntries(draft.attendanceBreakdown.map((d) => [d.workDate, d.transport]));
    expect(byDate["2026-04-03"]).toBe(3334);
  });

  it("V1も未提出なら従来どおり生成不可", async () => {
    state.submission = undefined;
    state.v1Submissions = [{ submissionId: 1, projectId: 1, status: "pending", transportAmount: 0, expenseAmount: 0 }];
    await expect(build()).rejects.toBeInstanceOf(WorkerMonthlyClosingNotSubmittedError);
  });
});
