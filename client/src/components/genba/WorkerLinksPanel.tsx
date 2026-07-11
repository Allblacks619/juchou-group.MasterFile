import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, RefreshCw, Ban, CircleCheck, Trash2, Link as LinkIcon } from "lucide-react";
import { rosterKindLabel, type RosterEntry } from "./AssignPicker";

type LinkRow = {
  id: string; siteWorkerId: string; token: string; role: "worker" | "leader"; active: boolean;
  expiresAt: string | Date | null; lastAccessAt: string | Date | null;
  displayName: string; kind: "registered" | "guest"; userId: number | null;
};

const fmt = (d: string | Date | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
};

/**
 * 作業員リンク管理画面 (G2)。名簿の作業員ごとに専用リンクを発行/コピー/再発行/無効化/有効化/削除。
 * ゲストはログイン不要でリンクから自分の担当を確認・更新できる。
 */
export default function WorkerLinksPanel({
  siteId, open, onOpenChange, isAdmin,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** admin は登録作業員の genba内権限 (管理者/リーダー/作業員) を変更できる */
  isAdmin?: boolean;
}) {
  const utils = trpc.useUtils();
  const [expiresDays, setExpiresDays] = useState<string>("");
  const { data: rosterData } = trpc.genba.users.siteRoster.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: links } = trpc.genba.workerLinks.list.useQuery({ siteId }, { enabled: open, retry: false });

  const invalidate = () => utils.genba.workerLinks.list.invalidate({ siteId });
  const issue = trpc.genba.workerLinks.issue.useMutation({
    onSuccess: async (l) => {
      invalidate();
      if (l?.token) { await copyUrl(l.token); toast.success("リンクを発行してコピーしました"); }
    },
    onError: (e) => toast.error(e.message),
  });
  const setActive = trpc.genba.workerLinks.setActive.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const setRole = trpc.genba.workerLinks.setRole.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const remove = trpc.genba.workerLinks.remove.useMutation({ onSuccess: () => { invalidate(); toast.success("リンクを削除しました"); }, onError: (e) => toast.error(e.message) });
  const setGenbaRole = trpc.genba.users.setGenbaRole.useMutation({
    onSuccess: () => { utils.genba.users.siteRoster.invalidate({ siteId }); toast.success("権限を変更しました"); },
    onError: (e) => toast.error(e.message),
  });
  const setWorkerRole = trpc.genba.workerLinks.setWorkerRole.useMutation({
    onSuccess: () => { utils.genba.users.siteRoster.invalidate({ siteId }); invalidate(); toast.success("権限を変更しました"); },
    onError: (e) => toast.error(e.message),
  });

  const roster = (rosterData?.roster || []) as RosterEntry[];
  const linked = rosterData?.linked ?? false;
  const linkList = (links || []) as LinkRow[];
  const linkByWorker = useMemo(() => new Map(linkList.map((l) => [l.siteWorkerId, l])), [linkList]);

  async function copyUrl(token: string) {
    const url = `${window.location.origin}/app/w/${token}`;
    try { await navigator.clipboard.writeText(url); } catch { window.prompt("コピーしてください", url); }
  }

  const expiryOpt = expiresDays ? Number(expiresDays) : undefined;

  // 名簿に載っているがリンク未発行の行 + 発行済みリンク行 (名簿から消えた人のリンクも表示=無効化対象)
  const rosterWithoutLink = roster.filter((r) => r.siteWorkerId && !linkByWorker.has(r.siteWorkerId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>🔗 作業員リンク管理</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          作業員ごとの専用リンクです。ゲストや外注の方は<strong>ログイン不要</strong>でこのリンクから自分の担当作業を確認・更新できます。
          現場から外れた人はここで<strong>無効化</strong>してください（再有効化・再発行も可能）。
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">新規発行の有効期限:</span>
          <select value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} className="rounded-md border border-border bg-background p-1.5 text-xs">
            <option value="">無期限</option>
            <option value="7">7日</option>
            <option value="30">30日</option>
            <option value="90">90日</option>
          </select>
        </div>

        {/* 発行済みリンク一覧 */}
        <div className="rounded-lg border border-border divide-y divide-border/60">
          <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground bg-muted/40">発行済みリンク（{linkList.length}）</div>
          {linkList.length === 0 && <p className="text-sm text-muted-foreground p-3">まだ発行されていません。下の名簿から発行してください。</p>}
          {linkList.map((l) => {
            const expired = l.expiresAt ? new Date(l.expiresAt).getTime() < Date.now() : false;
            const kind = rosterKindLabel({ kind: l.kind, appRole: l.userId != null ? "worker" : null });
            return (
              <div key={l.id} className="p-2 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-sm">{l.displayName}</strong>
                  <span className={`text-[9px] px-1 py-0.5 rounded border leading-none ${kind.cls}`}>{kind.label}</span>
                  <select value={l.role} disabled={!isAdmin || setRole.isPending}
                    title={isAdmin ? "このリンクの権限" : "権限を変更できるのは管理者のみです"}
                    onChange={(e) => setRole.mutate({ id: l.id, role: e.target.value as "worker" | "leader" })}
                    className="rounded border border-border bg-background px-1 py-0.5 text-[11px] disabled:opacity-60">
                    <option value="worker">作業員</option>
                    <option value="leader">リーダー</option>
                  </select>
                  {l.active && !expired
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#03AF7A] text-white font-bold">有効</span>
                    : expired
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F6AA00] text-[#3a2a00] font-bold">期限切れ</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#84919E] text-white font-bold">無効化済み</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">最終アクセス {fmt(l.lastAccessAt)}{l.expiresAt ? ` / 期限 ${fmt(l.expiresAt)}` : ""}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={async () => { await copyUrl(l.token); toast.success("リンクをコピーしました"); }}>
                    <Copy className="h-3 w-3 mr-1" /> コピー
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { if (window.confirm("再発行すると今のリンクは使えなくなります。よろしいですか？")) issue.mutate({ siteWorkerId: l.siteWorkerId, role: l.role, expiresDays: expiryOpt }); }}>
                    <RefreshCw className="h-3 w-3 mr-1" /> 再発行
                  </Button>
                  {l.active ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-[#b45309]"
                      onClick={() => setActive.mutate({ id: l.id, active: false })}>
                      <Ban className="h-3 w-3 mr-1" /> 無効化
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs text-[#03AF7A]"
                      onClick={() => setActive.mutate({ id: l.id, active: true })}>
                      <CircleCheck className="h-3 w-3 mr-1" /> 有効化
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive ml-auto"
                    onClick={() => { if (window.confirm(`${l.displayName} のリンクを完全に削除しますか？`)) remove.mutate({ id: l.id }); }}>
                    <Trash2 className="h-3 w-3 mr-1" /> 削除
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* 名簿 (リンク未発行) */}
        <div className="rounded-lg border border-border divide-y divide-border/60">
          <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground bg-muted/40">
            名簿（リンク未発行）{linked ? " — 出面に登録された人" : ""}
          </div>
          {rosterWithoutLink.length === 0 && <p className="text-sm text-muted-foreground p-3">{roster.length === 0 ? "名簿が空です。案件連携と出面の登録を確認してください。" : "全員に発行済みです。"}</p>}
          {rosterWithoutLink.map((r) => {
            const kind = rosterKindLabel(r);
            const isOwner = r.appRole === "super_admin";
            return (
              <div key={r.siteWorkerId} className="p-2 flex items-center gap-2 flex-wrap">
                <strong className="text-sm">{r.displayName}</strong>
                <span className={`text-[9px] px-1 py-0.5 rounded border leading-none ${kind.cls}`}>{kind.label}</span>
                {/* 権限セレクト: 全員に表示。オーナー(super_admin)は固定、変更操作は管理者のみ */}
                {isOwner ? (
                  <select value="admin" disabled title="オーナーの権限は変更できません"
                    className="rounded border border-border bg-muted/60 px-1 py-0.5 text-[11px] opacity-70">
                    <option value="admin">管理者（固定）</option>
                  </select>
                ) : r.userId != null ? (
                  <select value={(r as any).genbaRole ?? "worker"}
                    disabled={!isAdmin || setGenbaRole.isPending}
                    title={isAdmin ? "genba内の権限 (システム全体の権限は変わりません)" : "権限を変更できるのは管理者のみです"}
                    onChange={(e) => setGenbaRole.mutate({ userId: r.userId as number, role: e.target.value as any })}
                    className="rounded border border-border bg-background px-1 py-0.5 text-[11px] disabled:opacity-60">
                    <option value="admin">管理者</option>
                    <option value="leader">リーダー</option>
                    <option value="worker">作業員</option>
                  </select>
                ) : r.siteWorkerId != null ? (
                  <select value={(r as any).workerRole ?? "worker"}
                    disabled={!isAdmin || setWorkerRole.isPending}
                    title={isAdmin ? "この現場での役割 (リンク発行時の権限になります)" : "権限を変更できるのは管理者のみです"}
                    onChange={(e) => setWorkerRole.mutate({ siteWorkerId: r.siteWorkerId as string, role: e.target.value as "worker" | "leader" })}
                    className="rounded border border-border bg-background px-1 py-0.5 text-[11px] disabled:opacity-60">
                    <option value="leader">リーダー</option>
                    <option value="worker">作業員</option>
                  </select>
                ) : null}
                {(r as any).roleOverridden && <span title="genba内で上書きされた権限" className="text-[10px] text-[#005AFF] font-bold">*</span>}
                <Button size="sm" variant="outline" className="h-7 text-xs ml-auto"
                  disabled={issue.isPending}
                  onClick={() => issue.mutate({ siteWorkerId: r.siteWorkerId as string, expiresDays: expiryOpt })}>
                  <LinkIcon className="h-3 w-3 mr-1" /> 専用リンクを発行
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
