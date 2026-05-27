/**
 * Shared date utilities — UTC-safe date handling
 *
 * All dates in the system are stored as "YYYY-MM-DD" strings (local date, no timezone).
 * This module provides consistent formatting for DB save, UI display, and PDF output.
 *
 * Key principle: Never rely on `new Date(dateString)` for date-only strings,
 * because it parses as UTC midnight and can shift the date in JST (+9).
 */

/**
 * Parse a "YYYY-MM-DD" string into year/month/day numbers WITHOUT timezone conversion.
 * This avoids the UTC midnight issue that causes date shifts in JST.
 */
export function parseLocalDate(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m, day: d };
}

/**
 * Convert a "YYYY-MM-DD" string to a Date object in local timezone.
 * Uses explicit year/month/day to avoid UTC parsing issues.
 */
export function toLocalDate(dateStr: string): Date {
  const { year, month, day } = parseLocalDate(dateStr);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date object or "YYYY-MM-DD" string to "YYYY-MM-DD" for DB storage.
 * If input is already a string in correct format, returns as-is.
 */
export function toDbDateString(input: Date | string): string {
  if (typeof input === "string") {
    // Already a date string — validate and return
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    // If it's an ISO string, extract the date part carefully
    const d = new Date(input);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // Date object — use local getters
  return `${input.getFullYear()}-${String(input.getMonth() + 1).padStart(2, "0")}-${String(input.getDate()).padStart(2, "0")}`;
}

/**
 * Format for Japanese UI display: "2024年3月15日"
 */
export function toDisplayDateJa(input: Date | string): string {
  const d = typeof input === "string" ? toLocalDate(input) : input;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Format for Japanese UI display with day of week: "2024年3月15日(金)"
 */
export function toDisplayDateJaWithDay(input: Date | string): string {
  const d = typeof input === "string" ? toLocalDate(input) : input;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
}

/**
 * Format for year-month display: "2024年3月"
 */
export function toDisplayYearMonthJa(year: number, month: number): string {
  return `${year}年${month}月`;
}

/**
 * Format for PDF display: "2024/03/15"
 */
export function toDisplayDateSlash(input: Date | string): string {
  const d = typeof input === "string" ? toLocalDate(input) : input;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Safely extract date string from a DB record's workDate field.
 * Handles both Date objects and string values.
 */
export function extractDateStr(workDate: Date | string): string {
  if (typeof workDate === "string") {
    // If ISO string like "2024-03-15T00:00:00.000Z", extract date part
    return workDate.substring(0, 10);
  }
  return toDbDateString(workDate);
}
