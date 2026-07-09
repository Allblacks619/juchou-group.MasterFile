import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Scopes = { map: boolean; tasks: boolean; board: boolean; dash: boolean };
const SCOPE_LABELS: [keyof Scopes, string][] = [["map", "図面"], ["tasks", "作業"], ["board", "配置(件数のみ)"], ["dash", "全体進捗"]];

/** 外部共有マネージャ (field): 閲覧専用リンクの作成/一覧/失効。作業員名・メモ・予算は共有されない */
export default function ShareManager({
  siteId, open, onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: shares } = trpc.genba.shares.list.useQuery({ siteId }, { enabled: open, retry: false });
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scopes>({ map: true, tasks: false, board: false, dash: true });
  const [expires, setExpires] = useState("");

  const create = trpc.genba.shares.create.useMutation({
    onSuccess: () => { utils.genba.shares.list.invalidate({ siteId }); setName(""); toast.success("共有リンクを作成しました"); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.genba.shares.revoke.useMutation({
    onSuccess: () => { utils.genba.shares.list.invalidate({ siteId }); toast.success("共有リンクを失効しました"); },
    onError: (e) => toast.error(e.message),
  });

  const list = (shares || []) as any[];
  const shareUrl = (token: string) => `${window.location.origin}/app/genba/share/${token}`;

  function submit() {
    const nm = name.trim();
    if (!nm) { toast.error("共有名を入力してください"); return; }
    if (!Object.values(scopes).some(Boolean)) { toast.error("公開する内容を1つ以上選んでください"); return; }
    create.mutate({ siteId, name: nm, scopes, expiresAt: expires ? new Date(expires + "T23:59:59").toISOString() : null });
  }
  async function copy(token: string) {
    try { await navigator.clipboard.writeText(shareUrl(token)); toast.success("リンクをコピーしました"); }
    catch { toast.error("コピーに失敗しました"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>🔗 外部共有（閲覧専用）</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">施主・元請など外部の方に、閲覧専用リンクを発行できます。<strong>社内メモ・作業員名・Driveリンク・予算は共有されません。</strong></p>

        <div className="rounded-lg border border-border p-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="共有名（例: 施主様向け）"
            className="w-full rounded-md border border-border bg-background p-2 text-sm" />
          <div className="flex flex-wrap gap-3 text-sm">
            {SCOPE_LABELS.map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={scopes[k]} onChange={(e) => setScopes((s) => ({ ...s, [k]: e.target.checked }))} />
                {label}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">有効期限（任意）</span>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="rounded-md border border-border bg-background p-1.5 text-sm" />
          </label>
          <Button className="w-full" onClick={submit} disabled={create.isPending}>共有リンクを作成</Button>
        </div>

        <div className="space-y-2">
          {list.length === 0 && <p className="text-sm text-muted-foreground py-2">共有リンクはまだありません。</p>}
          {list.map((sh) => {
            const on = Object.entries(sh.scopes || {}).filter(([, v]) => v).map(([k]) => SCOPE_LABELS.find(([sk]) => sk === k)?.[1] || k);
            return (
              <div key={sh.id} className="rounded-lg border border-border p-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-sm">{sh.name}</strong>
                  {on.map((l) => <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{l}</span>)}
                  {sh.expiresAt && <span className="text-[10px] text-[#b45309]">〜{String(sh.expiresAt).slice(0, 10)}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <input readOnly value={shareUrl(sh.token)} className="flex-1 text-[11px] rounded border border-border bg-muted/40 px-2 py-1 text-muted-foreground" />
                  <Button size="sm" variant="outline" onClick={() => copy(sh.token)}>コピー</Button>
                  <Button size="sm" variant="outline" className="text-[#FF4B00]" onClick={() => { if (window.confirm(`「${sh.name}」を失効しますか？`)) revoke.mutate({ id: sh.id }); }}>失効</Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
