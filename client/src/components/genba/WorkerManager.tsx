import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Trash2, Link2 } from "lucide-react";

type SiteWorker = { id: number; name: string | null; appRole: string; genbaRole: "admin" | "leader" | "worker"; roleOverridden: boolean; viaTeam: boolean };
type Share = { id: string; name: string; token: string; scopes: { map: boolean; tasks: boolean; board: boolean; dash: boolean; showWorkerNames: boolean }; expiresAt: Date | string | null; createdAt: Date | string };

const ROLE_LABEL: Record<string, string> = { admin: "🛠 管理者", leader: "⭐ リーダー", worker: "👷 作業員" };
const SCOPE_LABELS: [keyof Share["scopes"], string][] = [["map", "図面"], ["tasks", "作業"], ["board", "配置"], ["dash", "全体"]];

/** 作業員管理 + 外部共有リンク (管理画面)。役割変更は管理者のみ、共有はfield(admin/leader)。 */
export default function WorkerManager({
  siteId, siteName, isAdmin, open, onOpenChange,
}: {
  siteId: string;
  siteName: string;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: workers } = trpc.genba.users.listSiteWorkers.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: shares } = trpc.genba.shares.list.useQuery({ siteId }, { enabled: open, retry: false });

  const [shareName, setShareName] = useState("");
  const [scopes, setScopes] = useState({ map: true, tasks: false, board: false, dash: true, showWorkerNames: false });

  const setRole = trpc.genba.users.setGenbaRole.useMutation({
    onSuccess: () => { utils.genba.users.listSiteWorkers.invalidate({ siteId }); toast.success("権限を変更しました"); },
    onError: (e) => toast.error(e.message),
  });
  const createShare = trpc.genba.shares.create.useMutation({
    onSuccess: (s) => {
      utils.genba.shares.list.invalidate({ siteId });
      setShareName("");
      if (s) { copyLink(s.token); toast.success("共有リンクを作成しコピーしました"); }
    },
    onError: (e) => toast.error(e.message),
  });
  const revokeShare = trpc.genba.shares.revoke.useMutation({
    onSuccess: () => { utils.genba.shares.list.invalidate({ siteId }); toast.success("共有リンクを失効しました"); },
    onError: (e) => toast.error(e.message),
  });

  const workerList = (workers || []) as SiteWorker[];
  const shareList = (shares || []) as Share[];
  const shareUrl = (token: string) => `${window.location.origin}/genba/view/${token}`;

  function copyLink(token: string) {
    const url = shareUrl(token);
    navigator.clipboard?.writeText(url).catch(() => {});
  }
  function createFor(name: string, sc = scopes) {
    if (!sc.map && !sc.tasks && !sc.board && !sc.dash) { toast.error("表示する画面を1つ以上選択してください"); return; }
    createShare.mutate({ siteId, name: name.trim() || siteName, scopes: sc });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>👷 作業員・権限 / 共有</DialogTitle></DialogHeader>

        {/* 作業員一覧 + 権限 */}
        <div className="space-y-2">
          <div className="text-sm font-bold">この現場の作業員</div>
          <p className="text-xs text-muted-foreground">
            権限: 🛠管理者(全機能+予算) / ⭐リーダー(予算以外) / 👷作業員(現場入力)。
            {isAdmin ? "権限は現場ビジョン全体に適用されます。" : "権限の変更は管理者のみ可能です。"}
          </p>
          {workerList.length === 0 && <p className="text-sm text-muted-foreground py-2">まだ作業員が割り当てられていません（班・作業に割り当てると表示されます）。</p>}
          {workerList.map((w) => (
            <div key={w.id} className="flex items-center gap-2 py-1.5 border-b border-border/50">
              <span className="text-sm flex-1 truncate">
                {w.name || `user#${w.id}`}
                {w.roleOverridden && <span className="ml-1 text-[10px] text-gold" title="この現場ビジョン用に権限を上書き設定">*</span>}
              </span>
              {isAdmin ? (
                <select value={w.genbaRole} onChange={(e) => setRole.mutate({ userId: w.id, role: e.target.value as any })}
                  className="rounded-md border border-border bg-background p-1.5 text-xs font-bold">
                  {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              ) : (
                <span className="text-xs font-bold">{ROLE_LABEL[w.genbaRole]}</span>
              )}
              <button title="この作業員向けの閲覧専用リンクを発行" className="text-muted-foreground hover:text-gold"
                onClick={() => createFor(w.name || `作業員${w.id}`, { map: true, tasks: false, board: false, dash: true, showWorkerNames: false })}>
                <Link2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* 共有リンク作成 */}
        <div className="rounded-lg border border-border p-3 space-y-2 mt-2">
          <div className="text-sm font-bold">🔗 外部共有リンク（閲覧専用）</div>
          <p className="text-xs text-muted-foreground">施主・元請けなど外部の方に見せる閲覧専用ビュー。見せる画面を選べ、編集はできません。</p>
          <div className="flex gap-2">
            <input value={shareName} onChange={(e) => setShareName(e.target.value)} placeholder="名前（例: 元請け共有用）"
              className="flex-1 rounded-md border border-border bg-background p-2 text-sm" onKeyDown={(e) => e.key === "Enter" && createFor(shareName)} />
            <Button size="sm" onClick={() => createFor(shareName)} disabled={createShare.isPending}>作成</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SCOPE_LABELS.map(([k, label]) => (
              <button key={k} onClick={() => setScopes((s) => ({ ...s, [k]: !s[k] }))}
                className={`text-xs px-2 py-1 rounded border ${scopes[k] ? "bg-[#4DC4FF] text-[#00304a] border-[#4DC4FF]" : "border-border text-muted-foreground"}`}>
                {scopes[k] ? "✓ " : ""}{label}
              </button>
            ))}
            <label className="text-xs flex items-center gap-1 ml-2 cursor-pointer">
              <input type="checkbox" checked={scopes.showWorkerNames} onChange={(e) => setScopes((s) => ({ ...s, showWorkerNames: e.target.checked }))} />
              作業員の実名を表示
            </label>
          </div>
        </div>

        {/* 既存の共有リンク */}
        <div className="space-y-2">
          {shareList.map((s) => {
            const activeScopes = SCOPE_LABELS.filter(([k]) => s.scopes[k]).map(([, l]) => l).join("・");
            return (
              <div key={s.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold">🔗 {s.name}</span>
                  <span className="text-[11px] text-muted-foreground">{activeScopes}{s.scopes.showWorkerNames ? "・実名" : ""}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button title="リンクをコピー" className="text-muted-foreground hover:text-gold" onClick={() => { copyLink(s.token); toast.success("リンクをコピーしました"); }}>
                      <Copy className="h-4 w-4" />
                    </button>
                    <button title="失効" className="text-[#FF4B00]" onClick={() => { if (window.confirm(`共有「${s.name}」を失効しますか？`)) revokeShare.mutate({ id: s.id }); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground break-all mt-1">{shareUrl(s.token)}</div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
