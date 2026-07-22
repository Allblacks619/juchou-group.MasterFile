import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, MapPin, ListChecks, Loader2 } from "lucide-react";
import { dispName } from "@/lib/genbaRomaji";
import { useGenbaT } from "@/lib/genbaLang";
import { rosterKindLabel, type RosterEntry } from "./AssignPicker";

type SiteTask = { id: string; name: string; romaji: string | null; zoneId: string; zoneName: string; parentZoneId: string | null; floorId: string | null; floorName: string | null };
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
  const t = useGenbaT();
  const utils = trpc.useUtils();
  const { data: rosterData } = trpc.genba.users.siteRoster.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: teamsData } = trpc.genba.teams.listBySite.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: siteTasks, isLoading } = trpc.genba.tasks.listBySite.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: zonesData } = trpc.genba.zones.listBySite.useQuery({ siteId }, { enabled: open, retry: false });

  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"all" | "specific">("all");
  const [selNames, setSelNames] = useState<Set<string>>(new Set());
  const [selZones, setSelZones] = useState<Set<string>>(new Set());

  const bulk = trpc.genba.tasks.bulkAssign.useMutation();

  function reset() { setAssignees([]); setMode("all"); setSelNames(new Set()); setSelZones(new Set()); }

  const isSel = (kind: Assignee["kind"], id: number | string) => assignees.some((a) => a.kind === kind && a.id === id);
  const toggleAssignee = (a: Assignee) =>
    setAssignees((prev) => (prev.some((x) => x.kind === a.kind && x.id === a.id)
      ? prev.filter((x) => !(x.kind === a.kind && x.id === a.id))
      : [...prev, a]));

  const roster = (rosterData?.roster || []) as RosterEntry[];
  const teams = (teamsData || []) as { id: string; name: string; memberIds: number[] }[];
  const tasks = (siteTasks || []) as SiteTask[];
  const allZones = (zonesData || []) as { id: string; floorId: string; floorName: string; name: string; parentZoneId: string | null; priority: number | null }[];

  // エリア一覧を現場の全エリアからフロア別・親子ネストで導出 (サブエリアも親も選択肢に出す)。
  // 作業件数は「そのエリア直下 + 配下サブエリア」の末端作業数を表示する。
  const floorsWithZones = useMemo(() => {
    const directCount = new Map<string, number>();
    for (const t of tasks) directCount.set(t.zoneId, (directCount.get(t.zoneId) || 0) + 1);
    const childrenOf = new Map<string, typeof allZones>();
    for (const z of allZones) { const a = childrenOf.get(z.parentZoneId ?? "_root") || []; a.push(z); childrenOf.set(z.parentZoneId ?? "_root", a); }
    // 配下サブエリアも含めた合計件数 (再帰)
    const totalCount = (zoneId: string, guard = new Set<string>()): number => {
      if (guard.has(zoneId)) return 0; guard.add(zoneId);
      let n = directCount.get(zoneId) || 0;
      for (const c of childrenOf.get(zoneId) || []) n += totalCount(c.id, guard);
      return n;
    };
    // フロア別に親→子の preorder で並べ、depth を付ける
    const byFloor = new Map<string, { floorName: string; zones: { zoneId: string; zoneName: string; count: number; depth: number }[] }>();
    const rootsByFloor = new Map<string, typeof allZones>();
    for (const z of allZones) { if (!z.parentZoneId) { const a = rootsByFloor.get(z.floorId) || []; a.push(z); rootsByFloor.set(z.floorId, a); } }
    for (const z of allZones) {
      if (!byFloor.has(z.floorId)) byFloor.set(z.floorId, { floorName: z.floorName || "フロア", zones: [] });
    }
    const walk = (zoneId: string, floorId: string, depth: number, guard: Set<string>) => {
      if (guard.has(zoneId)) return; guard.add(zoneId);
      const z = allZones.find((x) => x.id === zoneId);
      if (!z) return;
      byFloor.get(floorId)!.zones.push({ zoneId: z.id, zoneName: z.name, count: totalCount(z.id), depth });
      for (const c of (childrenOf.get(z.id) || [])) walk(c.id, floorId, depth + 1, guard);
    };
    rootsByFloor.forEach((roots, floorId) => { const guard = new Set<string>(); for (const r of roots) walk(r.id, floorId, 0, guard); });
    return Array.from(byFloor.values()).filter((f) => f.zones.length > 0);
  }, [tasks, allZones]);

  const workNames = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tasks) m.set(t.name, (m.get(t.name) || 0) + 1);
    return Array.from(m.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [tasks]);

  // エリアの親子関係 (zoneId → parentZoneId)。親エリアを選んだら配下のサブエリアの作業も対象に含める
  const zoneParent = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const z of allZones) m.set(z.id, z.parentZoneId);
    for (const t of tasks) if (!m.has(t.zoneId)) m.set(t.zoneId, t.parentZoneId); // 保険
    return m;
  }, [allZones, tasks]);

  // あるエリアが選択済みか (自分自身、または祖先エリアが選択されていれば対象)
  const zoneCovered = (zoneId: string): boolean => {
    let cur: string | null = zoneId;
    const guard = new Set<string>();
    while (cur && !guard.has(cur)) {
      if (selZones.has(cur)) return true;
      guard.add(cur);
      cur = zoneParent.get(cur) ?? null;
    }
    return false;
  };

  // 選択に応じた対象 taskId (エリア選択(サブエリア含む) × (全作業 or 特定作業))
  const targetTaskIds = useMemo(() => {
    return tasks
      .filter((t) => zoneCovered(t.zoneId) && (mode === "all" || selNames.has(t.name)))
      .map((t) => t.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selZones, mode, selNames, zoneParent]);

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };
  const allZoneIds = floorsWithZones.flatMap((f) => f.zones.map((z) => z.zoneId));
  const allZonesSelected = allZoneIds.length > 0 && allZoneIds.every((id) => selZones.has(id));

  async function apply() {
    if (assignees.length === 0) { toast.error(t("配置する作業員または班を選んでください")); return; }
    if (targetTaskIds.length === 0) { toast.error(t("対象の作業がありません。エリアや作業を選んでください")); return; }
    setBusy(true);
    try {
      // 選んだ人／班をそれぞれ対象作業へ割当 (bulkAssign は1割当ずつ。add* は重複挿入しない)
      for (const a of assignees) {
        const key = a.kind === "user" ? { userId: a.id as number }
          : a.kind === "guest" ? { siteWorkerId: a.id as string }
            : { teamId: a.id as string };
        await bulk.mutateAsync({ taskIds: targetTaskIds, ...key, on: true });
      }
      utils.genba.board.get.invalidate({ siteId });
      utils.genba.tasks.listByZone.invalidate();
      utils.genba.tasks.listBySite.invalidate({ siteId });
      toast.success(`${assignees.length}${t("名／班 を ")}${targetTaskIds.length}${t("件の作業へ配置しました")}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || t("配置に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("📥 まとめて配置")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t("作業員（または班）を、複数のエリアへ一度に配置します。特定の作業だけを複数エリアへ配置することもできます。")}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* ① 誰を */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {t("① 配置する人／班")}
                <span className="text-[11px] font-normal text-muted-foreground">（{t("複数選べます")}{assignees.length > 0 ? ` ・ ${assignees.length}${t("名／班")}` : ""}）</span>
                {assignees.length > 0 && (
                  <button type="button" className="ml-auto text-xs text-[#005AFF] font-semibold" onClick={() => setAssignees([])}>{t("全解除")}</button>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
                {roster.map((r) => {
                  const isUser = r.userId != null;
                  const id = isUser ? r.userId! : r.siteWorkerId;
                  if (id == null) return null;
                  const kind = isUser ? "user" as const : "guest" as const;
                  const selected = isSel(kind, id);
                  const badge = rosterKindLabel(r);
                  return (
                    <button key={`${kind}-${id}`} type="button"
                      onClick={() => toggleAssignee({ kind, id, label: r.displayName })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm ${selected ? "bg-gold/15" : "hover:bg-muted/50"}`}>
                      <span className={`shrink-0 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${selected ? "bg-gold border-gold text-white" : "border-border text-transparent"}`}>✓</span>
                      <span className="flex-1 truncate">{r.displayName}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded border leading-none ${badge.cls}`}>{t(badge.label)}</span>
                    </button>
                  );
                })}
                {teams.map((team) => {
                  const selected = isSel("team", team.id);
                  return (
                    <button key={`team-${team.id}`} type="button"
                      onClick={() => toggleAssignee({ kind: "team", id: team.id, label: team.name })}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm ${selected ? "bg-gold/15" : "hover:bg-muted/50"}`}>
                      <span className={`shrink-0 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${selected ? "bg-gold border-gold text-white" : "border-border text-transparent"}`}>✓</span>
                      <span className="flex-1 truncate">{team.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded border leading-none bg-[#005AFF]/10 text-[#005AFF] border-[#005AFF]/30">{t("班")}</span>
                    </button>
                  );
                })}
                {roster.length === 0 && teams.length === 0 && <div className="p-3 text-xs text-muted-foreground">{t("名簿・班がありません。")}</div>}
              </div>
            </section>

            {/* ② 何を */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> {t("② 何を配置するか")}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "all" ? "bg-gold/10 text-gold border-gold/40 font-semibold" : "border-border text-muted-foreground"}`}>
                  {t("そのエリアの全作業")}
                </button>
                <button type="button" onClick={() => setMode("specific")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "specific" ? "bg-gold/10 text-gold border-gold/40 font-semibold" : "border-border text-muted-foreground"}`}>
                  {t("特定の作業だけ")}
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
                  {workNames.length === 0 && <span className="text-xs text-muted-foreground">{t("作業がありません。")}</span>}
                </div>
              )}
            </section>

            {/* ③ どのエリア */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {t("③ どのエリアへ")}
                {allZoneIds.length > 0 && (
                  <button type="button" className="ml-auto text-xs text-[#005AFF] font-semibold"
                    onClick={() => setSelZones(allZonesSelected ? new Set() : new Set(allZoneIds))}>
                    {allZonesSelected ? t("全解除") : t("全エリア選択")}
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {floorsWithZones.map((f, fi) => (
                  <div key={fi} className="rounded-lg border border-border overflow-hidden">
                    <div className="px-2 py-1 bg-muted/40 text-[11px] font-bold text-muted-foreground">{f.floorName}</div>
                    <div className="p-1.5 space-y-1">
                      {f.zones.map((z) => {
                        const on = selZones.has(z.zoneId);
                        const covered = !on && zoneCovered(z.zoneId); // 親エリアが選択済みなら自動で対象
                        return (
                          <button key={z.zoneId} type="button" onClick={() => toggle(selZones, z.zoneId, setSelZones)}
                            style={{ marginLeft: z.depth * 16 }}
                            className={`w-full text-left text-xs px-2 py-1 rounded-lg border ${on ? "bg-[#03AF7A] text-white border-[#03AF7A]" : covered ? "border-[#03AF7A]/50 text-[#03AF7A] bg-[#03AF7A]/5" : "border-border text-foreground/80"}`}>
                            {z.depth > 0 ? "└ " : ""}{on ? "✓ " : covered ? "↳ " : ""}{dispName(z.zoneName)} <span className="opacity-70">({z.count})</span>
                            {covered && <span className="opacity-70"> {t("・親エリアで選択中")}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {floorsWithZones.length === 0 && <p className="text-xs text-muted-foreground p-2">{t("エリア（作業）がありません。先に図面でエリアと作業を作成してください。")}</p>}
              </div>
            </section>

            {/* 適用 */}
            <div className="sticky bottom-0 bg-background pt-2 border-t border-border/60 flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">
                {assignees.length > 0 ? <strong className="text-foreground">{assignees.length === 1 ? assignees[0].label : `${assignees.length}${t("名／班")}`}</strong> : t("未選択")}
                {t(" を ")}<strong className="text-foreground">{targetTaskIds.length}</strong>{t(" 件の作業へ配置")}
              </span>
              <Button onClick={apply} disabled={busy || assignees.length === 0 || targetTaskIds.length === 0}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t("配置する")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
