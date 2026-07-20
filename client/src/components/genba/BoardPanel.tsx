import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, Link2 } from "lucide-react";
import { STATUS, PRIORITY } from "@/lib/genbaMap";
import { colorForKey } from "@/lib/genbaTeamColor";
import { dispName } from "@/lib/genbaRomaji";
import BulkAssignPanel from "./BulkAssignPanel";
import BulkLinkPanel from "./BulkLinkPanel";

/** 配置ボード (プロトタイプ BoardTab 移植): 現在の割当から人別/エリア別を自動生成 (毎日の入力不要) */
export default function BoardPanel({
  siteId, meUserId, open, onOpenChange, embedded, canEdit,
}: {
  siteId: string;
  meUserId: number | null;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  embedded?: boolean;
  /** admin/leader は「まとめて配置」で複数エリアへ一括割当できる */
  canEdit?: boolean;
}) {
  const active = embedded || !!open;
  const [view, setView] = useState<"people" | "zone">("people");
  const [showBulk, setShowBulk] = useState(false);
  const [showBulkLink, setShowBulkLink] = useState(false);
  const { data: board } = trpc.genba.board.get.useQuery({ siteId }, { enabled: active, retry: false });
  const { data: teams } = trpc.genba.teams.listBySite.useQuery({ siteId }, { enabled: active, retry: false });
  const { data: users } = trpc.genba.users.listAssignable.useQuery(undefined, { enabled: active, retry: false });

  const teamName = (id: string) => (teams || []).find((t: any) => t.id === id)?.name || "班";
  const userName = (id: number) => (users || []).find((u: any) => u.id === id)?.name || `user#${id}`;
  const people = (board?.people || []) as any[];
  const guestPeople = ((board as any)?.guestPeople || []) as any[];
  const zones = (board?.zones || []) as any[];

  const StatusChip = ({ s }: { s: keyof typeof STATUS }) => (
    <span className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: STATUS[s].color }}>{STATUS[s].icon} {STATUS[s].label}</span>
  );

  const inner = (
      <>
        {!embedded && <DialogHeader><DialogTitle>🗂 配置ボード</DialogTitle></DialogHeader>}
        <div className="flex gap-2 items-center">
          <button onClick={() => setView("people")} className={`px-3 py-1.5 rounded-lg text-sm border ${view === "people" ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>👷 人別</button>
          <button onClick={() => setView("zone")} className={`px-3 py-1.5 rounded-lg text-sm border ${view === "zone" ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>🗺 エリア別</button>
          {canEdit && (
            <div className="ml-auto flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setShowBulkLink(true)}>
                <Link2 className="h-4 w-4 mr-1" /> まとめて図面リンク
              </Button>
              <Button size="sm" onClick={() => setShowBulk(true)}>
                <UserPlus className="h-4 w-4 mr-1" /> まとめて配置
              </Button>
            </div>
          )}
        </div>
        {canEdit && showBulk && <BulkAssignPanel siteId={siteId} open={showBulk} onOpenChange={setShowBulk} />}
        {canEdit && showBulkLink && <BulkLinkPanel siteId={siteId} open={showBulkLink} onOpenChange={setShowBulkLink} />}
        <p className="text-xs text-muted-foreground">現在の割り当てから自動生成されます（毎日の入力は不要）。完了・親作業は除外。</p>

        {view === "people" ? (
          <div className="space-y-2">
            {people.map((p) => {
              const groups = new Map<string, any[]>();
              for (const t of p.tasks) { const arr = groups.get(t.zoneId) || []; arr.push(t); groups.set(t.zoneId, arr); }
              const mine = p.userId === meUserId;
              return (
                <div key={p.userId} className="rounded-lg border border-border p-2" style={{ borderLeft: `5px solid ${colorForKey(p.userId)}`, outline: mine ? "2px solid #005AFF" : undefined, outlineOffset: -2 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm">{p.name || `user#${p.userId}`}</strong>
                    {p.teamIds.map((id: string) => <span key={id} className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: colorForKey(id), color: colorForKey(id) }}>{teamName(id)}</span>)}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{p.tasks.length ? `${p.tasks.length}件` : ""}</span>
                  </div>
                  {p.tasks.length === 0 ? (
                    <div className="text-xs text-muted-foreground mt-1">未配置（担当作業なし）</div>
                  ) : (
                    Array.from(groups.entries()).map(([zoneId, ts]) => (
                      <div key={zoneId} className="mt-2">
                        <div className="text-xs font-bold text-muted-foreground">📍 {dispName(ts[0].zoneName)}</div>
                        {ts.map((t) => (
                          <div key={t.id} className="flex items-center gap-2 py-1 border-b border-border/50">
                            <span className="text-sm flex-1">{dispName(t.name)}</span>
                            {t.status === "progress" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e0f2fe] text-[#0369a1]">↻ 継続中</span>}
                            <StatusChip s={t.status} />
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              );
            })}
            {/* ゲスト (現場名簿・割当あり) */}
            {guestPeople.map((p) => {
              const groups = new Map<string, any[]>();
              for (const t of p.tasks) { const arr = groups.get(t.zoneId) || []; arr.push(t); groups.set(t.zoneId, arr); }
              return (
                <div key={`g-${p.guestId}`} className="rounded-lg border border-border p-2" style={{ borderLeft: `5px solid ${colorForKey(p.guestId)}` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm">{p.name}</strong>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-[#F6AA00]/15 text-[#8a5a00] border-[#F6AA00]/40">ゲスト</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{p.tasks.length}件</span>
                  </div>
                  {Array.from(groups.entries()).map(([zoneId, ts]) => (
                    <div key={zoneId} className="mt-2">
                      <div className="text-xs font-bold text-muted-foreground">📍 {dispName(ts[0].zoneName)}</div>
                      {ts.map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2 py-1 border-b border-border/50">
                          <span className="text-sm flex-1">{dispName(t.name)}</span>
                          {t.status === "progress" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e0f2fe] text-[#0369a1]">↻ 継続中</span>}
                          <StatusChip s={t.status} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {zones.length === 0 && <p className="text-sm text-muted-foreground py-2">アクティブな作業のあるエリアがありません。</p>}
            {zones.map((z) => {
              const pr = z.priority ? PRIORITY[z.priority] : null;
              return (
                <div key={z.id} className="rounded-lg border border-border p-2" style={{ borderTop: `5px solid ${pr ? pr.color : "#cbd5e1"}` }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm">{z.floorName ? z.floorName + " / " : ""}{z.name}</strong>
                    {pr && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: pr.color, color: pr.text }}>{pr.label}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{z.taskCount}件</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {z.assignedUserIds.length === 0 && (z.assignedGuestNames || []).length === 0 ? (
                      z.workStatus === "paused"
                        ? <span className="text-xs font-bold text-muted-foreground">⏸ 作業予定なし（設定済み）</span>
                        : <span className="text-xs font-bold text-[#b45309]">⚠ 担当者未割当</span>
                    ) : (
                      <>
                        {z.assignedUserIds.map((id: number) => (
                          <span key={id} className="text-xs px-2 py-1 rounded text-white" style={{ background: colorForKey(id) }}>{userName(id)}</span>
                        ))}
                        {(z.assignedGuestNames || []).map((name: string, i: number) => (
                          <span key={`g${i}`} className="text-xs px-2 py-1 rounded text-white inline-flex items-center gap-1" style={{ background: colorForKey(name) }}>
                            {name}<span className="text-[9px] px-0.5 rounded bg-white/25 leading-tight">G</span>
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
  );

  if (embedded) return <div className="space-y-2">{inner}</div>;
  return (
    <Dialog open={!!open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">{inner}</DialogContent>
    </Dialog>
  );
}
