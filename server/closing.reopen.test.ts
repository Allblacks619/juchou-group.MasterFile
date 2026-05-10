import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

let closingStatus: string = "closed";
let submissionStatusByEmployee: Record<number, string> = { 10: "submitted", 11: "submitted" };

vi.mock("./db", () => ({
  getEmployeeByUserId: vi.fn().mockImplementation(async (userId: number) => {
    if (userId === 3) return { id: 11, userId: 3, nameKanji: "作業員B" };
    return { id: 10, userId: 2, nameKanji: "作業員A" };
  }),
  getProjectClosingByProjectMonth: vi.fn().mockImplementation(async () => ({ id: 100, projectId: 1, closingMonth: "2026-04", status: closingStatus, closedAt: null, closedBy: null })),
  getProjectClosingById: vi.fn().mockImplementation(async () => ({ id: 100, projectId: 1, closingMonth: "2026-04", status: closingStatus, closedAt: null, closedBy: null })),
  createProjectClosing: vi.fn().mockResolvedValue({ id: 100, projectId: 1, closingMonth: "2026-04", status: "open" }),
  updateProjectClosing: vi.fn().mockImplementation(async (_id: number, patch: any) => ({ id: 100, ...patch })),
  getProjectById: vi.fn().mockResolvedValue({ id: 1, name: "案件A", clientId: 1 }),
  getClientById: vi.fn().mockResolvedValue({ id: 1, name: "取引先A" }),
  getAllEmployees: vi.fn().mockResolvedValue([{ id: 10, nameKanji: "作業員A" }, { id: 11, nameKanji: "作業員B" }]),
  getProjectMembersByProject: vi.fn().mockResolvedValue([{ employeeId: 10, isActive: true }, { employeeId: 11, isActive: true }]),
  getProjectMembers: vi.fn().mockResolvedValue([{ employeeId: 10, isActive: true }, { employeeId: 11, isActive: true }]),
  getAttendanceByProject: vi.fn().mockResolvedValue([{ employeeId: 10, hoursWorked: 80, shiftType: "day", workDate: new Date("2026-04-01") }, { employeeId: 11, hoursWorked: 80, shiftType: "day", workDate: new Date("2026-04-01") }]),
  getClosingSubmissionsByClosing: vi.fn().mockImplementation(async () => ([10,11].map((employeeId) => ({ id: 900 + employeeId, closingId: 100, employeeId, status: submissionStatusByEmployee[employeeId] || "pending", transportAmount: 0, expenseAmount: 0, receiptRequired: false, receiptUploaded: false, notes: null })))),
  getClosingSubmissionByClosingEmployee: vi.fn().mockImplementation(async (_closingId: number, employeeId: number) => ({ id: 900 + employeeId, closingId: 100, employeeId, status: submissionStatusByEmployee[employeeId] || "pending", transportAmount: 0, expenseAmount: 0, receiptRequired: false, receiptUploaded: false, notes: null })),
  upsertClosingSubmission: vi.fn().mockResolvedValue({ id: 900 }),
  updateClosingSubmission: vi.fn().mockResolvedValue({ id: 900 }),
  getEmployeePaymentByClosingEmployee: vi.fn().mockResolvedValue(null),
  upsertEmployeePayment: vi.fn().mockResolvedValue({ id: 1 }),
  createAuditLog: vi.fn().mockResolvedValue({ id: 1 }),
  listClosingSubmissionDocuments: vi.fn().mockResolvedValue([]),
}));

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 2,
    openId: "u-2",
    email: "user@example.com",
    name: "User",
    loginMethod: "manus",
    role: "user",
    appRole: "worker",
    loginId: "worker1",
    mustChangePassword: false,
    employeeId: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function createCtx(user: User): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any };
}

describe("closing reopen/edit recovery", () => {
  beforeEach(() => {
    closingStatus = "closed";
    submissionStatusByEmployee = { 10: "submitted", 11: "submitted" };
    vi.clearAllMocks();
  });

  it("close status blocks worker editing", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));
    await expect(caller.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 1000, expenseAmount: 0, notes: "x" })).rejects.toThrow();
  });

  it("reopen status enables all workers editing", async () => {
    closingStatus = "open";
    const workerA = appRouter.createCaller(createCtx(createUser()));
    const workerB = appRouter.createCaller(createCtx(createUser({ id: 3, employeeId: 11, loginId: "worker2" })));
    await expect(workerA.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 1200, expenseAmount: 500, notes: "reopen-a" })).resolves.toEqual({ success: true });
    await expect(workerB.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 800, expenseAmount: 200, notes: "reopen-b" })).resolves.toEqual({ success: true });
  });

  it("return status allows only returned worker editing", async () => {
    closingStatus = "ready";
    submissionStatusByEmployee = { 10: "rejected", 11: "approved" };
    const workerA = appRouter.createCaller(createCtx(createUser()));
    const workerB = appRouter.createCaller(createCtx(createUser({ id: 3, employeeId: 11, loginId: "worker2" })));
    await expect(workerA.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 900, expenseAmount: 100, notes: "returned" })).resolves.toEqual({ success: true });
    await expect(workerB.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 900, expenseAmount: 100, notes: "not-returned" })).rejects.toThrow("この状態では編集できません");
  });


  it("ready + non-rejected worker cannot submit", async () => {
    closingStatus = "ready";
    submissionStatusByEmployee = { 10: "approved", 11: "submitted" };
    const workerA = appRouter.createCaller(createCtx(createUser()));
    await expect(workerA.closing.submitMySubmission({ projectId: 1, closingMonth: "2026-04" })).rejects.toThrow("この状態では提出できません");
  });

  it("ready + rejected worker can resubmit", async () => {
    closingStatus = "ready";
    submissionStatusByEmployee = { 10: "rejected", 11: "approved" };
    const workerA = appRouter.createCaller(createCtx(createUser()));
    await expect(workerA.closing.submitMySubmission({ projectId: 1, closingMonth: "2026-04" })).resolves.toEqual({ success: true });
  });

  it("reopened/open worker can submit", async () => {
    closingStatus = "open";
    submissionStatusByEmployee = { 10: "pending", 11: "pending" };
    const workerA = appRouter.createCaller(createCtx(createUser()));
    await expect(workerA.closing.submitMySubmission({ projectId: 1, closingMonth: "2026-04" })).resolves.toEqual({ success: true });
  });

  it("closed/reclosed worker cannot submit", async () => {
    closingStatus = "closed";
    submissionStatusByEmployee = { 10: "pending", 11: "pending" };
    const workerA = appRouter.createCaller(createCtx(createUser()));
    await expect(workerA.closing.submitMySubmission({ projectId: 1, closingMonth: "2026-04" })).rejects.toThrow();
  });
  it("reclose locks again after reopen", async () => {
    const adminCaller = appRouter.createCaller(createCtx(createUser({ role: "admin", appRole: "admin" })));
    closingStatus = "closed";
    await expect(adminCaller.closing.reopen({ projectId: 1, closingMonth: "2026-04" })).resolves.toBeTruthy();
    closingStatus = "ready";
    await expect(adminCaller.closing.close({ projectId: 1, closingMonth: "2026-04" })).resolves.toBeTruthy();
    closingStatus = "closed";
    const worker = appRouter.createCaller(createCtx(createUser()));
    await expect(worker.closing.saveMySubmission({ projectId: 1, closingMonth: "2026-04", transportAmount: 1, expenseAmount: 0, notes: "after-reclose" })).rejects.toThrow();
  });
});
