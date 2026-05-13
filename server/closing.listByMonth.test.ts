import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const { projects, clients, closingsByProject } = vi.hoisted(() => {
  const projects = [
    { id: 1, name: "既存締め現場", clientId: 10, status: "completed", startDate: new Date("2026-01-01"), endDate: new Date("2026-03-31") },
    { id: 2, name: "出面あり未初期化現場", clientId: 10, status: "completed", startDate: new Date("2026-01-01"), endDate: new Date("2026-03-31") },
    { id: 3, name: "メンバーあり未初期化現場", clientId: 20, status: "active", startDate: new Date("2026-04-01"), endDate: null },
    { id: 4, name: "無関係終了現場", clientId: 20, status: "completed", startDate: new Date("2025-01-01"), endDate: new Date("2025-12-31") },
  ];
  const clients = [
    { id: 10, name: "取引先A" },
    { id: 20, name: "取引先B" },
  ];
  const closingsByProject = new Map<number, any>([
    [1, { id: 101, projectId: 1, closingMonth: "2026-05", status: "open" }],
  ]);

  return { projects, clients, closingsByProject };
});

vi.mock("./db", () => ({
  getProjectById: vi.fn(async (id: number) => projects.find((project) => project.id === id) || null),
  getClientById: vi.fn(async (id: number) => clients.find((client) => client.id === id) || null),
  getAllProjects: vi.fn(async () => projects),
  getAllClients: vi.fn(async () => clients),
  getProjectClosingsByMonth: vi.fn(async (closingMonth: string) =>
    Array.from(closingsByProject.values()).filter((closing) => closing.closingMonth === closingMonth)
  ),
  getProjectClosingByProjectMonth: vi.fn(async (projectId: number, closingMonth: string) => {
    const closing = closingsByProject.get(projectId);
    return closing?.closingMonth === closingMonth ? closing : null;
  }),
  getClosingSubmissionsByClosing: vi.fn(async (closingId: number) => {
    if (closingId === 101) return [
      { id: 1001, closingId, employeeId: 201, status: "pending", receiptRequired: false, receiptUploaded: false },
      { id: 1002, closingId, employeeId: 202, status: "approved", receiptRequired: true, receiptUploaded: true },
    ];
    return [];
  }),
  getAllEmployees: vi.fn(async () => [
    { id: 201, nameKanji: "山田太郎" },
    { id: 202, nameKanji: "佐藤花子" },
  ]),
  listClosingSubmissionDocuments: vi.fn(async () => []),
  getAttendanceByProject: vi.fn(async (projectId: number) => {
    if (projectId === 2) return [
      { id: 2001, projectId, employeeId: 203, workDate: new Date("2026-05-10"), hoursWorked: 80, workType: "normal" },
    ];
    return [];
  }),
  getProjectMembers: vi.fn(async (projectId: number) => {
    if (projectId === 3) return [{ id: 3001, projectId, employeeId: 204, isActive: true }];
    if (projectId === 4) return [{ id: 3002, projectId, employeeId: 205, isActive: false }];
    return [];
  }),
  createAuditLog: vi.fn(async () => ({ id: 1 })),
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

describe("closing.listByMonth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns initialized, uninitialized relevant, and excludes unrelated inactive projects", async () => {
    const caller = appRouter.createCaller(createCtx(createUser()));

    const rows = await caller.closing.listByMonth({ closingMonth: "2026-05" });

    expect(rows.map((row: any) => row.project.id).sort()).toEqual([1, 2, 3]);
    expect(rows).not.toContainEqual(expect.objectContaining({ project: expect.objectContaining({ id: 4 }) }));

    const initialized = rows.find((row: any) => row.project.id === 1);
    expect(initialized).toMatchObject({
      project: expect.objectContaining({ id: 1, name: "既存締め現場" }),
      client: expect.objectContaining({ id: 10, name: "取引先A" }),
      closing: expect.objectContaining({ id: 101, status: "open" }),
      summary: expect.objectContaining({ targetCount: 2, pendingCount: 1, submittedCount: 1, approvedCount: 1 }),
    });

    const attendanceOnly = rows.find((row: any) => row.project.id === 2);
    expect(attendanceOnly).toMatchObject({
      project: expect.objectContaining({ id: 2, name: "出面あり未初期化現場" }),
      closing: null,
      summary: {
        targetCount: 0,
        pendingCount: 0,
        submittedCount: 0,
        approvedCount: 0,
        receiptMissingCount: 0,
        canMarkReady: false,
      },
    });

    const memberOnly = rows.find((row: any) => row.project.id === 3);
    expect(memberOnly).toMatchObject({
      project: expect.objectContaining({ id: 3, name: "メンバーあり未初期化現場" }),
      client: expect.objectContaining({ id: 20, name: "取引先B" }),
      closing: null,
      summary: expect.objectContaining({ targetCount: 0, pendingCount: 0, submittedCount: 0 }),
    });

    expect(db.getProjectClosingsByMonth).toHaveBeenCalledWith("2026-05");
    expect(db.getAttendanceByProject).toHaveBeenCalledWith(2, expect.any(Date), expect.any(Date));
    expect(db.getProjectMembers).toHaveBeenCalledWith(3);
  });
});
