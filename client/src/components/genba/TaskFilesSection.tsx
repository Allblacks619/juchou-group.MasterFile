import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Paperclip, Upload, Link2, Trash2, ExternalLink, FileText, ImageIcon, Loader2, Download, CheckCircle2, CloudOff } from "lucide-react";
import { fileToTaskUpload } from "@/lib/genbaUpload";
import { useGenbaT } from "@/lib/genbaLang";
import { saveFileOffline, getOfflineFile, allOfflineFileIds, listOfflineFilesByTask, removeOfflineFile, base64ToBlob } from "@/lib/genbaFileCache";
import FigureViewer, { type ViewerFile } from "./FigureViewer";

/** ファイルの適用範囲。作業=この作業だけ / エリア=このエリア全作業共通 / フロア=図面上の全エリア共通 */
type Scope = "task" | "zone" | "floor";

type FileRow = {
  id: string; kind: "link" | "upload"; title: string | null; fileName: string | null;
  mimeType: string | null; sizeBytes: number | null; url: string | null;
  scope?: Scope;
};

const SCOPE_META: Record<Scope, { label: string; short: string; color: string }> = {
  task: { label: "この作業だけ", short: "この作業", color: "#005AFF" },
  zone: { label: "このエリア全体（全作業共通）", short: "エリア共通", color: "#03AF7A" },
  floor: { label: "全エリア共通（この図面の全エリア）", short: "全エリア共通", color: "#F6AA00" },
};

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)}KB` : `${(n / 1024 / 1024).toFixed(1)}MB`);

/**
 * 参考ファイル (図面・資料) のセクション。1つの一覧に「この作業／このエリア／全エリア共通」を統合表示し、
 * 作業員はワンタッチで開ける (どの範囲の図面かはバッジで分かる)。
 * 追加時に適用範囲を選ぶだけ (アップロード or 共有リンク)。範囲ごとに正しいテーブルへ保存する。
 * - taskId を渡すと「この作業」範囲が、zoneId を渡すと「このエリア」「全エリア共通」範囲が使える。
 * - 閲覧は誰でも (ゲストリンク含む)。追加/削除は canEdit(リーダー以上) のときのみ。
 * - アップロード実体はオフライン保存 (端末IndexedDB) でき、圏外でも開ける。
 */
export default function TaskFilesSection({
  taskId, zoneId, canEdit, label,
}: {
  taskId?: string;
  zoneId?: string;
  canEdit: boolean;
  label?: string;
}) {
  const t = useGenbaT();
  const hasTask = !!taskId;
  const hasZone = !!zoneId;
  const ownerCtxId = (taskId ?? zoneId) as string; // オフライン保存のグループキー (この画面の文脈)
  const scopes: Scope[] = [
    ...(hasTask ? (["task"] as Scope[]) : []),
    ...(hasZone ? (["zone", "floor"] as Scope[]) : []),
  ];
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [addScope, setAddScope] = useState<Scope>(scopes[0] ?? "task");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [offlineList, setOfflineList] = useState<FileRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);

  // 3範囲を常に呼ぶ (rules-of-hooks)。使わない範囲は enabled:false で無効化
  const taskQ = trpc.genba.tasks.files.list.useQuery({ taskId: taskId ?? "" }, { enabled: hasTask, retry: false });
  const zoneQ = trpc.genba.zones.files.list.useQuery({ zoneId: zoneId ?? "" }, { enabled: hasZone, retry: false });
  const floorQ = trpc.genba.floors.files.list.useQuery({ zoneId: zoneId ?? "" }, { enabled: hasZone, retry: false });

  const tag = (rows: FileRow[] | undefined, scope: Scope): FileRow[] => (rows || []).map((f) => ({ ...f, scope }));
  const serverList: FileRow[] = [
    ...(hasTask ? tag(taskQ.data as FileRow[] | undefined, "task") : []),
    ...(hasZone ? tag(zoneQ.data as FileRow[] | undefined, "zone") : []),
    ...(hasZone ? tag(floorQ.data as FileRow[] | undefined, "floor") : []),
  ];
  const isLoading = (hasTask && taskQ.isLoading) || (hasZone && (zoneQ.isLoading || floorQ.isLoading));

  const invalidate = (scope: Scope) => {
    if (scope === "task") { utils.genba.tasks.files.list.invalidate({ taskId }); utils.genba.tasks.listByZone.invalidate(); }
    else if (scope === "zone") utils.genba.zones.files.list.invalidate({ zoneId });
    else utils.genba.floors.files.list.invalidate({ zoneId });
  };

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const refreshSaved = async () => {
    setSavedIds(await allOfflineFileIds());
    const cached = await listOfflineFilesByTask(ownerCtxId);
    setOfflineList(cached.map((m) => ({ id: m.id, kind: "upload", title: m.title, fileName: m.fileName, mimeType: m.mimeType, sizeBytes: m.sizeBytes, url: null })));
  };
  useEffect(() => { void refreshSaved(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ownerCtxId]);

  const onAddSuccess = (scope: Scope) => { invalidate(scope); setShowLink(false); setLinkUrl(""); setLinkTitle(""); toast.success(t("リンクを追加しました")); };
  const onErr = (e: any) => toast.error(e.message);
  const taskAdd = trpc.genba.tasks.files.addLink.useMutation({ onSuccess: () => onAddSuccess("task"), onError: onErr });
  const zoneAdd = trpc.genba.zones.files.addLink.useMutation({ onSuccess: () => onAddSuccess("zone"), onError: onErr });
  const floorAdd = trpc.genba.floors.files.addLink.useMutation({ onSuccess: () => onAddSuccess("floor"), onError: onErr });
  const taskUp = trpc.genba.tasks.files.upload.useMutation({ onSuccess: () => { invalidate("task"); toast.success(t("ファイルを追加しました")); }, onError: onErr });
  const zoneUp = trpc.genba.zones.files.upload.useMutation({ onSuccess: () => { invalidate("zone"); toast.success(t("ファイルを追加しました")); }, onError: onErr });
  const floorUp = trpc.genba.floors.files.upload.useMutation({ onSuccess: () => { invalidate("floor"); toast.success(t("ファイルを追加しました")); }, onError: onErr });
  const onRemove = async (scope: Scope, v: { id: string }) => { invalidate(scope); await removeOfflineFile(v.id).catch(() => {}); await refreshSaved(); toast.success(t("ファイルを削除しました")); };
  const taskRm = trpc.genba.tasks.files.remove.useMutation({ onSuccess: (_r, v) => onRemove("task", v), onError: onErr });
  const zoneRm = trpc.genba.zones.files.remove.useMutation({ onSuccess: (_r, v) => onRemove("zone", v), onError: onErr });
  const floorRm = trpc.genba.floors.files.remove.useMutation({ onSuccess: (_r, v) => onRemove("floor", v), onError: onErr });

  // 外部リンクをアプリに取り込む (サーバーがDL→R2保存→アプリ内表示・圏外保存が可能に)
  const [importingId, setImportingId] = useState<string | null>(null);
  const onImportSuccess = (scope: Scope) => { invalidate(scope); setImportingId(null); toast.success(t("アプリに取り込みました（アプリ内で開けます）")); };
  const onImportErr = (e: any) => { setImportingId(null); toast.error(e.message); };
  const taskImport = trpc.genba.tasks.files.importLink.useMutation({ onSuccess: () => onImportSuccess("task"), onError: onImportErr });
  const zoneImport = trpc.genba.zones.files.importLink.useMutation({ onSuccess: () => onImportSuccess("zone"), onError: onImportErr });
  const floorImport = trpc.genba.floors.files.importLink.useMutation({ onSuccess: () => onImportSuccess("floor"), onError: onImportErr });
  function doImport(f: FileRow) {
    setImportingId(f.id);
    if (f.scope === "task") taskImport.mutate({ id: f.id });
    else if (f.scope === "zone") zoneImport.mutate({ id: f.id });
    else floorImport.mutate({ id: f.id });
  }

  const addPending = taskAdd.isPending || zoneAdd.isPending || floorAdd.isPending;
  function doAddLink() {
    const url = linkUrl.trim(); if (!url) return;
    const title = linkTitle.trim() || undefined;
    if (addScope === "task") taskAdd.mutate({ taskId: taskId!, url, title });
    else if (addScope === "zone") zoneAdd.mutate({ zoneId: zoneId!, url, title });
    else floorAdd.mutate({ zoneId: zoneId!, url, title });
  }
  function doRemove(f: FileRow) {
    if (f.scope === "task") taskRm.mutate({ id: f.id });
    else if (f.scope === "zone") zoneRm.mutate({ id: f.id });
    else if (f.scope === "floor") floorRm.mutate({ id: f.id });
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    if (!chosen.length) return;
    const scope = addScope;
    setBusy(true);
    try {
      for (const file of chosen) {
        const p = await fileToTaskUpload(file);
        if (scope === "task") await taskUp.mutateAsync({ taskId: taskId!, base64: p.base64, mimeType: p.mimeType, fileName: p.fileName });
        else if (scope === "zone") await zoneUp.mutateAsync({ zoneId: zoneId!, base64: p.base64, mimeType: p.mimeType, fileName: p.fileName });
        else await floorUp.mutateAsync({ zoneId: zoneId!, base64: p.base64, mimeType: p.mimeType, fileName: p.fileName });
      }
    } catch (err: any) {
      toast.error(err?.message || t("アップロードに失敗しました"));
    } finally { setBusy(false); }
  }

  async function saveOffline(f: FileRow) {
    setSavingId(f.id);
    try {
      const fetcher = f.scope === "task" ? utils.genba.tasks.files.getBytes
        : f.scope === "floor" ? utils.genba.floors.files.getBytes
        : utils.genba.zones.files.getBytes;
      const bytes = await fetcher.fetch({ id: f.id });
      await saveFileOffline({ id: f.id, taskId: ownerCtxId, title: f.title, fileName: f.fileName }, bytes);
      await refreshSaved();
      toast.success(t("オフラインに保存しました"));
    } catch (err: any) {
      toast.error(err?.message || t("保存に失敗しました"));
    } finally { setSavingId(null); }
  }

  async function openFile(f: FileRow) {
    // 外部共有リンク(Drive等・埋め込み不可)は従来どおり外部で開く
    if (f.kind === "link") {
      if (f.url) window.open(f.url, "_blank", "noopener,noreferrer");
      else toast.error(t("リンクが見つかりません"));
      return;
    }
    // アップロード実体: オフライン保存があればそれ、無ければサーバー経由で取得(CORS回避)してアプリ内で表示
    setOpeningId(f.id);
    try {
      let blob: Blob | null = null;
      let mimeType = f.mimeType;
      if (savedIds.has(f.id)) {
        const rec = await getOfflineFile(f.id);
        if (rec) { blob = rec.blob; mimeType = rec.mimeType || mimeType; }
      }
      if (!blob) {
        if (!online) { toast.error(t("オフラインでは端末に保存したファイルのみ開けます")); return; }
        const fetcher = f.scope === "task" ? utils.genba.tasks.files.getBytes
          : f.scope === "floor" ? utils.genba.floors.files.getBytes
          : utils.genba.zones.files.getBytes;
        const b = await fetcher.fetch({ id: f.id });
        blob = base64ToBlob(b.base64, b.mimeType); mimeType = b.mimeType;
      }
      setViewer({ blob, mimeType, title: f.title || f.fileName || t("図面") });
    } catch (e: any) {
      toast.error(e?.message || t("図面を開けませんでした"));
    } finally {
      setOpeningId(null);
    }
  }

  const list: FileRow[] = serverList.length > 0 || online ? serverList : offlineList;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" /> {label ? t(label) : t("図面・資料")}</span>
        {canEdit && (
          <div className="ml-auto flex gap-1.5">
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFileChosen} />
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy || !online} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}{t("アップロード")}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!online} onClick={() => setShowLink((v) => !v)}>
              <Link2 className="h-3.5 w-3.5 mr-1" />{t("リンク")}
            </Button>
          </div>
        )}
      </div>

      {/* 適用範囲の選択 (アップロード/リンクの保存先)。範囲が複数あるときだけ出す */}
      {canEdit && scopes.length > 1 && (
        <div className="rounded-lg border border-border/70 bg-muted/30 p-1.5 space-y-1">
          <div className="text-[10px] text-muted-foreground px-0.5">{t("どこに追加しますか？（次のアップロード／リンクの保存先）")}</div>
          <div className="flex flex-wrap gap-1">
            {scopes.map((s) => {
              const active = addScope === s;
              const m = SCOPE_META[s];
              return (
                <button key={s} onClick={() => setAddScope(s)}
                  className="text-[11px] font-medium px-2 py-1 rounded-md border transition-colors"
                  style={{ borderColor: m.color, background: active ? m.color : "transparent", color: active ? "#fff" : m.color }}>
                  {t(m.label)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!online && (
        <div className="flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1" style={{ background: "rgba(246,170,0,0.16)", color: "#8a6d00" }}>
          <CloudOff className="h-3.5 w-3.5" /> {t("オフライン: 端末に保存したファイルのみ開けます")}
        </div>
      )}

      {canEdit && showLink && (
        <div className="rounded-lg border border-border p-2 space-y-1.5">
          <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder={t("表示名（任意・例: 強電作業 図面）")} className="h-8 text-sm" />
          <div className="flex gap-1.5">
            <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/..." className="h-8 text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter") doAddLink(); }} />
            <Button size="sm" className="h-8" disabled={!linkUrl.trim() || addPending} onClick={doAddLink}>{t("追加")}</Button>
          </div>
        </div>
      )}

      {isLoading && online ? (
        <div className="py-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("まだ図面・資料がありません。")}{canEdit ? t("アップロード、または共有リンクを貼れます。") : ""}</p>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border/60">
          {list.map((f) => {
            const isImg = (f.mimeType || "").startsWith("image/");
            const rowLabel = f.title || f.fileName || f.url || t("ファイル");
            const saved = savedIds.has(f.id);
            const canSaveOffline = f.kind === "upload";
            const sm = f.scope ? SCOPE_META[f.scope] : null;
            return (
              <div key={`${f.scope ?? "x"}:${f.id}`} className="flex items-center gap-2 p-2">
                <span className="shrink-0 text-muted-foreground">
                  {f.kind === "link" ? <ExternalLink className="h-4 w-4" /> : isImg ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate flex items-center gap-1.5">
                    <span className="truncate">{rowLabel}</span>
                    {sm && (
                      <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded" style={{ background: `${sm.color}22`, color: sm.color }}>{t(sm.short)}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {f.kind === "link" ? t("共有リンク") : `${t("アップロード")}${f.sizeBytes ? " · " + fmtSize(f.sizeBytes) : ""}`}
                    {saved && <span className="inline-flex items-center gap-0.5 text-[#03AF7A]"><CheckCircle2 className="h-3 w-3" />{t("保存済み")}</span>}
                  </div>
                </div>
                {canSaveOffline && (
                  saved ? (
                    <button title={t("端末保存を解除")} className="shrink-0 text-[#03AF7A] hover:text-muted-foreground p-1"
                      onClick={async () => { await removeOfflineFile(f.id); await refreshSaved(); toast.success(t("端末保存を解除しました")); }}>
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  ) : (
                    <button title={t("オフライン用に端末へ保存")} className="shrink-0 text-muted-foreground hover:text-foreground p-1 disabled:opacity-40"
                      disabled={savingId === f.id || !online} onClick={() => saveOffline(f)}>
                      {savingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </button>
                  )
                )}
                {canEdit && online && f.kind === "link" && f.scope && (
                  <button title={t("アプリに取り込む（アプリ内表示・圏外保存が可能に）")} disabled={importingId === f.id}
                    onClick={() => doImport(f)}
                    className="shrink-0 text-xs font-semibold text-[#03AF7A] px-2 py-1 rounded hover:bg-muted inline-flex items-center gap-1 disabled:opacity-40">
                    {importingId === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}{t("取り込む")}
                  </button>
                )}
                <button onClick={() => openFile(f)}
                  className="shrink-0 text-xs font-semibold text-[#005AFF] px-2 py-1 rounded hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1"
                  disabled={(!saved && !f.url) || openingId === f.id}>
                  {openingId === f.id && <Loader2 className="h-3 w-3 animate-spin" />}{t("開く")}
                </button>
                {canEdit && online && f.scope && (
                  <button title={t("削除")} className="shrink-0 text-muted-foreground hover:text-destructive p-1"
                    onClick={() => { if (window.confirm(`「${rowLabel}」${t("を削除しますか？")}`)) doRemove(f); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewer && <FigureViewer file={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
