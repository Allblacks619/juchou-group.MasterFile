/**
 * Invoice PDF Generator (請求書PDF)
 * Generates A4 portrait PDF with Japanese text support using PDFKit.
 * Layout modeled after freee invoice format:
 * - Client info top-left, dates/numbers top-right
 * - Company info + logo/seal center-right
 * - Subject line, summary box (subtotal/tax/total), bank info
 * - Items table with description, quantity, unit price, amount
 * - Tax breakdown by rate group at bottom
 * - Notes section
 * - Watermark
 */
import PDFDocument from "pdfkit";
import { Invoice, InvoiceItem, CompanyProfile } from "../drizzle/schema";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";

const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Regular_53121a47.ttf";
const FONT_BOLD_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Regular_53121a47.ttf";

let fontPath: string | null = null;
let fontBoldPath: string | null = null;

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

async function downloadImage(url: string): Promise<string | null> {
  try {
    const tmpDir = os.tmpdir();
    const ext = url.includes(".png") ? ".png" : url.includes(".svg") ? ".png" : ".jpg";
    const hash = Buffer.from(url).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
    const dest = path.join(tmpDir, `img_${hash}${ext}`);
    if (fs.existsSync(dest)) return dest;
    await downloadFile(url, dest);
    return dest;
  } catch {
    return null;
  }
}

async function ensureFont(): Promise<string> {
  if (fontPath && fs.existsSync(fontPath)) return fontPath;
  const tmpDir = os.tmpdir();
  const dest = path.join(tmpDir, "NotoSansJP-Regular.ttf");
  fontPath = await downloadFile(FONT_URL, dest);
  return fontPath;
}

async function ensureBoldFont(): Promise<string> {
  if (fontBoldPath && fs.existsSync(fontBoldPath)) return fontBoldPath;
  const tmpDir = os.tmpdir();
  const dest = path.join(tmpDir, "NotoSansJP-Bold.ttf");
  try {
    fontBoldPath = await downloadFile(FONT_BOLD_URL, dest);
    return fontBoldPath;
  } catch {
    // Fallback to regular font
    return await ensureFont();
  }
}

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toJaDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatYen(amount: number): string {
  return `${amount.toLocaleString("ja-JP")}`;
}

interface InvoicePdfData {
  invoice: Invoice;
  items: InvoiceItem[];
  company?: CompanyProfile | null;
  clientName?: string;
  clientAddress?: string;
  clientPostalCode?: string;
  clientDepartment?: string;
  clientContactPerson?: string;
  showSeal?: boolean;
  showLogo?: boolean;
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const font = await ensureFont();
  const boldFont = await ensureBoldFont();
  const { invoice, items, company, clientName, clientAddress, clientPostalCode, clientDepartment, clientContactPerson } = data;
  const showSeal = data.showSeal !== false;
  const showLogo = data.showLogo !== false;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 35, bottom: 35, left: 40, right: 40 },
    info: {
      Title: `請求書 ${invoice.invoiceNumber}`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.registerFont("JP", font);
  doc.registerFont("JP-Bold", boldFont);
  doc.font("JP");

  const pageW = 595.28;
  const mL = 40;
  const mR = 40;
  const contentW = pageW - mL - mR;

  // ── Watermark ── uploaded image (company.watermarkUrl) if set, else the company-name text.
  doc.save();
  let watermarkDrawn = false;
  if (company?.watermarkUrl) {
    try {
      const wmPath = await downloadImage(company.watermarkUrl);
      if (wmPath) {
        doc.opacity(0.05);
        const wmSize = 300;
        doc.image(wmPath, (pageW - wmSize) / 2, 421 - wmSize / 2, { width: wmSize, height: wmSize, fit: [wmSize, wmSize] });
        watermarkDrawn = true;
      }
    } catch { /* fall back to text watermark below */ }
  }
  if (!watermarkDrawn) {
    doc.opacity(0.03);
    doc.fontSize(80).fillColor("#c8a96e");
    doc.translate(pageW / 2, 421);
    doc.rotate(-35, { origin: [0, 0] });
    doc.text("充寵グループ", -200, -30, { width: 400, align: "center" });
  }
  doc.restore();

  let y = 35;

  // ── Title ──
  doc.font("JP-Bold").fontSize(18).fillColor("#333").text("請求書", mL, y, { align: "center", width: contentW });
  y += 35;

  // ── Left: Client info ──
  const clientStartY = y;
  doc.font("JP-Bold").fontSize(12).fillColor("#333");
  const honorific = invoice.honorific || "御中";
  doc.text(`${clientName || "取引先"} ${honorific}`, mL, y);
  y += 20;

  if (clientPostalCode) {
    doc.font("JP").fontSize(8).fillColor("#555");
    doc.text(`〒${clientPostalCode}`, mL, y);
    y += 12;
  }
  if (clientAddress) {
    doc.font("JP").fontSize(8).fillColor("#555");
    doc.text(clientAddress, mL, y, { width: 220 });
    y += 12;
  }
  if (clientDepartment) {
    doc.font("JP").fontSize(8).fillColor("#555");
    doc.text(clientDepartment, mL, y);
    y += 12;
  }
  if (clientContactPerson) {
    doc.font("JP").fontSize(8).fillColor("#555");
    doc.text(`${clientContactPerson} 様`, mL, y);
    y += 12;
  }

  // ── Right: Invoice meta ──
  const metaX = pageW - mR - 200;
  let metaY = clientStartY;
  doc.font("JP").fontSize(8).fillColor("#555");

  const metaRows: [string, string][] = [
    ["請求日", toJaDateStr(invoice.issueDate)],
    ["請求書番号", invoice.invoiceNumber],
  ];
  if (company?.invoiceIssuerNumber) {
    metaRows.push(["登録番号", company.invoiceIssuerNumber]);
  }

  for (const [label, value] of metaRows) {
    doc.text(label, metaX, metaY, { width: 70 });
    doc.text(value, metaX + 70, metaY, { width: 130, align: "right" });
    metaY += 14;
  }

  // ── Right: Company info block ──
  metaY += 10;

  // Company logo (if enabled and available)
  if (showLogo && company?.logoUrl) {
    try {
      const logoPath = await downloadImage(company.logoUrl);
      if (logoPath) {
        doc.image(logoPath, metaX + 140, metaY - 5, { width: 50, height: 50, fit: [50, 50] });
      }
    } catch { /* ignore logo errors */ }
  }

  // Company name
  if (company?.companyName) {
    doc.font("JP-Bold").fontSize(10).fillColor("#333");
    doc.text(company.companyName, metaX, metaY, { width: showLogo && company?.logoUrl ? 130 : 200, align: "right" });
    metaY += 16;
  }

  doc.font("JP").fontSize(7).fillColor("#555");
  // Owner name from env
  const ownerName = process.env.OWNER_NAME;
  if (ownerName) {
    doc.text(ownerName, metaX, metaY, { width: 200, align: "right" });
    metaY += 11;
  }
  if (company?.postalCode) {
    doc.text(`〒${company.postalCode}`, metaX, metaY, { width: 200, align: "right" });
    metaY += 11;
  }
  if (company?.address) {
    doc.text(company.address, metaX, metaY, { width: 200, align: "right" });
    metaY += 11;
  }

  // Company seal (if enabled and available)
  if (showSeal && company?.sealUrl) {
    try {
      const sealPath = await downloadImage(company.sealUrl);
      if (sealPath) {
        // Draw seal overlapping the company info area (semi-transparent effect)
        doc.save();
        doc.opacity(0.85);
        doc.image(sealPath, metaX + 155, metaY - 35, { width: 40, height: 40, fit: [40, 40] });
        doc.restore();
      }
    } catch { /* ignore seal errors */ }
  }

  y = Math.max(y + 10, metaY + 10);

  // ── "下記の通りご請求申し上げます。" ──
  doc.font("JP").fontSize(8).fillColor("#333");
  doc.text("下記の通りご請求申し上げます。", mL, y);
  y += 16;

  // ── Subject (件名) ──
  const subjectText = (invoice as any).subject;
  if (subjectText) {
    doc.font("JP-Bold").fontSize(9).fillColor("#333");
    doc.text(`件名　${subjectText}`, mL, y);
    y += 16;
  }

  // ── Summary box: subtotal / tax / total ──
  const hasWithholding = invoice.withholding && invoice.withholdingAmount > 0;
  const summaryBoxW = hasWithholding ? 370 : 280;
  const summaryBoxH = 36;
  doc.rect(mL, y, summaryBoxW, summaryBoxH).lineWidth(0.5).strokeColor("#999").stroke();
  // Inner columns
  const numCols = hasWithholding ? 4 : 3;
  const col1W = hasWithholding ? 80 : 90;
  const col2W = hasWithholding ? 80 : 90;
  const colWHW = hasWithholding ? 90 : 0;
  const col3W = hasWithholding ? 120 : 100;
  doc.moveTo(mL + col1W, y).lineTo(mL + col1W, y + summaryBoxH).stroke();
  doc.moveTo(mL + col1W + col2W, y).lineTo(mL + col1W + col2W, y + summaryBoxH).stroke();
  if (hasWithholding) {
    doc.moveTo(mL + col1W + col2W + colWHW, y).lineTo(mL + col1W + col2W + colWHW, y + summaryBoxH).stroke();
  }
  // Header row
  doc.rect(mL, y, summaryBoxW, 14).fillAndStroke("#f0ebe0", "#999");
  doc.font("JP").fontSize(7).fillColor("#333");
  doc.text("小計", mL + 4, y + 3, { width: col1W - 8, align: "center" });
  doc.text("消費税", mL + col1W + 4, y + 3, { width: col2W - 8, align: "center" });
  if (hasWithholding) {
    doc.text("源泉徴収", mL + col1W + col2W + 4, y + 3, { width: colWHW - 8, align: "center" });
  }
  doc.text("請求金額", mL + col1W + col2W + colWHW + 4, y + 3, { width: col3W - 8, align: "center" });
  // Value row
  doc.font("JP").fontSize(8).fillColor("#333");
  doc.text(`${formatYen(invoice.subtotal)}円`, mL + 4, y + 18, { width: col1W - 8, align: "center" });
  doc.text(`${formatYen(invoice.taxAmount)}円`, mL + col1W + 4, y + 18, { width: col2W - 8, align: "center" });
  if (hasWithholding) {
    doc.fillColor("#c00");
    doc.text(`-${formatYen(invoice.withholdingAmount)}円`, mL + col1W + col2W + 4, y + 18, { width: colWHW - 8, align: "center" });
    doc.fillColor("#333");
  }
  doc.font("JP-Bold").fontSize(11).fillColor("#333");
  doc.text(`${formatYen(invoice.totalAmount)}円`, mL + col1W + col2W + colWHW + 4, y + 16, { width: col3W - 8, align: "center" });
  y += summaryBoxH + 10;

  // ── Payment info box ──
  if (invoice.dueDate || company?.bankName) {
    const payBoxW = 280;
    const payBoxH = company?.bankName ? 44 : 22;
    doc.rect(mL, y, payBoxW, payBoxH).lineWidth(0.5).strokeColor("#999").stroke();

    // Due date row
    const dueDateColW = 80;
    doc.rect(mL, y, dueDateColW, 22).fillAndStroke("#f0ebe0", "#999");
    doc.font("JP").fontSize(7).fillColor("#333");
    doc.text("入金期日", mL + 4, y + 6, { width: dueDateColW - 8, align: "center" });
    doc.moveTo(mL + dueDateColW, y).lineTo(mL + dueDateColW, y + 22).stroke();

    if (company?.bankName) {
      doc.rect(mL + dueDateColW, y, payBoxW - dueDateColW, 22).fillAndStroke("#f0ebe0", "#999");
      doc.text("振込先", mL + dueDateColW + 4, y + 6, { width: payBoxW - dueDateColW - 8, align: "center" });
    }

    doc.font("JP").fontSize(8).fillColor("#333");
    doc.text(invoice.dueDate ? toJaDateStr(invoice.dueDate) : "-", mL + 4, y + 28, { width: dueDateColW - 8, align: "center" });

    if (company?.bankName) {
      doc.moveTo(mL + dueDateColW, y + 22).lineTo(mL + dueDateColW, y + payBoxH).stroke();
      doc.font("JP").fontSize(7).fillColor("#333");
      const accType = company.accountType === "ordinary" ? "普通" : company.accountType === "checking" ? "当座" : "";
      const bankInfo = `${company.bankName} ${company.branchName || ""}\n${accType}口座 ${company.accountNumber || ""}\n口座名義 ${company.accountHolder || ""}`;
      doc.text(bankInfo, mL + dueDateColW + 6, y + 24, { width: payBoxW - dueDateColW - 12, lineGap: 1 });
    }

    y += payBoxH + 12;
  }

  // ── Items table ──
  const amountColW = 75;
  const qtyColW = 55;
  const priceColW = 60;
  const descColW = contentW - qtyColW - priceColW - amountColW;

  const colDefs = [
    { w: descColW, label: "品目・摘要", align: "left" as const },
    { w: qtyColW, label: "数量", align: "right" as const },
    { w: priceColW, label: "単価", align: "right" as const },
    { w: amountColW, label: "明細金額", align: "right" as const },
  ];

  // Header
  let x = mL;
  for (const col of colDefs) {
    doc.rect(x, y, col.w, 18).fillAndStroke("#e8e0d0", "#999");
    doc.font("JP").fillColor("#333").fontSize(7).text(col.label, x + 3, y + 4, { width: col.w - 6, align: "center" });
    x += col.w;
  }
  y += 18;

  // Rows
  const normalItems = items.filter((i) => i.itemType !== "text");
  const rowH = 18;
  const maxRows = 12; // Fixed number of rows like freee
  const totalRows = Math.max(normalItems.length, maxRows);

  let itemIdx = 0;
  for (let rowNum = 0; rowNum < totalRows; rowNum++) {
    if (y > 720) {
      doc.addPage();
      y = 40;
      // Re-draw watermark on new page
      doc.save();
      doc.opacity(0.03);
      doc.fontSize(80).fillColor("#c8a96e");
      doc.translate(pageW / 2, 421);
      doc.rotate(-35, { origin: [0, 0] });
      doc.text("充寵グループ", -200, -30, { width: 400, align: "center" });
      doc.restore();
    }

    const item = itemIdx < items.length ? items[itemIdx] : null;
    const isText = item?.itemType === "text";

    if (isText && item) {
      // Text row - spans full width
      doc.rect(mL, y, contentW, rowH).fillAndStroke("#f9f9f5", "#ddd");
      doc.font("JP").fillColor("#666").fontSize(6.5);
      doc.text(item.description || "", mL + 3, y + 4, { width: contentW - 10 });
      y += rowH;
      itemIdx++;
      continue;
    }

    const bgColor = rowNum % 2 === 0 ? "#ffffff" : "#fafaf5";

    if (item && item.itemType === "normal") {
      const quantityStr = item.unit === "日"
        ? `${(item.quantity / 10).toFixed(1)} ${item.unit}`
        : `${item.quantity} ${item.unit || "式"}`;

      // Mark reduced tax rate items with ※
      const descText = item.description + (item.itemTaxRate === 8 ? " ※" : "");

      const values: string[] = [];
      values.push(descText);
      values.push(quantityStr);
      values.push(formatYen(item.unitPrice));
      values.push(formatYen(item.amount));

      x = mL;
      for (let j = 0; j < colDefs.length; j++) {
        doc.rect(x, y, colDefs[j].w, rowH).fillAndStroke(bgColor, "#ddd");
        const align = colDefs[j].align;
        doc.font("JP").fillColor("#333").fontSize(7).text(values[j] || "", x + 3, y + 4, { width: colDefs[j].w - 6, align });
        x += colDefs[j].w;
      }
      itemIdx++;
    } else {
      // Empty row
      x = mL;
      for (const col of colDefs) {
        doc.rect(x, y, col.w, rowH).fillAndStroke(bgColor, "#ddd");
        x += col.w;
      }
    }

    y += rowH;
  }

  // Handle remaining text items after the table
  while (itemIdx < items.length) {
    const item = items[itemIdx];
    if (item.itemType === "text") {
      doc.rect(mL, y, contentW, rowH).fillAndStroke("#f9f9f5", "#ddd");
      doc.font("JP").fillColor("#666").fontSize(6.5);
      doc.text(item.description || "", mL + 3, y + 4, { width: contentW - 10 });
      y += rowH;
    }
    itemIdx++;
  }

  y += 8;

  // ── Reduced tax rate note ──
  if (items.some((i) => i.itemTaxRate === 8 && i.itemType === "normal")) {
    doc.font("JP").fontSize(6.5).fillColor("#666");
    doc.text("※印は軽減税率対象です。", mL, y);
    y += 12;
  }

  // ── Tax breakdown (right-aligned) ──
  const breakdownX = mL + contentW - 220;
  const breakdownW = 220;

  // Group tax by rate
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    const rate = item.itemTaxRate || 10;
    const existing = taxByRate.get(rate) || 0;
    taxByRate.set(rate, existing + item.amount);
  }

  // Draw breakdown box
  const breakdownEntries = Array.from(taxByRate.entries()).sort((a, b) => b[0] - a[0]).filter(([r]) => r > 0);
  if (breakdownEntries.length > 0) {
    const bdBoxH = 14 + breakdownEntries.length * 28;
    doc.rect(breakdownX, y, breakdownW, bdBoxH).lineWidth(0.5).strokeColor("#999").stroke();

    // Header
    doc.rect(breakdownX, y, breakdownW, 14).fillAndStroke("#f0ebe0", "#999");
    doc.font("JP").fontSize(7).fillColor("#333");
    doc.text("内訳", breakdownX + 4, y + 3);

    let bdY = y + 14;
    for (const [rate, base] of breakdownEntries) {
      const taxAmt = Math.round((base * rate) / 100);
      const rateLabel = rate === 8 ? `軽減税率${rate}%対象(税抜)` : `${rate}%対象(税抜)`;
      const taxLabel = rate === 8 ? `軽減税率${rate}%消費税` : `${rate}%消費税`;

      doc.font("JP").fontSize(7).fillColor("#333");
      doc.text(rateLabel, breakdownX + 8, bdY + 3, { width: 130 });
      doc.text(`${formatYen(base)}円`, breakdownX + 138, bdY + 3, { width: 76, align: "right" });
      bdY += 14;
      doc.font("JP").fontSize(6.5).fillColor("#666");
      doc.text(taxLabel, breakdownX + 16, bdY + 2, { width: 122 });
      doc.text(`${formatYen(taxAmt)}円`, breakdownX + 138, bdY + 2, { width: 76, align: "right" });
      bdY += 14;
    }

    y += bdBoxH + 8;
  }

  // ── Notes box ──
  if (invoice.notes) {
    if (y > 720) {
      doc.addPage();
      y = 40;
    }
    const notesBoxH = 50;
    doc.rect(mL, y, contentW, notesBoxH).lineWidth(0.5).strokeColor("#999").stroke();
    doc.font("JP").fontSize(7).fillColor("#666");
    doc.text("備考", mL + 6, y + 4);
    doc.font("JP").fontSize(7).fillColor("#333");
    doc.text(invoice.notes, mL + 6, y + 16, { width: contentW - 12, lineGap: 2 });
    y += notesBoxH + 8;
  }

  // ── Page number ──
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.font("JP").fontSize(7).fillColor("#999");
    doc.text(`${i + 1} / ${totalPages}`, mL, 842 - 30, { width: contentW, align: "center" });
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}
