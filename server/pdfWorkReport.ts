/*
 * pdfWorkReport.ts — 個別作業日報PDF（A4縦・1ページ）
 *
 * オーナー指示書準拠のレイアウト:
 * - 上部: 充寵グループ / ○○○○年○月 / 氏名（ラベル文字なし）、作成日=対象月末日、受領社印
 * - 本文: 1日〜末日の縦型カレンダー表（日付/現場名/残業時間/交通費）。休み等の日は行を残し中身は空欄
 * - 夜勤: 現場名セルのみ薄紫ハイライト＋現場名末尾に[夜]。記号(○×休 等)は使わない
 * - 下部集計: 昼勤出勤日数/夜勤出勤日数/残業時間 のみ
 * - 交通費列は includeTransport=false で丸ごと省略できる
 */
import PDFDocument from "pdfkit";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import type { WorkReportData } from "./workReport";

const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Variable_0e3524c3.ttf";

async function downloadFont(url: string, filename: string): Promise<string> {
  const dest = path.join(os.tmpdir(), filename);
  if (fs.existsSync(dest)) return dest;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", reject);
  });
}

async function fetchImageBuffer(url?: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    return await new Promise((resolve) => {
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
const NIGHT_BG = "#EDE7F6"; // 薄紫（夜勤の現場名セルのみ）

export interface WorkReportPdfOptions {
  data: WorkReportData;
  companyName?: string;
  sealUrl?: string | null;
  includeTransport?: boolean; // 交通費列を載せるか（既定true）
}

export async function generateWorkReportPdf(options: WorkReportPdfOptions): Promise<Buffer> {
  const { data } = options;
  const includeTransport = options.includeTransport !== false;
  const fontPath = await downloadFont(FONT_URL, "NotoSansJP-Regular.ttf");
  const sealBuffer = await fetchImageBuffer(options.sealUrl);

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 36, left: 48, right: 48 },
    info: {
      Title: `作業日報 ${data.year}年${data.monthNum}月 ${data.name}`,
      Author: options.companyName || "充寵グループ",
    },
  });
  doc.registerFont("JP", fontPath);
  doc.font("JP");

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const pageW = 595.28;
  const pageH = 841.89;
  const mL = 48;
  const contentW = pageW - mL * 2;

  // ── ヘッダー（ラベル無し・3情報＋作成日＋受領社印） ──
  doc.fontSize(10).fillColor("#444").text(options.companyName || "充寵グループ", mL, 42);
  // 作成日 = 対象月の末日（ラベル無しで日付のみ）
  doc.fontSize(9).fillColor("#666").text(
    `${data.year}年${data.monthNum}月${data.daysInMonth}日`,
    mL, 42, { width: contentW - 64, align: "right" }
  );
  // 受領社印（右上・作成日の下）
  if (sealBuffer) {
    try {
      doc.save();
      doc.opacity(0.9);
      doc.image(sealBuffer, pageW - mL - 52, 54, { width: 52, height: 52, fit: [52, 52] });
      doc.restore();
      doc.fontSize(6.5).fillColor("#999").text("受領", pageW - mL - 52, 108, { width: 52, align: "center" });
    } catch { /* 社印は任意 */ }
  }

  doc.fontSize(9).fillColor("#888").text("作 業 日 報", mL, 58, { width: contentW, align: "center", characterSpacing: 2 });
  doc.fontSize(17).fillColor("#111").text(`${data.year}年${data.monthNum}月`, mL, 72, { width: contentW, align: "center" });
  doc.fontSize(14).fillColor("#111").text(data.name, mL, 96, { width: contentW, align: "center" });

  // ── テーブル ──
  const tableY = 126;
  const dateColW = 64;
  const otColW = 64;
  const transportColW = includeTransport ? 78 : 0;
  const siteColW = contentW - dateColW - otColW - transportColW;
  const headerH = 20;
  const summaryReserve = 86;
  const rowH = Math.min(20, Math.max(14.5, (pageH - tableY - headerH - summaryReserve - 40) / data.rows.length));

  const cols = [
    { label: "日付", w: dateColW, align: "center" as const },
    { label: "現場名", w: siteColW, align: "left" as const },
    { label: "残業時間(h)", w: otColW, align: "center" as const },
    ...(includeTransport ? [{ label: "交通費(円)", w: transportColW, align: "center" as const }] : []),
  ];

  // header row
  let x = mL;
  for (const col of cols) {
    doc.save();
    doc.rect(x, tableY, col.w, headerH).fill("#F1F3F5");
    doc.restore();
    doc.rect(x, tableY, col.w, headerH).lineWidth(0.7).stroke("#C6CBD1");
    doc.fillColor("#333").fontSize(8.5).text(col.label, x + 4, tableY + (headerH - 8.5) / 2 - 1, { width: col.w - 8, align: col.align, lineBreak: false });
    x += col.w;
  }

  let y = tableY + headerH;
  const cellFont = Math.min(9, Math.max(7.5, rowH * 0.52));
  for (const row of data.rows) {
    const isSun = row.weekday === 0;
    const isSat = row.weekday === 6;
    x = mL;

    // 日付（曜日付き。週末は文字色のみ控えめに変える）
    doc.rect(x, y, dateColW, rowH).lineWidth(0.5).stroke("#D5D9DE");
    doc.fillColor(isSun ? "#C0392B" : isSat ? "#2C5FA8" : "#222").fontSize(cellFont).text(
      `${row.day}日（${DAY_LABELS[row.weekday]}）`,
      x, y + (rowH - cellFont) / 2 - 1, { width: dateColW, align: "center", lineBreak: false }
    );
    x += dateColW;

    // 現場名（夜勤はこのセルだけ薄紫＋末尾[夜]）
    if (row.isNight) {
      doc.save();
      doc.rect(x, y, siteColW, rowH).fill(NIGHT_BG);
      doc.restore();
    }
    doc.rect(x, y, siteColW, rowH).lineWidth(0.5).stroke("#D5D9DE");
    if (row.projectNames.length > 0) {
      const label = row.projectNames.join(" / ") + (row.isNight ? "　[夜]" : "");
      doc.fillColor("#111").fontSize(cellFont).text(label, x + 6, y + (rowH - cellFont) / 2 - 1, { width: siteColW - 12, lineBreak: false, ellipsis: true });
    }
    x += siteColW;

    // 残業（あるときだけ数値）
    doc.rect(x, y, otColW, rowH).lineWidth(0.5).stroke("#D5D9DE");
    if (row.overtimeTimes10 > 0) {
      doc.fillColor("#111").fontSize(cellFont).text(String(row.overtimeTimes10 / 10), x, y + (rowH - cellFont) / 2 - 1, { width: otColW, align: "center", lineBreak: false });
    }
    x += otColW;

    // 交通費（あるときだけ金額）
    if (includeTransport) {
      doc.rect(x, y, transportColW, rowH).lineWidth(0.5).stroke("#D5D9DE");
      if (row.transport > 0) {
        doc.fillColor("#111").fontSize(cellFont).text(row.transport.toLocaleString("ja-JP"), x + 4, y + (rowH - cellFont) / 2 - 1, { width: transportColW - 10, align: "right", lineBreak: false });
      }
    }
    y += rowH;
  }

  // ── 集計（3項目のみ） ──
  y += 12;
  const sumRows: Array<[string, string]> = [
    ["昼勤出勤日数", `${data.summary.dayShiftDays}日`],
    ["夜勤出勤日数", `${data.summary.nightShiftDays}日`],
    ["残業時間", `${data.summary.overtimeHoursTimes10 / 10}時間`],
  ];
  const sumLabelW = 110;
  const sumValueW = 90;
  const sumH = 18;
  const sumX = mL;
  for (const [label, value] of sumRows) {
    doc.save();
    doc.rect(sumX, y, sumLabelW, sumH).fill("#F1F3F5");
    doc.restore();
    doc.rect(sumX, y, sumLabelW, sumH).lineWidth(0.6).stroke("#C6CBD1");
    doc.rect(sumX + sumLabelW, y, sumValueW, sumH).lineWidth(0.6).stroke("#C6CBD1");
    doc.fillColor("#333").fontSize(8.5).text(label, sumX + 6, y + 4.5, { lineBreak: false });
    doc.fillColor("#111").fontSize(9).text(value, sumX + sumLabelW, y + 4, { width: sumValueW - 8, align: "right", lineBreak: false });
    y += sumH;
  }

  doc.end();
  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
