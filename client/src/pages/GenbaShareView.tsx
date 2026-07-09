import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { PRIORITY, STATUS, polyPath, centroid, type Pt } from "@/lib/genbaMap";

/**
 * 現場ビジョン: 外部共有ビュー (非認証・閲覧専用)。
 * /api/genba/share/:token からサニタイズ済みデータを取得して表示する。
 * 認証なし・書き込みなし。内部情報(メモ/Drive/予算/実名)はサーバー側で既に除去済み。
 */
type ShareData = {
  share: { scopes: { map: boolean; tasks: boolean; board: boolean; dash: boolean; showWorkerNames: boolean } };
  site: { id: string; name: string };
  floors?: { id: string; name: string; imageUrl: string | null; w: number | null; h: number | null }[];
  zones?: { id: string; floorId: string; parentZoneId: string | null; name: string; polygon: Pt[]; priority: number | null; workStatus: string | null; progress: number; issues: number }[];
  tasks?: { id: string; zoneId: string; parentTaskId: string | null; name: string; romaji: string | null; status: string; percent: number | null; priority: number | null; startDate: string | null; dueDate: string | null }[];
  board?: { people: { label: string; teamIds: string[]; tasks: { id: string; name: string; status: string; zoneId: string; zoneName: string }[] }[]; zones: { id: string; name: string; floorName: string; priority: number | null; taskCount: number; assignedLabels: string[] }[]; teams: { id: string; name: string }[] };
  dash?: { overallProgress: number; zones: { id: string; name: string; progress: number; issues: number }[]; statusCounts: Record<string, number> };
};

export default function GenbaShareView() {
  const [, params] = useRoute("/genba/view/:token");
  const token = params?.token;
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/genba/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) { setError(j.error || "表示できませんでした"); return; }
        setData(j);
        const first = ["map", "tasks", "board", "dash"].find((k) => (j.share.scopes as any)[k]);
        setTab(first || "dash");
      })
      .catch(() => setError("通信エラーが発生しました"));
  }, [token]);

  if (error) return <Centered><div className="text-center"><div className="text-4xl mb-2">🔒</div><p className="text-muted-foreground">{error}</p></div></Centered>;
  if (!data) return <Centered><p className="text-muted-foreground">読み込み中…</p></Centered>;

  const scopes = data.share.scopes;
  const tabs = ([["map", "🗺 図面"], ["tasks", "📋 作業"], ["board", "👷 配置"], ["dash", "📊 全体"]] as const).filter(([k]) => (scopes as any)[k]);
  const zonesByFloor = (fid: string) => (data.zones || []).filter((z) => z.floorId === fid);
  const tasksByZone = (zid: string) => (data.tasks || []).filter((t) => t.zoneId === zid);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center gap-2 sticky top-0 bg-background z-10">
        <span className="font-bold">{data.site.name}</span>
        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">🔗 閲覧専用</span>
      </header>
      <div className="flex gap-2 px-4 py-2 border-b border-border overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap ${tab === k ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>{label}</button>
        ))}
      </div>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {tab === "map" && (data.floors || []).map((f) => (
          <div key={f.id} className="rounded-lg border border-border p-2">
            <div className="text-sm font-bold mb-1">{f.name}</div>
            {f.imageUrl && f.w && f.h ? (
              <svg viewBox={`0 0 ${f.w} ${f.h}`} className="w-full rounded border border-border">
                <image href={f.imageUrl} x="0" y="0" width={f.w} height={f.h} />
                {zonesByFloor(f.id).map((z) => {
                  const pr = z.priority ? PRIORITY[z.priority] : null;
                  const c = centroid(z.polygon);
                  const s = Math.max(f.w!, f.h!) / 400;
                  return (
                    <g key={z.id}>
                      <path d={polyPath(z.polygon)} fill={pr ? pr.soft : "rgba(100,116,139,0.15)"} stroke={pr ? pr.color : "#64748b"} strokeWidth={4 * s} />
                      <text x={c.x} y={c.y} textAnchor="middle" fontSize={14 * s} fontWeight={800} fill="#0f172a" stroke="#fff" strokeWidth={3.5 * s} paintOrder="stroke">{z.name} {z.progress}%</text>
                    </g>
                  );
                })}
              </svg>
            ) : <div className="text-xs text-muted-foreground py-4 text-center">図面画像なし</div>}
          </div>
        ))}

        {tab === "tasks" && (data.zones || []).filter((z) => !z.parentZoneId).map((z) => (
          <div key={z.id} className="rounded-lg border border-border p-2">
            <div className="text-sm font-bold mb-1">📍 {z.name} <span className="text-xs text-muted-foreground">{z.progress}%{z.issues ? ` ・⚠${z.issues}` : ""}</span></div>
            {tasksByZone(z.id).map((t) => {
              const st = STATUS[t.status as keyof typeof STATUS] || STATUS.todo;
              return (
                <div key={t.id} className="flex items-center gap-2 py-1 border-b border-border/40 text-sm">
                  <span className="flex-1">{t.name}</span>
                  {t.dueDate && <span className="text-[11px] text-muted-foreground">📅 {t.dueDate}</span>}
                  <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: st.color }}>{st.icon} {t.status === "progress" ? `${t.percent ?? 50}%` : st.label}</span>
                </div>
              );
            })}
          </div>
        ))}

        {tab === "board" && (
          <div className="space-y-2">
            {(data.board?.people || []).map((p, i) => (
              <div key={i} className="rounded-lg border border-border p-2">
                <div className="font-bold text-sm mb-1">{p.label}</div>
                {p.tasks.map((t) => <div key={t.id} className="text-sm py-0.5 flex gap-2"><span className="text-muted-foreground">📍{t.zoneName}</span><span>{t.name}</span></div>)}
              </div>
            ))}
            {(data.board?.people || []).length === 0 && <p className="text-sm text-muted-foreground">配置情報がありません。</p>}
          </div>
        )}

        {tab === "dash" && data.dash && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-sm text-muted-foreground">全体進捗</div>
              <div className="text-3xl font-bold tabular-nums">{data.dash.overallProgress}%</div>
              <div className="mt-2 h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-[#03AF7A]" style={{ width: `${data.dash.overallProgress}%` }} /></div>
            </div>
            {data.dash.zones.map((z) => (
              <div key={z.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{z.name}</span>
                {z.issues > 0 && <span className="text-[#FF4B00] text-xs">⚠{z.issues}</span>}
                <span className="tabular-nums w-10 text-right">{z.progress}%</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">{children}</div>;
}
