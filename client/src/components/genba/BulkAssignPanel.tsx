import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, MapPin, ListChecks, Loader2 } from "lucide-react";
import { dispName } from "@/lib/genbaRomaji";
import { rosterKindLabel, type RosterEntry } from "./AssignPicker";

type SiteTask = { id: string; name: string; romaji: string | null; zoneId: string; zoneName: string; floorId: string | null; floorName: string | null };
type Assignee = { kind: "user" | "guest" | "team"; id: number | string; label: string };

/**
 * まとめて配置 (一括割当)。作業員/班を選び、①複数エリアの全作業、または②特定の作業だけを
 * 複数エリアへ、1操作で割り当てる。対象 taskId をクライアントで列挙して tasks.bulkAssign へ渡す。
 */
export default function BulkAssignPanel({
  siteId, open, onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: rosterData } = trpc.genba.users.siteRoster.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: teamsData } = trpc.genba.teams.listBySite.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: siteTasks, isLoading } = trpc.genba.tasks.listBySite.useQuery({ siteId }, { enabled: open, retry: false });

  const [assignee, setAssignee] = useState<Assignee | null>(null);
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [selNames, setSelNames] = useState<Set<string>>(new Set());
  const [selZones, setSelZones] = useState<Set<string>>(new Set());

  const bulk = trpc.genba.tasks.bulkAssign.useMutation({
    onSuccess: (r) => {
      utils.genba.board.get.invalidate({ siteId });
      utils.genba.tasks.listByZone.invalidate();
      utils.genba.tasks.listBySite.invalidate({ siteId });
      toast.success(`${r.count}件の作業に配置しました`);
      reset();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  function reset() { setAssignee(null); setMode("all"); setSelNames(new Set()); setSelZones(new Set()); }

  const roster = (rosterData?.roster || []) as RosterEntry[];
  const teams = (teamsData || []) as { id: string; name: string; memberIds: number[] }[];
  const tasks = (siteTasks || []) as SiteTask[];

  // エリア一覧 (フロア別) と作業名一覧を現場の全作業から導出
  const floorsWithZones = useMemo(() => {
    const zoneMap = new Map<string, { zoneId: string; zoneName: string; count: number }>();
    const floorOf = new Map<string, { floorId: string | null; floorName: string | null }>();
    for (const t of tasks) {
      const z = zoneMap.get(t.zoneId) || { zoneId: t.zoneId, zoneName: t.zoneName, count: 0 };
      z.count++; zoneMap.set(t.zoneId, z);
      if (!floorOf.has(t.zoneId)) floorOf.set(t.zoneId, { floorId: t.floorId, floorName: t.floorName });
    }
    const byFloor = new Map<string, { floorName: string; zones: { zoneId: string; zoneName: string; count: number }[] }>();
    for (const z of Array.from(zoneMap.values())) {
      const f = floorOf.get(z.zoneId)!;
      const key = f.floorId ?? "_";
      const g = byFloor.get(key) || { floorName: f.floorName ?? "フロア", zones: [] };
      g.zones.push(z); byFloor.set(key, g);
    }
    return Array.from(byFloor.values());
  }, [tasks]);

  const workNames = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.name, (m.get(t.name) || 0) + 1);
    return Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [tasks]);

  // 選択に応じた対象 taskId (エリア選択 × (全作業 or 特定作業))
  const targetTaskIds = useMemo(() => {
    return tasks
      .filter((t) => selZones.has(t.zoneId) && (mode === "all" || selNames.has(t.name)))
      .map((t) => t.id);
  }, [tasks, selZones, mode, selNames]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };
  const allZoneIds = floorsWithZones.flatMap((f) => f.zones.map((z) => z.zoneId));
  const allZonesSelected = allZoneIds.length > 0 && allZoneIds.every((id) => selZones.has(id));

  function apply() {
    if (!assignee) { toast.error("配置する作業員または班を選んでください"); return; }
    if (targetTaskIds.length === 0) { toast.error("対象の作業がありません。エリアや作業を選んでください"); return; }
    const key = assignee.kind === "user" ? { userId: assignee.id as number }
      : assignee.kind === "guest" ? { siteWorkerId: assignee.id as string }
        : { teamId: assignee.id as string };
    bulk.mutate({ taskIds: targetTaskIds, ...key, on: true });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>📥 まとめて配置</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          作業員（または班）を、複数のエリアへ一度に配置します。特定の作業だけを複数エリアへ配置することもできます。
        </p>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* ① 誰を */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5"><Users className="h-4 w-4" /> ① 配置する人／班</div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                {roster.map((r) => {
                  const isUser = r.userId != null;
                  const id = isUser ? r.userId! : r.siteWorkerId;
                  if (id == null) return null;
                  const kind = isUser ? "user" as const : "guest" as const;
                  const selected = assignee?.kind === kind && assignee.id === id;
                  const badge = rosterKindLabel(r);
                  return (
                    <button key={`${kind}-${id}`} type="button"
                      onClick={() => setAssignee({ kind, id, label: r.displayName })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm ${selected ? "bg-gold/15" : "hover:bg-muted/50"}`}>
                      <span className="flex-1 truncate">{selected ? "✓ " : ""}{r.displayName}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded border leading-none ${badge.cls}`}>{badge.label}</span>
                    </button>
                  );
                })}
                {teams.map((t) => {
                  const selected = assignee?.kind === "team" && assignee.id === t.id;
                  return (
                    <button key={`team-${t.id}`} type="button"
                      onClick={() => setAssignee({ kind: "team", id: t.id, label: t.name })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm ${selected ? "bg-gold/15" : "hover:bg-muted/50"}`}>
                      <span className="flex-1 truncate">{selected ? "✓ " : ""}{t.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded border leading-none bg-[#005AFF]/10 text-[#005AFF] border-[#005AFF]/30">班</span>
                    </button>
                  );
                })}
                {roster.length === 0 && teams.length === 0 && <div className="p-3 text-xs text-muted-foreground">名簿・班がありません。</div>}
              </div>
            </section>

            {/* ② 何を */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> ② 何を配置するか</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "all" ? "bg-gold/10 text-gold border-gold/40 font-semibold" : "border-border text-muted-foreground"}`}>
                  そのエリアの全作業
                </button>
                <button type="button" onClick={() => setMode("specific")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "specific" ? "bg-gold/10 text-gold border-gold/40 font-semibold" : "border-border text-muted-foreground"}`}>
                  特定の作業だけ
                </button>
              </div>
              {mode === "specific" && (
                <div className="max-h-32 overflow-y-auto rounded-lg border border-border p-2 flex flex-wrap gap-1.5">
                  {workNames.map((w) => {
                    const on = selNames.has(w.name);
                    return (
                      <button key={w.name} type="button" onClick={() => toggle(selNames, w.name, setSelNames)}
                        className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-[#005AFF] text-white border-[#005AFF]" : "border-border text-foreground/80"}`}>
                        {dispName(w.name)} <span className="opacity-70">×{w.count}</span>
                      </button>
                    );
                  })}
                  {workNames.length === 0 && <span className="text-xs text-muted-foreground">作業がありません。</span>}
                </div>
              )}
            </section>

            {/* ③ どのエリア */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> ③ どのエリアへ
                {allZoneIds.length > 0 && (
                  <button type="button" className="ml-auto text-xs text-[#005AFF] font-semibold"
                    onClick={() => setSelZones(allZonesSelected ? new Set() : new Set(allZoneIds))}>
                    {allZonesSelected ? "全解除" : "全エリア選択"}
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {floorsWithZones.map((f, fi) => (
                  <div key={fi} className="rounded-lg border border-border overflow-hidden">
                    <div className="px-2 py-1 bg-muted/40 text-[11px] font-bold text-muted-foreground">{f.floorName}</div>
                    <div className="p-1.5 flex flex-wrap gap-1.5">
                      {f.zones.map((z) => {
                        const on = selZones.has(z.zoneId);
                        return (
                          <button key={z.zoneId} type="button" onClick={() => toggle(selZones, z.zoneId, setSelZones)}
                            className={`text-xs px-2 py-1 rounded-lg border ${on ? "bg-[#03AF7A] text-white border-[#03AF7A]" : "border-border text-foreground/80"}`}>
                            {on ? "✓ " : ""}{dispName(z.zoneName)} <span className="opacity-70">({z.count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {floorsWithZones.length === 0 && <p className="text-xs text-muted-foreground p-2">エリア（作業）がありません。先に図面でエリアと作業を作成してください。</p>}
              </div>
            </section>

            {/* 適用 */}
            <div className="sticky bottom-0 bg-background pt-2 border-t border-border/60 flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">
                {assignee ? <strong className="text-foreground">{assignee.label}</strong> : "未選択"}
                {" を "}<strong className="text-foreground">{targetTaskIds.length}</strong>{" 件の作業へ配置"}
              </span>
              <Button onClick={apply} disabled={bulk.isPending || !assignee || targetTaskIds.length === 0}>
                {bulk.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}配置する
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
