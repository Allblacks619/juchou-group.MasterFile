/**
 * 現場ビジョン: 予算トラッカーの計算 (サーバー/クライアント共有の純粋関数)。
 * プロトタイプ GenbaAppV18.jsx の BudgetTab calc を移植。
 * 「工期・契約金額・人工単価から あと何人工使えるか」を逆算する。
 * now を引数で受け取り副作用を持たない (テスト容易・SSR安全)。
 */

/** 1ヶ月の平均ミリ秒 (30.44日) */
export const MONTH_MS = 30.44 * 24 * 3600 * 1000;

export type BudgetInput = {
  contractAmount: number;
  targetType: "percent" | "amount";
  targetValue: number;
  costPerManDay: number;
  monthlyExpense: number;
  /** YYYY-MM-DD */
  periodStart: string | null;
  /** YYYY-MM-DD */
  periodEnd: string | null;
  /** 集計開始前の人工補正 */
  preManDays: number;
  /** 出面ソースから集計した人工 (manual: 手入力合計 / project: SUM(hoursWorked)/80) */
  sourceManDays: number;
};

export type BudgetSummary = {
  totalMonths: number;
  elapsedMonths: number;
  remainingMonths: number;
  targetProfit: number;
  budgetCap: number;
  usedManDays: number;
  laborCost: number;
  expenseCost: number;
  usedTotal: number;
  remainingBudget: number;
  allowableManDays: number;
  paceNeeded: number;
  currentPace: number;
  periodPct: number;
  budgetPct: number;
};

/**
 * 予算サマリーを計算する。contractAmount が 0 のときは null (未設定扱い)。
 * @param now 現在時刻 (呼び出し側が渡す)
 */
export function computeBudgetSummary(input: BudgetInput, now: Date): BudgetSummary | null {
  if (!input.contractAmount || !input.periodStart || !input.periodEnd) return null;

  const start = new Date(input.periodStart + "T00:00:00").getTime();
  const end = new Date(input.periodEnd + "T00:00:00").getTime();
  const nowMs = now.getTime();

  const totalMonths = Math.max((end - start) / MONTH_MS, 0.1);
  const elapsedMonths = Math.min(Math.max((nowMs - start) / MONTH_MS, 0), totalMonths);
  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);

  const targetProfit = input.targetType === "percent"
    ? (input.contractAmount * input.targetValue) / 100
    : input.targetValue;
  const budgetCap = input.contractAmount - targetProfit;

  const usedManDays = (input.preManDays || 0) + (input.sourceManDays || 0);
  const laborCost = usedManDays * input.costPerManDay;
  const expenseCost = input.monthlyExpense * elapsedMonths;
  const usedTotal = laborCost + expenseCost;
  const remainingBudget = budgetCap - usedTotal;

  const futureExpense = input.monthlyExpense * remainingMonths;
  const allowableManDays = input.costPerManDay > 0
    ? (remainingBudget - futureExpense) / input.costPerManDay
    : 0;
  const paceNeeded = remainingMonths > 0.05 ? allowableManDays / remainingMonths : 0;
  const currentPace = elapsedMonths > 0.05 ? usedManDays / elapsedMonths : 0;
  const periodPct = (elapsedMonths / totalMonths) * 100;
  const budgetPct = budgetCap > 0 ? (usedTotal / budgetCap) * 100 : 0;

  return {
    totalMonths, elapsedMonths, remainingMonths, targetProfit, budgetCap,
    usedManDays, laborCost, expenseCost, usedTotal, remainingBudget,
    allowableManDays, paceNeeded, currentPace, periodPct, budgetPct,
  };
}
