/*
 * pdfMerge.ts — 請求書PDFへの添付合体（出面表・アップロード書類）
 *
 * pdf-lib で複数のPDF/画像を1つのPDFにまとめる。
 * - PDF: 全ページをコピーして追加
 * - 画像(JPEG/PNG): A4ページに余白付きで収まるよう縮小して配置
 * 壊れた添付が1件あっても全体を失敗させず、スキップして警告を返す。
 */
import { PDFDocument } from "pdf-lib";

export type MergeAttachment = {
  /** 表示名（警告メッセージ用） */
  name: string;
  mimeType: string;
  bytes: Buffer | Uint8Array;
};

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 24;

/**
 * ベースPDFに添付（PDF/JPEG/PNG）を順に合体して1つのPDFにする。
 * 戻り値: 合体済みPDFのバイト列と、読み込めなかった添付の警告一覧。
 */
export async function mergePdfWithAttachments(
  basePdf: Buffer | Uint8Array,
  attachments: MergeAttachment[]
): Promise<{ bytes: Buffer; warnings: string[] }> {
  const merged = await PDFDocument.load(basePdf);
  const warnings: string[] = [];

  for (const attachment of attachments) {
    try {
      const mime = (attachment.mimeType || "").toLowerCase();
      if (mime.includes("pdf")) {
        const src = await PDFDocument.load(attachment.bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(src, src.getPageIndices());
        for (const page of pages) merged.addPage(page);
      } else if (mime.includes("png")) {
        const image = await merged.embedPng(attachment.bytes);
        addImagePage(merged, image);
      } else if (mime.includes("jpeg") || mime.includes("jpg")) {
        const image = await merged.embedJpg(attachment.bytes);
        addImagePage(merged, image);
      } else {
        warnings.push(`${attachment.name}: 未対応の形式のため添付をスキップしました（${attachment.mimeType}）`);
      }
    } catch {
      warnings.push(`${attachment.name}: 読み込みに失敗したため添付をスキップしました`);
    }
  }

  const bytes = Buffer.from(await merged.save());
  return { bytes, warnings };
}

function addImagePage(doc: PDFDocument, image: { width: number; height: number }) {
  const page = doc.addPage([A4.width, A4.height]);
  const maxW = A4.width - MARGIN * 2;
  const maxH = A4.height - MARGIN * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image as any, {
    x: (A4.width - w) / 2,
    y: (A4.height - h) / 2,
    width: w,
    height: h,
  });
}
