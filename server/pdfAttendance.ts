/**
 * Attendance Sheet PDF Generator (出面表PDF)
 * Generates A4 landscape PDF with monthly attendance grid.
 */
import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay } from "date-fns";

const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Regular_e41d65c6.ttf";

let fontPath: string | null = null;

async function ensureFont(): Promise<string> {
  if (fontPath && fs.existsSync(fontPath)) return fontPath;
  const tmpDir = os.tmpdir();
  const dest = path.join(tmpDir, "NotoSansJP-Regular.ttf");
  if (fs.existsSync(dest)) {
    fontPath = dest;
    return dest;
  }
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = FONT_URL.startsWith("https") ? https.get : http.get;
    get(FONT_URL, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          const get2 = loc.startsWith("https") ? https.get : http.get;
          get2(loc, (r2) => { r2.pipe(file); file.on("finish", () => { file.close(); fontPath = dest; resolve(dest); }); }).on("error", reject);
        }
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); fontPath = dest; resolve(dest); });
    }).on("error", reject);
  });
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const WORK_TYPE_LABELS: Record<string, string> = {
  normal: "出",
  half_day: "半",
  overtime: "残",
  holiday: "休",
  absence: "欠",
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

interface AttendancePdfOptions {
  year: number;
  month: number; // 1-12
  projectName: string;
  companyName?: string;
  employees: EmployeeInfo[];
  guestNames: string[];
  records: AttendanceRecord[];
}

export async function generateAttendancePdf(options: AttendancePdfOptions): Promise<Buffer> {
  const font = await ensureFont();
  const { year, month, projectName, companyName, employees, guestNames, records } = options;

  const monthDate = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  });
  const numDays = days.length;

  // Build attendance map
  const attendanceMap: Record<string, AttendanceRecord> = {};
  for (const rec of records) {
    const dateStr = format(new Date(rec.workDate), "yyyy-MM-dd");
    const key = rec.employeeId ? `emp-${rec.employeeId}-${dateStr}` : `guest-${rec.guestName}-${dateStr}`;
    attendanceMap[key] = rec;
  }

  // All rows: employees + guests
  const rows: { label: string; keyPrefix: string }[] = [
    ...employees.map(e => ({ label: e.nameKanji, keyPrefix: `emp-${e.id}` })),
    ...guestNames.map(g => ({ label: `${g}（ゲスト）`, keyPrefix: `guest-${g}` })),
  ];

  // A4 landscape
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 30, bottom: 30, left: 30, right: 30 },
    info: {
      Title: `出面表 ${year}年${month}月 - ${projectName}`,
      Author: companyName || "充寵グループ",
    },
  });

  doc.font(font);

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const pageW = 841.89 - 60; // A4 landscape width minus margins
  const startX = 30;
  const startY = 30;

  // Title
  doc.fontSize(14).text(`出面表 ${year}年${month}月`, startX, startY, { align: "center", width: pageW });
  doc.fontSize(10).text(`現場: ${projectName}`, startX, startY + 20, { align: "center", width: pageW });
  if (companyName) {
    doc.fontSize(8).text(companyName, startX, startY + 35, { align: "center", width: pageW });
  }

  const tableY = startY + 55;
  const nameColW = 90;
  const summaryColW = 35;
  const dayColW = Math.min(22, (pageW - nameColW - summaryColW * 3) / numDays);
  const rowH = 18;
  const headerH = 30;

  // Header row
  doc.fontSize(7);
  doc.rect(startX, tableY, nameColW, headerH).stroke();
  doc.text("氏名", startX + 2, tableY + 10, { width: nameColW - 4 });

  let x = startX + nameColW;
  for (const day of days) {
    const dayOfWeek = getDay(day);
    const isSun = dayOfWeek === 0;
    const isSat = dayOfWeek === 6;

    // Background for weekends
    if (isSun || isSat) {
      doc.save();
      doc.rect(x, tableY, dayColW, headerH).fill(isSun ? "#FEE2E2" : "#DBEAFE");
      doc.restore();
    }
    doc.rect(x, tableY, dayColW, headerH).stroke();
    doc.fontSize(6).text(format(day, "d"), x, tableY + 3, { width: dayColW, align: "center" });
    doc.fontSize(5).text(DAY_LABELS[dayOfWeek], x, tableY + 14, { width: dayColW, align: "center" });
    x += dayColW;
  }

  // Summary columns
  const summaryLabels = ["日数", "時間", "残業"];
  for (const label of summaryLabels) {
    doc.rect(x, tableY, summaryColW, headerH).stroke();
    doc.fontSize(6).text(label, x, tableY + 10, { width: summaryColW, align: "center" });
    x += summaryColW;
  }

  // Data rows
  let y = tableY + headerH;
  for (const row of rows) {
    if (y + rowH > 595.28 - 30) {
      // New page
      doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
      y = 30;
    }

    // Name cell
    doc.rect(startX, y, nameColW, rowH).stroke();
    doc.fontSize(6).text(row.label, startX + 2, y + 5, { width: nameColW - 4, lineBreak: false });

    let cx = startX + nameColW;
    let totalDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;

    for (const day of days) {
      const dateStr = format(day, "yyyy-MM-dd");
      const key = `${row.keyPrefix}-${dateStr}`;
      const rec = attendanceMap[key];
      const dayOfWeek = getDay(day);
      const isSun = dayOfWeek === 0;
      const isSat = dayOfWeek === 6;

      if (isSun || isSat) {
        doc.save();
        doc.rect(cx, y, dayColW, rowH).fill(isSun ? "#FEF2F2" : "#EFF6FF");
        doc.restore();
      }
      doc.rect(cx, y, dayColW, rowH).stroke();

      if (rec && rec.hoursWorked > 0) {
        totalDays++;
        totalHours += rec.hoursWorked;
        totalOvertime += rec.overtimeHours;

        const label = WORK_TYPE_LABELS[rec.workType] || "出";
        const shiftMark = rec.shiftType === "night" ? "夜" : "";
        doc.fontSize(5).text(`${label}${shiftMark}`, cx, y + 3, { width: dayColW, align: "center" });
        if (rec.overtimeHours > 0) {
          doc.fontSize(4).text(`+${rec.overtimeHours / 10}h`, cx, y + 10, { width: dayColW, align: "center" });
        }
      }
      cx += dayColW;
    }

    // Summary cells
    doc.rect(cx, y, summaryColW, rowH).stroke();
    doc.fontSize(6).text(totalDays > 0 ? String(totalDays) : "-", cx, y + 5, { width: summaryColW, align: "center" });
    cx += summaryColW;

    doc.rect(cx, y, summaryColW, rowH).stroke();
    doc.fontSize(6).text(totalHours > 0 ? String(totalHours / 10) : "-", cx, y + 5, { width: summaryColW, align: "center" });
    cx += summaryColW;

    doc.rect(cx, y, summaryColW, rowH).stroke();
    doc.fontSize(6).text(totalOvertime > 0 ? String(totalOvertime / 10) : "-", cx, y + 5, { width: summaryColW, align: "center" });

    y += rowH;
  }

  // Footer
  doc.fontSize(7).text(
    `作成日: ${format(new Date(), "yyyy/MM/dd")}`,
    startX,
    y + 10,
    { width: pageW, align: "right" }
  );

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
