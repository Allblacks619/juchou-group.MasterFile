import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PRIORITY } from "@/lib/genbaMap";
import type { ZoneWithAgg } from "./ZoneSheet";
import TaskTree from "./TaskTree";

/** 作業タブ (正本 TasksTab 移植): フロア選択 → エリア別に作業ツリーを一覧。 */
export default function TasksTab({ siteId, meUserId, canEdit }: { siteId: string; meUserId: number | null; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const { data: floors } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });
  const list = (floors || []) as { id: string; name: string }[];
  const [floorId, setFloorId] = useState<string | null>(null);
  const activeFloor = list.find((f) => f.id === floorId) || list[0] || null;

  const { data: zones } = trpc.genba.zones.listByFloor.useQuery(
    { floorId: activeFloor?.id ?? "" },
    { retry: false, enabled: !!activeFloor },
  );
  const zoneList = (zones || []) as ZoneWithAgg[];
  const roots = [...zoneList].filter((z) => !z.parentZoneId).sort((a, b) => (a.priority || 9) - (b.priority || 9));

  const refresh = () => activeFloor && utils.genba.zones.listByFloor.invalidate({ floorId: activeFloor.id });

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">図面がありません。「図面」タブで図面を追加してください。</p>;
  }

  return (
    <div className="space-y-3">
      {/* フロア選択 */}
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
