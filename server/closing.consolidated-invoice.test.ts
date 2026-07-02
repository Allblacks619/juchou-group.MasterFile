import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const { projects, closingsByProject } = vi.hoisted(() => {
  const projects = [
    { id: 1, name: "品川A現場", clientId: 10 },
    { id: 2, name: "品川B現場", clientId: 10 },
    { id: 3, name: "別取引先現場", clientId: 20 },
    { id: 4, name: "品川未準備現場", clientId: 10 },
    { id: 5, name: "品川未作成現場", clientId: 10 },
  ];

  const closingsByProject = new Map<number, any>([
    [1, { id: 101, projectId: 1, closingMonth: "2026-04", status: "closed" }],
    [2, { id: 102, projectId: 2, closingMonth: "2026-04", status: "ready" }],
    [3, { id: 103, projectId: 3, closingMonth: "2026-04", status: "locked" }],
    [4, { id: 104, projectId: 4, closingMonth: "2026-04", status: "open" }],
  ]);

  return { projects, closingsByProject };
});

vi.mock("./rateResolver", () => ({
  rateSourceLabel: (source: string) => source === "project_uniform" ? "案件一律" : "個別単価",
  resolveClientBillingRate: vi.fn().mockImplementation(async ({ projectId, shiftType }: any) => {
    if (projectId === 1 && shiftType === "night") return { rate: 15000, source: "project_uniform" };
    if (projectId === 1) return { rate: 10000, source: "project_uniform" };
    if (projectId === 2) return { rate: 12000, source: "employee_individual" };
    return { rate: 9000, source: "project_uniform" };
  }),
  resolveProjectMemberRatesForMonth: vi.fn(),
  resolveWorkerPaymentRate: vi.fn(),
}));

vi.mock("./db", () => ({
  getProjectById: vi.fn().mockImplementation(async (id: number) => projects.find((project) => project.id === id) || null),
  getAllProjects: vi.fn().mockResolvedValue(projects),
  getClientById: vi.fn().mockImplementation(async (id: number) => ({ id, name: id === 10 ? "品川建設" : "別取引先" })),
  getAllEmployees: vi.fn().mockResolvedValue([
    { id: 10, nameKanji: "山田太郎" },
    { id: 20, nameKanji: "佐藤花子" },
    { id: 30, nameKanji: "鈴木次郎" },
  ]),
  getProjectClosingByProjectMonth: vi.fn().mockImplementation(async (projectId: number, closingMonth: string) => {
    const closing = closingsByProject.get(projectId);
    return closing?.closingMonth === closingMonth ? closing : null;
  }),
  // Monthly Closing V2 is the new primary axis. These mocks return empty so the V2 builder
  // falls back to the legacy V1 bridge (project_closings + closing_submissions) under test.
  getMonthlyClosingV2ProjectReviewsByMonth: vi.fn().mockResolvedValue([]),
  getMonthlyClosingV2ParticipantReviewsByMonth: vi.fn().mockResolvedValue([]),
  getMonthlyClosingV2ClientTransportationBillingSummary: vi.fn().mockResolvedValue([]),
  // 自社はインボイス番号登録済み → 作業費・残業代は10%（既存の税計算を維持）。
  getCompanyProfile: vi.fn().mockResolvedValue({ id: 1, name: "充寵グループ", invoiceIssuerNumber: "T1234567890123" }),
  getClosingSubmissionsByClosing: vi.fn().mockImplementation(async (closingId: number) => {
    if (closingId === 101) return [{ id: 1001, closingId, employeeId: 10, status: "approved" }];
    if (closingId === 102) return [
      { id: 1002, closingId, employeeId: 20, status: "submitted" },
      { id: 1003, closingId, employeeId: 30, status: "submitted" },
    ];
    return [];
  }),
  getProjectMembers: vi.fn().mockImplementation(async (projectId: number) => {
    if (projectId === 1) return [{ employeeId: 10, isActive: true }];
    if (projectId === 2) return [{ employeeId: 20, isActive: true }, { employeeId: 30, isActive: true }];
    return [];
  }),
  getAttendanceByDateRange: vi.fn().mockImplementation(async (_start: Date, _end: Date, projectId: number) => {
    if (projectId === 1) return [
      { employeeId: 10, projectId, workDate: new Date("2026-04-01"), hoursWorked: 80, workType: "normal", shiftType: "day" },
      { employeeId: 10, projectId, workDate: new Date("2026-04-02"), hoursWorked: 80, workType: "normal", shiftType: "night" },
    ];
    if (projectId === 2) return [
      { employeeId: 20, projectId, workDate: new Date("2026-04-03"), hoursWorked: 80, workType: "normal", shiftType: "day" },
      { employeeId: 30, projectId, workDate: new Date("2026-04-03"), hoursWorked: 80, workType: "normal", shiftType: "day" },
    ];
    return [];
  }),
  getNextInvoiceNumber: vi.fn().mockResolvedValue("INV-2026-04-001"),
  createInvoice: vi.fn().mockResolvedValue({ id: 501, invoiceNumber: "INV-2026-04-001" }),
  createInvoiceItem: vi.fn().mockImplementation(async (item: any) => ({ id: 9000 + item.sortOrder, ...item })),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
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
    appRole: "admin",
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

describe("same-client same-month consolidated client invoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns UI-friendly candidates for all same-client same-month projects with eligibility", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));

    const candidates = await caller.closing.sameClientInvoiceCandidates({ projectId: 1, closingMonth: "2026-04" });

    expect(candidates.map((candidate: any) => candidate.projectId).sort()).toEqual([1, 2, 4, 5]);
    expect(candidates).not.toContainEqual(expect.objectContaining({ projectId: 3 }));
    expect(candidates).toContainEqual(expect.objectContaining({
      projectId: 1,
      projectName: "品川A現場",
      clientId: 10,
      clientName: "品川建設",
      closingId: 101,
      closingMonth: "2026-04",
      closingStatus: "closed",
      isEligible: true,
      reason: null,
    }));
    expect(candidates).toContainEqual(expect.objectContaining({ projectId: 2, closingStatus: "ready", isEligible: true }));
    expect(candidates).toContainEqual(expect.objectContaining({ projectId: 4, closingStatus: "open", isEligible: false, reason: "締め準備が完了していません" }));
    expect(candidates).toContainEqual(expect.objectContaining({ projectId: 5, closingStatus: "none", isEligible: false, reason: "締めデータが未作成です" }));
  });

  it("creates one draft for selected eligible projectIds with separate project and rate-bucket lines", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));

    await expect(caller.closing.generateForClosing({
      projectId: 1,
      projectIds: [1, 2],
      closingMonth: "2026-04",
    })).resolves.toMatchObject({
      invoiceId: 501,
      invoiceNumber: "INV-2026-04-001",
      status: "draft",
    });

    expect(db.createInvoice).toHaveBeenCalledTimes(1);
    expect(db.createInvoice).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 10,
      projectId: null,
      internalMemo: expect.stringContaining("closing draft / projectIds=1,2"),
      subtotal: 49000,
      taxAmount: 4900,
      totalAmount: 53900,
    }));

    const itemCalls = vi.mocked(db.createInvoiceItem).mock.calls.map(([item]) => item);
    const invoiceInput = vi.mocked(db.createInvoice).mock.calls[0][0] as any;
    const serializedExternalItems = JSON.stringify(itemCalls);
    expect(serializedExternalItems).not.toContain("山田太郎");
    expect(serializedExternalItems).not.toContain("佐藤花子");
    expect(serializedExternalItems).not.toContain("鈴木次郎");
    expect(serializedExternalItems).not.toContain("対象:");
    expect(serializedExternalItems).not.toContain("一律");
    expect(serializedExternalItems).not.toContain("個別");
    const normalItems = itemCalls.filter((item: any) => item.itemType === "normal");
    expect(normalItems.map((item: any) => item.description)).toEqual(["電気工事業A", "電気工事業B", "電気工事業A"]);
    expect(normalItems.map((item: any) => item.notes)).toEqual([null, null, null]);
    expect(invoiceInput.internalMemo).toContain("社内メモ: 請求単価の対象者内訳（外部請求書には表示されません）");
    expect(invoiceInput.internalMemo).toContain("山田太郎");
    expect(invoiceInput.internalMemo).toContain("佐藤花子");
    expect(invoiceInput.internalMemo).toContain("鈴木次郎");
    expect(invoiceInput.internalMemo).toContain("対象:");
    expect(invoiceInput.internalMemo).toContain("案件一律");
    expect(invoiceInput.internalMemo).toContain("個別単価");
    expect(invoiceInput.internalMemo).toContain("夜勤");
    expect(itemCalls).toHaveLength(5);
    expect(itemCalls).toEqual([
      expect.objectContaining({ itemType: "text", description: "【品川A現場】", amount: 0, sortOrder: 0 }),
      expect.objectContaining({ itemType: "normal", description: "電気工事業A", unitPrice: 15000, quantity: 10, amount: 15000, sortOrder: 1 }),
      expect.objectContaining({ itemType: "normal", description: "電気工事業B", unitPrice: 10000, quantity: 10, amount: 10000, sortOrder: 2 }),
      expect.objectContaining({ itemType: "text", description: "【品川B現場】", amount: 0, sortOrder: 3 }),
      expect.objectContaining({ itemType: "normal", description: "電気工事業A", unitPrice: 12000, quantity: 20, amount: 24000, sortOrder: 4 }),
    ]);
    expect(db.getAttendanceByDateRange).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 1);
    expect(db.getAttendanceByDateRange).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 2);
    expect(db.getAttendanceByDateRange).not.toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 3);
    expect(db.getAttendanceByDateRange).not.toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 4);
  });

  it("rejects not-ready selected projects instead of silently including them", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));

    await expect(caller.closing.generateForClosing({
      projectId: 1,
      projectIds: [1, 4],
      closingMonth: "2026-04",
    })).rejects.toThrow("請求対象外の締め状態です: 品川未準備現場");
  });
});
