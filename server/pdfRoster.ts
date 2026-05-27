/**
 * Worker Roster PDF Generator (作業員名簿PDF)
 * Generates A4 portrait PDF with Japanese text support using PDFKit.
 * Font: Noto Sans JP (variable weight, hosted on CDN)
 *
 * Layout improvements (v5):
 * - No photo section
 * - No employment type, height, weight
 * - Experience years near basic info
 * - Phone, address near basic info
 * - Insurance: show workers_comp OR employment based on insuranceNumberType
 * - No bank/invoice sections
 * - No business name row (事業者名)
 * - Company name in header
 * - Watermark + logo
 * - Grouped related fields
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

async function downloadImage(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const ext = url.includes(".png") ? ".png" : url.includes(".svg") ? ".svg" : ".jpg";
    const tmpFile = path.join(os.tmpdir(), `pdf_img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`);
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

function insuranceLabel(type: string | null | undefined): string {
  if (!type) return "";
  if (type === "national") return "国民健康保険";
  if (type === "social") return "社会保険";
  if (type === "construction") return "建設国保";
  return type;
}

interface RosterData {
  employee: Employee;
  qualifications: Qualification[];
  company?: CompanyProfile | null;
  projectName?: string;
}

// ── Watermark helper ──
async function drawWatermark(doc: PDFKit.PDFDocument, company: CompanyProfile | null | undefined, pageW: number, pageH: number) {
  if (!company?.watermarkUrl) return;
  const wmPath = await downloadImage(company.watermarkUrl);
  if (!wmPath) return;
  try {
    doc.save();
    doc.opacity(0.06);
    const wmSize = Math.min(pageW, pageH) * 0.5;
    doc.image(wmPath, (pageW - wmSize) / 2, (pageH - wmSize) / 2, { width: wmSize, height: wmSize, fit: [wmSize, wmSize] });
    doc.restore();
  } catch { /* ignore */ }
  try { fs.unlinkSync(wmPath); } catch { /* ignore */ }
}

// ── Header helper (company name + logo) ──
async function drawHeader(doc: PDFKit.PDFDocument, company: CompanyProfile | null | undefined, mL: number, mR: number, pageW: number): Promise<number> {
  let y = 20;

  // Logo (left side)
  if (company?.logoUrl) {
    const logoPath = await downloadImage(company.logoUrl);
    if (logoPath) {
      try {
        doc.image(logoPath, mL, y, { height: 28, fit: [80, 28] });
      } catch { /* ignore */ }
      try { fs.unlinkSync(logoPath); } catch { /* ignore */ }
    }
  }

  // Company name (center)
  const companyName = company?.companyName || "充寵グループ";
  doc.fontSize(11).fillColor("#333").text(companyName, mL, y + 6, { align: "center", width: pageW - mL - mR });

  // Date (right side)
  doc.fontSize(7).text(`作成日: ${toDateStr(new Date())}`, pageW - mR - 130, y + 10, { width: 130, align: "right" });

  y += 36;

  // Separator line
  doc.moveTo(mL, y).lineTo(pageW - mR, y).strokeColor("#c0a060").lineWidth(0.5).stroke();
  doc.strokeColor("#333").lineWidth(1);
  y += 6;

  return y;
}

/**
 * Generate a single worker roster PDF (作業員名簿)
 * Improved layout: grouped related info, no photo/bank/invoice
 */
export async function generateRosterPdf(data: RosterData): Promise<Buffer> {
  const font = await ensureFont();
  const { employee: e, qualifications: quals, company, projectName } = data;

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 20, bottom: 30, left: 30, right: 30 },
    info: {
      Title: `作業員名簿 - ${e.nameKanji || ""}`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.registerFont("JP", font);
  doc.font("JP");

  const pageW = 595.28;
  const pageH = 841.89;
  const mL = 30;
  const mR = 30;
  const contentW = pageW - mL - mR;

  // ── Watermark ──
  await drawWatermark(doc, company, pageW, pageH);

  // ── Header ──
  let y = await drawHeader(doc, company, mL, mR, pageW);

  // ── Title ──
  doc.fontSize(14).fillColor("#333").text("作業員名簿", mL, y, { align: "center", width: contentW });
  y += 22;

  if (projectName) {
    doc.fontSize(8).text(`現場名: ${projectName}`, mL, y);
    y += 14;
  }

  y += 4;

  // ── Helper: draw table row ──
  const drawRow = (label: string, value: string, x: number, yPos: number, labelW: number, valueW: number, h: number = 18) => {
    doc.rect(x, yPos, labelW, h).fillAndStroke("#f8f5ef", "#999");
    doc.fillColor("#333").fontSize(6.5).text(label, x + 3, yPos + 4, { width: labelW - 6 });
    doc.rect(x + labelW, yPos, valueW, h).stroke();
    doc.fillColor("#111").fontSize(7.5).text(value || "", x + labelW + 3, yPos + 4, { width: valueW - 6 });
    return yPos + h;
  };

  const drawRow2Col = (l1: string, v1: string, l2: string, v2: string, yPos: number, h: number = 18) => {
    const halfW = contentW / 2;
    const lw = 75;
    const vw = halfW - lw;
    drawRow(l1, v1, mL, yPos, lw, vw, h);
    drawRow(l2, v2, mL + halfW, yPos, lw, vw, h);
    return yPos + h;
  };

  const drawSectionTitle = (title: string, yPos: number) => {
    doc.fontSize(8).fillColor("#8b7340").text(`■ ${title}`, mL, yPos);
    return yPos + 14;
  };

  // ── Section 1: 基本情報 ──
  y = drawSectionTitle("基本情報", y);
  y = drawRow2Col("ふりがな", e.nameKana || "", "氏名（漢字）", e.nameKanji || "", y);
  y = drawRow2Col("氏名（ローマ字）", e.nameRomaji || "", "生年月日", `${toDateStr(e.dateOfBirth)}  (${calcAge(e.dateOfBirth)}歳)`, y);
  y = drawRow2Col("血液型", e.bloodType || "", "性別", e.gender === "male" ? "男" : e.gender === "female" ? "女" : "", y);
  y = drawRow2Col("国籍", e.nationality || "", "経験年数", e.experienceYears ? `${e.experienceYears}年` : "", y);
  y = drawRow2Col("電話番号", e.phone || "", "メール", e.email || "", y);
  const lw = 75;
  y = drawRow("住所", `${e.postalCode ? "〒" + e.postalCode + " " : ""}${e.address || ""}`, mL, y, lw, contentW - lw);

  // ── Section 2: 建設キャリアアップ ──
  y += 6;
  y = drawSectionTitle("建設キャリアアップ", y);
  y = drawRow("CCUS番号", e.careerUpNumber || "", mL, y, lw, contentW - lw);

  // ── Section 3: 在留情報 ──
  y += 6;
  y = drawSectionTitle("在留情報", y);
  y = drawRow2Col("在留資格", e.residenceStatus || "", "在留カード番号", e.residenceCardNumber || "", y);
  y = drawRow2Col("在留期限", toDateStr(e.residenceCardExpiry), "パスポート番号", e.passportNumber || "", y);

  // ── Section 4: 健康情報 ──
  y += 6;
  y = drawSectionTitle("健康情報", y);
  y = drawRow2Col("健康診断日", toDateStr(e.healthCheckDate), "血圧", e.bloodPressureHigh ? `${e.bloodPressureHigh}/${e.bloodPressureLow || ""}` : "", y);

  // ── Section 5: 保険情報 ──
  y += 6;
  y = drawSectionTitle("保険情報", y);
  y = drawRow2Col("健康保険種別", insuranceLabel(e.insuranceType), "健康保険番号", e.healthInsuranceNumber || "", y);
  y = drawRow2Col("年金番号", e.pensionNumber || "", "", "", y);

  // Show workers_comp OR employment based on insuranceNumberType
  const insType = e.insuranceNumberType;
  if (insType === "employment") {
    y = drawRow("雇用保険番号", e.employmentInsuranceNumber || "", mL, y, lw, contentW - lw);
  } else {
    // Default to workers_comp or show whichever has data
    y = drawRow("労災保険番号", e.workersCompNumber || "", mL, y, lw, contentW - lw);
  }

  // ── Section 6: 緊急連絡先 ──
  y += 6;
  y = drawSectionTitle("緊急連絡先", y);
  y = drawRow2Col("氏名（かな）", e.emergencyNameKana || "", "氏名（漢字）", e.emergencyNameKanji || "", y);
  y = drawRow2Col("続柄", e.emergencyRelationship || "", "電話番号", e.emergencyPhone || "", y);
  y = drawRow("住所", `${e.emergencyPostalCode ? "〒" + e.emergencyPostalCode + " " : ""}${e.emergencyAddress || ""}`, mL, y, lw, contentW - lw);

  // ── Section 7: 保有資格 ──
  if (quals.length > 0) {
    y += 6;
    y = drawSectionTitle("保有資格", y);

    const qCols = [{ w: 200, label: "資格名" }, { w: 120, label: "取得日" }, { w: contentW - 320, label: "証書番号" }];
    let qx = mL;
    for (const col of qCols) {
      doc.rect(qx, y, col.w, 16).fillAndStroke("#f0ece0", "#999");
      doc.fillColor("#333").fontSize(6.5).text(col.label, qx + 3, y + 3, { width: col.w - 6 });
      qx += col.w;
    }
    y += 16;

    for (const q of quals) {
      if (y > pageH - 60) {
        doc.addPage();
        await drawWatermark(doc, company, pageW, pageH);
        y = 30;
      }
      qx = mL;
      const vals = [q.name || "", toDateStr(q.obtainedDate), q.certificateNumber || ""];
      for (let i = 0; i < qCols.length; i++) {
        doc.rect(qx, y, qCols[i].w, 16).stroke();
        doc.fillColor("#333").fontSize(6.5).text(vals[i], qx + 3, y + 3, { width: qCols[i].w - 6 });
        qx += qCols[i].w;
      }
      y += 16;
    }
  }

  // ── Stamp (if exists) ──
  if (e.stampUrl) {
    if (y > pageH - 100) {
      doc.addPage();
      await drawWatermark(doc, company, pageW, pageH);
      y = 30;
    }
    y += 10;
    doc.fontSize(7).fillColor("#666").text("印鑑:", pageW - mR - 80, y);
    const stampImg = await downloadImage(e.stampUrl);
    if (stampImg) {
      try {
        doc.image(stampImg, pageW - mR - 55, y - 5, { width: 45, height: 45, fit: [45, 45] });
      } catch { /* ignore */ }
      try { fs.unlinkSync(stampImg); } catch { /* ignore */ }
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
 * Generate a multi-worker roster list PDF (横向きA4)
 * Improved: no photo, no employment type, no height/weight, no bank/invoice
 * Insurance shows based on type selection
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
    margins: { top: 20, bottom: 20, left: 15, right: 15 },
    info: {
      Title: `作業員名簿一覧${projectName ? ` - ${projectName}` : ""}`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  doc.registerFont("JP", font);
  doc.font("JP");

  const pageW = 841.89;
  const pageH = 595.28;
  const mL = 15;
  const mR = 15;
  const contentW = pageW - mL - mR;

  // Watermark
  await drawWatermark(doc, company, pageW, pageH);

  // Header with company name
  const companyName = company?.companyName || "充寵グループ";

  // Logo (left)
  let headerY = 12;
  if (company?.logoUrl) {
    const logoPath = await downloadImage(company.logoUrl);
    if (logoPath) {
      try { doc.image(logoPath, mL, headerY, { height: 20, fit: [60, 20] }); } catch { /* ignore */ }
      try { fs.unlinkSync(logoPath); } catch { /* ignore */ }
    }
  }

  doc.fontSize(10).fillColor("#333").text(companyName, mL, headerY + 2, { align: "center", width: contentW });
  doc.fontSize(7).text(`作成日: ${toDateStr(new Date())}`, pageW - mR - 100, headerY + 4, { width: 100, align: "right" });

  // Title
  let y = 38;
  doc.fontSize(11).text("作業員名簿一覧", mL, y, { align: "center", width: contentW });
  y += 16;

  if (projectName) {
    doc.fontSize(7).text(`現場名: ${projectName}`, mL, y);
    y += 12;
  }

  // Table columns (improved - no photo, no employment type, no height/weight, no bank/invoice)
  const cols = [
    { w: 22, label: "No." },
    { w: 65, label: "氏名" },
    { w: 52, label: "生年月日" },
    { w: 22, label: "年齢" },
    { w: 26, label: "血液型" },
    { w: 30, label: "経験" },
    { w: 38, label: "国籍" },
    { w: 48, label: "在留資格" },
    { w: 105, label: "住所" },
    { w: 56, label: "電話番号" },
    { w: 44, label: "健康診断日" },
    { w: 36, label: "血圧" },
    { w: 56, label: "緊急連絡先" },
    { w: 42, label: "保険種別" },
    { w: 44, label: "年金番号" },
    { w: 50, label: "労災/雇用保険" },
    { w: contentW - 736, label: "保有資格" },
  ];

  const rowH = 18;
  const fontSize = 5;

  const drawTableHeader = (yPos: number) => {
    let x = mL;
    for (const col of cols) {
      doc.rect(x, yPos, col.w, rowH).fillAndStroke("#f0ece0", "#999");
      doc.fillColor("#333").fontSize(fontSize).text(col.label, x + 1, yPos + 4, { width: col.w - 2 });
      x += col.w;
    }
    return yPos + rowH;
  };

  y = drawTableHeader(y);

  for (let i = 0; i < workers.length; i++) {
    if (y > pageH - 30) {
      doc.addPage();
      await drawWatermark(doc, company, pageW, pageH);
      y = 20;
      y = drawTableHeader(y);
    }

    const { employee: e, qualifications: quals } = workers[i];
    const qualNames = quals.map(q => q.name).join(", ");
    const bp = e.bloodPressureHigh ? `${e.bloodPressureHigh}/${e.bloodPressureLow || ""}` : "";
    const emergencyInfo = e.emergencyNameKanji ? `${e.emergencyNameKanji} ${e.emergencyPhone || ""}` : "";
    const fullAddress = `${e.postalCode ? "〒" + e.postalCode + " " : ""}${e.address || ""}`;

    // Insurance: show based on type
    const insNumber = e.insuranceNumberType === "employment"
      ? (e.employmentInsuranceNumber || "")
      : (e.workersCompNumber || "");

    const values = [
      String(i + 1),
      e.nameKanji || "",
      toDateStr(e.dateOfBirth),
      calcAge(e.dateOfBirth),
      e.bloodType || "",
      e.experienceYears ? `${e.experienceYears}年` : "",
      e.nationality || "",
      e.residenceStatus || "",
      fullAddress,
      e.phone || "",
      toDateStr(e.healthCheckDate),
      bp,
      emergencyInfo,
      insuranceLabel(e.insuranceType),
      e.pensionNumber || "",
      insNumber,
      qualNames,
    ];

    const bgColor = i % 2 === 0 ? "#ffffff" : "#fafaf5";
    let x = mL;
    for (let j = 0; j < cols.length; j++) {
      doc.rect(x, y, cols[j].w, rowH).fillAndStroke(bgColor, "#ddd");
      doc.fillColor("#333").fontSize(fontSize).text(values[j], x + 1, y + 4, { width: cols[j].w - 2 });
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

/**
 * Generate multiple individual roster PDFs combined into one document
 * Each worker gets their own page(s)
 */
export async function generateMultiRosterPdf(
  workers: Array<{ employee: Employee; qualifications: Qualification[] }>,
  company?: CompanyProfile | null,
  projectName?: string,
): Promise<Buffer> {
  if (workers.length === 1) {
    return generateRosterPdf({
      employee: workers[0].employee,
      qualifications: workers[0].qualifications,
      company,
      projectName,
    });
  }
  return generateMultiPageRosterPdf(workers, company, projectName);
}

/** Internal: Generate a single PDF with multiple workers, each starting on a new page */
async function generateMultiPageRosterPdf(
  workers: Array<{ employee: Employee; qualifications: Qualification[] }>,
  company?: CompanyProfile | null,
  projectName?: string,
): Promise<Buffer> {
  const font = await ensureFont();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 20, bottom: 30, left: 30, right: 30 },
    info: {
      Title: `作業員名簿（${workers.length}名）`,
      Author: company?.companyName || "充寵グループ",
    },
  });

  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  doc.registerFont("JP", font);
  doc.font("JP");

  const pageW = 595.28;
  const pageH = 841.89;
  const mL = 30;
  const mR = 30;
  const contentW = pageW - mL - mR;

  const drawRow = (label: string, value: string, x: number, yPos: number, labelW: number, valueW: number, h: number = 18) => {
    doc.rect(x, yPos, labelW, h).fillAndStroke("#f8f5ef", "#999");
    doc.fillColor("#333").fontSize(6.5).text(label, x + 3, yPos + 4, { width: labelW - 6 });
    doc.rect(x + labelW, yPos, valueW, h).stroke();
    doc.fillColor("#111").fontSize(7.5).text(value || "", x + labelW + 3, yPos + 4, { width: valueW - 6 });
    return yPos + h;
  };

  const drawRow2Col = (l1: string, v1: string, l2: string, v2: string, yPos: number, h: number = 18) => {
    const halfW = contentW / 2;
    const lw2 = 75;
    const vw2 = halfW - lw2;
    drawRow(l1, v1, mL, yPos, lw2, vw2, h);
    drawRow(l2, v2, mL + halfW, yPos, lw2, vw2, h);
    return yPos + h;
  };

  const drawSectionTitle = (title: string, yPos: number) => {
    doc.fontSize(8).fillColor("#8b7340").text(`■ ${title}`, mL, yPos);
    return yPos + 14;
  };

  const lw = 75;

  for (let wi = 0; wi < workers.length; wi++) {
    if (wi > 0) doc.addPage();

    const { employee: e, qualifications: quals } = workers[wi];

    // Watermark
    await drawWatermark(doc, company, pageW, pageH);

    // Header
    let y = await drawHeader(doc, company, mL, mR, pageW);

    // Title
    doc.fontSize(14).fillColor("#333").text("作業員名簿", mL, y, { align: "center", width: contentW });
    y += 22;

    if (projectName) {
      doc.fontSize(8).text(`現場名: ${projectName}`, mL, y);
      y += 14;
    }
    y += 4;

    // Section 1: 基本情報
    y = drawSectionTitle("基本情報", y);
    y = drawRow2Col("ふりがな", e.nameKana || "", "氏名（漢字）", e.nameKanji || "", y);
    y = drawRow2Col("氏名（ローマ字）", e.nameRomaji || "", "生年月日", `${toDateStr(e.dateOfBirth)}  (${calcAge(e.dateOfBirth)}歳)`, y);
    y = drawRow2Col("血液型", e.bloodType || "", "性別", e.gender === "male" ? "男" : e.gender === "female" ? "女" : "", y);
    y = drawRow2Col("国籍", e.nationality || "", "経験年数", e.experienceYears ? `${e.experienceYears}年` : "", y);
    y = drawRow2Col("電話番号", e.phone || "", "メール", e.email || "", y);
    y = drawRow("住所", `${e.postalCode ? "〒" + e.postalCode + " " : ""}${e.address || ""}`, mL, y, lw, contentW - lw);

    // Section 2: CCUS
    y += 6;
    y = drawSectionTitle("建設キャリアアップ", y);
    y = drawRow("CCUS番号", e.careerUpNumber || "", mL, y, lw, contentW - lw);

    // Section 3: 在留情報
    y += 6;
    y = drawSectionTitle("在留情報", y);
    y = drawRow2Col("在留資格", e.residenceStatus || "", "在留カード番号", e.residenceCardNumber || "", y);
    y = drawRow2Col("在留期限", toDateStr(e.residenceCardExpiry), "パスポート番号", e.passportNumber || "", y);

    // Section 4: 健康情報
    y += 6;
    y = drawSectionTitle("健康情報", y);
    y = drawRow2Col("健康診断日", toDateStr(e.healthCheckDate), "血圧", e.bloodPressureHigh ? `${e.bloodPressureHigh}/${e.bloodPressureLow || ""}` : "", y);

    // Section 5: 保険情報
    y += 6;
    y = drawSectionTitle("保険情報", y);
    y = drawRow2Col("健康保険種別", insuranceLabel(e.insuranceType), "健康保険番号", e.healthInsuranceNumber || "", y);
    y = drawRow2Col("年金番号", e.pensionNumber || "", "", "", y);

    const insType = e.insuranceNumberType;
    if (insType === "employment") {
      y = drawRow("雇用保険番号", e.employmentInsuranceNumber || "", mL, y, lw, contentW - lw);
    } else {
      y = drawRow("労災保険番号", e.workersCompNumber || "", mL, y, lw, contentW - lw);
    }

    // Section 6: 緊急連絡先
    y += 6;
    y = drawSectionTitle("緊急連絡先", y);
    y = drawRow2Col("氏名（かな）", e.emergencyNameKana || "", "氏名（漢字）", e.emergencyNameKanji || "", y);
    y = drawRow2Col("続柄", e.emergencyRelationship || "", "電話番号", e.emergencyPhone || "", y);
    y = drawRow("住所", `${e.emergencyPostalCode ? "〒" + e.emergencyPostalCode + " " : ""}${e.emergencyAddress || ""}`, mL, y, lw, contentW - lw);

    // Section 7: 保有資格
    if (quals.length > 0) {
      y += 6;
      y = drawSectionTitle("保有資格", y);

      const qCols = [{ w: 200, label: "資格名" }, { w: 120, label: "取得日" }, { w: contentW - 320, label: "証書番号" }];
      let qx = mL;
      for (const col of qCols) {
        doc.rect(qx, y, col.w, 16).fillAndStroke("#f0ece0", "#999");
        doc.fillColor("#333").fontSize(6.5).text(col.label, qx + 3, y + 3, { width: col.w - 6 });
        qx += col.w;
      }
      y += 16;

      for (const q of quals) {
        if (y > pageH - 60) {
          doc.addPage();
          await drawWatermark(doc, company, pageW, pageH);
          y = 30;
        }
        qx = mL;
        const vals = [q.name || "", toDateStr(q.obtainedDate), q.certificateNumber || ""];
        for (let ci = 0; ci < qCols.length; ci++) {
          doc.rect(qx, y, qCols[ci].w, 16).stroke();
          doc.fillColor("#333").fontSize(6.5).text(vals[ci], qx + 3, y + 3, { width: qCols[ci].w - 6 });
          qx += qCols[ci].w;
        }
        y += 16;
      }
    }

    // Stamp
    if (e.stampUrl) {
      if (y > pageH - 80) {
        doc.addPage();
        await drawWatermark(doc, company, pageW, pageH);
        y = 30;
      }
      y += 8;
      const stampImg = await downloadImage(e.stampUrl);
      if (stampImg) {
        try { doc.image(stampImg, pageW - mR - 55, y - 5, { width: 45, height: 45, fit: [45, 45] }); } catch { /* ignore */ }
        try { fs.unlinkSync(stampImg); } catch { /* ignore */ }
      }
    }
  }

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
  });
}
