import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { colorForKey } from "@/lib/genbaTeamColor";
import { useGenbaT } from "@/lib/genbaLang";

/** 班管理 (プロトタイプ TeamsTab 相当): 班の作成/リネーム/削除 + メンバー割当 */
export default function TeamManager({ siteId, open, onOpenChange }: { siteId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useGenbaT();
  const utils = trpc.useUtils();
  const { data: teams } = trpc.genba.teams.listBySite.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: users } = trpc.genba.users.listAssignable.useQuery(undefined, { enabled: open, retry: false });

  const refresh = () => utils.genba.teams.listBySite.invalidate({ siteId });
  const create = trpc.genba.teams.create.useMutation({ onSuccess: () => { refresh(); toast.success(t("班を作成しました")); }, onError: (e) => toast.error(e.message) });
  const rename = trpc.genba.teams.rename.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = trpc.genba.teams.remove.useMutation({ onSuccess: () => { refresh(); toast.success(t("班を削除しました")); }, onError: (e) => toast.error(e.message) });
  const setMember = trpc.genba.teams.setMember.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  const teamList = (teams || []) as { id: string; name: string; memberIds: number[] }[];
  const userList = (users || []) as { id: number; name: string | null; appRole: string }[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("班の管理")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {teamList.length === 0 && <p className="text-sm text-muted-foreground">{t("班がありません。下のボタンから作成してください。")}</p>}
          {teamList.map((g) => (
            <div key={g.id} className="rounded-lg border border-border p-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorForKey(g.id) }} />
                <strong className="text-sm flex-1 truncate">{g.name}</strong>
                <span className="text-xs text-muted-foreground">{g.memberIds.length}{t("名")}</span>
                <Button variant="ghost" size="sm" className="px-1 h-7" onClick={() => { const v = window.prompt(t("班名を変更"), g.name); if (v && v.trim() && v.trim() !== g.name) rename.mutate({ id: g.id, name: v.trim() }); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="px-1 h-7 text-destructive hover:text-destructive" onClick={() => { if (confirm(`「${g.name}${t("」を削除しますか？")}`)) remove.mutate({ id: g.id }); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {userList.map((u) => {
                  const on = g.memberIds.includes(u.id);
                  return (
                    <button key={u.id}
                      className="text-xs rounded px-2 py-1 border"
                      style={{ background: on ? colorForKey(g.id) : "transparent", color: on ? "#fff" : undefined, borderColor: colorForKey(g.id) }}
                      onClick={() => setMember.mutate({ teamId: g.id, userId: u.id, on: !on })}>
                      {on ? "✓ " : ""}{u.name || `user#${u.id}`}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-full" onClick={() => { const v = window.prompt(t("班名を入力"), `${teamList.length + 1}${t("班")}`); if (v && v.trim()) create.mutate({ siteId, name: v.trim() }); }}>
            <Plus className="h-4 w-4 mr-1" /> {t("班を作成")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
