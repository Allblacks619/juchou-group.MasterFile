import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { PRIORITY, STATUS, polyPath, centroid, type Pt } from "@/lib/genbaMap";

/**
 * 【非認証・公開】外部共有ビュー (閲覧専用)。
 * genba.shares.viewByToken (public procedure) から scope 済みデータのみを表示する。
 * 内部情報 (社内メモ・作業員名・Driveリンク・予算) はサーバー側で除去済み。
 */
export default function AppGenbaShare() {
  const params = useParams();
  const token = (params as any).token as string;
  const { data, isLoading, error } = trpc.genba.shares.viewByToken.useQuery({ token }, { retry: false, enabled: !!token });

  const scopes = data?.scopes || {};
  const tabs: [string, string][] = [];
  if (scopes.map) tabs.push(["map", "図面"]);
  if (scopes.tasks) tabs.push(["tasks", "作業"]);
  if (scopes.board) tabs.push(["board", "配置"]);
  if (scopes.dash) tabs.push(["dash", "全体"]);
  const [tab, setTab] = useState<string>("");
  const active = tab && tabs.some(([k]) => k === tab) ? tab : tabs[0]?.[0];

  const [floorIdx, setFloorIdx] = useState(0);

  if (isLoading) return <Center>読み込み中...</Center>;
  if (error || !data) return <Center>🔒 このリンクは無効か、有効期限が切れています。</Center>;

  const floors = data.map?.floors || [];
  const zones = data.map?.zones || [];
  const floor = floors[floorIdx] || floors[0] || null;
  const floorZones = floor ? zones.filter((z: any) => z.floorId === floor.id) : [];
  const tasks = data.tasks || [];
  const board = data.board || [];
  const dash = data.dash || null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-4 py-3 flex items-center gap-2">
        <span className="text-lg">🔗</span>
        <h1 className="font-bold truncate">{data.siteName}</h1>
        <span className="text-xs text-muted-foreground ml-auto">閲覧専用</span>
      </header>

      <nav className="flex gap-2 px-4 py-2 border-b border-border overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap ${active === k ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>{label}</button>
        ))}
      </nav>

      <main className="p-4 max-w-3xl mx-auto">
        {active === "map" && (
          <div>
            {floors.length > 1 && (
              <div className="flex gap-2 mb-3 overflow-x-auto">
                {floors.map((f: any, i: number) => (
                  <button key={f.id} onClick={() => setFloorIdx(i)} className={`px-3 py-1.5 rounded-lg text-sm border whitespace-nowrap ${floor?.id === f.id ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>{f.name}</button>
                ))}
              </div>
            )}
            {floor?.imageUrl ? (
              <svg viewBox={`0 0 ${floor.w || 1000} ${floor.h || 1000}`} className="w-full border border-border rounded-lg bg-white">
                <image href={floor.imageUrl} x={0} y={0} width={floor.w || 1000} height={floor.h || 1000} />
                {floorZones.map((z: any) => {
                  const poly = (Array.isArray(z.polygon) ? z.polygon : []) as Pt[];
                  if (poly.length < 3) return null;
                  const pr = z.priority ? PRIORITY[z.priority] : null;
                  const c = centroid(poly);
                  return (
                    <g key={z.id}>
                      <path d={polyPath(poly)} fill={(pr?.color || "#4DC4FF") + "33"} stroke={pr?.color || "#4DC4FF"} strokeWidth={2} />
                      <text x={c.x} y={c.y} textAnchor="middle" fontSize={14} fill="#111" fontWeight="bold">{z.name} {z.progress}%</text>
                    </g>
                  );
                })}
              </svg>
            ) : <Empty>図面がありません。</Empty>}
          </div>
        )}

        {active === "tasks" && (
          <div className="space-y-3">
            {floorZones.length === 0 && zones.length === 0 && <Empty>作業がありません。</Empty>}
            {zones.map((z: any) => {
              const zt = tasks.filter((t: any) => t.zoneId === z.id);
              if (zt.length === 0) return null;
              return (
                <div key={z.id} className="rounded-lg border border-border p-2">
                  <div className="text-sm font-bold mb-1">📍 {z.name} <span className="text-muted-foreground font-normal">{z.progress}%</span></div>
                  {zt.map((t: any) => {
                    const st = (STATUS as any)[t.status] || STATUS.todo;
                    return (
                      <div key={t.id} className="flex items-center gap-2 py-1 border-b border-border/40 text-sm">
                        <span className="flex-1">{t.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: st.color }}>{st.icon} {st.label}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {active === "board" && (
          <div className="space-y-2">
            {board.length === 0 && <Empty>配置情報がありません。</Empty>}
            {board.map((z: any) => (
              <div key={z.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
                <strong>{z.floorName ? z.floorName + " / " : ""}{z.name}</strong>
                <span className="ml-auto text-muted-foreground">{z.taskCount}件 / 担当 {z.assignedCount}名</span>
              </div>
            ))}
          </div>
        )}

        {active === "dash" && dash && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-sm text-muted-foreground">全体進捗</div>
              <div className="text-3xl font-bold tabular-nums">{dash.progress}%</div>
              <div className="h-2.5 rounded bg-muted mt-2 overflow-hidden"><div className="h-2.5 bg-[#03AF7A]" style={{ width: `${dash.progress}%` }} /></div>
            </div>
            {dash.floors.map((f: any) => (
              <div key={f.id} className="rounded-lg border border-border p-2">
                <div className="flex justify-between text-sm"><span>{f.name}</span><strong className="tabular-nums">{f.progress}%</strong></div>
                <div className="h-2 rounded bg-muted mt-1 overflow-hidden"><div className="h-2 bg-[#4DC4FF]" style={{ width: `${f.progress}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground p-6 text-center">{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{children}</p>;
}
