/**
 * Worker Roster PDF Generator (作業員名簿PDF)
 * Generates A4 portrait PDF with Japanese text support using PDFKit.
 * Font: Noto Sans JP (variable weight, hosted on CDN)
 */
import PDFDocument from "pdfkit";
import { Employee, Qualification, CompanyProfile } from "../drizzle/schema";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";

const FONT_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663330554130/Zmx5PsySMYEq8fnTQEF9bk/NotoSansJP-Regular_e41d65c6.ttf";

let fontPath: string | null = null;

/** Download font once and cache in /tmp */
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
        // Follow redirect
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

/** Download image from URL to temp file, return path */
async function downloadImage(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const ext = url.includes(".png") ? ".png" : url.includes(".svg") ? ".svg" : ".jpg";
    const tmpFile = path.join(os.tmpdir(), `pdf_img_${Date.now()}${ext}`);
    return new Promise((resolve) => {
      const get = url.startsWith("https") ? https.get : http.get;
      get(url, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        const file = fs.createWriteStream(tmpFile);
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(tmpFile); });
      }).on("error", () => resolve(null));
    });
  } catch { return null; }
}

function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function calcAge(dob: Date | string | null | undefined): string {
  if (!dob) return "";
  const d = typeof dob === "string" ? new Date(dob) : dob;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return String(age);
}

interface RosterData {
  employee: Employee;
  qualifications: Qualification[];
  company?: CompanyProfile | null;
  projectName?: string;
}

/**
 * Generate a single worker roster PDF (作業員名簿)
 * Returns a Buffer containing the PDF data.
 */
export async function generateRosterPdf(data: RosterData): Promise<Buffer> {
  const font = await ensureFont();
  const { employee: e, qualifications: quals, company, projectName } = data;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 30, bottom: 30, left: 30, right: 30 },
    info: {
      Title: `作業員名簿 - ${e.nameKanji || ""}`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  // Collect buffers
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  // Register font
  doc.registerFont("JP", font);
  doc.font("JP");

  const pageW = 595.28; // A4 width in points
  const pageH = 841.89;
  const mL = 30;
  const mR = 30;
  const contentW = pageW - mL - mR;

  // ── Title ──
  doc.fontSize(16).text("作業員名簿", mL, 30, { align: "center", width: contentW });
  doc.moveDown(0.3);

  // ── Company & Project info ──
  let y = 60;
  doc.fontSize(8);
  if (company?.companyName) {
    doc.text(`事業者名: ${company.companyName}`, mL, y);
    y += 14;
  }
  if (projectName) {
    doc.text(`現場名: ${projectName}`, mL, y);
    y += 14;
  }
  doc.text(`作成日: ${toDateStr(new Date())}`, pageW - mR - 150, 60, { width: 150, align: "right" });

  y += 6;

  // ── Helper: draw table row ──
  const drawRow = (label: string, value: string, x: number, yPos: number, labelW: number, valueW: number, h: number = 20) => {
    // Label cell
    doc.rect(x, yPos, labelW, h).stroke();
    doc.fontSize(7).text(label, x + 3, yPos + 4, { width: labelW - 6 });
    // Value cell
    doc.rect(x + labelW, yPos, valueW, h).stroke();
    doc.fontSize(8).text(value || "", x + labelW + 3, yPos + 4, { width: valueW - 6 });
    return yPos + h;
  };

  const drawRow2Col = (l1: string, v1: string, l2: string, v2: string, yPos: number, h: number = 20) => {
    const halfW = contentW / 2;
    const lw = 80;
    const vw = halfW - lw;
    drawRow(l1, v1, mL, yPos, lw, vw, h);
    drawRow(l2, v2, mL + halfW, yPos, lw, vw, h);
    return yPos + h;
  };

  // ── Basic info section ──
  doc.fontSize(9).fillColor("#333");

  // Photo placeholder area (right side)
  const photoX = pageW - mR - 80;
  const photoY = y;
  const photoW = 75;
  const photoH = 95;
  doc.rect(photoX, photoY, photoW, photoH).stroke();
  if (e.photoUrl) {
    const imgPath = await downloadImage(e.photoUrl);
    if (imgPath) {
      try {
        doc.image(imgPath, photoX + 2, photoY + 2, { width: photoW - 4, height: photoH - 4, fit: [photoW - 4, photoH - 4] });
      } catch { /* ignore image errors */ }
      fs.unlinkSync(imgPath);
    }
  } else {
    doc.fontSize(7).text("写真", photoX + 25, photoY + 40);
  }

  // Info table (left side, narrower to avoid photo)
  const tableW = contentW - photoW - 10;
  const lw = 80;
  const vw = tableW - lw;

  y = drawRow("ふりがな", e.nameKana || "", mL, y, lw, vw);
  y = drawRow("氏名", e.nameKanji || "", mL, y, lw, vw, 24);
  y = drawRow("生年月日", `${toDateStr(e.dateOfBirth)}  (${calcAge(e.dateOfBirth)}歳)`, mL, y, lw, vw);
  y = drawRow("血液型", e.bloodType || "", mL, y, lw, vw);

  // Make sure y is past the photo area
  y = Math.max(y, photoY + photoH + 5);

  // Full-width rows
  y = drawRow2Col("住所", `〒${e.postalCode || ""} ${e.address || ""}`, "電話番号", e.phone || "", y);
  y = drawRow2Col("国籍", e.nationality || "", "在留資格", e.residenceStatus || "", y);
  y = drawRow2Col("在留カード番号", e.residenceCardNumber || "", "在留期限", toDateStr(e.residenceCardExpiry), y);
  y = drawRow2Col("健康保険番号", e.healthInsuranceNumber || "", "保険種別", e.insuranceType === "national" ? "国民健康保険" : e.insuranceType === "social" ? "社会保険" : e.insuranceType === "construction" ? "建設国保" : "", y);
  y = drawRow2Col("雇用形態", e.employmentType === "sole_proprietor" ? "個人事業主" : e.employmentType === "employee" ? "雇用" : e.employmentType || "", "経験年数", e.experienceYears ? `${e.experienceYears}年` : "", y);
  y = drawRow2Col("健康診断日", toDateStr(e.healthCheckDate), "年金番号", e.pensionNumber || "", y);
  y = drawRow2Col("キャリアアップ番号", e.careerUpNumber || "", "労災保険番号", e.workersCompNumber || "", y);
  y = drawRow2Col("身長", e.height ? `${e.height}cm` : "", "体重", e.weight ? `${e.weight}kg` : "", y);

  // ── Emergency contact ──
  y += 8;
  doc.fontSize(9).text("緊急連絡先", mL, y, { underline: true });
  y += 16;
  y = drawRow2Col("氏名（かな）", e.emergencyNameKana || "", "氏名（漢字）", e.emergencyNameKanji || "", y);
  y = drawRow2Col("続柄", e.emergencyRelationship || "", "電話番号", e.emergencyPhone || "", y);
  y = drawRow("住所", `〒${e.emergencyPostalCode || ""} ${e.emergencyAddress || ""}`, mL, y, lw, contentW - lw);

  // ── Bank info ──
  y += 8;
  doc.fontSize(9).text("振込先情報", mL, y, { underline: true });
  y += 16;
  y = drawRow2Col("銀行名", e.bankName || "", "支店名", e.branchName || "", y);
  y = drawRow2Col("口座種別", e.accountType === "ordinary" ? "普通" : e.accountType === "checking" ? "当座" : "", "口座番号", e.accountNumber || "", y);
  y = drawRow("口座名義", e.accountHolder || "", mL, y, lw, contentW - lw);

  // ── Invoice info ──
  y += 8;
  doc.fontSize(9).text("インボイス情報", mL, y, { underline: true });
  y += 16;
  y = drawRow2Col("適格請求書発行事業者", e.isInvoiceIssuer ? "対応" : "非対応", "登録番号", e.invoiceIssuerNumber || "", y);

  // ── Qualifications ──
  if (quals.length > 0) {
    y += 8;
    doc.fontSize(9).text("保有資格", mL, y, { underline: true });
    y += 16;

    // Header
    const qCols = [{ w: 200, label: "資格名" }, { w: 120, label: "取得日" }, { w: contentW - 320, label: "証書番号" }];
    let qx = mL;
    for (const col of qCols) {
      doc.rect(qx, y, col.w, 18).fillAndStroke("#f0f0f0", "#333");
      doc.fillColor("#333").fontSize(7).text(col.label, qx + 3, y + 4, { width: col.w - 6 });
      qx += col.w;
    }
    y += 18;

    for (const q of quals) {
      if (y > pageH - 60) {
        doc.addPage();
        y = 30;
      }
      qx = mL;
      const vals = [q.name || "", toDateStr(q.obtainedDate), q.certificateNumber || ""];
      for (let i = 0; i < qCols.length; i++) {
        doc.rect(qx, y, qCols[i].w, 18).stroke();
        doc.fillColor("#333").fontSize(7).text(vals[i], qx + 3, y + 4, { width: qCols[i].w - 6 });
        qx += qCols[i].w;
      }
      y += 18;
    }
  }

  // ── Stamp ──
  if (e.stampUrl) {
    if (y > pageH - 120) {
      doc.addPage();
      y = 30;
    }
    y += 10;
    const stampImg = await downloadImage(e.stampUrl);
    if (stampImg) {
      try {
        doc.image(stampImg, pageW - mR - 60, y, { width: 50, height: 50, fit: [50, 50] });
      } catch { /* ignore */ }
      fs.unlinkSync(stampImg);
    }
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}

/**
 * Generate a multi-worker roster list PDF
 */
export async function generateRosterListPdf(
  workers: Array<{ employee: Employee; qualifications: Qualification[] }>,
  company?: CompanyProfile | null,
  projectName?: string,
): Promise<Buffer> {
  const font = await ensureFont();

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 25, bottom: 25, left: 25, right: 25 },
    info: {
      Title: `作業員名簿一覧${projectName ? ` - ${projectName}` : ""}`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.registerFont("JP", font);
  doc.font("JP");

  const pageW = 841.89; // A4 landscape
  const pageH = 595.28;
  const mL = 25;
  const mR = 25;
  const contentW = pageW - mL - mR;

  // Title
  doc.fontSize(14).text("作業員名簿一覧", mL, 25, { align: "center", width: contentW });
  doc.fontSize(8);
  if (company?.companyName) doc.text(`事業者名: ${company.companyName}`, mL, 45);
  if (projectName) doc.text(`現場名: ${projectName}`, mL, 57);
  doc.text(`作成日: ${toDateStr(new Date())}`, pageW - mR - 150, 45, { width: 150, align: "right" });

  // Table header
  const cols = [
    { w: 30, label: "No." },
    { w: 90, label: "氏名" },
    { w: 70, label: "生年月日" },
    { w: 30, label: "年齢" },
    { w: 40, label: "血液型" },
    { w: 60, label: "国籍" },
    { w: 80, label: "在留資格" },
    { w: 80, label: "住所" },
    { w: 60, label: "電話番号" },
    { w: 60, label: "保険種別" },
    { w: 60, label: "雇用形態" },
    { w: contentW - 660, label: "保有資格" },
  ];

  let y = 72;
  const rowH = 22;

  // Draw header
  let x = mL;
  for (const col of cols) {
    doc.rect(x, y, col.w, rowH).fillAndStroke("#e8e0d0", "#333");
    doc.fillColor("#333").fontSize(6).text(col.label, x + 2, y + 6, { width: col.w - 4 });
    x += col.w;
  }
  y += rowH;

  // Draw rows
  for (let i = 0; i < workers.length; i++) {
    if (y > pageH - 40) {
      doc.addPage();
      y = 25;
      // Redraw header
      x = mL;
      for (const col of cols) {
        doc.rect(x, y, col.w, rowH).fillAndStroke("#e8e0d0", "#333");
        doc.fillColor("#333").fontSize(6).text(col.label, x + 2, y + 6, { width: col.w - 4 });
        x += col.w;
      }
      y += rowH;
    }

    const { employee: e, qualifications: quals } = workers[i];
    const insuranceLabel = e.insuranceType === "national" ? "国保" : e.insuranceType === "social" ? "社保" : e.insuranceType === "construction" ? "建設国保" : "";
    const empTypeLabel = e.employmentType === "sole_proprietor" ? "個人事業主" : e.employmentType === "employee" ? "雇用" : "";
    const qualNames = quals.map(q => q.name).join(", ");

    const values = [
      String(i + 1),
      e.nameKanji || "",
      toDateStr(e.dateOfBirth),
      calcAge(e.dateOfBirth),
      e.bloodType || "",
      e.nationality || "",
      e.residenceStatus || "",
      e.address ? (e.address.length > 15 ? e.address.slice(0, 15) + "…" : e.address) : "",
      e.phone || "",
      insuranceLabel,
      empTypeLabel,
      qualNames.length > 25 ? qualNames.slice(0, 25) + "…" : qualNames,
    ];

    const bgColor = i % 2 === 0 ? "#ffffff" : "#fafaf5";
    x = mL;
    for (let j = 0; j < cols.length; j++) {
      doc.rect(x, y, cols[j].w, rowH).fillAndStroke(bgColor, "#ccc");
      doc.fillColor("#333").fontSize(6).text(values[j], x + 2, y + 6, { width: cols[j].w - 4 });
      x += cols[j].w;
    }
    y += rowH;
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => {
      resolve(Buffer.concat(buffers));
    });
  });
}
