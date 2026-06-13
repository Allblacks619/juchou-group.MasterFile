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
    { id: 1, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-01") },
    { id: 2, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-05-02") },
    { id: 3, projectId: 1, employeeId: 101, guestName: null, workDate: new Date("2026-05-03") },
    { id: 4, projectId: 1, employeeId: 102, guestName: null, workDate: new Date("2026-05-04") },
    { id: 5, projectId: 1, employeeId: null, guestName: "応援ゲスト", workDate: new Date("2026-05-05") },
    { id: 6, projectId: 2, employeeId: 100, guestName: null, workDate: new Date("2026-05-06") },
    { id: 7, projectId: 1, employeeId: 100, guestName: null, workDate: new Date("2026-04-30") },
  ],
  submissions: [
    { workerId: 100, targetMonth: "2026-05", status: "accepted", sendBackReason: null },
    { workerId: 102, targetMonth: "2026-05", status: "sent_back", sendBackReason: "出面を確認してください" },
  ],
  transportationLines: [
    { id: 501, workerId: 100, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 0, paymentMethod: "company_card", payerType: "company_card_etc", workerReimbursementRequired: false, clientBillable: false, workerReimbursementAmount: 0, clientBillableAmount: 0, isClientBillable: false, memo: "ETC", internalMemo: "ETC" },
    { id: 502, workerId: 101, projectId: 1, targetMonth: "2026-05", expenseType: "transportation", amount: 1200, paymentMethod: "paid_by_worker", payerType: "worker_paid", workerReimbursementRequired: true, clientBillable: true, workerReimbursementAmount: 1200, clientBillableAmount: 1200, isClientBillable: true, memo: "客先請求", internalMemo: "客先請求" },
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
  normalizeMonthlyClosingV2TransportationLine: vi.fn((line) => ({
    payerType: line.payerType,
    workerReimbursementRequired: line.workerReimbursementRequired,
    clientBillable: line.clientBillable,
    workerReimbursementAmount: line.workerReimbursementAmount,
    clientBillableAmount: line.clientBillableAmount,
    internalMemo: line.internalMemo ?? line.memo ?? null,
  })),
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

  it("stores transportation amount, billing type, receipt metadata, and memo per target month/project/worker", async () => {
    const caller = appRouter.createCaller(createCtx(createUser({ appRole: "admin" })));

    await expect(caller.monthlyClosingV2.upsertTransportationExpense({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 101,
      payerType: "worker_paid",
      workerReimbursementRequired: true,
      clientBillable: true,
      workerReimbursementAmount: 1500,
      clientBillableAmount: 1800,
      internalMemo: "作業員精算し客先請求",
    })).resolves.toMatchObject({
      targetMonth: "2026-05",
      projectId: 1,
      workerId: 101,
      payerType: "worker_paid",
      workerReimbursementRequired: true,
      clientBillable: true,
      workerReimbursementAmount: 1500,
      clientBillableAmount: 1800,
      internalMemo: "作業員精算し客先請求",
    });

    const expenses = await caller.monthlyClosingV2.getTransportationExpenses({ targetMonth: "2026-05", projectId: 1 });
    expect(expenses[100]).toMatchObject({
      amount: 0,
      payerType: "company_card_etc",
      workerReimbursementRequired: false,
      clientBillable: false,
      workerReimbursementAmount: 0,
      clientBillableAmount: 0,
      internalMemo: "ETC",
      receiptStatus: "添付済み",
      receiptCount: 1,
      receipts: [expect.objectContaining({ fileName: "etc.pdf", mimeType: "application/pdf" })],
    });
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
      workerReimbursementRequired: true,
      clientBillable: true,
      workerReimbursementAmount: 1000,
      clientBillableAmount: 1000,
      internalMemo: "worker should not see this",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    expect(summary[0].note).toContain("作業員別・日別内訳は社内管理情報");
  });
});
