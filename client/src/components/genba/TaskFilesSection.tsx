import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Paperclip, Upload, Link2, Trash2, ExternalLink, FileText, ImageIcon, Loader2, Download, CheckCircle2, CloudOff } from "lucide-react";
import { fileToTaskUpload } from "@/lib/genbaUpload";
import { saveFileOffline, getOfflineFile, offlineFileIds, listOfflineFilesByTask, removeOfflineFile } from "@/lib/genbaFileCache";

type FileRow = {
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
 * 参考ファイル (図面・資料) のセクション。作業(taskId) または エリア(zoneId) に紐づける。
 * エリアに貼れば配下の全作業から参照でき (readOnly で継承表示)、作業員はワンタッチで開ける。
 * リンク貼付 + 画像/PDFアップロード + 一覧/表示/削除 + オフライン保存 (端末IndexedDB)。
 * 閲覧は誰でも (ゲストリンク含む)、追加・削除は canEdit(リーダー以上) かつ !readOnly のときのみ。
 */
export default function TaskFilesSection({
  taskId, zoneId, canEdit, readOnly, label,
}: {
  taskId?: string;
  zoneId?: string;
  canEdit: boolean;
  /** true = 閲覧・オフライン保存のみ (追加/削除UIを出さない)。エリア図面の継承表示に使う */
  readOnly?: boolean;
  label?: string;
}) {
  const isZone = !!zoneId;
  const ownerId = (zoneId ?? taskId) as string;
  const showEdit = canEdit && !readOnly;
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [offlineList, setOfflineList] = useState<FileRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // 作業/エリアどちらか片方のみ有効化 (rules-of-hooks のため両方呼ぶ)
  const taskQ = trpc.genba.tasks.files.list.useQuery({ taskId: taskId ?? "" }, { enabled: !isZone && !!taskId, retry: false });
  const zoneQ = trpc.genba.zones.files.list.useQuery({ zoneId: zoneId ?? "" }, { enabled: isZone && !!zoneId, retry: false });
  const files = (isZone ? zoneQ.data : taskQ.data) as FileRow[] | undefined;
  const isLoading = isZone ? zoneQ.isLoading : taskQ.isLoading;

  const invalidate = () => {
    if (isZone) utils.genba.zones.files.list.invalidate({ zoneId });
    else { utils.genba.tasks.files.list.invalidate({ taskId }); utils.genba.tasks.listByZone.invalidate(); }
  };

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const refreshSaved = async () => {
    setSavedIds(await offlineFileIds(ownerId));
    const cached = await listOfflineFilesByTask(ownerId);
    setOfflineList(cached.map((m) => ({ id: m.id, kind: "upload", title: m.title, fileName: m.fileName, mimeType: m.mimeType, sizeBytes: m.sizeBytes, url: null })));
  };
  useEffect(() => { void refreshSaved(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ownerId]);

  const onAddSuccess = () => { invalidate(); setShowLink(false); setLinkUrl(""); setLinkTitle(""); toast.success("リンクを追加しました"); };
  const onErr = (e: any) => toast.error(e.message);
  const taskAdd = trpc.genba.tasks.files.addLink.useMutation({ onSuccess: onAddSuccess, onError: onErr });
  const zoneAdd = trpc.genba.zones.files.addLink.useMutation({ onSuccess: onAddSuccess, onError: onErr });
  const taskUp = trpc.genba.tasks.files.upload.useMutation({ onSuccess: () => { invalidate(); toast.success("ファイルを追加しました"); }, onError: onErr });
  const zoneUp = trpc.genba.zones.files.upload.useMutation({ onSuccess: () => { invalidate(); toast.success("ファイルを追加しました"); }, onError: onErr });
  const onRemove = async (_r: any, v: { id: string }) => { invalidate(); await removeOfflineFile(v.id).catch(() => {}); await refreshSaved(); toast.success("ファイルを削除しました"); };
  const taskRm = trpc.genba.tasks.files.remove.useMutation({ onSuccess: onRemove, onError: onErr });
  const zoneRm = trpc.genba.zones.files.remove.useMutation({ onSuccess: onRemove, onError: onErr });

  const addPending = isZone ? zoneAdd.isPending : taskAdd.isPending;
  function doAddLink() {
    const url = linkUrl.trim(); if (!url) return;
    const title = linkTitle.trim() || undefined;
    if (isZone) zoneAdd.mutate({ zoneId: zoneId!, url, title });
    else taskAdd.mutate({ taskId: taskId!, url, title });
  }
  function doRemove(id: string) { if (isZone) zoneRm.mutate({ id }); else taskRm.mutate({ id }); }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!chosen.length) return;
    setBusy(true);
    try {
      for (const file of chosen) {
        const p = await fileToTaskUpload(file);
        if (isZone) await zoneUp.mutateAsync({ zoneId: zoneId!, base64: p.base64, mimeType: p.mimeType, fileName: p.fileName });
        else await taskUp.mutateAsync({ taskId: taskId!, base64: p.base64, mimeType: p.mimeType, fileName: p.fileName });
      }
    } catch (err: any) {
      toast.error(err?.message || "アップロードに失敗しました");
    } finally { setBusy(false); }
  }

  async function saveOffline(f: FileRow) {
    setSavingId(f.id);
    try {
      const bytes = await (isZone ? utils.genba.zones.files.getBytes.fetch({ id: f.id }) : utils.genba.tasks.files.getBytes.fetch({ id: f.id }));
      await saveFileOffline({ id: f.id, taskId: ownerId, title: f.title, fileName: f.fileName }, bytes);
      await refreshSaved();
      toast.success("オフラインに保存しました");
    } catch (err: any) {
      toast.error(err?.message || "保存に失敗しました");
    } finally { setSavingId(null); }
  }

  async function openFile(f: FileRow) {
    if (savedIds.has(f.id)) {
      const rec = await getOfflineFile(f.id);
      if (rec) { openBlob(rec.blob); return; }
    }
    if (f.url) { window.open(f.url, "_blank", "noopener,noreferrer"); return; }
    toast.error(online ? "このファイルは表示できません" : "オフラインでは端末に保存したファイルのみ開けます");
  }

  const serverList = (files || []) as FileRow[];
  const list: FileRow[] = serverList.length > 0 || online ? serverList : offlineList;

  // 継承表示(readOnly)で1件も無ければ何も描かない (作業詳細をすっきり保つ)
  if (readOnly && !isLoading && list.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> {label || "作業ファイル（図面・資料）"}</span>
        {showEdit && (
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

      {showEdit && showLink && (
        <div className="rounded-lg border border-border p-2 space-y-1.5">
          <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="表示名（任意・例: 強電作業 図面）" className="h-8 text-sm" />
          <div className="flex gap-1.5">
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/..." className="h-8 text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") doAddLink(); }} />
            <Button size="sm" className="h-8" disabled={!linkUrl.trim() || addPending} onClick={doAddLink}>追加</Button>
          </div>
        </div>
      )}

      {isLoading && online ? (
        <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">まだファイルがありません。{showEdit ? "図面や資料をアップロード、または共有リンクを貼れます。" : ""}</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border/60">
          {list.map((f) => {
            const isImg = (f.mimeType || "").startsWith("image/");
            const rowLabel = f.title || f.fileName || f.url || "ファイル";
            const saved = savedIds.has(f.id);
            const canSaveOffline = f.kind === "upload";
            return (
              <div key={f.id} className="flex items-center gap-2 p-2">
                <span className="shrink-0 text-muted-foreground">
                  {f.kind === "link" ? <ExternalLink className="h-4 w-4" /> : isImg ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{rowLabel}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {f.kind === "link" ? "共有リンク" : `アップロード${f.sizeBytes ? " · " + fmtSize(f.sizeBytes) : ""}`}
                    {saved && <span className="inline-flex items-center gap-0.5 text-[#03AF7A]"><CheckCircle2 className="h-3 w-3" />保存済み</span>}
                  </div>
                </div>
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
                {showEdit && online && (
                  <button title="削除" className="shrink-0 text-muted-foreground hover:text-destructive p-1"
                    onClick={() => { if (window.confirm(`「${rowLabel}」を削除しますか？`)) doRemove(f.id); }}>
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
