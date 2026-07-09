import { describe, it, expect } from "vitest";
import { computeBudgetSummary, type BudgetInput } from "../../shared/genba/budget";

/** 予算計算 (純粋関数): 契約・目標利益・人工単価から逆算 */
describe("computeBudgetSummary", () => {
  const base: BudgetInput = {
    contractAmount: 12_000_000,
    targetType: "percent",
    targetValue: 15,
    costPerManDay: 25_000,
    monthlyExpense: 300_000,
    periodStart: "2026-06-01",
    periodEnd: "2026-12-31",
    preManDays: 42,
    sourceManDays: 17.5,
  };
  const now = new Date("2026-07-01T00:00:00");

  it("目標利益(％)と予算上限を算出", () => {
    const s = computeBudgetSummary(base, now)!;
    expect(s.targetProfit).toBe(1_800_000); // 12,000,000 × 15%
    expect(s.budgetCap).toBe(10_200_000); // 契約 − 目標利益
  });

  it("使用人工 = 導入前 + ソース、人工原価もそれに比例", () => {
    const s = computeBudgetSummary(base, now)!;
    expect(s.usedManDays).toBe(59.5); // 42 + 17.5
    expect(s.laborCost).toBe(59.5 * 25_000);
    expect(s.remainingBudget).toBeLessThan(s.budgetCap);
    expect(Number.isFinite(s.allowableManDays)).toBe(true);
  });

  it("目標利益(円)は固定額", () => {
    const s = computeBudgetSummary({ ...base, targetType: "amount", targetValue: 2_000_000 }, now)!;
    expect(s.targetProfit).toBe(2_000_000);
    expect(s.budgetCap).toBe(10_000_000);
  });

  it("契約金額 0 / 工期未設定なら null", () => {
    expect(computeBudgetSummary({ ...base, contractAmount: 0 }, now)).toBeNull();
    expect(computeBudgetSummary({ ...base, periodStart: null }, now)).toBeNull();
  });

  it("工期消化と予算消化の割合を返す", () => {
    const s = computeBudgetSummary(base, now)!;
    expect(s.periodPct).toBeGreaterThan(0);
    expect(s.periodPct).toBeLessThan(100);
    expect(s.budgetPct).toBeGreaterThanOrEqual(0);
  });
});
