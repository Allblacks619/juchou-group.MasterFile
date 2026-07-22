import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Link2, MapPin, ListChecks, Loader2 } from "lucide-react";
import { dispName } from "@/lib/genbaRomaji";
import { useGenbaT } from "@/lib/genbaLang";

type SiteTask = { id: string; name: string; romaji: string | null; zoneId: string; zoneName: string; floorId: string | null; floorName: string | null };

/**
 * まとめて図面リンク添付。図面/資料の共有リンクを、①複数エリアの全作業、または②特定の作業だけ
 * (例: 強電作業) へ、1操作でまとめて添付する。対象 taskId をクライアントで列挙し、既存の
 * tasks.files.addLink を各作業へ適用する (作業員は各作業からワンタッチで開ける)。
 */
export default function BulkLinkPanel({
  siteId, open, onOpenChange,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useGenbaT();
  const utils = trpc.useUtils();
  const { data: siteTasks, isLoading } = trpc.genba.tasks.listBySite.useQuery({ siteId }, { enabled: open, retry: false });

  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [mode, setMode] = useState<"all" | "specific">("specific");
  const [selNames, setSelNames] = useState<Set<string>>(new Set());
  const [selZones, setSelZones] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const addLink = trpc.genba.tasks.files.addLink.useMutation();

  function reset() { setLinkTitle(""); setLinkUrl(""); setMode("specific"); setSelNames(new Set()); setSelZones(new Set()); }

  const tasks = (siteTasks || []) as SiteTask[];

  // エリア一覧 (フロア別) と作業名一覧を現場の全作業から導出 (BulkAssignPanel と同ロジック)
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

  const url = linkUrl.trim();
  const urlValid = /^https?:\/\//i.test(url);

  async function apply() {
    if (!url) { toast.error(t("図面リンクのURLを入力してください")); return; }
    if (!urlValid) { toast.error(t("URLは https:// から入力してください")); return; }
    if (targetTaskIds.length === 0) { toast.error(t("対象の作業がありません。作業やエリアを選んでください")); return; }
    const title = linkTitle.trim() || undefined;
    setBusy(true);
    try {
      for (const taskId of targetTaskIds) {
        await addLink.mutateAsync({ taskId, url, title });
      }
      utils.genba.tasks.files.list.invalidate();
      utils.genba.tasks.listByZone.invalidate();
      utils.genba.tasks.listBySite.invalidate({ siteId });
      toast.success(`${targetTaskIds.length}${t("件の作業に図面リンクを添付しました")}`);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || t("添付に失敗しました"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>🔗 {t("まとめて図面リンク添付")}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t("図面・資料の共有リンクを、特定の作業（例: 強電作業）や複数エリアへ、1操作でまとめて添付します。作業員は各作業からワンタッチで開けます。")}
        </p>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {/* ① リンク */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5"><Link2 className="h-4 w-4" /> {t("① 添付する図面リンク")}</div>
              <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder={t("表示名（任意・例: 強電 平面図）")} className="h-9 text-sm" />
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://drive.google.com/..." className="h-9 text-sm" />
              {url && !urlValid && <p className="text-[11px] text-destructive">{t("URLは https:// から入力してください。")}</p>}
            </section>

            {/* ② 何に */}
            <section className="space-y-1.5">
              <div className="text-sm font-bold flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> {t("② どの作業に付けるか")}</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode("specific")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "specific" ? "bg-gold/10 text-gold border-gold/40 font-semibold" : "border-border text-muted-foreground"}`}>
                  {t("特定の作業だけ")}
                </button>
                <button type="button" onClick={() => setMode("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${mode === "all" ? "bg-gold/10 text-gold border-gold/40 font-semibold" : "border-border text-muted-foreground"}`}>
                  {t("そのエリアの全作業")}
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
                {floorsWithZones.length === 0 && <p className="text-xs text-muted-foreground p-2">{t("エリア（作業）がありません。先に図面でエリアと作業を作成してください。")}</p>}
              </div>
            </section>

            {/* 適用 */}
            <div className="sticky bottom-0 bg-background pt-2 border-t border-border/60 flex items-center gap-2">
              <span className="text-xs text-muted-foreground flex-1">
                {t("図面リンクを")} <strong className="text-foreground">{targetTaskIds.length}</strong> {t("件の作業へ添付")}
              </span>
              <Button onClick={apply} disabled={busy || !url || !urlValid || targetTaskIds.length === 0}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{t("添付する")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
