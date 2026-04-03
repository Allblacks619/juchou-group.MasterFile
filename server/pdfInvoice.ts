/**
 * Invoice PDF Generator (請求書PDF)
 * Generates A4 portrait PDF with Japanese text support using PDFKit.
 * Supports per-item tax rates, text-only rows, and tax breakdown by rate group.
 */
import PDFDocument from "pdfkit";
import { Invoice, InvoiceItem, CompanyProfile } from "../drizzle/schema";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";

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
        if (!loc) return reject(new Error("Redirect without location"));
        const get2 = loc.startsWith("https") ? https.get : http.get;
        get2(loc, (res2) => {
          res2.pipe(file);
          file.on("finish", () => { file.close(); fontPath = dest; resolve(dest); });
        }).on("error", reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); fontPath = dest; resolve(dest); });
    }).on("error", reject);
  });
}

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

interface InvoicePdfData {
  invoice: Invoice;
  items: InvoiceItem[];
  company?: CompanyProfile | null;
  clientName?: string;
}

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const font = await ensureFont();
  const { invoice, items, company, clientName } = data;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 40, bottom: 40, left: 40, right: 40 },
    info: {
      Title: `請求書 ${invoice.invoiceNumber}`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.registerFont("JP", font);
  doc.font("JP");

  const pageW = 595.28;
  const mL = 40;
  const mR = 40;
  const contentW = pageW - mL - mR;

  let y = 40;

  // ── Title ──
  doc.fontSize(22).fillColor("#333").text("請求書", mL, y, { align: "center", width: contentW });
  y += 40;

  // ── Invoice number & date ──
  doc.fontSize(9).fillColor("#666");
  doc.text(`請求書番号: ${invoice.invoiceNumber}`, pageW - mR - 200, y, { width: 200, align: "right" });
  y += 14;
  doc.text(`発行日: ${toDateStr(invoice.issueDate)}`, pageW - mR - 200, y, { width: 200, align: "right" });
  if (invoice.dueDate) {
    y += 14;
    doc.text(`支払期限: ${toDateStr(invoice.dueDate)}`, pageW - mR - 200, y, { width: 200, align: "right" });
  }
  y += 14;
  doc.text(`対象期間: ${toDateStr(invoice.periodStart)} 〜 ${toDateStr(invoice.periodEnd)}`, pageW - mR - 200, y, { width: 200, align: "right" });

  // ── Client info (left side) ──
  const clientY = 80;
  const honorific = invoice.honorific || "御中";
  doc.fontSize(14).fillColor("#333").text(`${clientName || "取引先"} ${honorific}`, mL, clientY);
  doc.moveTo(mL, clientY + 22).lineTo(mL + 250, clientY + 22).lineWidth(1).strokeColor("#c8a96e").stroke();

  // ── Company info (right side, below dates) ──
  y = Math.max(y + 20, 160);
  doc.fontSize(8).fillColor("#666");
  if (company?.companyName) {
    doc.text(company.companyName, pageW - mR - 200, y, { width: 200, align: "right" });
    y += 12;
  }
  if (company?.address) {
    doc.text(`〒${company.postalCode || ""} ${company.address}`, pageW - mR - 200, y, { width: 200, align: "right" });
    y += 12;
  }
  if (company?.phone) {
    doc.text(`TEL: ${company.phone}`, pageW - mR - 200, y, { width: 200, align: "right" });
    y += 12;
  }
  if (company?.email) {
    doc.text(`Email: ${company.email}`, pageW - mR - 200, y, { width: 200, align: "right" });
    y += 12;
  }
  if (company?.invoiceIssuerNumber) {
    doc.text(`登録番号: ${company.invoiceIssuerNumber}`, pageW - mR - 200, y, { width: 200, align: "right" });
    y += 12;
  }

  // ── Total amount box ──
  y = Math.max(y + 10, 230);
  const boxH = 40;
  doc.rect(mL, y, contentW, boxH).fillAndStroke("#faf5eb", "#c8a96e");
  doc.fontSize(12).fillColor("#333").text("ご請求金額", mL + 10, y + 12);
  doc.fontSize(16).fillColor("#333").text(formatYen(invoice.totalAmount), mL + contentW - 200, y + 8, { width: 190, align: "right" });
  y += boxH + 15;

  // ── Items table ──
  const descW = contentW - 40 - 80 - 80 - 60 - 80;
  const cols = [
    { w: 40, label: "No." },
    { w: descW, label: "摘要" },
    { w: 80, label: "数量" },
    { w: 80, label: "単価" },
    { w: 60, label: "税率" },
    { w: 80, label: "金額" },
  ];

  // Header
  let x = mL;
  for (const col of cols) {
    doc.rect(x, y, col.w, 22).fillAndStroke("#e8e0d0", "#999");
    doc.fillColor("#333").fontSize(8).text(col.label, x + 4, y + 6, { width: col.w - 8, align: "center" });
    x += col.w;
  }
  y += 22;

  // Rows
  let normalIdx = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (y > 750) {
      doc.addPage();
      y = 40;
    }

    const isText = item.itemType === "text";
    const bgColor = isText ? "#f5f5f0" : (normalIdx % 2 === 0 ? "#ffffff" : "#fafaf5");

    if (isText) {
      // Text row spans the full width
      doc.rect(mL, y, contentW, 18).fillAndStroke(bgColor, "#ddd");
      doc.fillColor("#666").fontSize(7).text(item.description || "", mL + 44, y + 4, { width: contentW - 48 });
      y += 18;
    } else {
      normalIdx++;
      const quantityStr = item.unit === "日"
        ? `${(item.quantity / 10).toFixed(1)}日`
        : `${item.quantity}${item.unit || ""}`;

      const taxRateStr = `${item.itemTaxRate || 10}%`;

      const values = [
        String(normalIdx),
        item.description || "",
        quantityStr,
        formatYen(item.unitPrice),
        taxRateStr,
        formatYen(item.amount),
      ];

      x = mL;
      for (let j = 0; j < cols.length; j++) {
        doc.rect(x, y, cols[j].w, 20).fillAndStroke(bgColor, "#ddd");
        const align = j >= 2 ? "right" : "left";
        doc.fillColor("#333").fontSize(7).text(values[j], x + 4, y + 5, { width: cols[j].w - 8, align });
        x += cols[j].w;
      }

      // If item has notes, add a sub-row
      if (item.notes) {
        y += 20;
        if (y > 750) {
          doc.addPage();
          y = 40;
        }
        doc.rect(mL, y, contentW, 14).fillAndStroke("#fafaf5", "#eee");
        doc.fillColor("#888").fontSize(6).text(`  ${item.notes}`, mL + 44, y + 3, { width: contentW - 48 });
        y += 14;
      } else {
        y += 20;
      }
    }
  }

  // ── Tax breakdown by rate group ──
  y += 10;
  const summaryX = mL + contentW - 220;
  const summaryW = 220;

  const drawSummaryRow = (label: string, value: string, bold: boolean = false) => {
    doc.fontSize(bold ? 10 : 9).fillColor("#333");
    doc.text(label, summaryX, y, { width: 120 });
    doc.text(value, summaryX + 120, y, { width: 100, align: "right" });
    y += 18;
  };

  drawSummaryRow("小計", formatYen(invoice.subtotal));

  // Group tax by rate
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    const rate = item.itemTaxRate || 10;
    const existing = taxByRate.get(rate) || 0;
    taxByRate.set(rate, existing + item.amount);
  }

  for (const [rate, base] of Array.from(taxByRate.entries()).sort((a, b) => b[0] - a[0])) {
    if (rate === 0) continue;
    const taxAmt = Math.round(base * rate / 100);
    const rateLabel = rate === 8 ? `消費税 ${rate}%（軽減税率）` : `消費税 ${rate}%`;
    drawSummaryRow(rateLabel, formatYen(taxAmt));
  }

  doc.moveTo(summaryX, y - 2).lineTo(summaryX + summaryW, y - 2).lineWidth(0.5).strokeColor("#999").stroke();
  drawSummaryRow("合計金額", formatYen(invoice.totalAmount), true);

  // ── Notes ──
  if (invoice.notes) {
    y += 15;
    doc.fontSize(8).fillColor("#666").text("備考:", mL, y);
    y += 14;
    doc.fontSize(8).fillColor("#333").text(invoice.notes, mL, y, { width: contentW });
  }

  // ── Bank info ──
  y += 30;
  if (company?.bankName) {
    doc.fontSize(9).fillColor("#333").text("お振込先", mL, y, { underline: true });
    y += 16;
    doc.fontSize(8).fillColor("#666");
    doc.text(`${company.bankName} ${company.branchName || ""}`, mL, y);
    y += 12;
    const accType = company.accountType === "ordinary" ? "普通" : company.accountType === "checking" ? "当座" : "";
    doc.text(`${accType} ${company.accountNumber || ""}`, mL, y);
    y += 12;
    doc.text(`口座名義: ${company.accountHolder || ""}`, mL, y);
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}
