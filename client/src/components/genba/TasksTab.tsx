import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PRIORITY, STATUS } from "@/lib/genbaMap";
import type { ZoneWithAgg } from "./ZoneSheet";
import TaskTree from "./TaskTree";
import StatusModal, { type SetStatusPayload } from "./StatusModal";

type MineTask = { id: string; zoneId: string; zoneName: string; name: string; romaji: string | null; status: "todo" | "progress" | "done" | "issue"; percent: number | null; dueDate: string | null; issueText: string | null };

/** 作業タブ (正本 TasksTab 移植): フロア選択 → エリア別に作業ツリーを一覧。「自分の作業」フィルタ付き (G3)。 */
export default function TasksTab({ siteId, meUserId, canEdit }: { siteId: string; meUserId: number | null; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const { data: floors } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });
  const list = (floors || []) as { id: string; name: string }[];
  const [floorId, setFloorId] = useState<string | null>(null);
  // プロトタイプ準拠: 作業員は既定で「自分の作業」から始まる
  const [mineOnly, setMineOnly] = useState(!canEdit && meUserId != null);
  const activeFloor = list.find((f) => f.id === floorId) || list[0] || null;

  const { data: zones } = trpc.genba.zones.listByFloor.useQuery(
    { floorId: activeFloor?.id ?? "" },
    { retry: false, enabled: !!activeFloor && !mineOnly },
  );
  const zoneList = (zones || []) as ZoneWithAgg[];
  const roots = [...zoneList].filter((z) => !z.parentZoneId).sort((a, b) => (a.priority || 9) - (b.priority || 9));

  const refresh = () => activeFloor && utils.genba.zones.listByFloor.invalidate({ floorId: activeFloor.id });

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">図面がありません。「図面」タブで図面を追加してください。</p>;
  }

  const mineChip = meUserId != null && (
    <button onClick={() => setMineOnly(!mineOnly)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border ${mineOnly ? "bg-[#005AFF] text-white border-[#005AFF]" : "text-muted-foreground border-border"}`}>
      👤 自分の作業
    </button>
  );

  if (mineOnly && meUserId != null) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setMineOnly(false)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border text-muted-foreground border-border">
            すべての作業
          </button>
          {mineChip}
        </div>
        <MyTasksList siteId={siteId} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* フロア選択 + 自分の作業フィルタ */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {list.map((f) => {
          const active = f.id === (activeFloor?.id ?? "");
          return (
            <button key={f.id} onClick={() => setFloorId(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border ${active ? "bg-gold/15 text-gold border-gold/50" : "text-muted-foreground border-border"}`}>
              {f.name}
            </button>
          );
        })}
        {mineChip}
      </div>

      {roots.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">このフロアにはエリアがありません。「図面」タブでエリアを追加してください。</p>}

      {roots.map((z) => {
        const pr = z.priority ? PRIORITY[z.priority] : null;
        return (
          <div key={z.id} className="rounded-xl border border-border bg-card/60 overflow-hidden" style={{ borderLeft: `5px solid ${pr ? pr.color : "#cbd5e1"}` }}>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
              <strong className="text-sm">{z.workStatus === "paused" ? "⏸ " : ""}{z.name}</strong>
              {pr && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: pr.color, color: pr.text }}>{pr.label}</span>}
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{Math.round(z.progress)}%{z.issues > 0 ? ` · ⚠${z.issues}` : ""}</span>
            </div>
            <div className="px-3 py-2">
              <TaskTree zoneId={z.id} siteId={siteId} meUserId={meUserId} canEdit={canEdit} onChanged={refresh} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 自分の担当作業 (G3): 現場内の自分に割り当てられた葉タスクをエリア別に表示・その場で更新 */
function MyTasksList({ siteId }: { siteId: string }) {
  const utils = trpc.useUtils();
  const { data } = trpc.genba.tasks.listMine.useQuery({ siteId }, { retry: false });
  const setStatus = trpc.genba.tasks.setStatus.useMutation({
    onSuccess: () => { utils.genba.tasks.listMine.invalidate({ siteId }); utils.genba.zones.listByFloor.invalidate(); toast.success("更新しました"); },
    onError: (e) => toast.error(e.message),
  });
  const [statusTask, setStatusTask] = useState<MineTask | null>(null);

  const tasks = (data || []) as MineTask[];
  const grouped = new Map<string, MineTask[]>();
  for (const t of tasks) { const arr = grouped.get(t.zoneName) || []; arr.push(t); grouped.set(t.zoneName, arr); }

  if (tasks.length === 0) {
    return <p className="text-sm text-muted-foreground rounded-xl border border-border p-4">あなたに割り当てられた作業はありません。管理者・リーダーに確認してください。</p>;
  }

  return (
    <div className="space-y-2">
      {Array.from(grouped.entries()).map(([zoneName, ts]) => (
        <div key={zoneName} className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-1.5 bg-muted/40 text-xs font-bold">📍 {zoneName}</div>
          <div className="divide-y divide-border/60">
            {ts.map((t) => {
              const st = STATUS[t.status];
              return (
                <div key={t.id} className="px-3 py-2 flex items-center gap-2">
                  <button onClick={() => setStatusTask(t)}
                    className="text-xs font-bold rounded px-2 py-1.5 text-white shrink-0" style={{ background: st.color }}>
                    {st.icon} {t.status === "progress" ? `${t.percent ?? 50}%` : st.label}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.name}</div>
                    {t.dueDate && <div className="text-[11px] text-muted-foreground">📅 {t.dueDate}</div>}
                    {t.status === "issue" && t.issueText && <div className="text-[11px] text-[#b91c1c]">⚠ {t.issueText}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {statusTask && (
        <StatusModal task={statusTask as any} open={!!statusTask} onOpenChange={(v) => !v && setStatusTask(null)}
          onSubmit={async (p: SetStatusPayload) => { await setStatus.mutateAsync({ id: statusTask.id, ...p }); }} />
      )}
    </div>
  );
}
