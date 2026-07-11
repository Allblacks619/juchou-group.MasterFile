import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus, ExternalLink, Share2 } from "lucide-react";
import { romanize, dispName } from "@/lib/genbaRomaji";
import { todayStr, fmtDate, type GenbaTaskDto } from "@/lib/genbaTask";

/** 作業詳細 (プロトタイプ TaskDetailModal 移植): 名前/ローマ字/期限/リンク/メモ/問題写真/引き継ぎ/削除/サブ作業 */
export default function TaskDetailModal({
  task, zoneId, canEdit, meUserId, open, onOpenChange, onChanged,
}: {
  task: GenbaTaskDto;
  zoneId: string;
  canEdit: boolean;
  meUserId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(task.name);
  const [memo, setMemo] = useState(task.memo || "");
  const [hoTarget, setHoTarget] = useState("");
  const [hoNote, setHoNote] = useState("");

  const events = trpc.genba.tasks.events.useQuery({ taskId: task.id }, { enabled: open, retry: false });
  const usersQ = trpc.genba.users.listAssignable.useQuery(undefined, { enabled: open, retry: false });
  const handover = trpc.genba.tasks.handover.useMutation({
    onSuccess: () => { onChanged(); setHoTarget(""); setHoNote(""); toast.success("引き継ぎました（相手に指示を送信）"); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.genba.tasks.update.useMutation({ onSuccess: onChanged, onError: (e) => toast.error(e.message) });
  const create = trpc.genba.tasks.create.useMutation({
    onSuccess: () => { onChanged(); toast.success("サブ作業を追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.genba.tasks.remove.useMutation({
    onSuccess: () => { onChanged(); onOpenChange(false); toast.success("作業を削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const overdue = task.dueDate && task.status !== "done" && task.dueDate < todayStr();
  const issueEvents = (events.data || []).filter((e: any) => e.kind === "issue");
  const latestIssue = issueEvents[issueEvents.length - 1] as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {canEdit ? (
              <Input value={name} onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== task.name && update.mutate({ id: task.id, name: name.trim() })}
                className="font-bold" />
            ) : dispName(task.name, task.romaji)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {canEdit && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">🇧🇷 ローマ字（ポルトガル語表示用・任意）</Label>
              <Input defaultValue={task.romaji || ""} placeholder={romanize(task.name)}
                onBlur={(e) => { const v = e.target.value.trim(); if (v !== (task.romaji || "")) update.mutate({ id: task.id, romaji: v || null }); }}
                className="text-xs" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">開始日</Label>
              {canEdit ? (
                <Input type="date" defaultValue={task.startDate || ""}
                  onChange={(e) => update.mutate({ id: task.id, startDate: e.target.value || null })} />
              ) : <div className="text-sm">{task.startDate ? `${fmtDate(task.startDate)}〜` : "設定なし"}</div>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">期限</Label>
              {canEdit ? (
                <Input type="date" defaultValue={task.dueDate || ""}
                  onChange={(e) => update.mutate({ id: task.id, dueDate: e.target.value || null })} />
              ) : <div className={`text-sm ${overdue ? "text-destructive font-bold" : ""}`}>{task.dueDate ? `${fmtDate(task.dueDate)}${overdue ? "(期限超過!)" : ""}` : "設定なし"}</div>}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">📐 図面リンク（Google Drive等）</Label>
            {canEdit && (
              <Input defaultValue={task.linkUrl || ""} placeholder="https://drive.google.com/..."
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && !/^https?:\/\//i.test(v)) { toast.error("URLは https:// から入力してください"); return; }
                  if (v !== (task.linkUrl || "")) update.mutate({ id: task.id, linkUrl: v || null });
                }} />
            )}
            {task.linkUrl && (
              <a href={task.linkUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-gold hover:underline mt-1">
                <ExternalLink className="h-3.5 w-3.5" /> 図面を開く（最新版）
              </a>
            )}
          </div>

          {canEdit && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">📝 管理者メモ</Label>
                <label className="text-xs flex items-center gap-1 ml-auto cursor-pointer">
                  <input type="checkbox" defaultChecked={task.memoVisible}
                    onChange={(e) => update.mutate({ id: task.id, memoVisible: e.target.checked })} />
                  作業員に表示
                </label>
              </div>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)}
                onBlur={() => memo !== (task.memo || "") && update.mutate({ id: task.id, memo })}
                rows={3} placeholder="施工上の注意点、指示事項など"
                className="w-full rounded-md border border-border bg-background p-2 text-sm" />
            </div>
          )}
          {!canEdit && task.memo && task.memoVisible && (
            <div className="text-sm rounded-md border border-[#fde68a] bg-[#fefce8] text-[#713f12] p-2">{task.memo}</div>
          )}

          {task.status === "issue" && (
            <div className="space-y-2 rounded-md border border-[#FF4B00]/30 bg-[#FF4B00]/5 p-2">
              <div className="text-sm font-bold text-[#b91c1c]">⚠ 報告されている問題</div>
              <div className="text-sm">{task.issueText || "(詳細未記入)"}</div>
              {latestIssue?.photoUrls?.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {latestIssue.photoUrls.map((u: string, i: number) => (
                    <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                      <img src={u} alt={`問題写真${i + 1}`} className="h-20 w-20 rounded object-cover border border-border" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 引き継ぎ (worker も可) */}
          <div className="space-y-1 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> 引き継ぎ（担当を相手に渡し、指示を自動送信）</Label>
            <div className="flex gap-2">
              <select value={hoTarget} onChange={(e) => setHoTarget(e.target.value)} className="flex-1 rounded-md border border-border bg-background p-2 text-sm">
                <option value="">相手を選択…</option>
                {(usersQ.data || []).filter((u: any) => u.id !== meUserId).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || `user#${u.id}`}</option>
                ))}
              </select>
              <Button size="sm" disabled={!hoTarget || handover.isPending}
                onClick={() => handover.mutate({ taskId: task.id, toUserId: Number(hoTarget), note: hoNote.trim() || undefined })}>
                引き継ぐ
              </Button>
            </div>
            <Input value={hoNote} onChange={(e) => setHoNote(e.target.value)} placeholder="申し送り（任意）" className="text-xs" />
          </div>

          {canEdit && (
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => {
                const n = window.prompt("サブ作業名を入力");
                if (n && n.trim()) create.mutate({ zoneId, parentTaskId: task.id, name: n.trim() });
              }}>
                <Plus className="h-4 w-4 mr-1" /> サブ作業
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`「${task.name}」を削除しますか？\n(サブ作業も削除されます)`)) remove.mutate({ id: task.id }); }}>
                <Trash2 className="h-4 w-4 mr-1" /> 削除
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
