import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Upload, Trash2, Link2, ImageOff } from "lucide-react";
import { fileToResizedImage, pdfToImages, type GenbaUploadImage } from "@/lib/genbaUpload";

type FloorWorkspaceProps = {
  siteId: string;
  siteName: string;
  driveUrl: string | null;
  canEdit: boolean;
  onBack: () => void;
};

/**
 * 現場ビジョン M2-A: 図面(フロア)ワークスペース。
 * 図面のアップロード(PDF/画像・クライアント縮小)・一覧・表示・削除。
 * エリア(ゾーン)オーバーレイは M2-B で図面SVGに追加する。
 */
export default function FloorWorkspace({ siteId, siteName, driveUrl, canEdit, onBack }: FloorWorkspaceProps) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: floors, isLoading } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });

  const createFloor = trpc.genba.floors.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const removeFloor = trpc.genba.floors.remove.useMutation({
    onSuccess: () => {
      utils.genba.floors.list.invalidate({ siteId });
      toast.success("図面を削除しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const list = floors || [];
  const activeFloor = list.find((f) => f.id === activeFloorId) || list[0] || null;

  async function uploadOne(img: GenbaUploadImage, name: string) {
    await createFloor.mutateAsync({
      siteId,
      name,
      base64: img.base64,
      mimeType: img.mimeType,
      fileName: img.fileName,
      w: img.w,
      h: img.h,
    });
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    try {
      if (file.type === "application/pdf") {
        setBusy("PDFを読み込み中…");
        const { images, total } = await pdfToImages(file, (i, n) => setBusy(`PDF変換中 ${i}/${n}ページ`));
        for (let i = 0; i < images.length; i++) {
          setBusy(`アップロード中 ${i + 1}/${images.length}`);
          await uploadOne(images[i], images.length > 1 ? `${images[i].fileName.replace(/\.jpg$/, "")}` : file.name.replace(/\.pdf$/i, ""));
        }
        toast.success(total > images.length ? `${images.length}ページを取り込みました (${total}ページ中、上限12)` : `PDFから${images.length}フロアを取り込みました`);
      } else if (file.type.startsWith("image/")) {
        setBusy("図面を処理中…");
        const img = await fileToResizedImage(file);
        await uploadOne(img, file.name.replace(/\.[^.]+$/, ""));
        toast.success("図面を追加しました");
      } else {
        toast.error("画像(PNG/JPG)またはPDFを選択してください");
        return;
      }
      await utils.genba.floors.list.invalidate({ siteId });
    } catch (err: any) {
      toast.error(err?.message || "図面の読み込みに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          現場一覧
        </Button>
        <h2 className="text-lg font-bold truncate">{siteName}</h2>
        {driveUrl && (
          <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-gold hover:underline">
            <Link2 className="h-3.5 w-3.5" />
            図面(Drive)
          </a>
        )}
        {canEdit && (
          <div className="ml-auto">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChosen} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {busy || "図面を追加"}
            </Button>
          </div>
        )}
      </div>

      {/* フロアバー */}
      {list.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {list.map((f) => {
            const active = f.id === (activeFloor?.id ?? "");
            return (
              <button
                key={f.id}
                onClick={() => setActiveFloorId(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                  active ? "bg-gold/10 text-gold border-gold/40" : "text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 図面表示 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !activeFloor ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <ImageOff className="h-8 w-8" />
          <p>まだ図面がありません。{canEdit ? "「図面を追加」からPDF/画像をアップロードしてください。" : "管理者またはリーダーが図面を追加すると表示されます。"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
            {activeFloor.imageUrl ? (
              (() => {
                const fw = activeFloor.w ?? 1200;
                const fh = activeFloor.h ?? 850;
                return (
                  <svg viewBox={`0 0 ${fw} ${fh}`} className="w-full h-auto block">
                    <image href={activeFloor.imageUrl} x="0" y="0" width={fw} height={fh} />
                  </svg>
                );
              })()
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <ImageOff className="h-6 w-6 mr-2" /> 画像を読み込めませんでした
              </div>
            )}
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(`「${activeFloor.name}」を削除しますか？`)) {
                    removeFloor.mutate({ id: activeFloor.id });
                    setActiveFloorId(null);
                  }
                }}
                disabled={removeFloor.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                このフロアを削除
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
