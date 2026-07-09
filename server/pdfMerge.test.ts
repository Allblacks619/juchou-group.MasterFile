import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { mergePdfWithAttachments } from "./pdfMerge";

async function makePdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

// 1x1 の最小PNG
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

describe("mergePdfWithAttachments", () => {
  it("PDF添付は全ページを後ろに合体する", async () => {
    const base = await makePdf(2);
    const attach = await makePdf(3);
    const { bytes, warnings } = await mergePdfWithAttachments(base, [
      { name: "出面表", mimeType: "application/pdf", bytes: attach },
    ]);
    const merged = await PDFDocument.load(bytes);
    expect(merged.getPageCount()).toBe(5);
    expect(warnings).toHaveLength(0);
  });

  it("PNG画像はA4ページとして追加される", async () => {
    const base = await makePdf(1);
    const { bytes, warnings } = await mergePdfWithAttachments(base, [
      { name: "領収書.png", mimeType: "image/png", bytes: TINY_PNG },
    ]);
    const merged = await PDFDocument.load(bytes);
    expect(merged.getPageCount()).toBe(2);
    expect(warnings).toHaveLength(0);
  });

  it("未対応形式・壊れたファイルはスキップして警告を返す（全体は成功）", async () => {
    const base = await makePdf(1);
    const { bytes, warnings } = await mergePdfWithAttachments(base, [
      { name: "動画.mp4", mimeType: "video/mp4", bytes: Buffer.from("x") },
      { name: "壊れたPDF", mimeType: "application/pdf", bytes: Buffer.from("not a pdf") },
      { name: "正常PDF", mimeType: "application/pdf", bytes: await makePdf(1) },
    ]);
    const merged = await PDFDocument.load(bytes);
    expect(merged.getPageCount()).toBe(2); // base 1 + 正常PDF 1
    expect(warnings).toHaveLength(2);
  });

  it("添付なしならベースのまま", async () => {
    const base = await makePdf(2);
    const { bytes } = await mergePdfWithAttachments(base, []);
    const merged = await PDFDocument.load(bytes);
    expect(merged.getPageCount()).toBe(2);
  });
});
