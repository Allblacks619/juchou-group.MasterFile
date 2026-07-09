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
  /** ゲストの行を載せる（既定: true） */
  includeGuests?: boolean;
  /** 平日(土日以外)の未記入・休・欠勤を「✖」で埋める（月締め確定後の請求書添付用。既定: false） */
  fillAbsentWeekdays?: boolean;
}

export async function generateAttendancePdf(options: AttendancePdfOptions): Promise<Buffer> {
  const fonts = await ensureFonts();
  const { year, month, projectName, companyName, employees, records, logoUrl, watermarkUrl } = options;
  const guestNames = options.includeGuests === false ? [] : options.guestNames;
  const fillAbsent = options.fillAbsentWeekdays === true;

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

  // ── レイアウト（見本準拠）: 作業員ごとに「出勤」「残業」の2段行。氏名は1行（自動縮小・改行なし）。
  // 右端に合計列、最下部に日別合計（出勤人数/残業h）の2行。
  const tableY = headerY + 52;
  const nameColW = 96;
  const typeColW = 26; // 出勤/残業 のサブラベル列
  const summaryColW = 40; // 右端の合計列
  const dayColW = (pageW - nameColW - typeColW - summaryColW) / numDays;
  const headerRowH = 30;
  const bottomReserve = 74;
  // 行数 = 作業員×2 + 日別合計2。半行(サブ行)の高さでクランプ。
  const subRowsCount = rows.length * 2 + 2;
  const availH = (pageH - startY - bottomReserve) - (tableY - startY) - headerRowH;
  const subRowH = subRowsCount > 0 ? Math.max(14, Math.min(26, availH / subRowsCount)) : 18;
  const markFont = Math.max(10, Math.min(15, Math.round(subRowH * 0.62)));
  const otNumFont = Math.max(8, Math.min(12, Math.round(subRowH * 0.5)));
  const sumFont = Math.max(9, Math.min(13, Math.round(subRowH * 0.55)));
  const baseNameFont = Math.max(9, Math.min(13, Math.round(subRowH * 0.55)));
  // セル内で1行テキストを縦中央に置くためのtop（ざっくりアセント補正）。
  const vc = (h: number, f: number) => (h - f) / 2 - 1;

  // 氏名を1行に収めるためのフォント自動縮小（改行させない）。
  const fitFontSize = (text: string, maxWidth: number, base: number): number => {
    let size = base;
    doc.font("Regular");
    while (size > 5.5) {
      doc.fontSize(size);
      if (doc.widthOfString(text) <= maxWidth) return size;
      size -= 0.5;
    }
    return size;
  };

  const drawTableHeader = (yTop: number): number => {
    // 氏名 + 区分 の結合ヘッダー
    doc.save();
    doc.rect(startX, yTop, nameColW + typeColW, headerRowH).fill("#F3F4F6");
    doc.restore();
    doc.rect(startX, yTop, nameColW + typeColW, headerRowH).stroke("#D1D5DB");
    doc.fillColor("#111827").font("Bold").fontSize(10).text("氏名", startX + 5, yTop + vc(headerRowH, 10), { width: nameColW - 10, lineBreak: false });

    let hx = startX + nameColW + typeColW;
    for (const day of days) {
      const dayOfWeek = getDay(day);
      const isSun = dayOfWeek === 0;
      const isSat = dayOfWeek === 6;
      doc.save();
      doc.rect(hx, yTop, dayColW, headerRowH).fill(isSun ? "#FEE2E2" : isSat ? "#DBEAFE" : "#F3F4F6");
      doc.restore();
      doc.rect(hx, yTop, dayColW, headerRowH).stroke("#D1D5DB");
      doc.fillColor(isSun ? "#DC2626" : isSat ? "#2563EB" : "#111827");
      doc.font("Bold").fontSize(9).text(format(day, "d"), hx, yTop + 3, { width: dayColW, align: "center" });
      doc.font("Regular").fontSize(7).text(DAY_LABELS[dayOfWeek], hx, yTop + 17, { width: dayColW, align: "center" });
      hx += dayColW;
    }

    doc.save();
    doc.rect(hx, yTop, summaryColW, headerRowH).fill("#F3F4F6");
    doc.restore();
    doc.rect(hx, yTop, summaryColW, headerRowH).stroke("#D1D5DB");
    doc.fillColor("#111827").font("Bold").fontSize(9).text("合計", hx, yTop + vc(headerRowH, 9), { width: summaryColW, align: "center" });
    return yTop + headerRowH;
  };

  // 日別合計（出勤人数・残業h）
  const dailyWorkedCount: number[] = days.map(() => 0);
  const dailyOvertime: number[] = days.map(() => 0);

  let y = drawTableHeader(tableY);

  for (const row of rows) {
    const pairH = subRowH * 2;
    if (y + pairH > pageH - bottomReserve) {
      doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
      drawWatermark();
      y = drawTableHeader(30);
    }

    // 氏名セル（2段ぶち抜き・1行・自動縮小）
    doc.rect(startX, y, nameColW, pairH).stroke("#D1D5DB");
    const nameFont = fitFontSize(row.label, nameColW - 8, baseNameFont);
    doc.fillColor("#111827").font("Regular").fontSize(nameFont).text(
      row.label,
      startX + 4,
      y + vc(pairH, nameFont),
      { width: nameColW - 8, lineBreak: false }
    );

    // 区分セル（出勤/残業）
    doc.save();
    doc.rect(startX + nameColW, y, typeColW, subRowH).fill("#FAFAFA");
    doc.rect(startX + nameColW, y + subRowH, typeColW, subRowH).fill("#FAFAFA");
    doc.restore();
    doc.rect(startX + nameColW, y, typeColW, subRowH).stroke("#D1D5DB");
    doc.rect(startX + nameColW, y + subRowH, typeColW, subRowH).stroke("#D1D5DB");
    const typeFont = Math.max(6.5, Math.min(8.5, subRowH * 0.42));
    doc.fillColor("#6B7280").font("Regular").fontSize(typeFont);
    doc.text("出勤", startX + nameColW, y + vc(subRowH, typeFont), { width: typeColW, align: "center" });
    doc.text("残業", startX + nameColW, y + subRowH + vc(subRowH, typeFont), { width: typeColW, align: "center" });

    let cx = startX + nameColW + typeColW;
    let totalDays = 0;
    let totalOvertime = 0;

    for (let di = 0; di < days.length; di++) {
      const day = days[di];
      const dateStr = format(day, "yyyy-MM-dd");
      const key = `${row.keyPrefix}-${dateStr}`;
      const rec = attendanceMap[key];
      const dayOfWeek = getDay(day);
      const isSun = dayOfWeek === 0;
      const isSat = dayOfWeek === 6;
      const isWeekend = isSun || isSat;

      // 背景（上下セルとも）
      doc.save();
      if (isSun) {
        doc.rect(cx, y, dayColW, pairH).fill("#FEF2F2");
      } else if (isSat) {
        doc.rect(cx, y, dayColW, pairH).fill("#EFF6FF");
      }
      doc.restore();
      doc.rect(cx, y, dayColW, subRowH).stroke("#D1D5DB");
      doc.rect(cx, y + subRowH, dayColW, subRowH).stroke("#D1D5DB");

      const worked = rec && isWorkedType(rec.workType) && rec.hoursWorked > 0;
      if (worked) {
        totalDays++;
        dailyWorkedCount[di]++;
        const mark = WORK_TYPE_MARKS[rec.workType] || "○";
        const nightMark = rec.shiftType === "night" ? "夜" : "";
        let markColor = "#059669";
        if (rec.workType === "half_day") markColor = "#D97706";
        else if (rec.workType === "holiday") markColor = "#7C3AED";
        // 2文字以上（○夜・休出など）はセル幅に収まるようフォントを縮小し、折り返しでの行またぎを防ぐ。
        const markText = `${mark}${nightMark}`;
        const mf = markText.length > 1 ? Math.max(7, Math.round(markFont * 0.58)) : markFont;
        doc.fillColor(markColor).font("Bold").fontSize(mf).text(
          markText, cx, y + vc(subRowH, mf), { width: dayColW, align: "center", lineBreak: false }
        );
        if (rec.overtimeHours > 0) {
          totalOvertime += rec.overtimeHours;
          dailyOvertime[di] += rec.overtimeHours;
          doc.fillColor("#2563EB").font("Regular").fontSize(otNumFont).text(
            String(rec.overtimeHours / 10), cx, y + subRowH + vc(subRowH, otNumFont), { width: dayColW, align: "center" }
          );
        }
      } else if (fillAbsent && !isWeekend) {
        // 月締め確定後: 平日の未記入・休・欠勤は「✖」で統一（見本準拠）
        doc.fillColor("#DC2626").font("Bold").fontSize(markFont).text(
          "×", cx, y + vc(subRowH, markFont), { width: dayColW, align: "center" }
        );
      } else if (rec && cellHasValue(rec.hoursWorked, rec.workType)) {
        // 通常時は 休/欠勤 の記号を残す
        const mark = WORK_TYPE_MARKS[rec.workType] || "休";
        const markColor = rec.workType === "absence" ? "#DC2626" : "#6B7280";
        doc.fillColor(markColor).font("Bold").fontSize(markFont).text(
          mark, cx, y + vc(subRowH, markFont), { width: dayColW, align: "center" }
        );
      }
      cx += dayColW;
    }

    // 合計列（上: 日数、下: 残業h）
    doc.rect(cx, y, summaryColW, subRowH).stroke("#D1D5DB");
    doc.rect(cx, y + subRowH, summaryColW, subRowH).stroke("#D1D5DB");
    doc.fillColor("#111827").font("Bold").fontSize(sumFont).text(
      totalDays > 0 ? String(totalDays) : "0", cx, y + vc(subRowH, sumFont), { width: summaryColW, align: "center" }
    );
    doc.fillColor(totalOvertime > 0 ? "#2563EB" : "#9CA3AF").font("Regular").fontSize(sumFont).text(
      String(totalOvertime / 10), cx, y + subRowH + vc(subRowH, sumFont), { width: summaryColW, align: "center" }
    );

    y += pairH;
  }

  // ── 日別合計（見本の最下部「合計」2行: 出勤人数 / 残業h） ──
  {
    const pairH = subRowH * 2;
    if (y + pairH > pageH - bottomReserve) {
      doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
      drawWatermark();
      y = drawTableHeader(30);
    }
    doc.save();
    doc.rect(startX, y, nameColW, pairH).fill("#F3F4F6");
    doc.restore();
    doc.rect(startX, y, nameColW, pairH).stroke("#D1D5DB");
    doc.fillColor("#111827").font("Bold").fontSize(baseNameFont).text("合計", startX + 4, y + vc(pairH, baseNameFont), { width: nameColW - 8, lineBreak: false });

    doc.save();
    doc.rect(startX + nameColW, y, typeColW, subRowH).fill("#F3F4F6");
    doc.rect(startX + nameColW, y + subRowH, typeColW, subRowH).fill("#F3F4F6");
    doc.restore();
    doc.rect(startX + nameColW, y, typeColW, subRowH).stroke("#D1D5DB");
    doc.rect(startX + nameColW, y + subRowH, typeColW, subRowH).stroke("#D1D5DB");
    const typeFont = Math.max(6.5, Math.min(8.5, subRowH * 0.42));
    doc.fillColor("#6B7280").font("Regular").fontSize(typeFont);
    doc.text("出勤", startX + nameColW, y + vc(subRowH, typeFont), { width: typeColW, align: "center" });
    doc.text("残業", startX + nameColW, y + subRowH + vc(subRowH, typeFont), { width: typeColW, align: "center" });

    let cx = startX + nameColW + typeColW;
    let grandDays = 0;
    let grandOt = 0;
    for (let di = 0; di < days.length; di++) {
      doc.rect(cx, y, dayColW, subRowH).stroke("#D1D5DB");
      doc.rect(cx, y + subRowH, dayColW, subRowH).stroke("#D1D5DB");
      grandDays += dailyWorkedCount[di];
      grandOt += dailyOvertime[di];
      doc.fillColor("#111827").font("Bold").fontSize(otNumFont).text(
        String(dailyWorkedCount[di]), cx, y + vc(subRowH, otNumFont), { width: dayColW, align: "center" }
      );
      doc.fillColor(dailyOvertime[di] > 0 ? "#2563EB" : "#9CA3AF").font("Regular").fontSize(otNumFont).text(
        String(dailyOvertime[di] / 10), cx, y + subRowH + vc(subRowH, otNumFont), { width: dayColW, align: "center" }
      );
      cx += dayColW;
    }
    // 総合計（右端）
    doc.rect(cx, y, summaryColW, subRowH).stroke("#D1D5DB");
    doc.rect(cx, y + subRowH, summaryColW, subRowH).stroke("#D1D5DB");
    doc.fillColor("#111827").font("Bold").fontSize(sumFont).text(String(grandDays), cx, y + vc(subRowH, sumFont), { width: summaryColW, align: "center" });
    doc.fillColor(grandOt > 0 ? "#2563EB" : "#9CA3AF").font("Bold").fontSize(sumFont).text(String(grandOt / 10), cx, y + subRowH + vc(subRowH, sumFont), { width: summaryColW, align: "center" });

    y += pairH;
  }

  // --- Legend ---
  y += 10;
  if (y + 30 > pageH - 30) {
    doc.addPage({ size: "A4", layout: "landscape", margins: { top: 30, bottom: 30, left: 30, right: 30 } });
    drawWatermark();
    y = 30;
  }

  doc.fillColor("#6B7280").font("Regular").fontSize(9);
  doc.text(
    fillAbsent
      ? "凡例:  ○ = 出勤    △ = 半日/早退    休出 = 休日出勤    夜 = 夜勤    × = 出勤なし(平日)    残業行 = 残業時間(h)"
      : "凡例:  ○ = 出勤    △ = 半日/早退    X = 欠勤    休出 = 休日出勤    休 = 休日    夜 = 夜勤    残業行 = 残業時間(h)",
    startX, y, { width: pageW }
  );

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
