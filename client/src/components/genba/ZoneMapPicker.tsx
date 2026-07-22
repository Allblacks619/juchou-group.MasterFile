import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MapPin, X } from "lucide-react";
import { PRIORITY, polyPath, centroid, zoneFillStyle, type Pt } from "@/lib/genbaMap";
import { dispName } from "@/lib/genbaRomaji";
import { useGenbaT } from "@/lib/genbaLang";

type ZoneRow = { id: string; floorId: string; parentZoneId: string | null; name: string; polygon: unknown; priority: number | null; workStatus: string | null; color: string | null; fillOpacity: number | null; progress: number; issues: number };

/**
 * 図(マップ)上のエリアをタップして1つ選ぶピッカー。エリアが多いときにプルダウンより早い。
 * 図面画像＋ポリゴンを等倍表示し、タップで選択して閉じる。画像が無い/小さいエリア向けに下部へ一覧ボタンも出す。
 * 閲覧系APIのみ使用 (floors.list / zones.listByFloor)。選択は onPick(zoneId|null, name) で返す。
 */
export default function ZoneMapPicker({
  siteId, selectedZoneId, onPick, onClose,
}: {
  siteId: string;
  selectedZoneId?: string | null;
  onPick: (zoneId: string | null, zoneName: string) => void;
  onClose: () => void;
}) {
  const t = useGenbaT();
  const { data: floors, isLoading: floorsLoading } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });
  const floorList = (floors || []) as { id: string; name: string; imageUrl: string | null; w: number | null; h: number | null }[];
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeFloorId && floorList.length) setActiveFloorId(floorList[0].id);
  }, [floorList, activeFloorId]);

  const activeFloor = floorList.find((f) => f.id === activeFloorId) || null;
  const { data: zones, isLoading: zonesLoading } = trpc.genba.zones.listByFloor.useQuery(
    { floorId: activeFloorId ?? "" }, { enabled: !!activeFloorId, retry: false });
  const zoneList = (zones || []) as ZoneRow[];

  const fw = activeFloor?.w || 1000;
  const fh = activeFloor?.h || 700;
  const scale = useMemo(() => Math.max(fw, fh) / 1000, [fw, fh]);

  const pick = (z: ZoneRow) => { onPick(z.id, z.name); onClose(); };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#005AFF]" /> {t("図からエリアを選ぶ")}</DialogTitle>
        </DialogHeader>

        {/* フロア切替 (複数図面のとき) */}
        {floorList.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {floorList.map((f) => (
              <button key={f.id} onClick={() => setActiveFloorId(f.id)}
                className={`text-xs px-2 py-1 rounded-lg border ${activeFloorId === f.id ? "border-[#005AFF] text-[#005AFF] font-bold" : "border-border text-muted-foreground"}`}>
                {f.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t("エリアをタップして選択")}</span>
          <button onClick={() => { onPick(null, ""); onClose(); }}
            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> {t("エリア指定なし")}
          </button>
        </div>

        {floorsLoading || zonesLoading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : !activeFloor ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("図面がまだありません。")}</p>
        ) : (
          <>
            <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
              <svg viewBox={`0 0 ${fw} ${fh}`} className="w-full h-auto block">
                {activeFloor.imageUrl && <image href={activeFloor.imageUrl} x="0" y="0" width={fw} height={fh} />}
                {zoneList
                  .filter((z) => Array.isArray(z.polygon) && (z.polygon as Pt[]).length >= 3)
                  .sort((a, b) => (a.parentZoneId ? 1 : 0) - (b.parentZoneId ? 1 : 0))
                  .map((z) => {
                    const poly = z.polygon as Pt[];
                    const fill = zoneFillStyle(z);
                    const sel = selectedZoneId === z.id;
                    const c = centroid(poly);
                    const pr = z.priority ? PRIORITY[z.priority] : null;
                    return (
                      <g key={z.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); pick(z); }}>
                        <path d={polyPath(poly)} fill={fill.color} fillOpacity={sel ? Math.min(fill.opacity + 0.2, 0.9) : fill.opacity}
                          stroke={sel ? "#005AFF" : (pr?.color || "#1B2A41")} strokeWidth={(sel ? 4 : 2) * scale} />
                        <g transform={`translate(${c.x} ${c.y})`}>
                          <text textAnchor="middle" dominantBaseline="middle" fontSize={14 * scale} fontWeight={700}
                            stroke="#fff" strokeWidth={3 * scale} paintOrder="stroke" fill="#0f172a">
                            {dispName(z.name)}
                          </text>
                        </g>
                      </g>
                    );
                  })}
              </svg>
            </div>

            {/* 一覧ボタン (画像が無い/小さいエリアのフォールバック) */}
            {zoneList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {zoneList.map((z) => (
                  <button key={z.id} onClick={() => pick(z)}
                    className={`text-xs px-2 py-1 rounded-lg border ${selectedZoneId === z.id ? "border-[#005AFF] text-[#005AFF] font-bold" : "border-border hover:bg-muted/50"}`}>
                    📍 {dispName(z.name)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
