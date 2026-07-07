/**
 * Attendance Sheet PDF Generator (出面表PDF)
 * Generates A4 landscape PDF with monthly attendance grid.
 * Marks: 出勤=○, 半日=△, 欠勤=X, 休出=休, 残業=+N
 */
import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay } from "date-fns";
import { isWorkedType, cellHasValue, extractDateKey } from "../shared/attendanceStatus";

// NotoSansJP Variable font — bundled on CDN, no external fetch failures
const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Variable_0e3524c3.ttf";

// Variable font includes all weights (Regular=400, Bold=700)
const FONT_BOLD_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Variable_0e3524c3.ttf";

let fontPath: string | null = null;
let fontBoldPath: string | null = null;

async function downloadFont(url: string, filename: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const dest = path.join(tmpDir, filename);
  if (fs.existsSync(dest)) return dest;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (loc) {
          const get2 = loc.startsWith("https") ? https.get : http.get;
          get2(loc, (r2) => { r2.pipe(file); file.on("finish", () => { file.close(); resolve(dest); }); }).on("error", reject);
        }
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", reject);
  });
}

async function ensureFonts(): Promise<{ regular: string; bold: string }> {
  if (!fontPath || !fs.existsSync(fontPath)) {
    fontPath = await downloadFont(FONT_URL, "NotoSansJP-Regular.ttf");
  }
  // Use regular for bold as well if bold download fails
  try {
    if (!fontBoldPath || !fs.existsSync(fontBoldPath)) {
      fontBoldPath = await downloadFont(FONT_BOLD_URL, "NotoSansJP-Bold.ttf");
    }
  } catch {
    fontBoldPath = fontPath;
  }
  return { regular: fontPath, bold: fontBoldPath || fontPath };
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    return new Promise((resolve) => {
      const get = url.startsWith("https") ? https.get : http.get;
      get(url, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", () => resolve(null));
      }).on("error", () => resolve(null));
    });
  } catch { return null; }
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// New marks per spec: 出勤=○, 半日(早退)=△, 欠勤=X, 休出=休
const WORK_TYPE_MARKS: Record<string, string> = {
  normal: "○",
  half_day: "△",
  overtime: "○",
  holiday: "休出",
  absence: "X",
  day_off: "休",
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
  logoUrl?: string;
  watermarkUrl?: string;
  employees: EmployeeInfo[];
  guestNames: string[];
  records: AttendanceRecord[];
}

export async function generateAttendancePdf(options: AttendancePdfOptions): Promise<Buffer> {
  const fonts = await ensureFonts();
  const { year, month, projectName, companyName, employees, guestNames, records, logoUrl, watermarkUrl } = options;

  // Fetch images
  const [logoBuffer, watermarkBuffer] = await Promise.all([
    logoUrl ? fetchImageBuffer(logoUrl) : null,
    watermarkUrl ? fetchImageBuffer(watermarkUrl) : null,
  ]);

  const monthDate = new Date(year, month - 1, 1);
  const days = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  });
  const numDays = days.length;

  // Build attendance map
  const attendanceMap: Record<string, AttendanceRecord> = {};
  for (const rec of records) {
    const dateStr = extractDateKey(rec.workDate);
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

  doc.registerFont("Regular", fonts.regular);
  doc.registerFont("Bold", fonts.bold);
  doc.font("Regular");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const pageW = 841.89 - 60; // A4 landscape width minus margins
  const pageH = 595.28;
  const startX = 30;
  const startY = 30;

  // --- Draw watermark ---
  function drawWatermark() {
    if (watermarkBuffer) {
      try {
        doc.save();
        doc.opacity(0.06);
        const wmSize = 300;
        const wmX = (841.89 - wmSize) / 2;
        const wmY = (pageH - wmSize) / 2;
        doc.image(watermarkBuffer, wmX, wmY, { width: wmSize, height: wmSize });
        doc.restore();
      } catch { /* ignore */ }
    }
  }

  drawWatermark();

  // --- Header ---
  // Company name and logo
  let headerY = startY;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, startX, headerY, { height: 34 });
    } catch { /* ignore */ }
  }
  doc.font("Bold").fontSize(12).text(
    companyName || "充寵グループ",
    startX + (logoBuffer ? 42 : 0),
    headerY + 6,
    { width: 240 }
  );

  // Title centered
  doc.font("Bold").fontSize(18).text(
    `出面表 ${year}年${month}月`,
    startX,
    headerY,
    { align: "center", width: pageW }
  );
  doc.font("Regular").fontSize(11).text(
    `現場: ${projectName}`,
    startX,
    headerY + 24,
    { align: "center", width: pageW }
  );

  // ── レイアウト: 用紙(A4横)を縦にも使い切るよう行の高さを行数から自動調整し、文字も大きくする ──
  const tableY = headerY + 52;
  const nameColW = 108;
  const summaryColW = 42;
  const dayColW = (pageW - nameColW - summaryColW * 3) / numDays;
  const headerRowH = 34;
  // 凡例＋フッターの予約を差し引いた残り高さを行数で割る。読みやすさのため 26〜48pt にクランプ。
  // 予約は「凡例(y+=10 → +30チェック)＋フッター」が1ページ目に収まる十分な余白にする。
  const bottomReserve = 74;
  const availH = (pageH - startY - bottomReserve) - (tableY - startY) - headerRowH;
  const rowH = rows.length > 0
    ? Math.max(26, Math.min(48, availH / rows.length))
    : 32;
  // 行高に応じて記号フォントを拡大（残業併記があるときは少し控えめに）。
  const markFont = Math.max(12, Math.min(18, Math.round(rowH * 0.48)));
  const markFontOt = Math.max(11, markFont - 2);
  const otFont = Math.max(7, Math.min(10, Math.round(rowH * 0.24)));
  const nameFont = Math.max(9, Math.min(13, Math.round(rowH * 0.36)));
  const sumFont = Math.max(10, Math.min(14, Math.round(rowH * 0.4)));
  // セル内で1行テキストを縦中央に置くためのtop（ざっくりアセント補正）。
  const vc = (h: number, f: number) => (h - f) / 2 - 1;

  // --- Table Header ---
  // Name column header
  doc.save();
  doc.rect(startX, tableY, nameColW, headerRowH).fill("#F3F4F6").stroke("#D1D5DB");
  doc.restore();
  doc.fillColor("#111827").font("Bold").fontSize(10).text("氏名", startX + 5, tableY + vc(headerRowH, 10), { width: nameColW - 10 });

  let x = startX + nameColW;
  for (const day of days) {
    const dayOfWeek = getDay(day);
    const isSun = dayOfWeek === 0;
    const isSat = dayOfWeek === 6;

    // Background for weekends
    doc.save();
    if (isSun) {
      doc.rect(x, tableY, dayColW, headerRowH).fill("#FEE2E2");
    } else if (isSat) {
      doc.rect(x, tableY, dayColW, headerRowH).fill("#DBEAFE");
    } else {
      doc.rect(x, tableY, dayColW, headerRowH).fill("#F3F4F6");
    }
    doc.restore();
    doc.rect(x, tableY, dayColW, headerRowH).stroke("#D1D5DB");

    doc.fillColor(isSun ? "#DC2626" : isSat ? "#2563EB" : "#111827");
    doc.font("Bold").fontSize(10).text(format(day, "d"), x, tableY + 4, { width: dayColW, align: "center" });
    doc.font("Regular").fontSize(7).text(DAY_LABELS[dayOfWeek], x, tableY + 19, { width: dayColW, align: "center" });
    x += dayColW;
  }

  // Summary columns header
  const summaryLabels = ["日数", "時間", "残業"];
  for (const label of summaryLabels) {
    doc.save();
    doc.rect(x, tableY, summaryColW, headerRowH).fill("#F3F4F6").stroke("#D1D5DB");
    doc.restore();
    doc.fillColor("#111827").font("Bold").fontSize(9).text(label, x, tableY + vc(headerRowH, 9), { width: summaryColW, align: "center" });
    x += summaryColW;
  }

  // --- Data Rows ---
  let y = tableY + headerRowH;
  let rowIndex = 0;

  for (const row of rows) {
    if (y + rowH > pageH - bottomReserve) {
      // New page
      doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
      drawWatermark();
      y = 30;
    }

    const isEvenRow = rowIndex % 2 === 0;

    // Name cell
    doc.save();
    if (isEvenRow) {
      doc.rect(startX, y, nameColW, rowH).fill("#FAFAFA");
    }
    doc.restore();
    doc.rect(startX, y, nameColW, rowH).stroke("#D1D5DB");
    doc.fillColor("#111827").font("Regular").fontSize(nameFont).text(
      row.label,
      startX + 5,
      y + vc(rowH, nameFont),
      { width: nameColW - 10, lineBreak: false }
    );

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

      // Background
      doc.save();
      if (isSun) {
        doc.rect(cx, y, dayColW, rowH).fill("#FEF2F2");
      } else if (isSat) {
        doc.rect(cx, y, dayColW, rowH).fill("#EFF6FF");
      } else if (isEvenRow) {
        doc.rect(cx, y, dayColW, rowH).fill("#FAFAFA");
      }
      doc.restore();
      doc.rect(cx, y, dayColW, rowH).stroke("#D1D5DB");

      if (rec && !isWorkedType(rec.workType) && cellHasValue(rec.hoursWorked, rec.workType)) {
        // Day off / absence — NOT counted as worked days
        const mark = WORK_TYPE_MARKS[rec.workType] || "休";
        const markColor = rec.workType === "absence" ? "#DC2626" : "#6B7280";
        doc.fillColor(markColor).font("Bold").fontSize(markFont).text(
          mark,
          cx,
          y + vc(rowH, markFont),
          { width: dayColW, align: "center" }
        );
      } else if (rec && rec.hoursWorked > 0) {
        totalDays++;
        totalHours += rec.hoursWorked;
        totalOvertime += rec.overtimeHours;

        const mark = WORK_TYPE_MARKS[rec.workType] || "○";
        const nightMark = rec.shiftType === "night" ? "夜" : "";
        const hasOt = rec.overtimeHours > 0;

        // Color coding
        let markColor = "#059669"; // green for normal
        if (rec.workType === "half_day") markColor = "#D97706"; // amber
        else if (rec.workType === "holiday") markColor = "#7C3AED"; // purple

        const mf = hasOt ? markFontOt : markFont;
        doc.fillColor(markColor).font("Bold").fontSize(mf).text(
          `${mark}${nightMark}`,
          cx,
          y + (hasOt ? Math.max(2, rowH * 0.14) : vc(rowH, mf)),
          { width: dayColW, align: "center" }
        );

        if (hasOt) {
          doc.fillColor("#2563EB").font("Regular").fontSize(otFont).text(
            `+${rec.overtimeHours / 10}`,
            cx,
            y + rowH - otFont - 3,
            { width: dayColW, align: "center" }
          );
        }
      }
      cx += dayColW;
    }

    // Summary cells
    const drawSummary = (value: string, color: string, bold: boolean) => {
      doc.save();
      if (isEvenRow) doc.rect(cx, y, summaryColW, rowH).fill("#FAFAFA");
      doc.restore();
      doc.rect(cx, y, summaryColW, rowH).stroke("#D1D5DB");
      doc.fillColor(color).font(bold ? "Bold" : "Regular").fontSize(sumFont).text(
        value, cx, y + vc(rowH, sumFont), { width: summaryColW, align: "center" }
      );
      cx += summaryColW;
    };
    drawSummary(totalDays > 0 ? String(totalDays) : "-", "#111827", true);
    drawSummary(totalHours > 0 ? String(totalHours / 10) : "-", "#111827", false);
    drawSummary(totalOvertime > 0 ? String(totalOvertime / 10) : "-", totalOvertime > 0 ? "#2563EB" : "#111827", false);

    y += rowH;
    rowIndex++;
  }

  // --- Legend ---
  y += 10;
  if (y + 30 > pageH - 30) {
    doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
    drawWatermark();
    y = 30;
  }

  doc.fillColor("#6B7280").font("Regular").fontSize(9);
  doc.text("凡例:  ○ = 出勤    △ = 半日/早退    X = 欠勤    休出 = 休日出勤    休 = 休日    夜 = 夜勤    +N = 残業時間(h)", startX, y, { width: pageW });

  // Footer
  y += 16;
  doc.fillColor("#9CA3AF").fontSize(8).text(
    `作成日: ${format(new Date(), "yyyy/MM/dd")}`,
    startX,
    y,
    { width: pageW, align: "right" }
  );

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
