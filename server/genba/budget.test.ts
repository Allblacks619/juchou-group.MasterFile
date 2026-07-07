import { describe, it, expect } from "vitest";
import { computeBudget } from "./budget";

/** 予算計算 (プロトタイプ BudgetTab 準拠)。now 注入で決定的に検証 */
describe("computeBudget", () => {
  const base = {
    contractAmount: 12_000_000,
    targetType: "percent" as const,
    targetValue: 15,
    costPerManDay: 25_000,
    monthlyExpense: 300_000,
    periodStart: "2026-06-01",
    periodEnd: "2026-12-31",
    preManDays: 42,
    attendanceManDays: 17.5,
    now: new Date("2026-07-01T00:00:00"),
  };

  it("契約金額0なら null", () => {
    expect(computeBudget({ ...base, contractAmount: 0 })).toBeNull();
  });

  it("目標利益(%)・予算上限・使用人工・残り予算を算出", () => {
    const c = computeBudget(base)!;
    expect(c.targetProfit).toBe(1_800_000); // 12,000,000 × 15%
    expect(c.budgetCap).toBe(10_200_000); // 契約 − 目標利益
    expect(c.usedManDays).toBeCloseTo(59.5, 5); // 42 + 17.5
    expect(c.laborCost).toBe(59.5 * 25_000);
    // 経費 = 月経費 × 経過月数 (2026-06-01→07-01 ≈ 1ヶ月)
    expect(c.elapsedMonths).toBeGreaterThan(0.9);
    expect(c.elapsedMonths).toBeLessThan(1.05);
    expect(c.usedTotal).toBeCloseTo(c.laborCost + c.expenseCost, 3);
    expect(c.remainingBudget).toBeCloseTo(c.budgetCap - c.usedTotal, 3);
  });

  it("目標利益(円)指定も反映", () => {
    const c = computeBudget({ ...base, targetType: "amount", targetValue: 2_000_000 })!;
    expect(c.targetProfit).toBe(2_000_000);
    expect(c.budgetCap).toBe(10_000_000);
  });

  it("使用可能人工(上限)= (残予算 − 将来経費) / 人工単価", () => {
    const c = computeBudget(base)!;
    const futureExpense = base.monthlyExpense * c.remainingMonths;
    expect(c.allowableManDays).toBeCloseTo((c.remainingBudget - futureExpense) / base.costPerManDay, 3);
    expect(c.paceNeeded).toBeCloseTo(c.allowableManDays / c.remainingMonths, 3);
  });

  it("attendanceManDays をそのまま反映 (source は問わない)", () => {
    const c = computeBudget({ ...base, preManDays: 0, attendanceManDays: 10 })!;
    expect(c.usedManDays).toBe(10);
  });
});
