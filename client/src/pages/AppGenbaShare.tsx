import { useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { PRIORITY, STATUS, polyPath, centroid, type Pt } from "@/lib/genbaMap";

/**
 * 外部共有ビュー (★非認証・閲覧専用)。/app/share/:token でアクセス。
 * AppLayout の外側に配置し、ログイン不要で genba.shares.publicView を表示する。
 * 返るデータはサーバー側でサニタイズ済み (社内メモ/Drive/予算/担当者は含まれない)。
 */
export default function AppGenbaShare() {
  const [, params] = useRoute("/app/share/:token");
  const token = params?.token || "";
  const { data, isLoading, error } = trpc.genba.shares.publicView.useQuery({ token }, { enabled: !!token, retry: false });
  const [tab, setTab] = useState<string>("");

  if (isLoading) return <Centered>読み込み中...</Centered>;
  if (error || !data) return <Centered>この共有リンクは無効か、期限切れです。</Centered>;

  const scopes = data.scopes;
  const active = tab && scopes.includes(tab as any) ? tab : scopes[0];
  const tabLabel: Record<string, string> = { map: "🗺 図面", tasks: "📋 作業", board: "👷 配置", dash: "📊 全体" };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center gap-3">
        <h1 className="text-lg font-bold truncate">{data.site.name}</h1>
        <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground">🔗 閲覧専用</span>
      </header>
      <div className="px-4 py-3 max-w-3xl mx-auto space-y-3">
        <div className="flex gap-2 flex-wrap">
          {scopes.map((k) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${active === k ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>
              {tabLabel[k] || k}
            </button>
          ))}
        </div>

        {active === "map" && data.map && <MapView map={data.map} />}
        {active === "tasks" && data.tasks && <TasksView tasks={data.tasks} />}
        {active === "board" && data.board && <BoardView board={data.board} />}
        {active === "dash" && data.dash && <DashView dash={data.dash} />}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground p-6 text-center">{children}</div>;
}

function MapView({ map }: { map: NonNullable<any> }) {
  const [floorId, setFloorId] = useState<string>(map.floors[0]?.id || "");
  const floor = map.floors.find((f: any) => f.id === floorId) || map.floors[0];
  if (!floor) return <p className="text-sm text-muted-foreground">図面がありません。</p>;
  const zones = (map.zones as any[]).filter((z) => z.floorId === floor.id && Array.isArray(z.polygon) && z.polygon.length >= 3);
  return (
    <div className="space-y-2">
      {map.floors.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {map.floors.map((f: any) => (
            <button key={f.id} onClick={() => setFloorId(f.id)} className={`px-2.5 py-1 rounded-md text-xs border ${f.id === floor.id ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>{f.name}</button>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <svg viewBox={`0 0 ${floor.w || 1000} ${floor.h || 800}`} className="w-full h-auto bg-muted/30">
          {floor.imageUrl && <image href={floor.imageUrl} x={0} y={0} width={floor.w || 1000} height={floor.h || 800} />}
          {zones.map((z) => {
            const pr = z.priority ? PRIORITY[z.priority] : null;
            const base = z.color || pr?.color || "#4DC4FF";
            const alpha = Math.round(((z.fillOpacity ?? 20) / 100) * 255).toString(16).padStart(2, "0");
            const c = centroid(z.polygon as Pt[]);
            return (
              <g key={z.id}>
                <path d={polyPath(z.polygon as Pt[])} fill={base + alpha} stroke={base} strokeWidth={2} />
                <text x={c.x} y={c.y} textAnchor="middle" className="fill-foreground" style={{ fontSize: 16, fontWeight: 700 }}>{z.name}</text>
                <text x={c.x} y={c.y + 20} textAnchor="middle" style={{ fontSize: 13, fill: "#03AF7A" }}>{z.progress}%{z.issues > 0 ? ` ⚠${z.issues}` : ""}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function StatusChip({ s }: { s: string }) {
  const st = (STATUS as any)[s] || STATUS.todo;
  return <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: st.color }}>{st.icon} {st.label}</span>;
}

function TasksView({ tasks }: { tasks: NonNullable<any> }) {
  const byZone = new Map<string, any[]>();
  for (const t of tasks.tasks) { const a = byZone.get(t.zoneId) || []; a.push(t); byZone.set(t.zoneId, a); }
  return (
    <div className="space-y-2">
      {tasks.zones.map((z: any) => {
        const ts = byZone.get(z.id) || [];
        if (ts.length === 0) return null;
        return (
          <div key={z.id} className="rounded-lg border border-border p-2">
            <div className="text-sm font-bold mb-1">📍 {z.name}</div>
            {ts.map((t: any) => (
              <div key={t.id} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                <span className="text-sm flex-1">{t.name}</span>
                {t.percent != null && <span className="text-xs text-muted-foreground tabular-nums">{t.percent}%</span>}
                <StatusChip s={t.status} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function BoardView({ board }: { board: NonNullable<any> }) {
  if (board.zones.length === 0) return <p className="text-sm text-muted-foreground py-2">稼働中のエリアはありません。</p>;
  return (
    <div className="space-y-2">
      {board.zones.map((z: any) => {
        const pr = z.priority ? PRIORITY[z.priority] : null;
        return (
          <div key={z.id} className="rounded-lg border border-border p-2 flex items-center gap-2" style={{ borderLeft: `4px solid ${pr?.color || "#cbd5e1"}` }}>
            <strong className="text-sm">{z.floorName ? z.floorName + " / " : ""}{z.name}</strong>
            {pr && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: pr.color, color: pr.text }}>{pr.label}</span>}
            <span className="ml-auto text-xs text-muted-foreground">稼働中 {z.taskCount}件</span>
          </div>
        );
      })}
    </div>
  );
}

function DashView({ dash }: { dash: NonNullable<any> }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3">
        <div className="text-xs text-muted-foreground">全体進捗</div>
        <div className="text-3xl font-bold tabular-nums text-[#03AF7A]">{dash.overallProgress}%</div>
        <div className="h-2.5 rounded bg-muted mt-2 overflow-hidden"><div className="h-full bg-[#03AF7A]" style={{ width: `${dash.overallProgress}%` }} /></div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {(["todo", "progress", "done", "issue"] as const).map((k) => (
          <div key={k} className="flex-1 min-w-[70px] rounded-lg border border-border p-2 text-center">
            <div className="text-xl font-bold tabular-nums">{dash.statusCounts[k]}</div>
            <div className="text-[10px] text-muted-foreground">{(STATUS as any)[k].label}</div>
          </div>
        ))}
      </div>
      {dash.floors.map((f: any) => (
        <div key={f.id}>
          <div className="flex justify-between text-xs text-muted-foreground"><span>{f.name}</span><span>{f.progress}%</span></div>
          <div className="h-2 rounded bg-muted mt-1 overflow-hidden"><div className="h-full bg-[#005AFF]" style={{ width: `${f.progress}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
