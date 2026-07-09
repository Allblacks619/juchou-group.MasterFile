import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const mockGenbaDb = vi.hoisted(() => ({
  getGenbaSiteById: vi.fn(),
  getGenbaBudget: vi.fn(),
  upsertGenbaBudget: vi.fn(),
  addGenbaBudgetAttendance: vi.fn(),
  getGenbaBudgetAttendanceById: vi.fn(),
  deleteGenbaBudgetAttendance: vi.fn(),
  listGenbaBudgetAttendance: vi.fn(),
  sumGenbaManualManDays: vi.fn(),
  sumProjectManDays: vi.fn(),
  getProjectPeriod: vi.fn(),
}));
const mockDb = vi.hoisted(() => ({ createAuditLog: vi.fn() }));
vi.mock("./genba/db", async () => ({ ...(await vi.importActual<any>("./genba/db")), ...mockGenbaDb }));
vi.mock("./db", async () => ({ ...(await vi.importActual<any>("./db")), ...mockDb }));

function createUser(o: Partial<User> = {}): User {
  return { id: 1, openId: "o", email: "e", name: "Genba_Beta_User", loginMethod: "manus", role: "user", appRole: "admin" as any, loginId: "u", mustChangePassword: false, employeeId: null, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), ...o } as User;
}
function ctx(u: User): TrpcContext { return { user: u, req: { protocol: "https", headers: {} } as any, res: { clearCookie: vi.fn() } as any }; }
const admin = () => appRouter.createCaller(ctx(createUser({ appRole: "admin" as any, role: "admin" })));
const leader = () => appRouter.createCaller(ctx(createUser({ appRole: "manager" as any })));
const worker = () => appRouter.createCaller(ctx(createUser({ appRole: "worker" as any })));

const SITE = (o: any = {}) => ({ id: "Genba_Beta_Site_01", name: "現場A", projectId: null, driveUrl: null, archived: false, createdAt: new Date(), updatedAt: new Date(), ...o });
const BUDGET = (o: any = {}) => ({ siteId: "Genba_Beta_Site_01", enabled: true, contractAmount: 12_000_000, targetType: "percent", targetValue: 15, costPerManDay: 25_000, monthlyExpense: 300_000, periodStart: "2026-06-01", periodEnd: "2026-12-31", preManDays: "42.0", attendanceSource: "manual", createdAt: new Date(), updatedAt: new Date(), ...o });

describe("genba.budgets (M4-B)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => { delete process.env.GENBA_ENABLED; });

  describe("get", () => {
    it("未設定なら既定値(enabled=false)を返す", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.getGenbaBudget.mockResolvedValue(null);
      const res = await admin().genba.budgets.get({ siteId: SITE().id });
      expect(res.budget.enabled).toBe(false);
      expect(res.hasProject).toBe(false);
    });

    it("projectId があれば工期提案を同梱", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: 5 }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(null);
      mockGenbaDb.getProjectPeriod.mockResolvedValue({ name: "PJ", startDate: new Date("2026-06-01T00:00:00"), endDate: new Date("2026-12-31T00:00:00") });
      const res = await admin().genba.budgets.get({ siteId: SITE().id });
      expect(res.hasProject).toBe(true);
      expect(res.projectPeriod).toMatchObject({ name: "PJ", startDate: "2026-06-01", endDate: "2026-12-31" });
    });
  });

  describe("save", () => {
    it("preManDays を文字列化して upsert", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.upsertGenbaBudget.mockResolvedValue(BUDGET());
      await admin().genba.budgets.save({ siteId: SITE().id, enabled: true, contractAmount: 12_000_000, preManDays: 42 });
      const [sid, patch] = mockGenbaDb.upsertGenbaBudget.mock.calls[0];
      expect(sid).toBe(SITE().id);
      expect(patch.preManDays).toBe("42");
      expect(patch.contractAmount).toBe(12_000_000);
      expect(mockDb.createAuditLog).toHaveBeenCalled();
    });
  });

  describe("addManualAttendance", () => {
    it("manDays を文字列で保存", async () => {
      mockGenbaDb.addGenbaBudgetAttendance.mockImplementation(async (d: any) => d);
      await admin().genba.budgets.addManualAttendance({ siteId: SITE().id, date: "2026-07-01", manDays: 6 });
      const arg = mockGenbaDb.addGenbaBudgetAttendance.mock.calls[0][0];
      expect(arg.manDays).toBe("6");
      expect(arg.date).toBe("2026-07-01");
      expect(arg.id).toBeTruthy();
    });
  });

  describe("summary", () => {
    it("manual: 手入力出面を集計して計算", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "manual" }));
      mockGenbaDb.sumGenbaManualManDays.mockResolvedValue(17.5);
      const res = await admin().genba.budgets.summary({ siteId: SITE().id });
      expect(res.enabled).toBe(true);
      expect(res.source).toBe("manual");
      expect(res.sourceManDays).toBe(17.5);
      expect(res.summary?.usedManDays).toBe(59.5); // 42 + 17.5
      expect(res.summary?.budgetCap).toBe(10_200_000);
      expect(mockGenbaDb.sumProjectManDays).not.toHaveBeenCalled();
    });

    it("project: projectId×期間で既存attendanceを集計 (SUM/80)", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: 9 }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project" }));
      mockGenbaDb.sumProjectManDays.mockResolvedValue(30);
      const res = await admin().genba.budgets.summary({ siteId: SITE().id });
      expect(res.source).toBe("project");
      expect(mockGenbaDb.sumProjectManDays).toHaveBeenCalledWith(9, "2026-06-01", "2026-12-31");
      expect(res.summary?.usedManDays).toBe(72); // 42 + 30
    });

    it("project 指定でも projectId 無しなら manual にフォールバック", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE({ projectId: null }));
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ attendanceSource: "project" }));
      mockGenbaDb.sumGenbaManualManDays.mockResolvedValue(5);
      const res = await admin().genba.budgets.summary({ siteId: SITE().id });
      expect(res.source).toBe("manual");
      expect(mockGenbaDb.sumProjectManDays).not.toHaveBeenCalled();
    });

    it("無効(enabled=false)なら summary=null", async () => {
      mockGenbaDb.getGenbaSiteById.mockResolvedValue(SITE());
      mockGenbaDb.getGenbaBudget.mockResolvedValue(BUDGET({ enabled: false }));
      const res = await admin().genba.budgets.summary({ siteId: SITE().id });
      expect(res.enabled).toBe(false);
      expect(res.summary).toBeNull();
    });
  });

  describe("admin 専用", () => {
    it("leader / worker は get/save/summary 不可 (403)", async () => {
      await expect(leader().genba.budgets.get({ siteId: SITE().id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(worker().genba.budgets.summary({ siteId: SITE().id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(leader().genba.budgets.save({ siteId: SITE().id, enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  it("GENBA_ENABLED=false で全遮断", async () => {
    process.env.GENBA_ENABLED = "false";
    await expect(admin().genba.budgets.get({ siteId: SITE().id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
