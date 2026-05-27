/**
 * 作業出面・交通費確認表 PDF Generator
 * Generates A4 portrait PDF with:
 * - 5 columns: 日付, 曜日, プロジェクト, 残業, 交通費（日額）
 * - Night work rows highlighted in purple
 * - Same-day multiple projects as separate rows
 * - Transportation calculated: monthly amount / attendance days (remainder on last day)
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";

const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Variable_0e3524c3.ttf";

let fontPath: string | null = null;

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

async function ensureFont(): Promise<string> {
  if (!fontPath || !fs.existsSync(fontPath)) {
    fontPath = await downloadFont(FONT_URL, "NotoSansJP-Confirmation.ttf");
  }
  return fontPath;
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export interface ConfirmationRecord {
  workDate: Date | string;
  projectId: number;
  projectName: string;
  shiftType: "day" | "night";
  overtimeHours: number; // stored as int * 10 (e.g. 15 = 1.5h)
  notes: string | null;
}

export interface ProjectTransport {
  projectId: number;
  projectName: string;
  monthlyAmount: number; // yen
  attendanceDays: number; // total days for this project in the month
}

export interface ConfirmationPdfOptions {
  year: number;
  month: number; // 1-12
  employeeName: string;
  companyName?: string;
  records: ConfirmationRecord[];
  projectTransports: ProjectTransport[];
}

interface PdfRow {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  projectName: string;
  isNight: boolean;
  overtime: string; // formatted
  transport: number; // yen for this day/project
  isSupplementRow?: boolean;
  showDate: boolean; // false for same-day subsequent rows
}

/**
 * Calculate daily transportation amounts with remainder on last day
 */
function calculateDailyTransport(monthlyAmount: number, totalDays: number): Map<number, number> {
  const dailyMap = new Map<number, number>();
  if (totalDays <= 0 || monthlyAmount <= 0) return dailyMap;
  const base = Math.floor(monthlyAmount / totalDays);
  const remainder = monthlyAmount - base * totalDays;
  for (let i = 0; i < totalDays; i++) {
    dailyMap.set(i, i === totalDays - 1 ? base + remainder : base);
  }
  return dailyMap;
}

export async function generateConfirmationPdf(options: ConfirmationPdfOptions): Promise<Buffer> {
  const font = await ensureFont();
  const { year, month, employeeName, companyName, records, projectTransports } = options;

  // Build transport lookup: projectId -> array of daily amounts (indexed by occurrence order)
  const projectDayCounters = new Map<number, number>(); // projectId -> current day index
  const projectDailyAmounts = new Map<number, Map<number, number>>(); // projectId -> (dayIndex -> amount)
  for (const pt of projectTransports) {
    projectDailyAmounts.set(pt.projectId, calculateDailyTransport(pt.monthlyAmount, pt.attendanceDays));
    projectDayCounters.set(pt.projectId, 0);
  }

  // Sort records by date, then day before night
  const sortedRecords = [...records].sort((a, b) => {
    const dateA = new Date(a.workDate).toISOString().slice(0, 10);
    const dateB = new Date(b.workDate).toISOString().slice(0, 10);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    // Same date: day before night
    if (a.shiftType === "day" && b.shiftType === "night") return -1;
    if (a.shiftType === "night" && b.shiftType === "day") return 1;
    // Same shift: sort by project
    return a.projectName.localeCompare(b.projectName, "ja");
  });

  // Track which dates we've already shown
  const seenDates = new Set<string>();
  // Track project day occurrences for transport calculation
  const projectDateSeen = new Map<string, Set<string>>(); // projectId-date tracking

  // Build PDF rows
  const pdfRows: PdfRow[] = [];
  for (const rec of sortedRecords) {
    const dateStr = new Date(rec.workDate).toISOString().slice(0, 10);
    const dateObj = new Date(rec.workDate);
    const dayOfWeek = DAY_LABELS[dateObj.getUTCDay()];
    const showDate = !seenDates.has(dateStr);
    seenDates.add(dateStr);

    // Calculate transport for this row
    const projectKey = `${rec.projectId}-${dateStr}`;
    if (!projectDateSeen.has(String(rec.projectId))) {
      projectDateSeen.set(String(rec.projectId), new Set());
    }
    let transport = 0;
    const projectDates = projectDateSeen.get(String(rec.projectId))!;
    if (!projectDates.has(dateStr)) {
      projectDates.add(dateStr);
      const dayIndex = projectDayCounters.get(rec.projectId) || 0;
      const dailyAmounts = projectDailyAmounts.get(rec.projectId);
      if (dailyAmounts) {
        transport = dailyAmounts.get(dayIndex) || 0;
      }
      projectDayCounters.set(rec.projectId, dayIndex + 1);
    }

    // Format overtime
    const overtimeHrs = rec.overtimeHours / 10;
    const overtime = overtimeHrs > 0 ? `${overtimeHrs.toFixed(1)}h` : "";

    pdfRows.push({
      date: showDate ? `${parseInt(dateStr.slice(8, 10))}` : "",
      dayOfWeek: showDate ? dayOfWeek : "",
      projectName: rec.projectName,
      isNight: rec.shiftType === "night",
      overtime,
      transport,
      showDate,
    });

    // Add supplement row for notes if present
    if (rec.notes && rec.notes.trim()) {
      pdfRows.push({
        date: "",
        dayOfWeek: "",
        projectName: `※ ${rec.notes.trim()}`,
        isNight: false,
        overtime: "",
        transport: 0,
        isSupplementRow: true,
        showDate: false,
      });
    }
  }

  // Generate PDF
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    info: {
      Title: `作業出面・交通費確認表 ${year}年${month}月 - ${employeeName}`,
      Author: companyName || "充寵グループ",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.registerFont("NotoSansJP", font);
  doc.font("NotoSansJP");

  const pageW = doc.page.width;
  const mL = 40;
  const mR = 40;
  const contentW = pageW - mL - mR;

  // Header
  doc.fontSize(14).text("作業出面・交通費確認表", mL, 40, { align: "center", width: contentW });
  doc.fontSize(10).text(`${year}年${month}月`, mL, 60, { align: "center", width: contentW });
  doc.fontSize(10).text(`従業員: ${employeeName}`, mL, 78, { align: "left" });
  if (companyName) {
    doc.fontSize(9).text(companyName, mL, 78, { align: "right", width: contentW });
  }

  // Table setup
  const tableTop = 100;
  const rowH = 22;
  const colWidths = [40, 30, 220, 50, 80]; // 日付, 曜日, プロジェクト, 残業, 交通費
  const colX = [mL];
  for (let i = 1; i < colWidths.length; i++) {
    colX.push(colX[i - 1] + colWidths[i - 1]);
  }
  const headers = ["日付", "曜日", "プロジェクト", "残業", "交通費（日額）"];

  // Draw header row
  let y = tableTop;
  doc.fontSize(8).fillColor("#333333");
  // Header background
  doc.rect(mL, y, contentW, rowH).fill("#f0f0f0").stroke("#cccccc");
  doc.fillColor("#333333");
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], colX[i] + 4, y + 6, { width: colWidths[i] - 8, align: "center" });
  }
  y += rowH;

  // Draw data rows
  const nightBg = "#f3e8ff"; // light purple for night work
  let totalTransport = 0;

  for (const row of pdfRows) {
    // Check if we need a new page
    if (y + rowH > doc.page.height - 60) {
      doc.addPage();
      y = 40;
      // Redraw header on new page
      doc.rect(mL, y, contentW, rowH).fill("#f0f0f0").stroke("#cccccc");
      doc.fillColor("#333333");
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], colX[i] + 4, y + 6, { width: colWidths[i] - 8, align: "center" });
      }
      y += rowH;
    }

    // Row background
    if (row.isNight) {
      doc.rect(mL, y, contentW, rowH).fill(nightBg);
    }
    // Row border
    doc.rect(mL, y, contentW, rowH).stroke("#dddddd");
    doc.fillColor(row.isSupplementRow ? "#666666" : "#111111");
    doc.fontSize(row.isSupplementRow ? 7 : 8);

    // Date column
    doc.text(row.date, colX[0] + 4, y + 6, { width: colWidths[0] - 8, align: "center" });
    // Day of week column
    doc.text(row.dayOfWeek, colX[1] + 4, y + 6, { width: colWidths[1] - 8, align: "center" });
    // Project column (with night indicator)
    const projectText = row.isNight ? `🌙 ${row.projectName}` : row.projectName;
    doc.text(projectText, colX[2] + 4, y + 6, { width: colWidths[2] - 8, align: "left" });
    // Overtime column
    doc.text(row.overtime, colX[3] + 4, y + 6, { width: colWidths[3] - 8, align: "center" });
    // Transport column
    if (row.transport > 0) {
      doc.text(`¥${row.transport.toLocaleString()}`, colX[4] + 4, y + 6, { width: colWidths[4] - 8, align: "right" });
      totalTransport += row.transport;
    }

    y += rowH;
  }

  // Summary footer
  y += 10;
  doc.fontSize(9).fillColor("#111111");
  doc.text(`交通費合計: ¥${totalTransport.toLocaleString()}`, mL, y, { align: "right", width: contentW });
  y += 16;
  doc.fontSize(8).fillColor("#666666");
  doc.text("※ 紫色の行は夜勤を示します", mL, y);
  y += 12;
  doc.text(`生成日時: ${new Date().toISOString().slice(0, 16).replace("T", " ")}`, mL, y);

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
