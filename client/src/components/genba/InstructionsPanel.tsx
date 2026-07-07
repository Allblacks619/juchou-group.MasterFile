import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** 指示パネル (プロトタイプ InstructionsTab 移植): 作成(field)・一覧・未読・既読状況 */
export default function InstructionsPanel({
  siteId, canEdit, open, onOpenChange, onReadChanged,
}: {
  siteId: string;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onReadChanged: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: list } = trpc.genba.instructions.listForMe.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: teams } = trpc.genba.teams.listBySite.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: users } = trpc.genba.users.listAssignable.useQuery(undefined, { enabled: open, retry: false });

  const [text, setText] = useState("");
  const [target, setTarget] = useState("all");

  const teamList = (teams || []) as { id: string; name: string; memberIds: number[] }[];
  const userList = (users || []) as { id: number; name: string | null }[];
  const items = (list || []) as any[];

  const markRead = trpc.genba.instructions.markRead.useMutation();
  const create = trpc.genba.instructions.create.useMutation({
    onSuccess: () => { utils.genba.instructions.listForMe.invalidate({ siteId }); setText(""); toast.success("指示を送信しました"); onReadChanged(); },
    onError: (e) => toast.error(e.message),
  });

  // パネルを開いたら自分宛ての未読を既読化 (プロトタイプ準拠: 閲覧=既読)
  useEffect(() => {
    if (!open || !items.length) return;
    const unread = items.filter((i) => i.mine && !i.read);
    if (unread.length === 0) return;
    Promise.all(unread.map((i) => markRead.mutateAsync({ instructionId: i.id }).catch(() => {})))
      .then(() => { utils.genba.instructions.listForMe.invalidate({ siteId }); onReadChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items.length]);

  const userName = useMemo(() => (id: number) => userList.find((u) => u.id === id)?.name || `user#${id}`, [userList]);
  const targetLabel = (i: any) => {
    if (i.targetKind === "all") return "全員";
    if (i.targetKind === "team") return teamList.find((t) => t.id === i.targetId)?.name || "班";
    return userName(Number(i.targetId));
  };

  function send() {
    const t = text.trim();
    if (!t) { toast.error("指示の内容を入力してください"); return; }
    let targetKind: "all" | "team" | "worker" = "all";
    let targetId: string | undefined;
    if (target.startsWith("team:")) { targetKind = "team"; targetId = target.slice(5); }
    else if (target.startsWith("worker:")) { targetKind = "worker"; targetId = target.slice(7); }
    create.mutate({ siteId, text: t, targetKind, targetId });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>📣 指示</DialogTitle></DialogHeader>

        {canEdit && (
          <div className="rounded-lg border border-border p-2 space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              placeholder="例: 本日中に1-1エリアの建て込みを完了してください"
              className="w-full rounded-md border border-border bg-background p-2 text-sm" />
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-md border border-border bg-background p-2 text-sm">
              <option value="all">👥 全員へ</option>
              {teamList.map((g) => <option key={g.id} value={`team:${g.id}`}>🏳 {g.name}（{g.memberIds.length}名）へ</option>)}
              {userList.map((u) => <option key={u.id} value={`worker:${u.id}`}>👤 {u.name || `user#${u.id}`}へ</option>)}
            </select>
            <Button className="w-full" onClick={send} disabled={create.isPending}>送信</Button>
          </div>
        )}

        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground py-2">指示はまだありません。</p>}
          {items.map((i) => {
            const unread = i.mine && !i.read;
            const targetUsers = i.targetKind === "team" ? (teamList.find((t) => t.id === i.targetId)?.memberIds || []) : i.targetKind === "worker" ? [Number(i.targetId)] : userList.map((u) => u.id);
            const readCount = i.readerIds.filter((id: number) => targetUsers.includes(id)).length;
            return (
              <div key={i.id} className="rounded-lg border border-border p-2" style={{ borderLeft: unread ? "4px solid #FF4B00" : undefined }}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#1B2A41] text-white">→ {targetLabel(i)}</span>
                  {unread && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#FF4B00] text-white font-bold">未読</span>}
                </div>
                <div className="text-sm whitespace-pre-wrap">{i.text}</div>
                {canEdit && <div className="text-xs text-muted-foreground mt-1">既読 {readCount}/{targetUsers.length}</div>}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
