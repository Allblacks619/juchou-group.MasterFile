import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Paperclip, Upload, Link2, Trash2, ExternalLink, FileText, ImageIcon, Loader2, Download, CheckCircle2, CloudOff } from "lucide-react";
import { fileToTaskUpload } from "@/lib/genbaUpload";
import { saveFileOffline, getOfflineFile, offlineFileIds, listOfflineFilesByTask, removeOfflineFile } from "@/lib/genbaFileCache";

type TaskFile = {
  id: string; kind: "link" | "upload"; title: string | null; fileName: string | null;
  mimeType: string | null; sizeBytes: number | null; url: string | null;
};

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

/** Blob を新規タブで開く (画像/PDFの閲覧)。URLは少し後に解放する */
function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * 作業ごとの参考ファイル (図面・資料)。リンク貼付 + 画像/PDFアップロード + 一覧/表示/削除。
 * 閲覧は誰でも (ゲストリンク含む)、追加・削除は canEdit(リーダー以上) のみ。サブ作業も同じ仕組み。
 * オフライン保存: アップロード実体を端末(IndexedDB)に保存し、圏外でも「開く」で閲覧できる。
 */
export default function TaskFilesSection({ taskId, canEdit }: { taskId: string; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [offlineList, setOfflineList] = useState<TaskFile[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: files, isLoading } = trpc.genba.tasks.files.list.useQuery({ taskId }, { retry: false });
  const invalidate = () => { utils.genba.tasks.files.list.invalidate({ taskId }); utils.genba.tasks.listByZone.invalidate(); };

  // オンライン状態の監視 + 端末保存済み一覧の読み込み
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const refreshSaved = async () => {
    setSavedIds(await offlineFileIds(taskId));
    const cached = await listOfflineFilesByTask(taskId);
    setOfflineList(cached.map((m) => ({ id: m.id, kind: "upload", title: m.title, fileName: m.fileName, mimeType: m.mimeType, sizeBytes: m.sizeBytes, url: null })));
  };
  useEffect(() => { void refreshSaved(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [taskId]);

  const addLink = trpc.genba.tasks.files.addLink.useMutation({
    onSuccess: () => { invalidate(); setShowLink(false); setLinkUrl(""); setLinkTitle(""); toast.success("リンクを追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const upload = trpc.genba.tasks.files.upload.useMutation({
    onSuccess: () => { invalidate(); toast.success("ファイルを追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.genba.tasks.files.remove.useMutation({
    onSuccess: async (_r, v) => { invalidate(); await removeOfflineFile(v.id).catch(() => {}); await refreshSaved(); toast.success("ファイルを削除しました"); },
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

  async function saveOffline(f: TaskFile) {
    setSavingId(f.id);
    try {
      const bytes = await utils.genba.tasks.files.getBytes.fetch({ id: f.id });
      await saveFileOffline({ id: f.id, taskId, title: f.title, fileName: f.fileName }, bytes);
      await refreshSaved();
      toast.success("オフラインに保存しました");
    } catch (err: any) {
      toast.error(err?.message || "保存に失敗しました");
    } finally {
      setSavingId(null);
    }
  }

  async function openFile(f: TaskFile) {
    if (savedIds.has(f.id)) {
      const rec = await getOfflineFile(f.id);
      if (rec) { openBlob(rec.blob); return; }
    }
    if (f.url) { window.open(f.url, "_blank", "noopener,noreferrer"); return; }
    toast.error(online ? "このファイルは表示できません" : "オフラインでは端末に保存したファイルのみ開けます");
  }

  const serverList = (files || []) as TaskFile[];
  // オフラインでサーバ一覧が取れない時は端末保存済みを表示
  const list: TaskFile[] = serverList.length > 0 || online ? serverList : offlineList;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> 作業ファイル（図面・資料）</span>
        {canEdit && (
          <div className="ml-auto flex gap-1.5">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFileChosen} />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !online} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}アップロード
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!online} onClick={() => setShowLink((v) => !v)}>
              <Link2 className="h-3.5 w-3.5 mr-1" />リンク
            </Button>
          </div>
        )}
      </div>

      {!online && (
        <div className="flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1" style={{ background: "rgba(246,170,0,0.16)", color: "#8a6d00" }}>
          <CloudOff className="h-3.5 w-3.5" /> オフライン: 端末に保存したファイルのみ開けます
        </div>
      )}

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

      {isLoading && online ? (
        <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">まだファイルがありません。{canEdit ? "図面や資料をアップロード、または共有リンクを貼れます。" : ""}</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border/60">
          {list.map((f) => {
            const isImg = (f.mimeType || "").startsWith("image/");
            const label = f.title || f.fileName || f.url || "ファイル";
            const saved = savedIds.has(f.id);
            const canSaveOffline = f.kind === "upload";
            return (
              <div key={f.id} className="flex items-center gap-2 p-2">
                <span className="shrink-0 text-muted-foreground">
                  {f.kind === "link" ? <ExternalLink className="h-4 w-4" /> : isImg ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{label}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {f.kind === "link" ? "共有リンク" : `アップロード${f.sizeBytes ? " · " + fmtSize(f.sizeBytes) : ""}`}
                    {saved && <span className="inline-flex items-center gap-0.5 text-[#03AF7A]"><CheckCircle2 className="h-3 w-3" />保存済み</span>}
                  </div>
                </div>
                {/* オフライン保存 (アップロードのみ) */}
                {canSaveOffline && (
                  saved ? (
                    <button title="端末保存を解除" className="shrink-0 text-[#03AF7A] hover:text-muted-foreground p-1"
                      onClick={async () => { await removeOfflineFile(f.id); await refreshSaved(); toast.success("端末保存を解除しました"); }}>
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <button title="オフライン用に端末へ保存" className="shrink-0 text-muted-foreground hover:text-foreground p-1 disabled:opacity-40"
                      disabled={savingId === f.id || !online} onClick={() => saveOffline(f)}>
                      {savingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </button>
                  )
                )}
                <button onClick={() => openFile(f)}
                  className="shrink-0 text-xs font-semibold text-[#005AFF] px-2 py-1 rounded hover:bg-muted disabled:opacity-40"
                  disabled={!saved && !f.url}>開く</button>
                {canEdit && online && (
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
