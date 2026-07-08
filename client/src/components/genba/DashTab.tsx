import { useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import type { ZoneWithAgg } from "./ZoneSheet";

type FloorStat = { progress: number; issues: number; zones: number };

/** 全体タブ (正本 DashTab 相当): 現場全体の進捗・問題数・フロア別進捗の俯瞰。 */
export default function DashTab({ siteId }: { siteId: string }) {
  const { data: floors } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });
  const list = (floors || []) as { id: string; name: string }[];
  const [stats, setStats] = useState<Record<string, FloorStat>>({});

  const report = useCallback((floorId: string, s: FloorStat) => {
    setStats((prev) => (prev[floorId] && prev[floorId].progress === s.progress && prev[floorId].issues === s.issues && prev[floorId].zones === s.zones ? prev : { ...prev, [floorId]: s }));
  }, []);

  const known = list.map((f) => stats[f.id]).filter(Boolean) as FloorStat[];
  const overall = known.length ? Math.round(known.reduce((a, s) => a + s.progress, 0) / known.length) : 0;
  const totalIssues = known.reduce((a, s) => a + s.issues, 0);
  const totalZones = known.reduce((a, s) => a + s.zones, 0);

  if (list.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">図面がありません。「図面」タブで図面を追加してください。</p>;
  }

  return (
    <div className="space-y-4">
      {/* 総合カード */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs text-muted-foreground">現場全体の進捗</div>
        <div className="flex items-end gap-2 mt-1">
          <span className="text-4xl font-black tabular-nums" style={{ color: "#03AF7A" }}>{overall}</span>
          <span className="text-lg font-bold text-muted-foreground mb-1">%</span>
          <div className="ml-auto text-right text-xs text-muted-foreground">
            <div>エリア {totalZones}</div>
            {totalIssues > 0 && <div className="text-[#FF4B00] font-bold">⚠ 問題 {totalIssues}</div>}
          </div>
        </div>
        <div className="mt-2 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${overall}%`, background: "#03AF7A" }} />
        </div>
      </div>

      {/* フロア別 */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-muted-foreground px-1">フロア別</div>
        {list.map((f) => <FloorRow key={f.id} floorId={f.id} name={f.name} onStat={report} />)}
      </div>
    </div>
  );
}

function FloorRow({ floorId, name, onStat }: { floorId: string; name: string; onStat: (id: string, s: FloorStat) => void }) {
  const { data: zones } = trpc.genba.zones.listByFloor.useQuery({ floorId }, { retry: false });
  const roots = ((zones || []) as ZoneWithAgg[]).filter((z) => !z.parentZoneId);
  const progress = roots.length ? Math.round(roots.reduce((a, z) => a + z.progress, 0) / roots.length) : 0;
  const issues = ((zones || []) as ZoneWithAgg[]).reduce((a, z) => a + (z.issues || 0), 0);

  // 集計を親へ通知 (レンダー後)
  useReportStat(floorId, { progress, issues, zones: roots.length }, onStat, zones !== undefined);

  return (
    <div className="rounded-lg border border-border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{name}</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{progress}%{issues > 0 ? ` · ⚠${issues}` : ""}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#4DC4FF" }} />
      </div>
    </div>
  );
}

// フロア集計を親stateへ反映 (依存が揃ってから1回)
function useReportStat(floorId: string, s: FloorStat, onStat: (id: string, s: FloorStat) => void, ready: boolean) {
  useEffect(() => {
    if (ready) onStat(floorId, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorId, s.progress, s.issues, s.zones, ready]);
}
