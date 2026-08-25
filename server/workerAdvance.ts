/*
 * workerAdvance.ts — 前借り台帳の残高計算（純関数・DB非依存）
 *
 * 「前借り」は会社が作業員へ先に渡した金銭を意味する。
 * amount は会社に対する作業員の返済残高への符号付きデルタ（円）。
 * - advance（前借り）: 正（作業員が会社に返す残高が増える）
 * - repayment（相殺/返済）: 負（残高が減る）
 * - adjustment（調整）: 符号付き
 * 現在残高 = SUM(amount)。正の残高 = 作業員が会社に返す前借りが残っている。
 */

export const DEFAULT_ADVANCE_FEE_PERCENT = 10;

export type AdvanceEntryLike = { amount: number };
export type AdvanceEntryType = "advance" | "repayment" | "adjustment";

/**
 * 前借り元金から手数料と返済対象総額を求める。
 * 手数料率は1%単位の整数を前提とし、既定10%。円未満は四捨五入する。
 */
export function computeAdvanceCharge(
  principal: number,
  feePercent = DEFAULT_ADVANCE_FEE_PERCENT,
): { principal: number; feePercent: number; feeAmount: number; total: number } {
  const normalizedPrincipal = Math.max(Math.round(Math.abs(Number(principal || 0))), 0);
  const normalizedFeePercent = Math.min(Math.max(Math.round(Number(feePercent || 0)), 0), 100);
  const feeAmount = Math.round((normalizedPrincipal * normalizedFeePercent) / 100);
  return {
    principal: normalizedPrincipal,
    feePercent: normalizedFeePercent,
    feeAmount,
    total: normalizedPrincipal + feeAmount,
  };
}

/** 台帳エントリ配列から現在残高を計算する。 */
export function computeAdvanceBalance(entries: AdvanceEntryLike[]): number {
  return entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

/**
 * ある支払に対して既に適用済みの相殺額（正の絶対値）。
 * 支払に紐づくエントリ（通常は repayment=負）の合計を反転して返す。
 */
export function computeAppliedOffset(entriesForPayment: AdvanceEntryLike[]): number {
  const delta = entriesForPayment.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  return Math.max(-delta, 0);
}

/**
 * 支払時に相殺可能な最大額。
 * = min(残高, 支払額 − 既適用相殺) を 0 以上にクランプ。
 */
export function computeMaxOffset(balance: number, paymentTotal: number, alreadyOffset: number): number {
  const remainingPayable = Math.max(Number(paymentTotal || 0) - Math.max(alreadyOffset, 0), 0);
  return Math.max(Math.min(Math.max(balance, 0), remainingPayable), 0);
}

/** 種別と入力額（正）から残高への符号付きデルタを求める。adjustment は increase で方向指定。 */
export function signedDelta(entryType: AdvanceEntryType, amount: number, increase = true): number {
  const abs = Math.abs(Number(amount || 0));
  if (entryType === "advance") return abs;
  if (entryType === "repayment") return -abs;
  return increase ? abs : -abs;
}
