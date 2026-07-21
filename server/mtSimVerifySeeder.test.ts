import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 検証環境シーダー (scripts/seedMtSimVerify.ts) の挙動検証。
 * - 会社2/3 のテナント作成と、両社管理者アカウントの companyId スタンプ
 * - 甲野側の突合デモ出面（2/10 不一致・2/17 甲野側のみ）が companyId 付きで入ること
 * - 冪等（既存があれば再作成しない）
 */

const state = vi.hoisted(() => ({
  companies: [] as any[],
  users: new Map<string, any>(), // openId -> user
  clients: [] as any[], employees: [] as any[], projects: [] as any[], rates: [] as any[],
  closing: undefined as any,
  seq: 100,
}));

const calls = vi.hoisted(() => ({
  createCompany: vi.fn(async (d: any) => { const row = { id: ++state.seq, ...d }; state.companies.push(row); return row; }),
  upsertUser: vi.fn(async (d: any) => {
    const prev = state.users.get(d.openId) ?? {};
    state.users.set(d.openId, { ...prev, ...d });
  }),
  upsertAttendance: vi.fn(async (_d: any) => ({ id: 1 })),
  createProject: vi.fn(async (d: any) => { const row = { id: ++state.seq, ...d }; state.projects.push(row); return row; }),
  // mtSimFixture が使う残り
  createClient: vi.fn(async (d: any) => ({ id: ++state.seq, ...d })),
  createEmployee: vi.fn(async (d: any) => ({ id: ++state.seq, ...d })),
  updateEmployee: vi.fn(async () => ({})),
  deleteEmployeeRate: vi.fn(async () => {}),
  createEmployeeRate: vi.fn(async () => ({ id: 1 })),
  createProjectClosing: vi.fn(async (d: any) => ({ id: ++state.seq, ...d })),
  upsertClosingSubmission: vi.fn(async (d: any) => d),
  addProjectMember: vi.fn(async (d: any) => d),
  upsertMonthlyClosingV2ProjectReview: vi.fn(async (d: any) => d),
  upsertMonthlyClosingV2ParticipantReview: vi.fn(async (d: any) => d),
  upsertMonthlyClosingV2TransportationExpense: vi.fn(async (d: any) => d),
}));

vi.mock("./db", () => ({
  getAllCompanies: vi.fn(async () => state.companies),
  getUserByLoginId: vi.fn(async (loginId: string) => {
    const arr = Array.from(state.users.values());
    return arr.find((u) => u.loginId === loginId);
  }),
  getAllClients: vi.fn(async () => state.clients),
  getAllEmployees: vi.fn(async () => state.employees),
  getAllProjects: vi.fn(async (companyId?: number) => (companyId != null ? state.projects.filter((p) => p.companyId === companyId) : state.projects)),
  getAllEmployeeRates: vi.fn(async () => state.rates),
  getProjectClosingByProjectMonth: vi.fn(async () => state.closing),
  ...calls,
}));

import { seedMtSimVerify } from "../scripts/seedMtSimVerify";

describe("seedMtSimVerify（検証環境シーダー）", () => {
  beforeEach(() => {
    state.companies.length = 0; state.users.clear();
    state.clients.length = 0; state.employees.length = 0; state.projects.length = 0; state.rates.length = 0;
    state.closing = undefined; state.seq = 100;
    Object.values(calls).forEach((fn) => fn.mockClear());
  });

  it("会社2/3を作成し、両社管理者を各社の companyId でスタンプ、甲野側に突合デモ出面を入れる", async () => {
    const res = await seedMtSimVerify();

    // テナント台帳: 甲野・丙田
    expect(calls.createCompany).toHaveBeenCalledTimes(2);
    expect(res.konoId).toBeGreaterThan(1);
    expect(res.heidaId).toBeGreaterThan(1);

    // 管理者: 乙島=会社1 / 甲野=konoId
    const users = Array.from(state.users.values());
    const otsu = users.find((u) => u.loginId === "mtsim-otsu-admin")!;
    const kono = users.find((u) => u.loginId === "mtsim-kono-admin")!;
    expect(otsu.companyId).toBe(1);
    expect(otsu.appRole).toBe("admin");
    expect(kono.companyId).toBe(res.konoId);
    expect(kono.passwordHash).toBeTruthy();

    // 甲野側受入現場は konoId でスタンプ
    const konoProject = state.projects.find((p) => p.id === res.konoProjectId)!;
    expect(konoProject.companyId).toBe(res.konoId);

    // 突合デモ出面: guestName=乙島一郎・companyId=konoId・2/10 は残業4.0h（乙島申告6.0hと不一致）
    const konoRows = calls.upsertAttendance.mock.calls
      .map((c) => c[0])
      .filter((a: any) => a.companyId === res.konoId);
    expect(konoRows).toHaveLength(3);
    for (const r of konoRows) {
      expect(r.guestName).toBe("MTSIM 乙島 一郎");
      expect(r.projectId).toBe(res.konoProjectId);
    }
    const d10 = konoRows.find((r: any) => new Date(r.workDate).toISOString().startsWith("2025-02-10"))!;
    expect(d10.overtimeHours).toBe(40);
    expect(konoRows.some((r: any) => new Date(r.workDate).toISOString().startsWith("2025-02-17"))).toBe(true);
  });

  it("冪等: 2回目は会社・管理者・現場を再作成しない（パスワードは同期のみ）", async () => {
    const first = await seedMtSimVerify();
    calls.createCompany.mockClear(); calls.createProject.mockClear();
    const before = state.projects.length;

    const second = await seedMtSimVerify();
    expect(second.konoId).toBe(first.konoId);
    expect(calls.createCompany).not.toHaveBeenCalled();
    // 甲野側受入現場は再作成されない（乙島側の現場は mtSimFixture が名前一致で再利用）
    expect(state.projects.filter((p) => p.id === first.konoProjectId)).toHaveLength(1);
    expect(state.projects.length).toBe(before);
  });
});
