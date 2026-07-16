import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  getGenbaBudget: vi.fn(),
  getProjectPeriod: vi.fn(),
  upsertGenbaBudget: vi.fn(),
  addGenbaBudgetAttendance: vi.fn(),
  getGenbaBudgetAttendanceById: vi.fn(),
  deleteGenbaBudgetAttendance: vi.fn(),
  listGenbaBudgetAttendance: vi.fn(),
  sumManualBudgetManDays: vi.fn(),
  sumProjectAttendanceManDays: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const admin = () => appRouter.createCaller(ctx(createUser({ appRole: "admin" as any })));
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));

const SITE = (o: any = {}) => ({ id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date(), ...o });
const BUDGET = (o: any = {}) => ({
  siteId: "Genba_Beta_Site_01", enabled: true, contractAmount: 12_000_000, targetType: "percent",
  targetValue: 15, costPerManDay: 25_000, monthlyExpense: 300_000, periodStart: "2026-06-01",
  periodEnd: "2026-12-31", preManDays: 42, attendanceSource: "manual", createdAt: new Date(), updatedAt: new Date(), ...o,
});

describe("genba.budgets (M4-B)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("権限 (admin 専用)", () => {
    it("leader / worker は get 403", async () => {
      await expect(leader().genba.budgets.get({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.budgets.get({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("leader は save も 403", async () => {
      await expect(leader().genba.budgets.save({ siteId: "Genba_Beta_Site_01", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("get", () => {
    it("予算 + 連携プロジェクトの工期ヒントを返す", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: 7 }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET());
      mockGenbaDb.getProjectPeriod.mockResolvedValue({ id: 7, name: "P7", startDate: new Date("2026-06-01T00:00:00"), endDate: new Date("2026-12-31T00:00:00") });
      const res = await admin().genba.budgets.get({ siteId: "Genba_Beta_Site_01" });
      expect(res.projectId).toBe(7);
      expect(res.project).toMatchObject({ id: 7, startDate: "2026-06-01", endDate: "2026-12-31" });
    });
    it("projectId 無しなら project=null", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: null }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(null);
      const res = await admin().genba.budgets.get({ siteId: "Genba_Beta_Site_01" });
      expect(res.project).toBeNull();
      expect(res.budget).toBeNull();
    });
  });

  describe("save", () => {
    it("preManDays は小数文字列で upsert される", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.upsertGenbaBudget.mockResolvedValue(BUDGET());
      await admin().genba.budgets.save({ siteId: "Genba_Beta_Site_01", enabled: true, contractAmount: 12_000_000, preManDays: 42 });
      const [sid, patch] = mockGenbaDb.upsertGenbaBudget.mock.calls[0];
      expect(sid).toBe("Genba_Beta_Site_01");
      expect(patch.enabled).toBe(true);
      expect(patch.preManDays).toBe("42.0");
      expect(mockDb.createAuditLog).toHaveBeenCalled();
    });
    it("不正な日付は弾く", async () => {
      await expect(admin().genba.budgets.save({ siteId: "Genba_Beta_Site_01", periodStart: "2026/06/01" as any }))
        .rejects.toThrow();
    });
  });

  describe("manual attendance", () => {
    it("add は id生成・manDays小数文字列", async () => {
      mockGenbaDb.addGenbaBudgetAttendance.mockImplementation(async (d: any) => ({ ...d, createdAt: new Date(), updatedAt: new Date() }));
      const res = await admin().genba.budgets.addManualAttendance({ siteId: "Genba_Beta_Site_01", date: "2026-07-02", manDays: 5.5 });
      const arg = mockGenbaDb.addGenbaBudgetAttendance.mock.calls[0][0];
      expect(arg.id).toBeTruthy();
      expect(arg.manDays).toBe("5.5");
      expect(res?.manDays).toBe(5.5);
    });
    it("remove は存在チェック後に削除", async () => {
      mockGenbaDb.getGenbaBudgetAttendanceById.mockResolvedValue({ id: "a1" });
      const res = await admin().genba.budgets.removeManualAttendance({ id: "a1" });
      expect(res.success).toBe(true);
      expect(mockGenbaDb.deleteGenbaBudgetAttendance).toHaveBeenCalledWith("a1");
    });
  });

  describe("summary", () => {
    it("manual: 手入力合計を反映して calc を返す", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: null }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "manual" }));
      mockGenbaDb.sumManualBudgetManDays.mockResolvedValue(17.5);
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.enabled).toBe(true);
      expect(res.source).toBe("manual");
      expect(res.attendanceManDays).toBe(17.5);
      expect(res.calc?.usedManDays).toBeCloseTo(59.5, 5); // 42 + 17.5
      expect(res.calc?.budgetCap).toBe(10_200_000);
      expect(mockGenbaDb.sumProjectAttendanceManDays).not.toHaveBeenCalled();
    });

    it("project: 現場に projectId があれば既存出面を SUM/80 で集計", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: 7 }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project" }));
      mockGenbaDb.sumProjectAttendanceManDays.mockResolvedValue(30);
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.source).toBe("project");
      expect(mockGenbaDb.sumProjectAttendanceManDays).toHaveBeenCalledWith(7, "2026-06-01", "2026-12-31");
      expect(res.calc?.usedManDays).toBe(72); // 42 + 30
      expect(mockGenbaDb.sumManualBudgetManDays).not.toHaveBeenCalled();
    });

    it("project 指定でも現場に projectId 無ければ manual にフォールバック", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: null }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project" }));
      mockGenbaDb.sumManualBudgetManDays.mockResolvedValue(3);
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.source).toBe("manual");
      expect(mockGenbaDb.sumManualBudgetManDays).toHaveBeenCalled();
    });

    it("無効化 (enabled=false) なら calc=null", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ enabled: false }));
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.enabled).toBe(false);
      expect(res.calc).toBeNull();
    });
  });

  // 連携案件の工期を、予算側の工期が未入力のときのフォールバックに使う (「連携してるのに逆算できない」対策)
  describe("summary: 連携案件の工期フォールバック", () => {
    beforeEach(() => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: 7 }));
      mockGenbaDb.getProjectPeriod.mockResolvedValue({ id: 7, name: "P7", startDate: new Date("2026-04-01T00:00:00"), endDate: new Date("2026-12-31T00:00:00") });
      mockGenbaDb.sumProjectAttendanceManDays.mockResolvedValue(10);
    });

    it("予算側の工期終了が空でも案件の工期で逆算でき、集計も実効工期で呼ぶ", async () => {
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project", periodStart: "2026-05-01", periodEnd: null }));
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.calc).not.toBeNull();
      expect(res.effectivePeriodStart).toBe("2026-05-01");
      expect(res.effectivePeriodEnd).toBe("2026-12-31");
      expect(res.periodFromProject).toBe(true);
      expect(mockGenbaDb.sumProjectAttendanceManDays).toHaveBeenCalledWith(7, "2026-05-01", "2026-12-31");
    });

    it("予算側に工期があれば案件工期は使わない (periodFromProject=false)", async () => {
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project", periodStart: "2026-06-01", periodEnd: "2026-11-30" }));
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.effectivePeriodEnd).toBe("2026-11-30");
      expect(res.periodFromProject).toBe(false);
      expect(mockGenbaDb.sumProjectAttendanceManDays).toHaveBeenCalledWith(7, "2026-06-01", "2026-11-30");
    });

    it("案件にも工期終了が無ければ calc=null (逆算不可)", async () => {
      mockGenbaDb.getProjectPeriod.mockResolvedValue({ id: 7, name: "P7", startDate: new Date("2026-04-01T00:00:00"), endDate: null });
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project", periodStart: "2026-05-01", periodEnd: null }));
      const res = await admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" });
      expect(res.calc).toBeNull();
      expect(res.effectivePeriodEnd).toBeNull();
    });
  });

  it("GENBA_ENABLED=false で遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(admin().genba.budgets.summary({ siteId: "Genba_Beta_Site_01" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
