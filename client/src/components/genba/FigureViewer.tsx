import { useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut, Maximize, Download } from "lucide-react";
import { loadPdfDocument } from "@/lib/genbaUpload";
import { useGenbaT } from "@/lib/genbaLang";

export type ViewerFile = { blob: Blob; mimeType: string | null; title: string };

/**
 * 図面・資料のアプリ内ビューア。外部タブに飛ばさず、画像/PDFをその場で全画面表示する。
 * - 画像: <img> をズーム(ボタン/ホイール/ダブルタップ)しながら閲覧。パンは内側スクロール。
 * - PDF: pdfjs(自己ホストworker)でページをcanvasに描画して縦に並べる。
 * blob はオフライン保存の実体、または getBytes 経由で取得したバイト列から生成して渡す(CORS回避)。
 */
export default function FigureViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const t = useGenbaT();
  const isPdf = (file.mimeType || file.blob.type || "").includes("pdf");
  const isImage = (file.mimeType || file.blob.type || "").startsWith("image/");
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(isImage ? "ready" : "loading");
  const [pageCount, setPageCount] = useState(0);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const objectUrl = useRef<string | null>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  // 画像: blob→objectURL
  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file.blob);
    objectUrl.current = url;
    setImgSrc(url);
    return () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, [file.blob, isImage]);

  // PDF: pdfjsでページをcanvasに描画
  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    (async () => {
      try {
        const buf = await file.blob.arrayBuffer();
        const pdf = await loadPdfDocument(buf);
        if (cancelled) return;
        setPageCount(pdf.numPages);
        const wrap = canvasWrapRef.current;
        if (!wrap) return;
        wrap.innerHTML = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return;
          const page = await pdf.getPage(i);
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const base = page.getViewport({ scale: 1 });
          // 端末幅に合わせつつ高精細に描画 (最大幅1400px相当)
          const targetW = Math.min(1400, wrap.clientWidth || 900);
          const scale = (targetW / base.width) * dpr;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          canvas.style.width = "100%"; canvas.style.height = "auto";
          canvas.style.display = "block"; canvas.style.marginBottom = "8px";
          canvas.style.background = "#fff"; canvas.style.borderRadius = "4px";
          const ctx = canvas.getContext("2d");
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          wrap.appendChild(canvas);
        }
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, [file.blob, isPdf]);

  // キーボード: Escで閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const canZoom = isImage || isPdf;
  const clampZoom = (z: number) => Math.min(6, Math.max(0.5, z));
  const onWheel = (e: React.WheelEvent) => {
    if (!canZoom || !e.ctrlKey) return; // ctrl+ホイールでズーム (通常スクロールは温存)
    e.preventDefault();
    setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 0.9)));
  };

  function download() {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement("a");
    a.href = url; a.download = file.title || "figure";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/92" role="dialog" aria-modal="true">
      {/* ヘッダ */}
      <div className="flex items-center gap-2 px-3 py-2 text-white bg-black/60 shrink-0">
        <span className="truncate text-sm font-medium flex-1">{file.title}</span>
        {canZoom && (
          <>
            <button title={t("縮小")} className="p-2 rounded hover:bg-white/10" onClick={() => setZoom((z) => clampZoom(z / 1.25))}><ZoomOut className="h-5 w-5" /></button>
            <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button title={t("拡大")} className="p-2 rounded hover:bg-white/10" onClick={() => setZoom((z) => clampZoom(z * 1.25))}><ZoomIn className="h-5 w-5" /></button>
            <button title={t("全体表示")} className="p-2 rounded hover:bg-white/10" onClick={() => setZoom(1)}><Maximize className="h-5 w-5" /></button>
          </>
        )}
        <button title={t("ダウンロード")} className="p-2 rounded hover:bg-white/10" onClick={download}><Download className="h-5 w-5" /></button>
        <button title={t("閉じる")} className="p-2 rounded hover:bg-white/10" onClick={onClose}><X className="h-5 w-5" /></button>
      </div>

      {/* 本体 (スクロール=パン) */}
      <div className="flex-1 overflow-auto overscroll-contain" onWheel={onWheel} style={{ WebkitOverflowScrolling: "touch" }}>
        {status === "loading" && (
          <div className="h-full flex items-center justify-center text-white/80"><Loader2 className="h-6 w-6 animate-spin mr-2" /> {t("読み込み中…")}</div>
        )}
        {status === "error" && (
          <div className="h-full flex items-center justify-center text-white/80 text-sm px-6 text-center">{t("この図面を表示できませんでした。ダウンロードしてご確認ください。")}</div>
        )}

        {isImage && imgSrc && (
          <div className="min-h-full flex items-start justify-center p-2">
            <img
              src={imgSrc} alt={file.title}
              onError={() => setStatus("error")}
              style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none", height: "auto", objectFit: "contain", touchAction: "pinch-zoom" }}
              className="select-none"
              draggable={false}
            />
          </div>
        )}

        {isPdf && (
          <div className="mx-auto p-2" style={{ width: `${Math.min(100, 100)}%`, maxWidth: 1400 }}>
            <div ref={canvasWrapRef} style={{ width: `${zoom * 100}%`, margin: "0 auto", transformOrigin: "top center" }} />
            {status === "ready" && pageCount > 0 && (
              <div className="text-center text-white/60 text-xs py-2">{pageCount}{t("ページ")}</div>
            )}
          </div>
        )}

        {!isImage && !isPdf && status !== "loading" && (
          <div className="h-full flex items-center justify-center text-white/80 text-sm px-6 text-center">
            {t("このファイル形式はアプリ内で表示できません。ダウンロードしてご確認ください。")}
          </div>
        )}
      </div>
    </div>
  );
}
