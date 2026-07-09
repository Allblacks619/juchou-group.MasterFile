import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Camera, X } from "lucide-react";
import { STATUS } from "@/lib/genbaMap";
import { fileToResizedImage } from "@/lib/genbaUpload";
import type { GenbaTaskDto } from "@/lib/genbaTask";
import { useGenbaLang } from "@/lib/genbaLang";

export type SetStatusPayload = {
  status: "todo" | "progress" | "done" | "issue";
  percent?: number | null;
  issueText?: string;
  photos?: { base64: string; mimeType: string; fileName: string }[];
};

/** 進捗を登録 (プロトタイプ StatusModal 移植): 未着手/途中(25/50/75)/完了/問題あり+写真 */
export default function StatusModal({
  task, open, onOpenChange, onSubmit,
}: {
  task: GenbaTaskDto;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (p: SetStatusPayload) => Promise<void>;
}) {
  const { disp } = useGenbaLang();
  const [progressOpen, setProgressOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(task.status === "issue");
  const [issueText, setIssueText] = useState(task.issueText || "");
  const [photos, setPhotos] = useState<{ preview: string; base64: string; mimeType: string; fileName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  async function submit(p: SetStatusPayload) {
    setBusy(true);
    try {
      await onSubmit(p);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onPhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    for (const f of files.slice(0, 4 - photos.length)) {
      try {
        const img = await fileToResizedImage(f);
        setPhotos((p) => [...p, { preview: `data:${img.mimeType};base64,${img.base64}`, base64: img.base64, mimeType: img.mimeType, fileName: img.fileName }]);
      } catch { toast.error("写真の読み込みに失敗しました"); }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>進捗を登録: {disp(task.name, task.romaji)}</DialogTitle>
        </DialogHeader>

        {progressOpen ? (
          <div className="space-y-3">
            <div className="text-sm font-bold text-[#0369a1]">▶ 進捗はどれくらいですか？</div>
            <div className="grid grid-cols-3 gap-2">
              {[25, 50, 75].map((pct) => (
                <Button key={pct} disabled={busy} onClick={() => submit({ status: "progress", percent: pct })}
                  className="h-16 text-lg" style={{ background: STATUS.progress.color }}>
                  {pct}%
                </Button>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setProgressOpen(false)}>◀ 戻る</Button>
          </div>
        ) : !issueOpen ? (
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy} onClick={() => submit({ status: "todo" })} className="h-20 flex-col" style={{ background: STATUS.todo.color }}>
              <span className="text-2xl">{STATUS.todo.icon}</span>未着手
            </Button>
            <Button disabled={busy} onClick={() => setProgressOpen(true)} className="h-20 flex-col" style={{ background: STATUS.progress.color }}>
              <span className="text-2xl">{STATUS.progress.icon}</span>途中{task.status === "progress" ? `(${task.percent ?? 50}%)` : ""} ▸
            </Button>
            <Button disabled={busy} onClick={() => submit({ status: "done" })} className="h-20 flex-col" style={{ background: STATUS.done.color }}>
              <span className="text-2xl">{STATUS.done.icon}</span>完了
            </Button>
            <Button disabled={busy} onClick={() => setIssueOpen(true)} className="h-20 flex-col" style={{ background: STATUS.issue.color }}>
              <span className="text-2xl">⚠</span>問題あり ▸
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm font-bold text-[#b91c1c]">⚠ 問題の内容を報告</div>
            <textarea
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              placeholder="例: スリーブ位置が図面と相違。監督に確認が必要。"
              rows={4}
              className="w-full rounded-md border border-border bg-background p-2 text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative">
                  <img src={p.preview} alt={`添付${i + 1}`} className="h-16 w-16 rounded object-cover border border-border" />
                  <button className="absolute -top-1 -right-1 rounded-full bg-black/70 text-white w-4 h-4 flex items-center justify-center text-[10px]"
                    onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <button className="h-16 w-16 rounded border border-dashed border-border flex flex-col items-center justify-center text-xs text-muted-foreground"
                  onClick={() => photoRef.current?.click()}>
                  <Camera className="h-4 w-4 mb-0.5" />写真
                </button>
              )}
              <input ref={photoRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onPhotoChosen} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setIssueOpen(false)}>◀ 戻る</Button>
              <Button className="flex-[2]" disabled={busy} style={{ background: STATUS.issue.color }}
                onClick={() => submit({ status: "issue", issueText: issueText.trim(), photos: photos.map(({ base64, mimeType, fileName }) => ({ base64, mimeType, fileName })) })}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}⚠ 問題を報告する
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
