/**
 * Attendance Sheet Excel Generator (出面表Excel)
 * Generates .xlsx workbook with monthly attendance grid per project.
 * Layout mirrors the PDF version: rows = workers, columns = days of month.
 */
import ExcelJS from "exceljs";
import { eachDayOfInterval, startOfMonth, endOfMonth, getDay } from "date-fns";

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const WORK_TYPE_MARKS: Record<string, string> = {
  normal: "○",
  half_day: "△",
  overtime: "○",
  holiday: "休",
  absence: "X",
};

interface AttendanceRecord {
  employeeId: number | null;
  guestName: string | null;
  workDate: Date | string;
  hoursWorked: number;
  overtimeHours: number;
  workType: string;
  shiftType: string;
  notes: string | null;
}

interface EmployeeInfo {
  id: number;
  nameKanji: string;
}

interface AttendanceExcelOptions {
  year: number;
  month: number; // 1-12
  projectName: string;
  companyName?: string;
  employees: EmployeeInfo[];
  guestNames: string[];
  records: AttendanceRecord[];
}

export async function generateAttendanceExcel(options: AttendanceExcelOptions): Promise<Buffer> {
  const { year, month, projectName, companyName, employees, guestNames, records } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName || "充寵グループ";
  workbook.created = new Date();

  const ws = workbook.addWorksheet(`${year}年${month}月`, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    },
  });

  // Build date range
  const firstDay = startOfMonth(new Date(year, month - 1));
  const lastDay = endOfMonth(new Date(year, month - 1));
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });
  const numDays = days.length;

  // Build record lookup: key = `${empId || guestName}_${dateStr}`
  const recMap = new Map<string, AttendanceRecord>();
  for (const rec of records) {
    const d = typeof rec.workDate === "string" ? new Date(rec.workDate) : rec.workDate;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const key = rec.employeeId ? `emp_${rec.employeeId}_${dateStr}` : `guest_${rec.guestName}_${dateStr}`;
    recMap.set(key, rec);
  }

  // Build worker list
  const workers: { id: number | null; name: string; isGuest: boolean }[] = [
    ...employees.map(e => ({ id: e.id, name: e.nameKanji, isGuest: false })),
    ...guestNames.map(name => ({ id: null, name, isGuest: true })),
  ];

  // ── Styles ──
  const headerFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D2D2D" } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 9, name: "Noto Sans JP" };
  const dayHeaderFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  const sundayFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F0" } };
  const saturdayFill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F0FF" } };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  // ── Title Row ──
  const titleRow = ws.addRow([`出面表 — ${year}年${month}月`]);
  ws.mergeCells(1, 1, 1, 3 + numDays + 2);
  titleRow.getCell(1).font = { bold: true, size: 14, name: "Noto Sans JP" };
  titleRow.height = 28;

  // ── Sub-header ──
  const subRow = ws.addRow([`現場: ${projectName}`, "", companyName || ""]);
  ws.mergeCells(2, 1, 2, 3);
  subRow.getCell(1).font = { size: 10, name: "Noto Sans JP" };
  subRow.height = 20;

  // ── Column headers ──
  // Columns: No. | 氏名 | 区分 | Day1 | Day2 | ... | DayN | 出勤日数 | 残業時間
  const headerValues: (string | number)[] = ["No.", "氏名", "区分"];
  for (const day of days) {
    headerValues.push(day.getDate());
  }
  headerValues.push("出勤日数", "残業時間");

  const hRow = ws.addRow(headerValues);
  hRow.height = 22;
  for (let c = 1; c <= headerValues.length; c++) {
    const cell = hRow.getCell(c);
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  }

  // Day-of-week sub-header
  const dowValues: string[] = ["", "", ""];
  for (const day of days) {
    dowValues.push(DAY_LABELS[getDay(day)]);
  }
  dowValues.push("", "");

  const dowRow = ws.addRow(dowValues);
  dowRow.height = 18;
  for (let c = 1; c <= dowValues.length; c++) {
    const cell = dowRow.getCell(c);
    cell.fill = dayHeaderFill;
    cell.font = { size: 8, name: "Noto Sans JP" };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;

    // Color weekends
    if (c > 3 && c <= 3 + numDays) {
      const dayIdx = c - 4;
      const dow = getDay(days[dayIdx]);
      if (dow === 0) {
        cell.font = { size: 8, color: { argb: "FFCC0000" }, name: "Noto Sans JP" };
        cell.fill = sundayFill;
      } else if (dow === 6) {
        cell.font = { size: 8, color: { argb: "FF0000CC" }, name: "Noto Sans JP" };
        cell.fill = saturdayFill;
      }
    }
  }

  // ── Data Rows ──
  for (let wi = 0; wi < workers.length; wi++) {
    const worker = workers[wi];
    const rowValues: (string | number)[] = [
      wi + 1,
      worker.name,
      worker.isGuest ? "応援" : "社員",
    ];

    let workDays = 0;
    let totalOvertime = 0;

    for (const day of days) {
      const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const key = worker.isGuest ? `guest_${worker.name}_${dateStr}` : `emp_${worker.id}_${dateStr}`;
      const rec = recMap.get(key);

      if (rec) {
        let mark = WORK_TYPE_MARKS[rec.workType] || "○";
        if (rec.overtimeHours > 0) {
          mark += `+${(rec.overtimeHours / 10).toFixed(1)}`;
        }
        rowValues.push(mark);
        if (rec.workType !== "absence") workDays++;
        if (rec.workType === "half_day") workDays -= 0.5;
        totalOvertime += rec.overtimeHours;
      } else {
        rowValues.push("");
      }
    }

    rowValues.push(workDays);
    rowValues.push(totalOvertime > 0 ? `${(totalOvertime / 10).toFixed(1)}h` : "");

    const dataRow = ws.addRow(rowValues);
    dataRow.height = 20;

    for (let c = 1; c <= rowValues.length; c++) {
      const cell = dataRow.getCell(c);
      cell.border = thinBorder;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.font = { size: 9, name: "Noto Sans JP" };

      // Name column left-aligned
      if (c === 2) {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }

      // Weekend column coloring
      if (c > 3 && c <= 3 + numDays) {
        const dayIdx = c - 4;
        const dow = getDay(days[dayIdx]);
        if (dow === 0) cell.fill = sundayFill;
        else if (dow === 6) cell.fill = saturdayFill;
      }

      // Alternating row colors
      if (wi % 2 === 1 && c <= 3) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9F9F9" } };
      }
    }
  }

  // ── Column widths ──
  ws.getColumn(1).width = 5;   // No.
  ws.getColumn(2).width = 14;  // 氏名
  ws.getColumn(3).width = 6;   // 区分
  for (let i = 0; i < numDays; i++) {
    ws.getColumn(4 + i).width = 5.5;
  }
  ws.getColumn(4 + numDays).width = 9;     // 出勤日数
  ws.getColumn(4 + numDays + 1).width = 9;  // 残業時間

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
