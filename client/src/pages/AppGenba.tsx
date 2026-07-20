import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, HardHat, Archive } from "lucide-react";
import GenbaShell from "@/components/genba/GenbaShell";

/**
 * 現場ビジョン (genba) — 一体型アプリのマウント点。
 * me/現場一覧をロードし、GenbaShell(下部タブ+現場切替+設定タブ)へ委譲する。
 */
export default function AppGenba() {
  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading, error: meError } = trpc.genba.me.useQuery(undefined, { retry: false });
  const { data: sites, isLoading: sitesLoading } = trpc.genba.sites.list.useQuery(undefined, { retry: false, enabled: !!me });

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const createSite = trpc.genba.sites.create.useMutation({
    onSuccess: () => { utils.genba.sites.list.invalidate(); setCreateOpen(false); setNewName(""); toast.success("現場を作成しました"); },
    onError: (e) => toast.error(e.message),
  });

  // admin のみ: 削除(アーカイブ)した現場を復元できる。現場ゼロの空画面でも復元に辿り着けるようにする
  const isGenbaAdmin = me?.genbaRole === "admin";
  const { data: archivedSites } = trpc.genba.sites.listArchived.useQuery(undefined, { retry: false, enabled: !!me && isGenbaAdmin });
  const archivedList = (archivedSites || []) as { id: string; name: string }[];
  const restoreSite = trpc.genba.sites.archive.useMutation({
    onSuccess: () => { utils.genba.sites.list.invalidate(); utils.genba.sites.listArchived.invalidate(); toast.success("現場を復元しました"); },
    onError: (e) => toast.error(e.message),
  });

  if (meLoading || (!!me && sitesLoading)) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (meError || !me) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">現場ビジョンは現在利用できません。</CardContent></Card>;
  }

  const list = (sites || []) as { id: string; name: string; driveUrl: string | null; projectId: number | null }[];
  const canEdit = me.genbaRole !== "worker";

  const createDialog = (
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新しい現場を作成</DialogTitle>
          <DialogDescription>現場名を入力してください（後から変更できます）。</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="genba-new-name">現場名</Label>
          <Input id="genba-new-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例: ○○ビル新築工事" maxLength={120}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createSite.mutate({ name: newName.trim() }); }} />
        </div>
        <DialogFooter>
          <Button onClick={() => createSite.mutate({ name: newName.trim() })} disabled={!newName.trim() || createSite.isPending}>
            {createSite.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}作成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // 現場ゼロ: 作成導線のみ
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <HardHat className="h-10 w-10 text-gold" />
        <div>
          <h1 className="text-xl font-bold">現場ビジョン</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {canEdit ? "最初の現場を作成しましょう。" : "管理者またはリーダーが現場を作成すると表示されます。"}
          </p>
        </div>
        {canEdit && <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />現場を作成</Button>}

        {/* 削除(アーカイブ)した現場の復元。現場ゼロでもここから戻せる (admin のみ・データは無事) */}
        {isGenbaAdmin && archivedList.length > 0 && (
          <div className="w-full max-w-sm mt-4 rounded-xl border border-border p-3 text-left space-y-2">
            <div className="text-sm font-bold flex items-center gap-1.5"><Archive className="h-4 w-4" /> 削除した現場（復元）</div>
            <p className="text-[11px] text-muted-foreground">削除した現場はデータを保持しています。ここから元に戻せます。</p>
            <div className="rounded-lg border border-border divide-y divide-border/60">
              {archivedList.map((s) => (
                <div key={s.id} className="flex items-center gap-2 p-2">
                  <span className="flex-1 truncate text-sm">{s.name}</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-[#03AF7A] border-[#03AF7A]/40 hover:bg-[#03AF7A]/10"
                    onClick={() => restoreSite.mutate({ id: s.id, archived: false })} disabled={restoreSite.isPending}>
                    ↩ 復元
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        {createDialog}
      </div>
    );
  }

  return (
    <>
      <GenbaShell
        me={me as any}
        sites={list}
        onCreateSite={() => setCreateOpen(true)}
        onSitesChanged={() => utils.genba.sites.list.invalidate()}
      />
      {createDialog}
    </>
  );
}
