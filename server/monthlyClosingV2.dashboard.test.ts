import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const fixture = vi.hoisted(() => ({
  employees: [
    { id: 100, nameKanji: "大木テリキ", nameRomaji: "Teriki" },
    { id: 101, nameKanji: "大木充", nameRomaji: "Mitsuru" },
    { id: 102, nameKanji: "大木早苗", nameRomaji: "Sanae" },
  ],
  clients: [
    { id: 10, name: "長山建設" },
  ],
  projects: [
    { id: 1, name: "長山 新築マンション", clientId: 10 },
    { id: 2, name: "SHIRAHAMA", clientId: null },
  ],
  attendance: [
    { id: 1, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-01"), hoursWorked: 80 },
    { id: 2, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-02"), hoursWorked: 80 },
    { id: 3, projectId: 1, employeeId: 101, guestName: null, workDate: new Date("2026-05-03"), hoursWorked: 80 },
    { id: 4, projectId: 1, employeeId: 102, guestName: null, workDate: new Date("2026-05-04"), hoursWorked: 80 },
    { id: 5, projectId: 1, employeeId: null, guestName: "応援ゲスト", workDate: new Date("2026-05-05"), hoursWorked: 80 },
    { id: 6, projectId: 2, employeeId: 100, guestName: null, workDate: new Date("2026-05-06"), hoursWorked: 80 },
    { id: 7, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-04-30"), hoursWorked: 80 },
  ],
  submissions: [
    { workerId: 100, targetMonth: "2026-05", status: "accepted", sendBackReason: null },
    { workerId: 102, targetMonth: "2026-05", status: "sent_back", sendBackReason: "出面を確認してください" },
  ],
  transportationLines: [
    { id: 501, workerId: 100, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 0, paymentMethod: "company_card", isClientBillable: false, memo: "ETC" },
    { id: 502, workerId: 101, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 1200, paymentMethod: "paid_by_worker", isClientBillable: true, memo: "客先請求" },
    { id: 503, workerId: 102, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 900, paymentMethod: "company_card", isClientBillable: false, memo: "会社カード・請求なし" },
  ],
  transportationReceipts: [
    { id: 601, expenseLineId: 501, workerId: 100, projectId: 1, targetMonth: "2026-05", originalFileName: "etc.pdf", receiptFileUrl: "https://files/につながる/receipt.pdf", mimeType: "application/pdf", fileSize: 128, uploadedAt: new Date("2026-05-31") },
  ],
}));

vi.mock("./storage", () => ({ storagePut: vi.fn(async (key: string) => ({ url: `https://storage/${key}` })) }));

vi.mock("./db", () => ({
  getAttendanceByDateRange: vi.fn(async (start: Date, end: Date, projectId?: number) =>
    fixture.attendance.filter((record) => record.workDate >= start && record.workDate <= end && (projectId == null || record.projectId === projectId))
  ),
  getAllEmployees: vi.fn(async () => fixture.employees),
  getAllProjects: vi.fn(async () => fixture.projects),
  getAllClients: vi.fn(async () => fixture.clients),
  getMonthlyClosingV2WorkerSubmissionsByMonth: vi.fn(async (targetMonth: string) =>
    fixture.submissions.filter((submission) => submission.targetMonth === targetMonth)
  ),
  getMonthlyClosingV2ProjectReviewsByMonth: vi.fn(async () => []),
  getMonthlyClosingV2ParticipantReviewsByMonth: vi.fn(async () => []),
  // 既定は「交通費未入力」の従来挙動を保つため空。入力済み判定のテストでは mockResolvedValueOnce で上書きする。
  getMonthlyClosingV2TransportationLinesByMonth: vi.fn(async () => []),
  getMonthlyClosingV2ParticipantReview: vi.fn(async () => undefined),
  upsertMonthlyClosingV2ProjectReview: vi.fn(async (data) => ({ id: 1, ...data })),
  upsertMonthlyClosingV2ParticipantReview: vi.fn(async (data) => ({ id: 1, ...data })),
  getMonthlyClosingV2ExpenseLinesByProjectMonth: vi.fn(async (projectId: number, targetMonth: string) =>
    fixture.transportationLines.filter((line) => line.projectId === projectId && line.targetMonth === targetMonth)
  ),
  getMonthlyClosingV2ExpenseLineReceiptsByExpenseLineIds: vi.fn(async (expenseLineIds: number[]) =>
    fixture.transportationReceipts.filter((receipt) => expenseLineIds.includes(receipt.expenseLineId))
  ),
  getMonthlyClosingV2ExpenseLinesByWorkerProjectMonth: vi.fn(async (workerId: number, projectId: number, targetMonth: string) =>
    fixture.transportationLines.filter((line) => line.workerId === workerId && line.projectId === projectId && line.targetMonth === targetMonth)
  ),
  upsertMonthlyClosingV2TransportationExpense: vi.fn(async (data) => ({ id: 700, expenseType: "transportation", ...data })),
  createMonthlyClosingV2ExpenseLineReceipt: vi.fn(async (data) => ({ id: 800, uploadedAt: new Date(), ...data })),
  getMonthlyClosingV2ClientTransportationBillingSummary: vi.fn(async (targetMonth: string) => [{ clientId: 10, projectId: 1, totalAmount: 1200, lineCount: 1, targetMonth }]),
  payerTypeFromPaymentMethod: vi.fn((line) => line.paymentMethod === "paid_by_worker" ? "worker_paid" : line.paymentMethod === "company_card" ? "company_card_etc" : line.paymentMethod === "paid_by_client" ? "client_paid_direct" : (line.amount || 0) === 0 ? "none" : "company_paid"),
  createAuditLog: vi.fn(async (data) => ({ id: 900, ...data })),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "admin-1",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    appRole: "manager",
    loginId: "admin",
    mustChangePassword: false,
    employeeId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  } as User;
}

function createCtx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("monthlyClosingV2.dashboard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a project/site-first dashboard with participants nested under each project", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });

    expect(result.rows.map((row) => row.projectName)).toEqual(["長山 新築マンション", "SHIRAHAMA"]);
    expect(result.rows[0]).toMatchObject({
      targetMonth: "2026-05",
      clientName: "長山建設",
      projectName: "長山 新築マンション",
      participantCount: 3,
      attendanceCount: 5,
      closingStatus: "差し戻しあり",
      warningCount: 2,
    });
    expect(result.rows[0].participants.map((participant: any) => participant.workerName)).toEqual([
      "大木テリキ",
      "大木充",
      "大木早苗",
      "応援ゲスト",
    ]);
  });

  it("displays guest attendance as excluded from aggregation and warnings", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });
    const guest = result.rows[0].participants.find((participant: any) => participant.isGuest);

    expect(guest).toMatchObject({
      category: "ゲスト / 集計対象外",
      isAggregationExcluded: true,
      transportationStatus: "集計対象外",
      invoiceInfoStatus: "集計対象外",
      missingInfo: "ゲストのため集計対象外",
      warningCount: 0,
    });
    expect(result.rows[0].participantCount).toBe(3);
    expect(result.rows[0].warningCount).toBe(2);
  });

  it("休・欠勤・時間0は出勤日数に数えない（出面表と一致）（#3）", async () => {
    const extra = [
      // 休（day_off）は時間があっても出勤に数えない
      { id: 9001, projectId: 1, employeeId: 101, guestName: null, workDate: new Date("2026-05-10"), workType: "day_off", hoursWorked: 80 },
      // 「出勤扱い」でも実働時間0は数えない（休を normal/0h で記録した場合の取りこぼし対策）
      { id: 9002, projectId: 1, employeeId: 101, guestName: null, workDate: new Date("2026-05-11"), workType: "normal", hoursWorked: 0 },
    ];
    fixture.attendance.push(...(extra as any));
    try {
      const caller = appRouter.createCaller(createCtx(createUser()));
      const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });
      const mitsuru = result.rows[0].participants.find((p: any) => p.workerName === "大木充");
      expect(mitsuru.attendanceCount).toBe(1); // 1 worked record (80h); day_off and 0h not counted
    } finally {
      fixture.attendance.splice(fixture.attendance.length - extra.length, extra.length);
    }
  });

  it("交通費が入力済み（0円=交通費なし含む）なら『交通費未入力』の警告を出さない", async () => {
    // worker:100 は月締め未提出だが、管理者が交通費なし（amount 0, none→other）を保存済み。
    (db.getMonthlyClosingV2TransportationLinesByMonth as any).mockResolvedValueOnce([
      { id: 901, workerId: 100, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 0, paymentMethod: "other" },
    ]);
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });
    const teriki = result.rows[0].participants.find((p: any) => p.workerName === "大木テリキ");
    expect(teriki.individualStatus).not.toBe("交通費未入力");
    expect(teriki.transportationStatus).toBe("入力済み");
    expect(teriki.warningCount).toBe(0);
  });

  it("保存済みの『交通費未入力』ステータスも、交通費入力後は陳腐化として自動解除する", async () => {
    (db.getMonthlyClosingV2TransportationLinesByMonth as any).mockResolvedValueOnce([
      { id: 902, workerId: 100, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 0, paymentMethod: "other" },
    ]);
    (db.getMonthlyClosingV2ParticipantReviewsByMonth as any).mockResolvedValueOnce([
      { projectId: 1, participantKey: "worker:100", individualStatus: "交通費未入力", transportationStatus: "未入力", isAggregationExcluded: false },
    ]);
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });
    const teriki = result.rows[0].participants.find((p: any) => p.workerName === "大木テリキ");
    expect(teriki.individualStatus).not.toBe("交通費未入力");
    expect(teriki.warningCount).toBe(0);
  });

  it("参加者が全員締め完了なら、古い『差し戻しあり』は解消される（#2 reconcile）", async () => {
    (db.getMonthlyClosingV2ParticipantReviewsByMonth as any).mockResolvedValueOnce([
      { projectId: 1, participantKey: "worker:100", individualStatus: "締め完了", isAggregationExcluded: false },
      { projectId: 1, participantKey: "worker:101", individualStatus: "締め完了", isAggregationExcluded: false },
      { projectId: 1, participantKey: "worker:102", individualStatus: "締め完了", isAggregationExcluded: false },
    ]);
    (db.getMonthlyClosingV2ProjectReviewsByMonth as any).mockResolvedValueOnce([
      { projectId: 1, status: "差し戻しあり" },
    ]);
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.dashboard({ targetMonth: "2026-05" });
    expect(result.rows[0].closingStatus).toBe("締め完了");
  });

  it("persists project review status edits in V2-specific storage", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));
    const result = await caller.monthlyClosingV2.updateProjectStatus({
      targetMonth: "2026-05",
      projectId: 1,
      status: "確認中",
    });

    expect(result).toMatchObject({ targetMonth: "2026-05", projectId: 1, status: "確認中" });
  });

  it("requires admin privilege and a reason to include an excluded guest", async () => {
    const managerCaller = appRouter.createCaller(createCtx(createUser({ appRole: "manager" })));
    await expect(managerCaller.monthlyClosingV2.updateParticipantStatus({
      targetMonth: "2026-05",
      projectId: 1,
      participantKey: "guest:応援ゲスト",
      workerId: null,
      guestName: "応援ゲスト",
      individualStatus: "未確認",
      transportationStatus: "確認待ち",
      invoiceInfoStatus: "確認待ち",
      sendBackReason: "",
      missingInfo: "",
      isAggregationExcluded: false,
      aggregationOverrideReason: "応援費を今回だけ請求対象にするため",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const adminCaller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" })));
    await expect(adminCaller.monthlyClosingV2.updateParticipantStatus({
      targetMonth: "2026-05",
      projectId: 1,
      participantKey: "guest:応援ゲスト",
      workerId: null,
      guestName: "応援ゲスト",
      individualStatus: "未確認",
      transportationStatus: "確認待ち",
      invoiceInfoStatus: "確認待ち",
      sendBackReason: "",
      missingInfo: "",
      isAggregationExcluded: false,
      aggregationOverrideReason: "",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const result = await adminCaller.monthlyClosingV2.updateParticipantStatus({
      targetMonth: "2026-05",
      projectId: 1,
      participantKey: "guest:応援ゲスト",
      workerId: null,
      guestName: "応援ゲスト",
      individualStatus: "未確認",
      transportationStatus: "確認待ち",
      invoiceInfoStatus: "確認待ち",
      sendBackReason: "",
      missingInfo: "管理者により集計対象に含める",
      isAggregationExcluded: false,
      aggregationOverrideReason: "応援費を今回だけ請求対象にするため",
    });

    expect(result).toMatchObject({
      targetMonth: "2026-05",
      projectId: 1,
      participantKey: "guest:応援ゲスト",
      isAggregationExcluded: false,
      aggregationOverrideReason: "応援費を今回だけ請求対象にするため",
      aggregationOverrideBy: 1,
    });
  });

  it("stores transportation payment method, client billable flag, receipt metadata, and memo per target month/project/worker", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" })));

    await expect(caller.monthlyClosingV2.upsertTransportationExpense({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 101,
      payerType: "worker_paid",
      clientBillable: true,
      amount: 1500,
      memo: "作業員精算し客先請求",
    })).resolves.toMatchObject({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 101,
      payerType: "worker_paid",
      clientBillable: true,
      amount: 1500,
      memo: "作業員精算し客先請求",
    });

    const expenses = await caller.monthlyClosingV2.getTransportationExpenses({ targetMonth: "2026-05", projectId: 1 });
    expect(expenses[100]).toMatchObject({
      amount: 0,
      payerType: "company_card_etc",
      clientBillable: false,
      memo: "ETC",
      receiptStatus: "添付済み",
      receiptCount: 1,
      receipts: [expect.objectContaining({ fileName: "etc.pdf", mimeType: "application/pdf" })],
    });
  });

  it.each([
    ["worker_paid + clientBillable true", "worker_paid", true, 1100],
    ["worker_paid + clientBillable false", "worker_paid", false, 1200],
    ["company_card_etc + clientBillable true", "company_card_etc", true, 1300],
    ["company_card_etc + clientBillable false", "company_card_etc", false, 1400],
    ["company_paid + clientBillable true", "company_paid", true, 1500],
    ["company_paid + clientBillable false", "company_paid", false, 1600],
    ["client_paid_direct + clientBillable false", "client_paid_direct", false, 1700],
    ["none + clientBillable false", "none", false, 0],
  ] as const)("accepts separated payer/client billing case: %s", async (_label, payerType, clientBillable, amount) => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "manager" })));

    await expect(caller.monthlyClosingV2.upsertTransportationExpense({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 101,
      payerType,
      clientBillable,
      amount,
      memo: _label,
    })).resolves.toMatchObject({ payerType, clientBillable, amount, memo: _label });

    expect(db.upsertMonthlyClosingV2TransportationExpense).toHaveBeenLastCalledWith(expect.objectContaining({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 101,
      payerType,
      clientBillable,
      amount,
      memo: _label,
    }));
  });

  it("allows a PDF receipt upload even when transportation amount is zero", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" })));
    const result = await caller.monthlyClosingV2.uploadTransportationReceipt({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 100,
      base64: Buffer.from("pdf evidence").toString("base64"),
      mimeType: "application/pdf",
      fileName: "etc-evidence.pdf",
      payerType: "company_card_etc",
    });

    expect(result).toMatchObject({ receiptId: 800, fileName: "etc-evidence.pdf" });
    expect(db.createMonthlyClosingV2ExpenseLineReceipt).toHaveBeenCalledWith(expect.objectContaining({
      expenseLineId: 501,
      workerId: 100,
      targetMonth: "2026-05",
      projectId: 1,
      originalFileName: "etc-evidence.pdf",
      mimeType: "application/pdf",
    }));
  });

  it("rejects internal transportation management APIs for normal workers", async () => {
    const workerCaller = appRouter.createCaller(createCtx(createUser({ appRole: "worker", role: "user" as any })));

    await expect(workerCaller.monthlyClosingV2.getTransportationExpenses({ targetMonth: "2026-05", projectId: 1 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(workerCaller.monthlyClosingV2.upsertTransportationExpense({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 100,
      payerType: "worker_paid",
      clientBillable: true,
      amount: 1000,
      memo: "worker should not see this",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const guestCaller = appRouter.createCaller(createCtx(createUser({ appRole: "guest", role: "user" as any })));
    await expect(guestCaller.monthlyClosingV2.transportationBillingSummary({ targetMonth: "2026-05" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("aggregates client-billable transportation by client and project without worker-level breakdown", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" })));
    const summary = await caller.monthlyClosingV2.transportationBillingSummary({ targetMonth: "2026-05" });

    expect(summary).toEqual([expect.objectContaining({
      targetMonth: "2026-05",
      clientId: 10,
      clientName: "長山建設",
      projectId: 1,
      projectName: "長山 新築マンション",
      transportationAmount: 1200,
      lineCount: 1,
      receiptCount: 0,
      receiptReferences: [],
    })]);
    expect(JSON.stringify(summary)).not.toContain("大木");
    expect(db.getMonthlyClosingV2ExpenseLineReceiptsByExpenseLineIds).toHaveBeenLastCalledWith([502]);
    expect(summary[0].note).toContain("作業員別・日別内訳は社内管理情報");
  });
});
