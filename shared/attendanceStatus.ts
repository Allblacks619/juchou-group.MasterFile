/**
 * Shared attendance status definitions.
 * Single source of truth for display labels, short marks, and colors
 * used across: Dashboard, AppAttendance, AppMyAttendance, and PDF output.
 */

export type WorkType = "normal" | "half_day" | "overtime" | "holiday" | "absence" | "day_off";
export type ShiftType = "day" | "night";

/** Full labels (Japanese) */
export const WORK_TYPE_LABELS: Record<WorkType, string> = {
  normal: "出勤",
  half_day: "半日",
  overtime: "残業",
  holiday: "休日出勤",
  absence: "休み",
  day_off: "休日",
};

/** Full labels (Portuguese) */
export const WORK_TYPE_LABELS_PT: Record<WorkType, string> = {
  normal: "Presente",
  half_day: "Meio dia",
  overtime: "Hora extra",
  holiday: "Folga trab.",
  absence: "Ausente",
  day_off: "Folga",
};

/** Short marks for calendar cells and PDF */
export const WORK_TYPE_SHORT: Record<WorkType, string> = {
  normal: "出",
  half_day: "半",
  overtime: "残",
  holiday: "出",   // holiday work = "出" (purple)
  absence: "休",   // absence = "休"
  day_off: "休",   // day off = "休"
};

/** Short marks (Portuguese) */
export const WORK_TYPE_SHORT_PT: Record<WorkType, string> = {
  normal: "P",
  half_day: "½",
  overtime: "HE",
  holiday: "P",    // holiday work = present (purple)
  absence: "F",    // folga
  day_off: "F",    // folga
};

/** Tailwind color classes for calendar cells */
export const WORK_TYPE_COLORS: Record<WorkType, string> = {
  normal: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  half_day: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  overtime: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  holiday: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  absence: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  day_off: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

/** PDF mark symbols */
export const WORK_TYPE_PDF_MARKS: Record<string, string> = {
  normal: "○",
  half_day: "△",
  overtime: "○",
  holiday: "出",    // holiday work = "出"
  absence: "休",    // absence = "休"
  day_off: "休",    // day off = "休"
};

/** PDF mark colors (hex) */
export const WORK_TYPE_PDF_COLORS: Record<string, string> = {
  normal: "#059669",   // green
  half_day: "#D97706", // amber
  overtime: "#059669", // green
  holiday: "#7C3AED",  // purple
  absence: "#6B7280",  // gray
  day_off: "#6B7280",  // gray
};

/**
 * Check if a cell has a meaningful value (not blank).
 * day_off and absence are meaningful markers even with 0 hours.
 */
export function cellHasValue(hoursWorked: number, workType: string): boolean {
  return hoursWorked > 0 || workType === "day_off" || workType === "absence";
}

/**
 * Check if a work type should be counted as worked days / billing target.
 * day_off and absence are NOT counted.
 */
export function isWorkedType(workType: string): boolean {
  return workType !== "day_off" && workType !== "absence";
}

/**
 * 出面日数の「1日あたりの重み」(×10)。半日(half_day)=0.5日、それ以外の実働=1.0日。
 * 稼働時間(hoursWorked)からは換算しない（時間記録は将来の労基用で日数算定には使わない）。
 * 呼び出し側で isWorkedType かつ hoursWorked>0 の実働レコードにのみ適用すること。
 */
export function workedDayValueTimes10(workType: string): number {
  return workType === "half_day" ? 5 : 10;
}

/**
 * Extract a "YYYY-MM-DD" date key from a DB record's workDate field.
 * Handles both Date objects and ISO string values safely.
 * This is the SINGLE function to use for building attendanceMap keys.
 */
export function extractDateKey(workDate: Date | string): string {
  if (typeof workDate === "string") {
    // ISO string like "2024-03-15T12:00:00.000Z" or "2024-03-15"
    return workDate.substring(0, 10);
  }
  // Date object — use UTC getters (our dates are stored at noon UTC)
  const y = workDate.getUTCFullYear();
  const m = String(workDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(workDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
