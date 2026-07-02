import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  submission: undefined as any,
  attendance: [] as any[],
  expenseLines: [] as any[],
  v1Submissions: [] as any[],
}));

vi.mock("./db", () => ({
  getMonthlyClosingV2WorkerSubmission: vi.fn(async () => state.submission),
  getAttendanceByDateRange: vi.fn(async () => state.attendance),
  getMonthlyClosingV2ExpenseLinesByWorkerMonth: vi.fn(async () => state.expenseLines),
  getClosingSubmissionsByEmployeeMonth: vi.fn(async () => state.v1Submissions),
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

const build = () => buildWorkerInvoiceDraftFromV2({ workerId: 10, targetMonth: "2026-04" });

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

  it("残業代を日勤単価÷8×1.25で自動計上する", async () => {
    state.attendance = [
      { employeeId: 10, projectId: 1, shiftType: "day", workDate: "2026-04-01", hoursWorked: 80, overtimeHours: 40, workType: "normal" },
    ];
    state.expenseLines = [];
    const draft = await build();
    const ot = draft.items.find((i: any) => i.label.startsWith("残業代"))!;
    // 15000 / 8 * 1.25 = 2343.75 -> 2344 ; × 4h = 9,376
    expect(ot.unit).toBe("時間");
    expect(ot.quantity).toBe(4);
    expect(ot.unitPrice).toBe(2344);
    expect(ot.amount).toBe(9376);
    expect(draft.warnings.some((w: string) => w.includes("残業代") && w.includes("深夜"))).toBe(true);
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
