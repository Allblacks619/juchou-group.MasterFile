// legacyビルドを使用: 通常ビルドは最新すぎるJS機能(getOrInsertComputed等)を要求し
// 現行ブラウザ/実機スマホで動かないため。legacyは広い端末互換を持つ。
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
// Viteが同梱するワーカー (CDN依存なし = 自己ホスト/オフラインで安定)
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** 図面アップロードのペイロード。base64 は data: プレフィックスなしの生base64 (サーバーは Buffer.from(base64,"base64")) */
export type GenbaUploadImage = {
  base64: string;
  mimeType: string;
  fileName: string;
  w: number;
  h: number;
};

const MAX_PDF_PAGES = 12;

function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "floor";
}

/** canvasをJPEGに圧縮して生base64を返す */
function canvasToImage(canvas: HTMLCanvasElement, fileName: string, quality: number): GenbaUploadImage {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return {
    base64: stripDataUrl(dataUrl),
    mimeType: "image/jpeg",
    fileName: `${baseName(fileName)}.jpg`,
    w: canvas.width,
    h: canvas.height,
  };
}

/** 画像ファイルをクライアント側で縮小 (maxW) してアップロード用に整形する。DBにbase64は入れない — R2キーのみ保存 */
export function fileToResizedImage(file: File, maxW = 1280, quality = 0.85): Promise<GenbaUploadImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const cxt = canvas.getContext("2d");
        if (!cxt) return reject(new Error("canvas context unavailable"));
        cxt.drawImage(img, 0, 0, w, h);
        resolve(canvasToImage(canvas, file.name, quality));
      };
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/** PDFを各ページ画像に変換 (最大12ページ)。pdf.jsはクライアントで実行しサーバーメモリを使わない */
export async function pdfToImages(
  file: File,
  onProgress?: (page: number, total: number) => void,
  targetW = 1600,
  quality = 0.85,
): Promise<{ images: GenbaUploadImage[]; total: number }> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const base = baseName(file.name);
  const images: GenbaUploadImage[] = [];
  for (let i = 1; i <= pages; i++) {
    onProgress?.(i, pages);
    const page = await pdf.getPage(i);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2, targetW / vp1.width);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const cxt = canvas.getContext("2d");
    if (!cxt) throw new Error("canvas context unavailable");
    await page.render({ canvas, canvasContext: cxt, viewport: vp } as any).promise;
    const name = pages > 1 ? `${base}_P${i}` : base;
    images.push(canvasToImage(canvas, `${name}.jpg`, quality));
  }
  return { images, total: pdf.numPages };
}
