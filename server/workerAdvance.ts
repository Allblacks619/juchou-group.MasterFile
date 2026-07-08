/*
 * workerAdvance.ts — 前借り／立替 台帳の残高計算（純関数・DB非依存）
 *
 * amount は残高への符号付きデルタ（円）。
 * - advance（前借り/立替）: 正（作業員が会社に返す残高が増える）
 * - repayment（相殺/返済）: 負（残高が減る）
 * - adjustment（調整）: 符号付き
 * 現在残高 = SUM(amount)。正の残高 = 作業員が会社に返す前借りが残っている。
 */

export type AdvanceEntryLike = { amount: number };
export type AdvanceEntryType = "advance" | "repayment" | "adjustment";

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
