/**
 * Worker Invoice PDF Generator (作業員請求書PDF)
 * Generates A4 portrait PDF with Japanese text support using PDFKit.
 * Uses snapshot data only — never generates from draft.
 * 
 * Invoice party rules:
 * - Worker invoices: recipient (宛先) is always 充寵グループ / JYUCHOU GROUP
 * - Worker is the issuer
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";

const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Regular_53121a47.ttf";

let fontPath: string | null = null;

async function downloadFile(url: string, dest: string): Promise<string> {
  if (fs.existsSync(dest)) return dest;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith("https") ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        if (!loc) return reject(new Error("Redirect without location"));
        const get2 = loc.startsWith("https") ? https.get : http.get;
        get2(loc, (res2) => {
          res2.pipe(file);
          file.on("finish", () => { file.close(); resolve(dest); });
        }).on("error", reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(dest); });
    }).on("error", reject);
  });
}

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    return new Promise((resolve, reject) => {
      const get = url.startsWith("https") ? https.get : http.get;
      get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (!loc) return resolve(null);
          const get2 = loc.startsWith("https") ? https.get : http.get;
          get2(loc, (res2) => {
            const chunks: Buffer[] = [];
            res2.on("data", (c: Buffer) => chunks.push(c));
            res2.on("end", () => resolve(Buffer.concat(chunks)));
          }).on("error", () => resolve(null));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }).on("error", () => resolve(null));
    });
  } catch { return null; }
}

async function ensureFont(): Promise<string> {
  if (fontPath && fs.existsSync(fontPath)) return fontPath;
  const tmpDir = os.tmpdir();
  const dest = path.join(tmpDir, "NotoSansJP-Regular-Worker.ttf");
  fontPath = await downloadFile(FONT_URL, dest);
  return fontPath;
}

function formatYen(amount: number): string {
  return `¥${Number(amount || 0).toLocaleString("ja-JP")}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

interface ImageSettings {
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  width?: number;
  height?: number;
}

interface PdfInput {
  invoice: any;
  items: any[];
  employee: any;
  project: any;
  company: any;
  snapshotData: any;
}

const RECIPIENT_NAME = "充寵グループ";
const RECIPIENT_SUFFIX = "御中";

export function buildWorkerInvoicePdfRenderPayload(model: any) {
  return {
    renderVersion: 1,
    format: 'worker-invoice-v1',
    previewOnly: true,
    printablePdfAvailable: true,
    message: 'UI preview metadata. Use workerInvoice.downloadMyInvoicePdf for the printable PDF.',
    model,
  };
}

export async function generateWorkerInvoicePdf(input: PdfInput): Promise<Buffer> {
  const { invoice, items, employee, project, company, snapshotData } = input;
  const font = await ensureFont();

  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  doc.registerFont("JP", font);
  doc.font("JP");

  const pageWidth = doc.page.width - 80; // 40 margin each side
  const leftX = 40;
  const rightX = doc.page.width - 40;
  let y = 40;

  // ── Logo (top-left or configured position) ──
  const logoSettings: ImageSettings = (company?.logoSettings as ImageSettings) || {};
  if (company?.logoUrl) {
    try {
      const logoBuffer = await downloadImage(company.logoUrl);
      if (logoBuffer) {
        const logoX = logoSettings.x ?? leftX;
        const logoY = logoSettings.y ?? y;
        const logoW = (logoSettings.width ?? 80) * (logoSettings.scale ?? 1);
        const logoH = (logoSettings.height ?? 40) * (logoSettings.scale ?? 1);
        const logoOpacity = logoSettings.opacity ?? 1;
        doc.save();
        doc.opacity(logoOpacity);
        doc.image(logoBuffer, logoX, logoY, { width: logoW, height: logoH, fit: [logoW, logoH] });
        doc.restore();
      }
    } catch { /* skip logo on error */ }
  }

  // ── Title ──
  doc.fontSize(18).text("請求書", leftX, y, { align: "center", width: pageWidth });
  y += 35;

  // ── Invoice number & date ──
  doc.fontSize(9);
  if (invoice.invoiceNumber) {
    doc.text(`請求書番号: ${invoice.invoiceNumber}`, leftX, y);
  }
  doc.text(`発行日: ${formatDate(invoice.issueDate || invoice.submittedAt)}`, rightX - 200, y, { width: 200, align: "right" });
  y += 20;

  // ── Recipient (always JYUCHOU GROUP for worker invoices) ──
  doc.fontSize(12).text(RECIPIENT_NAME, leftX, y);
  y += 18;
  doc.fontSize(9).text(RECIPIENT_SUFFIX, leftX, y);
  y += 6;
  if (company?.address) {
    doc.fontSize(8).text(company.address, leftX, y + 6);
    y += 12;
  }
  y += 15;

  // ── Separator ──
  doc.moveTo(leftX, y).lineTo(rightX, y).stroke();
  y += 15;

  // ── Worker info (issuer, right side) ──
  const workerName = employee?.nameKanji || "作業員";
  doc.fontSize(10).text(workerName, rightX - 250, y, { width: 250, align: "right" });
  y += 14;
  if (employee?.address) {
    doc.fontSize(8).text(employee.address, rightX - 250, y, { width: 250, align: "right" });
    y += 12;
  }
  if (employee?.phone) {
    doc.fontSize(8).text(`TEL: ${employee.phone}`, rightX - 250, y, { width: 250, align: "right" });
    y += 12;
  }
  if (employee?.invoiceIssuerNumber) {
    doc.fontSize(8).text(`登録番号: ${employee.invoiceIssuerNumber}`, rightX - 250, y, { width: 250, align: "right" });
    y += 12;
  }
  y += 10;

  // ── Seal/Stamp (near worker info) ──
  const sealSettings: ImageSettings = (company?.sealSettings as ImageSettings) || {};
  if (company?.sealUrl) {
    try {
      const sealBuffer = await downloadImage(company.sealUrl);
      if (sealBuffer) {
        const sealX = sealSettings.x ?? (rightX - 80);
        const sealY = sealSettings.y ?? (y - 50);
        const sealW = (sealSettings.width ?? 60) * (sealSettings.scale ?? 1);
        const sealH = (sealSettings.height ?? 60) * (sealSettings.scale ?? 1);
        const sealOpacity = sealSettings.opacity ?? 0.8;
        doc.save();
        doc.opacity(sealOpacity);
        doc.image(sealBuffer, sealX, sealY, { width: sealW, height: sealH, fit: [sealW, sealH] });
        doc.restore();
      }
    } catch { /* skip seal on error */ }
  }

  // ── Subject ──
  doc.fontSize(10).text(`件名: ${invoice.subject || `${invoice.closingMonth} 作業請求`}`, leftX, y);
  y += 14;
  doc.fontSize(9).text(`対象現場: ${project?.name || ""}`, leftX, y);
  y += 12;
  doc.fontSize(9).text(`対象月: ${invoice.closingMonth}`, leftX, y);
  y += 20;

  // ── Summary box ──
  const boxY = y;
  doc.rect(leftX, boxY, pageWidth, 50).stroke();
  doc.fontSize(10).text("小計", leftX + 10, boxY + 8);
  doc.text(formatYen(invoice.subtotalAmount), leftX + 100, boxY + 8);
  doc.text("消費税", leftX + 250, boxY + 8);
  doc.text(formatYen(invoice.taxAmount), leftX + 340, boxY + 8);
  doc.fontSize(12).text("合計金額", leftX + 10, boxY + 28);
  doc.text(formatYen(invoice.totalAmount), leftX + 100, boxY + 28);
  y = boxY + 60;

  // ── Items table ──
  if (items.length > 0) {
    doc.fontSize(9);
    const colWidths = [30, 170, 40, 30, 70, 70, 50];
    const headers = ["分類", "摘要", "数量", "単位", "単価", "金額", "税率"];
    let tableX = leftX;

    // Header row
    doc.rect(leftX, y, pageWidth, 18).fill("#f0f0f0").stroke("#ccc");
    doc.fillColor("#000");
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], tableX + 3, y + 4, { width: colWidths[i] - 6, align: i <= 1 ? "left" : "right" });
      tableX += colWidths[i];
    }
    y += 18;

    const categoryLabels: Record<string, string> = {
      labor: "労務", transport: "交通", expense: "経費", materials: "材料", misc: "他"
    };

    // Data rows
    for (const item of items) {
      if (y > 720) {
        doc.addPage();
        y = 40;
      }
      tableX = leftX;
      doc.rect(leftX, y, pageWidth, 16).stroke("#eee");
      if (item.itemType === "text") {
        doc.text(item.label || "", tableX + 3, y + 3, { width: pageWidth - 6 });
      } else {
        doc.text(categoryLabels[item.category] || "", tableX + 3, y + 3, { width: colWidths[0] - 6 });
        tableX += colWidths[0];
        doc.text(item.label || "", tableX + 3, y + 3, { width: colWidths[1] - 6 });
        tableX += colWidths[1];
        doc.text(String(item.quantity || 1), tableX + 3, y + 3, { width: colWidths[2] - 6, align: "right" });
        tableX += colWidths[2];
        doc.text(item.unit || "式", tableX + 3, y + 3, { width: colWidths[3] - 6, align: "right" });
        tableX += colWidths[3];
        doc.text(formatYen(item.unitPrice || 0), tableX + 3, y + 3, { width: colWidths[4] - 6, align: "right" });
        tableX += colWidths[4];
        doc.text(formatYen(item.amount || 0), tableX + 3, y + 3, { width: colWidths[5] - 6, align: "right" });
        tableX += colWidths[5];
        doc.text(`${item.taxRate || 10}%`, tableX + 3, y + 3, { width: colWidths[6] - 6, align: "right" });
      }
      y += 16;
    }
    y += 10;
  }

  // ── Bank info ──
  if (employee?.bankName) {
    if (y > 680) { doc.addPage(); y = 40; }
    doc.fontSize(9).text("振込先", leftX, y, { underline: true });
    y += 14;
    doc.text(`${employee.bankName} ${employee.branchName || ""}`, leftX, y);
    y += 12;
    doc.text(`${employee.accountType === "checking" ? "当座" : "普通"} ${employee.accountNumber || ""}`, leftX, y);
    y += 12;
    doc.text(`口座名義: ${employee.accountHolder || workerName}`, leftX, y);
    y += 18;
  }

  // ── Notes ──
  if (invoice.notes) {
    if (y > 700) { doc.addPage(); y = 40; }
    doc.fontSize(9).text("備考:", leftX, y);
    y += 12;
    doc.fontSize(8).text(invoice.notes, leftX, y, { width: pageWidth });
    y += 20;
  }

  // ── Supporting documents list ──
  const docs = snapshotData?.docs || [];
  if (docs.length > 0) {
    if (y > 700) { doc.addPage(); y = 40; }
    doc.fontSize(9).text("添付資料:", leftX, y);
    y += 12;
    for (const d of docs) {
      doc.fontSize(8).text(`・${d.originalFileName || d.fileKey || "資料"}`, leftX + 10, y);
      y += 11;
    }
  }

  doc.end();
  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
