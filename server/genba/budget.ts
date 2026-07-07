/**
 * 現場ビジョン: 予算トラッカーの計算 (サーバー側・純粋関数)。
 * プロトタイプ BudgetTab の calc を移植。工期・契約金額・人工単価から
 * 「あと何人工使えるか」を逆算する。時刻は now を注入して決定的にする。
 *
 * usedManDays = preManDays(導入前補正) + attendanceManDays(手入力 or 既存出面表の集計)。
 * attendanceManDays の求め方 (manual: genba_budget_attendance の SUM /
 * project: 既存 attendance の SUM(hoursWorked)/80.0) はビルダー側で解決して渡す。
 */

/** 1ヶ月の目安ミリ秒 (プロトタイプ準拠: 30.44日) */
export const MONTH_MS = 30.44 * 24 * 3600 * 1000;

export type BudgetCalcInput = {
  contractAmount: number;
  targetType: "percent" | "amount";
  targetValue: number;
  costPerManDay: number;
  monthlyExpense: number;
  /** YYYY-MM-DD */
  periodStart: string | null;
  /** YYYY-MM-DD */
  periodEnd: string | null;
  preManDays: number;
  /** 出面の合計人工 (source に応じてビルダーが集計済み) */
  attendanceManDays: number;
  /** 集計基準時刻 (省略時は実行時刻) */
  now?: Date;
};

export type BudgetCalc = {
  totalMonths: number;
  elapsedMonths: number;
  remainingMonths: number;
  targetProfit: number;
  budgetCap: number;
  usedManDays: number;
  attendanceManDays: number;
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

/** 契約金額が未設定 (0) なら計算不能として null を返す (プロトタイプ準拠) */
export function computeBudget(input: BudgetCalcInput): BudgetCalc | null {
  if (!input.contractAmount) return null;
  const start = new Date((input.periodStart || "1970-01-01") + "T00:00:00");
  const end = new Date((input.periodEnd || "1970-01-01") + "T00:00:00");
  const now = input.now ?? new Date();

  const totalMonths = Math.max((end.getTime() - start.getTime()) / MONTH_MS, 0.1);
  const elapsedMonths = Math.min(Math.max((now.getTime() - start.getTime()) / MONTH_MS, 0), totalMonths);
  const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);

  const targetProfit = input.targetType === "percent"
    ? (input.contractAmount * input.targetValue) / 100
    : input.targetValue;
  const budgetCap = input.contractAmount - targetProfit;

  const usedManDays = (input.preManDays || 0) + input.attendanceManDays;
  const laborCost = usedManDays * input.costPerManDay;
  const expenseCost = input.monthlyExpense * elapsedMonths;
  const usedTotal = laborCost + expenseCost;
  const remainingBudget = budgetCap - usedTotal;

  const futureExpense = input.monthlyExpense * remainingMonths;
  const allowableManDays = input.costPerManDay > 0 ? (remainingBudget - futureExpense) / input.costPerManDay : 0;
  const paceNeeded = remainingMonths > 0.05 ? allowableManDays / remainingMonths : 0;
  const currentPace = elapsedMonths > 0.05 ? usedManDays / elapsedMonths : 0;
  const periodPct = (elapsedMonths / totalMonths) * 100;
  const budgetPct = budgetCap > 0 ? (usedTotal / budgetCap) * 100 : 0;

  return {
    totalMonths, elapsedMonths, remainingMonths, targetProfit, budgetCap,
    usedManDays, attendanceManDays: input.attendanceManDays, laborCost, expenseCost, usedTotal,
    remainingBudget, allowableManDays, paceNeeded, currentPace, periodPct, budgetPct,
  };
}
