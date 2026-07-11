import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Check } from "lucide-react";
import { colorForKey } from "@/lib/genbaTeamColor";
import { todayStr } from "@/lib/genbaTask";
import { dispName } from "@/lib/genbaRomaji";

type Zone = { id: string; floorName: string; name: string };
type Task = { id: string; name: string; parentTaskId: string | null };
type AssignUser = { id: number; name: string | null };
type Dispatch = {
  id: string; zoneId: string; taskId: string; date: string; memo: string | null;
  done: boolean; zoneName: string; taskName: string; assigneeIds: number[];
};

/**
 * 今日の急ぎ手配 (エリア→作業→作業員→メモ)。
 * その日に急ぎで対応してほしい作業を手配し、専用ボードで消し込む。
 */
export default function DispatchPanel({
  siteId, canEdit, meUserId, open, onOpenChange,
}: {
  siteId: string;
  canEdit: boolean;
  meUserId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [scope, setScope] = useState<"today" | "all">("today");
  const [zoneId, setZoneId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [memo, setMemo] = useState("");
  const [picked, setPicked] = useState<number[]>([]);

  const { data: zones } = trpc.genba.zones.listBySite.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: tasks } = trpc.genba.tasks.listByZone.useQuery({ zoneId }, { enabled: open && !!zoneId, retry: false });
  const { data: users } = trpc.genba.users.listAssignable.useQuery({ siteId }, { enabled: open && canEdit, retry: false });
  const { data: list } = trpc.genba.dispatches.list.useQuery(
    { siteId, ...(scope === "today" ? { date: todayStr() } : {}) },
    { enabled: open, retry: false },
  );

  const zoneList = (zones || []) as Zone[];
  const taskList = (tasks || []) as Task[];
  const userList = (users || []) as AssignUser[];
  const dispatches = (list || []) as Dispatch[];
  const userName = (id: number) => userList.find((u) => u.id === id)?.name || `user#${id}`;

  const invalidate = () => {
    utils.genba.dispatches.list.invalidate({ siteId });
    utils.genba.dispatches.list.invalidate({ siteId, date: todayStr() });
  };
  const create = trpc.genba.dispatches.create.useMutation({
    onSuccess: () => { invalidate(); setTaskId(""); setMemo(""); setPicked([]); toast.success("急ぎ手配を送信しました ⚡"); },
    onError: (e) => toast.error(e.message),
  });
  const setDone = trpc.genba.dispatches.setDone.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const remove = trpc.genba.dispatches.remove.useMutation({ onSuccess: () => { invalidate(); toast.success("手配を削除しました"); }, onError: (e) => toast.error(e.message) });

  const togglePick = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  function submit() {
    if (!zoneId) { toast.error("エリアを選択してください"); return; }
    if (!taskId) { toast.error("作業を選択してください"); return; }
    if (picked.length === 0) { toast.error("作業員を1名以上選択してください"); return; }
    create.mutate({ siteId, zoneId, taskId, date, memo: memo.trim() || undefined, userIds: picked });
  }

  const sorted = useMemo(() => [...dispatches].sort((a, b) => Number(a.done) - Number(b.done)), [dispatches]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>⚡ 今日の急ぎ手配</DialogTitle></DialogHeader>

        {/* 作成フォーム (field) */}
        {canEdit && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <strong className="text-sm">⚡ 急ぎの作業を手配する</strong>
            <div className="grid grid-cols-2 gap-2">
              <select value={zoneId} onChange={(e) => { setZoneId(e.target.value); setTaskId(""); }} className="rounded-md border border-border bg-background p-2 text-sm">
                <option value="">エリアを選択</option>
                {zoneList.map((z) => <option key={z.id} value={z.id}>{z.floorName ? `${z.floorName} / ` : ""}{z.name}</option>)}
              </select>
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!zoneId} className="rounded-md border border-border bg-background p-2 text-sm disabled:opacity-50">
                <option value="">作業を選択</option>
                {taskList.map((t) => <option key={t.id} value={t.id}>{dispName(t.name, (t as any).romaji)}</option>)}
              </select>
            </div>

            <div>
              <div className="text-xs text-muted-foreground mb-1">作業員（複数可）</div>
              <div className="flex flex-wrap gap-1.5">
                {userList.length === 0 && <span className="text-[11px] text-muted-foreground">割当可能な作業員がいません（案件連携中は出面登録者のみ）。</span>}
                {userList.map((u) => {
                  const on = picked.includes(u.id);
                  return (
                    <button key={u.id} onClick={() => togglePick(u.id)}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ background: on ? colorForKey(u.id) : "transparent", color: on ? "#fff" : undefined, borderColor: on ? colorForKey(u.id) : undefined }}>
                      {on ? "✓ " : ""}{u.name || `user#${u.id}`}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">対象日</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-border bg-background p-1.5 text-sm" />
            </div>
            <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモ（例: 12時までに完了。資材は倉庫前）" className="w-full rounded-md border border-border bg-background p-2 text-sm" />
            <Button className="w-full" onClick={submit} disabled={create.isPending}>⚡ この作業を手配する（{picked.length}名）</Button>
          </div>
        )}

        {/* 手配ボード */}
        <div className="flex gap-2">
          <button onClick={() => setScope("today")} className={`px-3 py-1.5 rounded-lg text-sm border ${scope === "today" ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>今日</button>
          <button onClick={() => setScope("all")} className={`px-3 py-1.5 rounded-lg text-sm border ${scope === "all" ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>すべて</button>
        </div>

        <div className="space-y-2">
          {sorted.length === 0 && <p className="text-sm text-muted-foreground py-2">{scope === "today" ? "今日の急ぎ手配はありません。" : "急ぎ手配はまだありません。"}</p>}
          {sorted.map((d) => {
            const mine = meUserId != null && d.assigneeIds.includes(meUserId);
            const canDone = canEdit || mine;
            return (
              <div key={d.id} className={`rounded-lg border p-2 ${d.done ? "opacity-60" : ""}`}
                style={{ borderLeft: "4px solid #FF4B00", outline: mine ? "2px solid #005AFF" : undefined, outlineOffset: -2 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#FF4B00] text-white font-bold">⚡ 急ぎ</span>
                  <strong className="text-sm">📍 {dispName(d.zoneName)}</strong>
                  <span className="text-sm">/ {dispName(d.taskName)}</span>
                  {scope === "all" && <span className="text-[11px] text-muted-foreground">{d.date}</span>}
                  {d.done && <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#03AF7A] text-white">対応済</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {d.assigneeIds.map((id) => (
                    <span key={id} className="text-[11px] px-2 py-0.5 rounded text-white" style={{ background: colorForKey(id) }}>{userName(id)}</span>
                  ))}
                </div>
                {d.memo && <div className="text-xs text-muted-foreground mt-1">💬 {d.memo}</div>}
                <div className="flex gap-2 mt-2">
                  {canDone && (
                    <Button size="sm" variant={d.done ? "outline" : "default"} className="flex-1" style={d.done ? undefined : { background: "#03AF7A" }}
                      onClick={() => setDone.mutate({ id: d.id, done: !d.done })}>
                      <Check className="h-4 w-4 mr-1" />{d.done ? "未対応に戻す" : "対応済にする"}
                    </Button>
                  )}
                  {canEdit && (
                    <button onClick={() => { if (window.confirm("この手配を削除しますか？")) remove.mutate({ id: d.id }); }} className="text-muted-foreground hover:text-destructive px-2" title="削除">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
