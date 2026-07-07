import { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileDown, ExternalLink, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * 生成したPDFを見せるための共通ビューア。
 * - アプリ内でプレビュー（iframe）
 * - 「ダウンロード」「新しいタブで開く」「閉じる」ボタンを必ず表示
 * モバイルでは iframe が表示できないことがあるため、その場合もボタンで開ける。
 */
function PdfViewerDialog({
  url,
  fileName,
  title,
  onClose,
}: {
  url: string;
  fileName?: string;
  title?: string;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const name = fileName || "document.pdf";

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      // 署名付きURL(R2/S3)を blob で取得して確実にダウンロードさせる。
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    } catch {
      // CORS等で取得できない場合は新しいタブで開く（ブラウザの保存機能を使ってもらう）。
      window.open(url, "_blank", "noopener,noreferrer");
      toast.info("ダウンロードできない場合は、開いたPDFから保存してください。");
    } finally {
      setDownloading(false);
    }
  }, [url, name]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-[96vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-base truncate pr-8">{title || "PDF プレビュー"}</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40">
          <iframe
            src={url}
            title={title || "PDF"}
            className="w-full h-[62vh] bg-white"
          />
          <p className="text-[11px] text-muted-foreground text-center py-2 px-4">
            プレビューが表示されない場合は「新しいタブで開く」または「ダウンロード」をご利用ください。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 border-t border-border bg-background">
          <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
            <ExternalLink className="h-4 w-4 mr-1.5" />新しいタブで開く
          </Button>
          <Button size="sm" disabled={downloading} onClick={handleDownload} className="bg-gold text-background hover:bg-gold-dim">
            {downloading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
            ダウンロード
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4 mr-1.5" />閉じる
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * PDFビューアを使うためのフック。
 *   const pdf = usePdfViewer();
 *   pdf.open(url, "ファイル名.pdf", "タイトル");
 *   ...
 *   {pdf.dialog}
 */
export function usePdfViewer() {
  const [state, setState] = useState<{ url: string; fileName?: string; title?: string } | null>(null);
  const open = useCallback((url: string, fileName?: string, title?: string) => {
    if (!url) return;
    setState({ url, fileName, title });
  }, []);
  const close = useCallback(() => setState(null), []);
  const dialog = state ? (
    <PdfViewerDialog url={state.url} fileName={state.fileName} title={state.title} onClose={close} />
  ) : null;
  return { open, close, dialog };
}

export default PdfViewerDialog;
