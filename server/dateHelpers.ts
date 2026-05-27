/**
 * Server-side date helpers — UTC-safe date parsing for "YYYY-MM-DD" strings.
 *
 * Problem: `new Date("2024-03-15")` parses as UTC midnight (2024-03-15T00:00:00Z).
 * In JST (+9), this becomes 2024-03-15T09:00:00+09:00, which is fine for display,
 * but when MySQL stores it as a TIMESTAMP, timezone conversion can shift the date.
 *
 * Solution: Parse "YYYY-MM-DD" strings explicitly with noon UTC to avoid any
 * date boundary issues across timezones.
 */

/**
 * Parse a "YYYY-MM-DD" string to a Date at noon UTC.
 * This avoids timezone-related date shifts for date-only values.
 */
export function parseDateString(dateStr: string): Date {
  // Validate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    // If it's already an ISO string or other format, try to extract date part
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return new Date(Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0));
    }
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use noon UTC to avoid date boundary issues
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/**
 * Parse a "YYYY-MM-DD" string to start-of-day and end-of-day Date objects.
 * Used for date range queries where we need to match all records on a given date.
 */
export function parseDateRange(dateStr: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      dateStr = `${match[1]}-${match[2]}-${match[3]}`;
    }
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0)),
    end: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)),
  };
}

/**
 * Format a Date object to "YYYY-MM-DD" string using UTC getters.
 * This is the inverse of parseDateString.
 */
export function formatDateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
