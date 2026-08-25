const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

/**
 * 支払月から、支払根拠になる出面の締め月を求める。
 * 例: 2026-10 支払 = 2026-08 締め出面。
 */
export function paymentMonthToClosingMonth(paymentMonth: string): string {
  const match = MONTH_PATTERN.exec(paymentMonth);
  if (!match) throw new Error("paymentMonth must be YYYY-MM");

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("paymentMonth must be YYYY-MM");

  const zeroBased = year * 12 + (month - 1) - 2;
  const closingYear = Math.floor(zeroBased / 12);
  const closingMonth = ((zeroBased % 12) + 12) % 12 + 1;
  return `${closingYear}-${String(closingMonth).padStart(2, "0")}`;
}
