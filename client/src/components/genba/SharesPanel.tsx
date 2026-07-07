import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SCOPES: { key: string; label: string }[] = [
  { key: "map", label: "🗺 図面" },
  { key: "tasks", label: "📋 作業" },
  { key: "board", label: "👷 配置" },
  { key: "dash", label: "📊 全体" },
];
const EXPIRY: { key: string; label: string; days: number | null }[] = [
  { key: "none", label: "無期限", days: null },
  { key: "7", label: "7日間", days: 7 },
  { key: "30", label: "30日間", days: 30 },
];

/** 外部共有リンク管理 (プロトタイプ SharesTab 移植・field): 作成/一覧/URLコピー/失効 */
export default function SharesPanel({
  siteId, open, onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: list } = trpc.genba.shares.list.useQuery({ siteId }, { enabled: open, retry: false });
  const shares = (list || []) as { id: string; name: string; token: string; scopes: string[]; expiresAt: string | null }[];

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["map", "dash"]);
  const [expiry, setExpiry] = useState("none");

  const create = trpc.genba.shares.create.useMutation({
    onSuccess: () => { utils.genba.shares.list.invalidate({ siteId }); setName(""); toast.success("共有リンクを作成しました"); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.genba.shares.revoke.useMutation({
    onSuccess: () => { utils.genba.shares.list.invalidate({ siteId }); toast.success("共有リンクを失効しました"); },
    onError: (e) => toast.error(e.message),
  });

  const toggleScope = (k: string) => setScopes((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const shareUrl = (token: string) => `${window.location.origin}/app/share/${token}`;

  function submit() {
    if (!name.trim()) { toast.error("共有名を入力してください"); return; }
    if (scopes.length === 0) { toast.error("公開範囲を1つ以上選んでください"); return; }
    const days = EXPIRY.find((e) => e.key === expiry)?.days ?? null;
    const expiresAt = days ? new Date(Date.now() + days * 86400_000).toISOString() : undefined;
    create.mutate({ siteId, name: name.trim(), scopes: scopes as any, expiresAt });
  }
  async function copy(token: string) {
    try { await navigator.clipboard.writeText(shareUrl(token)); toast.success("URLをコピーしました"); }
    catch { toast.error("コピーに失敗しました"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>🔗 外部共有（閲覧専用）</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">施主・元請など外部の方に、選んだ範囲だけを閲覧専用で共有します。社内メモ・Driveリンク・予算・担当者名は共有されません。</p>

        {/* 作成 */}
        <div className="rounded-lg border border-border p-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="共有名（例: 施主様向け）"
            className="w-full rounded-md border border-border bg-background p-2 text-sm" />
          <div className="flex gap-2 flex-wrap">
            {SCOPES.map((s) => (
              <button key={s.key} onClick={() => toggleScope(s.key)}
                className={`px-2.5 py-1 rounded-md text-xs border ${scopes.includes(s.key) ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground">有効期限</span>
            <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className="rounded-md border border-border bg-background p-1.5 text-sm">
              {EXPIRY.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
            <Button size="sm" className="ml-auto" onClick={submit} disabled={create.isPending}>リンクを作成</Button>
          </div>
        </div>

        {/* 一覧 */}
        <div className="space-y-2">
          {shares.length === 0 && <p className="text-sm text-muted-foreground py-2">共有リンクはまだありません。</p>}
          {shares.map((sh) => {
            const expired = sh.expiresAt && new Date(sh.expiresAt).getTime() < Date.now();
            return (
              <div key={sh.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-sm">{sh.name}</strong>
                  {sh.scopes.map((s) => <span key={s} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{SCOPES.find((x) => x.key === s)?.label || s}</span>)}
                  {expired && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#FF4B00] text-white">期限切れ</span>}
                  <button className="ml-auto text-xs text-[#FF4B00]" onClick={() => { if (window.confirm(`「${sh.name}」を失効しますか？`)) revoke.mutate({ id: sh.id }); }}>失効</button>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <input readOnly value={shareUrl(sh.token)} className="flex-1 text-[11px] rounded-md border border-border bg-muted/40 p-1.5 text-muted-foreground" />
                  <Button size="sm" variant="outline" onClick={() => copy(sh.token)}>コピー</Button>
                </div>
                {sh.expiresAt && !expired && <div className="text-[10px] text-muted-foreground mt-1">有効期限: {new Date(sh.expiresAt).toLocaleDateString("ja-JP")}</div>}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
