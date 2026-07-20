import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, X, Loader2, Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import { fileToResizedImage } from "@/lib/genbaUpload";

export type MapPin = {
  id: string; floorId: string; zoneId: string | null; x: number; y: number;
  kind: string; text: string | null; status: string;
  byUserId: number | null; byUserName: string | null; photoUrls: string[];
  createdAt: string | Date;
};

type Photo = { base64: string; mimeType: string; fileName: string };

/** 図面の位置ピン: 新規問題報告フォーム / 既存報告の詳細(写真+コメント+解決/削除)。 */
export default function MapReportSheet(props:
  | { kind: "new"; floorId: string; x: number; y: number; zoneId: string | null; onClose: () => void; onSaved: () => void }
  | { kind: "detail"; pin: MapPin; canEdit: boolean; onClose: () => void; onChanged: () => void }
) {
  if (props.kind === "new") return <NewReport {...props} />;
  return <PinDetail {...props} />;
}

function NewReport({ floorId, x, y, zoneId, onClose, onSaved }: { floorId: string; x: number; y: number; zoneId: string | null; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = trpc.genba.floors.pins.create.useMutation({
    onSuccess: () => { toast.success("問題を報告しました"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  async function onPhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!chosen.length) return;
    setBusy(true);
    try {
      const next: Photo[] = [];
      for (const f of chosen.slice(0, 4 - photos.length)) {
        const img = await fileToResizedImage(f);
        next.push({ base64: img.base64, mimeType: img.mimeType, fileName: img.fileName });
      }
      setPhotos((p) => [...p, ...next].slice(0, 4));
    } catch (err: any) {
      toast.error(err?.message || "写真の処理に失敗しました");
    } finally { setBusy(false); }
  }

  function submit() {
    if (!text.trim() && photos.length === 0) { toast.error("コメントか写真を入れてください"); return; }
    create.mutate({ floorId, x, y, zoneId: zoneId || undefined, text: text.trim() || undefined, photos: photos.length ? photos : undefined });
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-sm">⚠ この位置の問題を報告</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder="例: この柱まわりのスリーブ位置が図面と相違"
            className="w-full rounded-md border border-border bg-background p-2 text-sm" />

          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPhotoChosen} />
            <Button type="button" variant="outline" size="sm" disabled={busy || photos.length >= 4} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Camera className="h-4 w-4 mr-1" />}
              写真を追加（{photos.length}/4）
            </Button>
            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={`data:${p.mimeType};base64,${p.base64}`} alt={`写真${i + 1}`} className="h-16 w-16 rounded object-cover border border-border" />
                    <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-black/70 text-white rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" className="flex-1" onClick={onClose}>キャンセル</Button>
            <Button size="sm" className="flex-1" disabled={create.isPending} onClick={submit}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}報告する
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PinDetail({ pin, canEdit, onClose, onChanged }: { pin: MapPin; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const resolved = pin.status === "resolved";
  const resolve = trpc.genba.floors.pins.resolve.useMutation({
    onSuccess: () => { toast.success(resolved ? "未解決に戻しました" : "解決済みにしました"); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.genba.floors.pins.remove.useMutation({
    onSuccess: () => { toast.success("報告を削除しました"); onChanged(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            {resolved ? <CheckCircle2 className="h-4 w-4 text-[#03AF7A]" /> : <span className="text-[#FF4B00]">⚠</span>}
            図面の問題報告
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${resolved ? "bg-[#03AF7A]/15 text-[#03AF7A]" : "bg-[#FF4B00]/15 text-[#FF4B00]"}`}>
              {resolved ? "解決済み" : "未解決"}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm whitespace-pre-wrap">{pin.text || "(コメントなし)"}</div>
          {pin.photoUrls.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {pin.photoUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                  <img src={u} alt={`写真${i + 1}`} className="h-24 w-24 rounded object-cover border border-border" />
                </a>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">報告者: {pin.byUserName || "不明"}</div>

          {canEdit && (
            <div className="flex gap-2 pt-1 border-t border-border">
              <Button variant="outline" size="sm" className="flex-1" disabled={resolve.isPending}
                onClick={() => resolve.mutate({ id: pin.id, resolved: !resolved })}>
                {resolved ? <RotateCcw className="h-4 w-4 mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                {resolved ? "未解決に戻す" : "解決済みにする"}
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={remove.isPending}
                onClick={() => { if (window.confirm("この報告を削除しますか？")) remove.mutate({ id: pin.id }); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
