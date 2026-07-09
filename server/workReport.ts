/*
 * workReport.ts — 個別作業日報のデータ構築（オーナー指示書準拠）
 *
 * 出面（attendance）から「何日に・どの現場へ・昼勤/夜勤・残業h」を、
 * 月締め提出（closing_submissions.transportAmount）から「本人が提出した現場別交通費」を取り、
 * 交通費は現場別に本人の出勤日数で日割り（端数は本人のその現場最終出勤日に調整）する。
 * ゲストは対象外（employeeId を持つ作業員のみ）。
 */
import * as db from "./db";
import { isWorkedType } from "../shared/attendanceStatus";

/** 交通費の日割り: floor で均等割りし、端数は最終出勤日に加算。合計は必ず total と一致する。 */
export function prorateTransport(total: number, dayCount: number): number[] {
  if (dayCount <= 0 || total <= 0) return [];
  const per = Math.floor(total / dayCount);
  const amounts = Array(dayCount).fill(per);
  amounts[dayCount - 1] = total - per * (dayCount - 1);
  return amounts;
}

export type WorkReportRow = {
  day: number; // 1..31
  weekday: number; // 0=日
  projectNames: string[]; // 出勤した現場名（通常1件。同日複数現場はまれに複数）
  isNight: boolean; // いずれかが夜勤なら true
  overtimeTimes10: number; // 残業（×10）。0なら空欄表示
  transport: number; // 円。0なら空欄表示
};

export type WorkReportData = {
  employeeId: number;
  name: string;
  month: string; // YYYY-MM
  year: number;
  monthNum: number;
  daysInMonth: number;
  rows: WorkReportRow[];
  summary: {
    dayShiftDays: number;
    nightShiftDays: number;
    overtimeHoursTimes10: number;
  };
  transportByProject: Array<{ projectId: number; projectName: string; total: number; days: number }>;
};

function monthRange(month: string): { start: Date; end: Date; year: number; monthNum: number; daysInMonth: number } {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59));
  return { start, end, year: y, monthNum: m, daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

function dateKey(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** 対象作業員の対象月の作業日報データを構築する。 */
export async function buildWorkerWorkReport(employeeId: number, month: string): Promise<WorkReportData | null> {
  const { start, end, year, monthNum, daysInMonth } = monthRange(month);
  const [employee, allProjects, records] = await Promise.all([
    db.getEmployeeById(employeeId),
    db.getAllProjects(),
    db.getAttendanceByDateRange(start, end),
  ]);
  if (!employee) return null;
  const projectName = (id: number) => (allProjects as any[]).find((p) => Number(p.id) === Number(id))?.name || `現場${id}`;

  const myRecords = (records as any[]).filter(
    (r) => Number(r.employeeId) === Number(employeeId) && isWorkedType(r.workType) && Number(r.hoursWorked || 0) > 0
  );

  // 日付ごとにまとめる（同日複数現場はまれだが結合して扱う）
  const byDay = new Map<number, { projectIds: number[]; projectNames: string[]; isNight: boolean; overtimeTimes10: number }>();
  // 現場別の本人出勤日（交通費日割り用・昇順）
  const daysByProject = new Map<number, number[]>();

  for (const rec of myRecords) {
    const key = dateKey(rec.workDate);
    if (!key) continue;
    const day = Number(key.slice(8, 10));
    if (day < 1 || day > daysInMonth) continue;
    const projectId = Number(rec.projectId);
    const entry = byDay.get(day) || { projectIds: [], projectNames: [], isNight: false, overtimeTimes10: 0 };
    if (!entry.projectIds.includes(projectId)) {
      entry.projectIds.push(projectId);
      entry.projectNames.push(projectName(projectId));
    }
    if (rec.shiftType === "night") entry.isNight = true;
    entry.overtimeTimes10 += Number(rec.overtimeHours || 0);
    byDay.set(day, entry);

    const days = daysByProject.get(projectId) || [];
    if (!days.includes(day)) days.push(day);
    daysByProject.set(projectId, days);
  }

  // 本人が提出した現場別交通費（月締め提出の transportAmount）→ 日割り
  const transportByDay = new Map<number, number>();
  const transportByProject: WorkReportData["transportByProject"] = [];
  for (const [projectId, days] of Array.from(daysByProject.entries())) {
    const closing = await db.getProjectClosingByProjectMonth(projectId, month);
    const submission = closing?.id ? await db.getClosingSubmissionByClosingEmployee(closing.id, employeeId) : null;
    const total = Number(submission?.transportAmount || 0);
    if (total <= 0) continue;
    const sorted = [...days].sort((a, b) => a - b);
    const amounts = prorateTransport(total, sorted.length);
    sorted.forEach((day, i) => {
      transportByDay.set(day, (transportByDay.get(day) || 0) + amounts[i]);
    });
    transportByProject.push({ projectId, projectName: projectName(projectId), total, days: sorted.length });
  }

  const rows: WorkReportRow[] = [];
  let dayShiftDays = 0;
  let nightShiftDays = 0;
  let overtimeHoursTimes10 = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const entry = byDay.get(day);
    const weekday = new Date(Date.UTC(year, monthNum - 1, day)).getUTCDay();
    if (entry) {
      if (entry.isNight) nightShiftDays++;
      else dayShiftDays++;
      overtimeHoursTimes10 += entry.overtimeTimes10;
    }
    rows.push({
      day,
      weekday,
      projectNames: entry?.projectNames || [],
      isNight: entry?.isNight || false,
      overtimeTimes10: entry?.overtimeTimes10 || 0,
      transport: transportByDay.get(day) || 0,
    });
  }

  return {
    employeeId,
    name: employee.nameKanji || employee.nameRomaji || `従業員${employeeId}`,
    month,
    year,
    monthNum,
    daysInMonth,
    rows,
    summary: { dayShiftDays, nightShiftDays, overtimeHoursTimes10 },
    transportByProject,
  };
}
