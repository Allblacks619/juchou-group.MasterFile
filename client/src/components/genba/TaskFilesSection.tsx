import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Paperclip, Upload, Link2, Trash2, ExternalLink, FileText, ImageIcon, Loader2 } from "lucide-react";
import { fileToTaskUpload } from "@/lib/genbaUpload";

type TaskFile = {
  id: string; kind: "link" | "upload"; title: string | null; fileName: string | null;
  mimeType: string | null; sizeBytes: number | null; url: string | null; createdAt: string | Date;
};

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

/**
 * 作業ごとの参考ファイル (図面・資料)。リンク貼付 + 画像/PDFアップロード + 一覧/表示/削除。
 * 閲覧は誰でも (ゲストリンク含む)、追加・削除は canEdit(リーダー以上) のみ。サブ作業も同じ仕組み。
 */
export default function TaskFilesSection({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");

  const { data: files, isLoading } = trpc.genba.tasks.files.list.useQuery({ taskId }, { retry: false });
  const invalidate = () => { utils.genba.tasks.files.list.invalidate({ taskId }); utils.genba.tasks.listByZone.invalidate(); };

  const addLink = trpc.genba.tasks.files.addLink.useMutation({
    onSuccess: () => { invalidate(); setShowLink(false); setLinkUrl(""); setLinkTitle(""); toast.success("リンクを追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const upload = trpc.genba.tasks.files.upload.useMutation({
    onSuccess: () => { invalidate(); toast.success("ファイルを追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.genba.tasks.files.remove.useMutation({
    onSuccess: () => { invalidate(); toast.success("ファイルを削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!chosen.length) return;
    setBusy(true);
    try {
      for (const file of chosen) {
        const payload = await fileToTaskUpload(file);
        await upload.mutateAsync({ taskId, base64: payload.base64, mimeType: payload.mimeType, fileName: payload.fileName });
      }
    } catch (err: any) {
      toast.error(err?.message || "アップロードに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const list = (files || []) as TaskFile[];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> 作業ファイル（図面・資料）</span>
        {canEdit && (
          <div className="ml-auto flex gap-1.5">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFileChosen} />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}アップロード
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowLink((v) => !v)}>
              <Link2 className="h-3.5 w-3.5 mr-1" />リンク
            </Button>
          </div>
        )}
      </div>

      {canEdit && showLink && (
        <div className="rounded-lg border border-border p-2 space-y-1.5">
          <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="表示名（任意・例: 強電作業 図面）" className="h-8 text-sm" />
          <div className="flex gap-1.5">
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/..." className="h-8 text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter" && linkUrl.trim()) addLink.mutate({ taskId, url: linkUrl.trim(), title: linkTitle.trim() || undefined }); }} />
            <Button size="sm" className="h-8" disabled={!linkUrl.trim() || addLink.isPending}
              onClick={() => addLink.mutate({ taskId, url: linkUrl.trim(), title: linkTitle.trim() || undefined })}>追加</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">まだファイルがありません。{canEdit ? "図面や資料をアップロード、または共有リンクを貼れます。" : ""}</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border/60">
          {list.map((f) => {
            const isImg = (f.mimeType || "").startsWith("image/");
            const label = f.title || f.fileName || f.url || "ファイル";
            return (
              <div key={f.id} className="flex items-center gap-2 p-2">
                <span className="shrink-0 text-muted-foreground">
                  {f.kind === "link" ? <ExternalLink className="h-4 w-4" /> : isImg ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {f.kind === "link" ? "共有リンク" : `アップロード${f.sizeBytes ? " · " + fmtSize(f.sizeBytes) : ""}`}
                  </div>
                </div>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 text-xs font-semibold text-[#005AFF] px-2 py-1 rounded hover:bg-muted">開く</a>
                ) : <span className="text-[10px] text-muted-foreground">表示できません</span>}
                {canEdit && (
                  <button title="削除" className="shrink-0 text-muted-foreground hover:text-destructive p-1"
                    onClick={() => { if (window.confirm(`「${label}」を削除しますか？`)) remove.mutate({ id: f.id }); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
