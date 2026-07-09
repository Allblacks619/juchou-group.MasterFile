import { useRef, useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, ImageOff, ZoomIn, ZoomOut, Maximize, Sparkles } from "lucide-react";
import { fileToResizedImage, pdfToImages, type GenbaUploadImage } from "@/lib/genbaUpload";
import { PRIORITY, polyPath, centroid, zoneFillStyle, type Pt } from "@/lib/genbaMap";
import { fullViewBox, clampViewBox, zoomAt, fitViewBox, type ViewBox } from "@shared/genba/mapview";
import ProgressBadge from "./ProgressBadge";
import ZoneSheet, { type ZoneWithAgg } from "./ZoneSheet";

type FloorWorkspaceProps = {
  siteId: string;
  canEdit: boolean;
  isAdmin: boolean;
  meUserId: number | null;
  /** シェルの「図面」タブとして使う (ヘッダ/他パネルはシェルが持つ)。常に true 想定 */
  mapOnly?: boolean;
};

type Mode = "view" | "draw" | "edit";

/**
 * 現場ビジョン: 図面(フロア)タブ。図面アップロード/表示 + エリア(ゾーン)のポリゴン描画・
 * 頂点編集・優先度・色/塗り・稼働状態・階層・進捗表示 + ズーム/パン/フォーカス/くっきり補正。
 * 指示・配置・材料・予算・設定などのナビは GenbaShell の下部タブが担当する。
 */
export default function FloorWorkspace({ siteId, canEdit, isAdmin, meUserId }: FloorWorkspaceProps) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);

  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // ゾーン描画/編集の状態機械
  const [mode, setMode] = useState<Mode>("view");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [draftPoly, setDraftPoly] = useState<Pt[]>([]);
  const [draftParentZoneId, setDraftParentZoneId] = useState<string | null>(null);
  const [editZoneId, setEditZoneId] = useState<string | null>(null);
  const [editPoly, setEditPoly] = useState<Pt[]>([]);
  const [selVtx, setSelVtx] = useState<number | null>(null);
  const [snapOn, setSnapOn] = useState(true); // 隣接エリアの境界へ頂点をスナップ

  // ズーム/パン/フォーカス (null = 全体表示)
  const [vb, setVb] = useState<ViewBox | null>(null);
  const [focusZoneId, setFocusZoneId] = useState<string | null>(null);
  const [sharpen, setSharpen] = useState(false);
  const panRef = useRef<{ cx: number; cy: number; vb: ViewBox } | null>(null);
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const didPanRef = useRef(false);

  const { data: floors, isLoading } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });

  const list = floors || [];
  const activeFloor = list.find((f) => f.id === activeFloorId) || list[0] || null;

  const { data: zones } = trpc.genba.zones.listByFloor.useQuery(
    { floorId: activeFloor?.id ?? "" },
    { retry: false, enabled: !!activeFloor },
  );
  const zoneList = (zones || []) as ZoneWithAgg[];

  // フロア切替時に描画/選択/ズーム状態をリセット
  useEffect(() => {
    setMode("view"); setSelectedZoneId(null); setDraftPoly([]); setDraftParentZoneId(null);
    setEditZoneId(null); setEditPoly([]); setSelVtx(null);
    setVb(null); setFocusZoneId(null);
  }, [activeFloor?.id]);

  const createFloor = trpc.genba.floors.create.useMutation({ onError: (e) => toast.error(e.message) });
  const removeFloor = trpc.genba.floors.remove.useMutation({
    onSuccess: () => { utils.genba.floors.list.invalidate({ siteId }); toast.success("図面を削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const invalidateZones = () => activeFloor && utils.genba.zones.listByFloor.invalidate({ floorId: activeFloor.id });
  const createZone = trpc.genba.zones.create.useMutation({ onSuccess: invalidateZones, onError: (e) => toast.error(e.message) });
  const updateZone = trpc.genba.zones.update.useMutation({ onSuccess: invalidateZones, onError: (e) => toast.error(e.message) });
  const removeZone = trpc.genba.zones.remove.useMutation({
    onSuccess: () => { invalidateZones(); setSelectedZoneId(null); toast.success("エリアを削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  // ── 図面アップロード (M2-A) ──
  async function uploadOne(img: GenbaUploadImage, name: string) {
    await createFloor.mutateAsync({ siteId, name, base64: img.base64, mimeType: img.mimeType, fileName: img.fileName, w: img.w, h: img.h });
  }
  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    try {
      if (file.type === "application/pdf") {
        setBusy("PDFを読み込み中…");
        const { images, total } = await pdfToImages(file, (i, n) => setBusy(`PDF変換中 ${i}/${n}ページ`));
        for (let i = 0; i < images.length; i++) {
          setBusy(`アップロード中 ${i + 1}/${images.length}`);
          await uploadOne(images[i], images.length > 1 ? images[i].fileName.replace(/\.jpg$/, "") : file.name.replace(/\.pdf$/i, ""));
        }
        toast.success(total > images.length ? `${images.length}ページを取り込みました (${total}ページ中、上限12)` : `PDFから${images.length}フロアを取り込みました`);
      } else if (file.type.startsWith("image/")) {
        setBusy("図面を処理中…");
        const img = await fileToResizedImage(file);
        await uploadOne(img, file.name.replace(/\.[^.]+$/, ""));
        toast.success("図面を追加しました");
      } else {
        toast.error("画像(PNG/JPG)またはPDFを選択してください");
        return;
      }
      await utils.genba.floors.list.invalidate({ siteId });
    } catch (err: any) {
      toast.error(err?.message || "図面の読み込みに失敗しました");
    } finally {
      setBusy(null);
    }
  }

  // ── SVG座標変換 ──
  function svgPoint(evt: React.MouseEvent | React.TouchEvent): Pt | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    const touch = "touches" in evt ? evt.touches[0] : null;
    pt.x = touch ? touch.clientX : (evt as React.MouseEvent).clientX;
    pt.y = touch ? touch.clientY : (evt as React.MouseEvent).clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  // ── 描画 (新規エリア) ──
  function onSvgClick(evt: React.MouseEvent) {
    if (mode !== "draw") return;
    const p = svgPoint(evt);
    if (p) setDraftPoly((d) => [...d, p]);
  }
  function confirmDraft() {
    if (!activeFloor) return;
    if (draftPoly.length < 3) { toast.error("頂点を3点以上タップしてください"); return; }
    const parentName = draftParentZoneId ? zoneList.find((z) => z.id === draftParentZoneId)?.name : null;
    const siblings = zoneList.filter((z) => z.parentZoneId === (draftParentZoneId ?? null));
    const def = parentName ? `${parentName}-${siblings.length + 1}` : `${zoneList.filter((z) => !z.parentZoneId).length + 1}工区`;
    const input = window.prompt("エリア名を入力", def);
    if (input === null) return;
    const name = input.trim() || def;
    createZone.mutate({ floorId: activeFloor.id, parentZoneId: draftParentZoneId ?? undefined, name, polygon: draftPoly });
    setDraftPoly([]); setMode("view"); setDraftParentZoneId(null);
    toast.success(`「${name}」を作成しました`);
  }
  function cancelDraft() { setDraftPoly([]); setMode("view"); setDraftParentZoneId(null); }

  // ── 隣接エリアの境界へのスナップ (綺麗に境目を合わせる/埋める) ──
  const SNAP_T = 18; // 画像px単位の吸着しきい値
  const neighborPolys = useMemo(
    () => zoneList.filter((z) => z.id !== editZoneId).map((z) => (z.polygon as Pt[]) || []).filter((p) => p.length >= 2),
    [zoneList, editZoneId],
  );
  function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return a;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return { x: a.x + t * dx, y: a.y + t * dy };
  }
  /** 隣接エリアの頂点/辺のうち最も近い点へ吸着 (しきい値内のみ)。境目の隙間や重なりを補正 */
  function snapForce(p: Pt): Pt {
    let best: Pt | null = null, bestD = SNAP_T;
    for (const poly of neighborPolys) {
      for (let i = 0; i < poly.length; i++) {
        const c = closestOnSeg(p, poly[i], poly[(i + 1) % poly.length]);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < bestD) { bestD = d; best = c; }
      }
    }
    return best ? { x: Math.round(best.x), y: Math.round(best.y) } : p;
  }
  const snapVtx = (p: Pt): Pt => (snapOn ? snapForce(p) : p);

  // ── 頂点編集 (範囲後編集) ──
  function startEditRange(zone: ZoneWithAgg) {
    setMode("edit");
    setEditZoneId(zone.id);
    setEditPoly((zone.polygon as Pt[]).map((p) => ({ ...p })));
    setSelVtx(null);
    setSelectedZoneId(null);
    toast("頂点をドラッグで移動、＋タップで頂点追加");
  }
  function saveEditRange() {
    if (editPoly.length >= 3 && editZoneId) updateZone.mutate({ id: editZoneId, polygon: editPoly });
    setMode("view"); setEditZoneId(null); setEditPoly([]); setSelVtx(null);
    toast.success("エリアの範囲を更新しました");
  }
  function cancelEditRange() { setMode("view"); setEditZoneId(null); setEditPoly([]); setSelVtx(null); }
  function deleteSelVtx() {
    if (selVtx === null) { toast.error("削除する頂点をタップで選択してください"); return; }
    if (editPoly.length <= 3) { toast.error("頂点は3点未満にできません"); return; }
    setEditPoly((p) => p.filter((_, i) => i !== selVtx));
    setSelVtx(null);
  }
  function insertMidpoint(i: number) {
    setEditPoly((p) => {
      const a = p[i], b = p[(i + 1) % p.length];
      const np = [...p];
      np.splice(i + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
      return np;
    });
    setSelVtx(i + 1);
  }
  function startDragVtx(i: number, evt: React.MouseEvent | React.TouchEvent) {
    evt.stopPropagation();
    dragIdx.current = i;
    setSelVtx(i);
  }

  const selectedZone = zoneList.find((z) => z.id === selectedZoneId) || null;
  const fw = activeFloor?.w ?? 1200;
  const fh = activeFloor?.h ?? 850;

  // ── ズーム/パン (viewBox 方式。svgPoint は getScreenCTM 経由なのでズーム中も座標が正しい) ──
  const view = vb ?? fullViewBox(fw, fh);
  const zoomLevel = fw / view.w;
  // オーバーレイ(枠線・バッジ)は「現在の表示範囲」基準でスケール → どのズーム倍率でも画面上のサイズが一定で読みやすい
  const scale = Math.max(view.w, view.h) / 1200;

  /** ほぼ全体表示なら null に正規化 (touchAction を通常スクロールに戻すため) */
  function normalizeVb(next: ViewBox): ViewBox | null {
    return next.w >= fw * 0.999 ? null : next;
  }
  function clientToSvg(clientX: number, clientY: number): Pt | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  function zoomBy(factor: number) {
    setVb((prev) => {
      const cur = prev ?? fullViewBox(fw, fh);
      return normalizeVb(zoomAt(cur, fw, fh, factor, cur.x + cur.w / 2, cur.y + cur.h / 2));
    });
  }
  function resetView() { setVb(null); setFocusZoneId(null); }

  // ホイールズーム (native listener: React の onWheel は passive で preventDefault できない)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = clientToSvg(e.clientX, e.clientY);
      if (!p) return;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      setVb((prev) => normalizeVb(zoomAt(prev ?? fullViewBox(fw, fh), fw, fh, factor, p.x, p.y)));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fw, fh, activeFloor?.id, isLoading]);

  function onPointerDown(evt: React.MouseEvent | React.TouchEvent) {
    const touches = "touches" in evt ? evt.touches : null;
    if (touches && touches.length >= 2) {
      // ピンチ開始 (全モード共通)。頂点ドラッグ/パンは中断
      dragIdx.current = null;
      panRef.current = null;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      pinchRef.current = {
        dist: Math.hypot(dx, dy),
        cx: (touches[0].clientX + touches[1].clientX) / 2,
        cy: (touches[0].clientY + touches[1].clientY) / 2,
      };
      return;
    }
    // 1本指/マウスのドラッグパンは view モードのみ (draw=頂点タップ, edit=頂点ドラッグを優先)
    if (mode !== "view") return;
    const cx = touches ? touches[0].clientX : (evt as React.MouseEvent).clientX;
    const cy = touches ? touches[0].clientY : (evt as React.MouseEvent).clientY;
    panRef.current = { cx, cy, vb: view };
    didPanRef.current = false;
  }

  function onPointerMove(evt: React.MouseEvent | React.TouchEvent) {
    const svg = svgRef.current;
    const touches = "touches" in evt ? evt.touches : null;

    // ピンチズーム + 2本指パン
    if (touches && touches.length >= 2 && pinchRef.current && svg) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const cx = (touches[0].clientX + touches[1].clientX) / 2;
      const cy = (touches[0].clientY + touches[1].clientY) / 2;
      const prev = pinchRef.current;
      const mid = clientToSvg(cx, cy);
      if (mid && prev.dist > 0) {
        const rect = svg.getBoundingClientRect();
        setVb((old) => {
          const cur = old ?? fullViewBox(fw, fh);
          const zoomed = zoomAt(cur, fw, fh, dist / prev.dist, mid.x, mid.y);
          const k = zoomed.w / rect.width;
          return normalizeVb(clampViewBox({ ...zoomed, x: zoomed.x - (cx - prev.cx) * k, y: zoomed.y - (cy - prev.cy) * k }, fw, fh));
        });
      }
      pinchRef.current = { dist, cx, cy };
      return;
    }

    // 頂点ドラッグ (edit)。隣接スナップが有効なら境界へ吸着
    if (mode === "edit" && dragIdx.current !== null) {
      const p = svgPoint(evt);
      if (p) { const q = snapVtx(p); setEditPoly((prev) => prev.map((pt, i) => (i === dragIdx.current ? q : pt))); }
      return;
    }

    // ドラッグパン (view)
    if (panRef.current && svg) {
      const cx = touches ? touches[0].clientX : (evt as React.MouseEvent).clientX;
      const cy = touches ? touches[0].clientY : (evt as React.MouseEvent).clientY;
      const start = panRef.current;
      if (Math.hypot(cx - start.cx, cy - start.cy) > 4) didPanRef.current = true;
      if (didPanRef.current) {
        const rect = svg.getBoundingClientRect();
        const k = start.vb.w / rect.width;
        setVb(normalizeVb(clampViewBox({ ...start.vb, x: start.vb.x - (cx - start.cx) * k, y: start.vb.y - (cy - start.cy) * k }, fw, fh)));
      }
    }
  }
  function onPointerUp(evt?: React.TouchEvent | React.MouseEvent) {
    dragIdx.current = null;
    panRef.current = null;
    const touches = evt && "touches" in evt ? evt.touches : null;
    if (!touches || touches.length < 2) pinchRef.current = null;
  }

  // ── エリアフォーカス (囲んだ内側だけを表示 + 自動ズームフィット) ──
  const focusZone = zoneList.find((z) => z.id === focusZoneId) || null;
  const focusPoly = focusZone && Array.isArray(focusZone.polygon) && (focusZone.polygon as Pt[]).length >= 3 ? (focusZone.polygon as Pt[]) : null;
  const focusSubtree = useMemo(() => {
    if (!focusZoneId) return null;
    const s = new Set([focusZoneId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const z of zoneList) {
        if (z.parentZoneId && s.has(z.parentZoneId) && !s.has(z.id)) { s.add(z.id); grew = true; }
      }
    }
    return s;
  }, [focusZoneId, zoneList]);

  function focusOnZone(zone: ZoneWithAgg) {
    const poly = zone.polygon as Pt[];
    if (!Array.isArray(poly) || poly.length < 3) return;
    setFocusZoneId(zone.id);
    setVb(fitViewBox(poly, fw, fh));
  }

  return (
    <div className="space-y-3">
      {/* フロアバー + 図面追加 */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1 min-w-0">
          {list.map((f) => {
            const active = f.id === (activeFloor?.id ?? "");
            return (
              <button
                key={f.id}
                onClick={() => setActiveFloorId(f.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${
                  active ? "bg-gold/10 text-gold border-gold/40" : "text-muted-foreground border-border hover:bg-muted/50"
                }`}
              >
                {f.name}
              </button>
            );
          })}
          {list.length === 0 && <span className="text-sm text-muted-foreground py-1.5">図面がありません</span>}
        </div>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChosen} />
            <Button size="sm" className="shrink-0" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {busy || "図面"}
            </Button>
          </>
        )}
      </div>

      {/* 描画ツールバー */}
      {canEdit && activeFloor && (
        <div className="flex flex-wrap items-center gap-2">
          {mode === "view" ? (
            <>
              <Button size="sm" onClick={() => { setMode("draw"); setDraftParentZoneId(null); setSelectedZoneId(null); }}>＋ エリア追加</Button>
              {selectedZone && (
                <Button size="sm" variant="secondary" onClick={() => { setMode("draw"); setDraftParentZoneId(selectedZone.id); }}>
                  ＋ サブエリア: {selectedZone.name}
                </Button>
              )}
            </>
          ) : mode === "draw" ? (
            <>
              <span className="text-sm text-muted-foreground flex-1">図面をタップして頂点を追加（{draftPoly.length}）{draftParentZoneId ? ` / 親: ${zoneList.find((z) => z.id === draftParentZoneId)?.name ?? ""}` : ""}</span>
              <Button size="sm" variant="secondary" onClick={() => setDraftPoly((d) => d.slice(0, -1))}>1点戻す</Button>
              <Button size="sm" onClick={confirmDraft}>確定</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={cancelDraft}>中止</Button>
            </>
          ) : (
            <>
              <span className="text-sm text-muted-foreground flex-1">✏ 頂点をドラッグで移動 / ＋タップで追加（{editPoly.length}）</span>
              <label className="text-xs flex items-center gap-1 cursor-pointer select-none" title="隣接エリアの境界に頂点を吸着">
                <input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> 隣接スナップ
              </label>
              <Button size="sm" variant="outline" onClick={() => { setEditPoly((prev) => prev.map(snapForce)); toast.success("隣接エリアの境界に合わせました"); }}>境界を補正</Button>
              <Button size="sm" variant="secondary" onClick={deleteSelVtx}>選択頂点を削除</Button>
              <Button size="sm" onClick={saveEditRange}>保存</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={cancelEditRange}>キャンセル</Button>
            </>
          )}
        </div>
      )}

      {/* 図面 + ゾーンオーバーレイ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !activeFloor ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
          <ImageOff className="h-8 w-8" />
          <p>まだ図面がありません。{canEdit ? "「図面を追加」からPDF/画像をアップロードしてください。" : "管理者またはリーダーが図面を追加すると表示されます。"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative rounded-lg border border-border overflow-hidden bg-muted/30">
            {/* ズーム/表示コントロール (図面右上のオーバーレイ) */}
            <div className="absolute top-2 right-2 z-10 flex flex-col items-center gap-1.5">
              <button title="拡大" onClick={() => zoomBy(1.5)}
                className="w-9 h-9 rounded-lg border border-border bg-background/90 shadow flex items-center justify-center hover:bg-muted">
                <ZoomIn className="h-4.5 w-4.5" />
              </button>
              <button title="縮小" onClick={() => zoomBy(1 / 1.5)}
                className="w-9 h-9 rounded-lg border border-border bg-background/90 shadow flex items-center justify-center hover:bg-muted">
                <ZoomOut className="h-4.5 w-4.5" />
              </button>
              <button title="全体表示" onClick={resetView}
                className="w-9 h-9 rounded-lg border border-border bg-background/90 shadow flex items-center justify-center hover:bg-muted">
                <Maximize className="h-4.5 w-4.5" />
              </button>
              <button title="くっきり補正 (シャープ化)" onClick={() => setSharpen((s) => !s)}
                className={`w-9 h-9 rounded-lg border shadow flex items-center justify-center ${sharpen ? "bg-gold/20 border-gold/60 text-gold" : "border-border bg-background/90 hover:bg-muted"}`}>
                <Sparkles className="h-4.5 w-4.5" />
              </button>
              {zoomLevel > 1.01 && (
                <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded bg-background/90 border border-border shadow">
                  {Math.round(zoomLevel * 100)}%
                </span>
              )}
            </div>
            {/* フォーカス中バナー */}
            {focusZone && (
              <div className="absolute top-2 left-2 z-10 flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-background/90 shadow text-xs">
                <span>🔍 {focusZone.name} にフォーカス中</span>
                <button className="font-bold text-gold hover:underline" onClick={resetView}>解除</button>
              </div>
            )}
            <svg
              ref={svgRef}
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              className="w-full h-auto block"
              style={{
                touchAction: mode !== "view" || vb ? "none" : "pan-y",
                cursor: mode === "draw" ? "crosshair" : didPanRef.current ? "grabbing" : "default",
              }}
              onClick={onSvgClick}
              onMouseDown={onPointerDown}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={() => onPointerUp()}
              onTouchStart={onPointerDown}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            >
              <defs>
                {/* くっきり補正: 軽いシャープ化 (畳み込み)。図面の細線・文字を強調する */}
                <filter id="genba-sharpen">
                  <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.7 0 -0.7 3.8 -0.7 0 -0.7 0" />
                </filter>
                {focusPoly && (
                  <clipPath id="genba-focus-clip">
                    <path d={polyPath(focusPoly)} />
                  </clipPath>
                )}
              </defs>

              {activeFloor.imageUrl && (
                focusPoly ? (
                  <>
                    {/* フォーカス: 外側は薄く残して位置関係だけ分かるように、内側は原寸表示 */}
                    <image href={activeFloor.imageUrl} x="0" y="0" width={fw} height={fh} opacity={0.12} />
                    <image href={activeFloor.imageUrl} x="0" y="0" width={fw} height={fh}
                      clipPath="url(#genba-focus-clip)" filter={sharpen ? "url(#genba-sharpen)" : undefined} />
                    <path d={polyPath(focusPoly)} fill="none" stroke="#0f172a" strokeWidth={2.5 * scale} strokeDasharray={`${9 * scale} ${6 * scale}`} />
                  </>
                ) : (
                  <image href={activeFloor.imageUrl} x="0" y="0" width={fw} height={fh}
                    filter={sharpen ? "url(#genba-sharpen)" : undefined} />
                )
              )}

              {/* 確定済みゾーン (フォーカス中は対象エリアとその子だけ表示して見やすく) */}
              {[...zoneList].filter((z) => z.id !== editZoneId && (!focusSubtree || focusSubtree.has(z.id)))
                .sort((a, b) => (a.parentZoneId ? 1 : 0) - (b.parentZoneId ? 1 : 0))
                .map((z) => {
                  const poly = z.polygon as Pt[];
                  if (!Array.isArray(poly) || poly.length < 3) return null;
                  const pr = z.priority ? PRIORITY[z.priority] : null;
                  const fill = zoneFillStyle(z);
                  const sel = selectedZoneId === z.id;
                  const isChild = !!z.parentZoneId;
                  const c = centroid(poly);
                  return (
                    <g key={z.id} style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        if (mode === "draw") return;
                        e.stopPropagation();
                        if (didPanRef.current) { didPanRef.current = false; return; }
                        setSelectedZoneId(sel ? null : z.id);
                      }}>
                      <path d={polyPath(poly)}
                        fill={fill.color}
                        fillOpacity={z.id === focusZoneId ? 0 : fill.opacity}
                        stroke={sel ? "#0f172a" : (z.color || pr?.color || "#64748b")}
                        strokeWidth={(sel ? 7 : isChild ? 3 : 5) * scale}
                        strokeDasharray={isChild ? `${10 * scale} ${7 * scale}` : "none"}
                      />
                      <g transform={`translate(${c.x},${c.y}) scale(${scale})`}>
                        <ProgressBadge name={(z.workStatus === "paused" ? "⏸" : "") + z.name} progress={z.progress} issues={z.issues} small={isChild} priority={z.priority} />
                      </g>
                    </g>
                  );
                })}

              {/* 描画中ドラフト */}
              {draftPoly.length > 0 && (
                <g>
                  <path d={polyPath(draftPoly)} fill="rgba(0,90,255,0.15)" stroke="#005AFF" strokeWidth={4 * scale} strokeDasharray={`${12 * scale} ${8 * scale}`} />
                  {draftPoly.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={14 * scale} fill="#005AFF" stroke="#fff" strokeWidth={4 * scale} />)}
                </g>
              )}

              {/* 頂点編集オーバーレイ */}
              {mode === "edit" && editPoly.length > 0 && (
                <g>
                  <path d={polyPath(editPoly)} fill="rgba(0,90,255,0.18)" stroke="#005AFF" strokeWidth={5 * scale} strokeDasharray={`${12 * scale} ${8 * scale}`} />
                  {editPoly.map((p, i) => {
                    const b = editPoly[(i + 1) % editPoly.length];
                    const m = { x: (p.x + b.x) / 2, y: (p.y + b.y) / 2 };
                    return (
                      <g key={"m" + i} style={{ cursor: "copy" }} onClick={(e) => { e.stopPropagation(); insertMidpoint(i); }}>
                        <circle cx={m.x} cy={m.y} r={12 * scale} fill="#fff" stroke="#005AFF" strokeWidth={2.5 * scale} />
                        <text x={m.x} y={m.y + 6 * scale} textAnchor="middle" fontSize={17 * scale} fontWeight="800" fill="#005AFF">＋</text>
                      </g>
                    );
                  })}
                  {editPoly.map((p, i) => (
                    <circle key={"v" + i} cx={p.x} cy={p.y} r={17 * scale}
                      fill={selVtx === i ? "#FF4B00" : "#005AFF"} stroke="#fff" strokeWidth={4 * scale}
                      style={{ cursor: "grab" }}
                      onMouseDown={(e) => startDragVtx(i, e)}
                      onTouchStart={(e) => startDragVtx(i, e)}
                      onClick={(e) => { e.stopPropagation(); setSelVtx(i); }}
                    />
                  ))}
                </g>
              )}
            </svg>
          </div>

          {/* 凡例 */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {Object.entries(PRIORITY).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: v.color }} />優先{k}: {v.label}
              </span>
            ))}
          </div>

          {/* エリア詳細 */}
          {selectedZone && (
            <ZoneSheet
              zone={selectedZone}
              children={zoneList.filter((z) => z.parentZoneId === selectedZone.id)}
              parent={selectedZone.parentZoneId ? zoneList.find((z) => z.id === selectedZone.parentZoneId) ?? null : null}
              canEdit={canEdit}
              siteId={siteId}
              meUserId={meUserId}
              onClose={() => setSelectedZoneId(null)}
              onSelectZone={setSelectedZoneId}
              onSetPriority={(priority) => updateZone.mutate({ id: selectedZone.id, priority })}
              onTogglePaused={() => updateZone.mutate({ id: selectedZone.id, workStatus: selectedZone.workStatus === "paused" ? null : "paused" })}
              onRename={() => {
                const nm = window.prompt("エリア名を変更", selectedZone.name);
                if (nm && nm.trim() && nm.trim() !== selectedZone.name) updateZone.mutate({ id: selectedZone.id, name: nm.trim() });
              }}
              onStartEditRange={() => startEditRange(selectedZone)}
              onSetStyle={(patch) => updateZone.mutate({ id: selectedZone.id, ...patch })}
              onFocus={() => focusOnZone(selectedZone)}
              onAddSubArea={() => { setMode("draw"); setDraftParentZoneId(selectedZone.id); setSelectedZoneId(null); }}
              onDelete={() => { if (confirm(`「${selectedZone.name}」を削除しますか？\n(サブエリア・作業も削除されます)`)) removeZone.mutate({ id: selectedZone.id }); }}
              onTasksChanged={() => { invalidateZones(); }}
            />
          )}

          {canEdit && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => { if (confirm(`「${activeFloor.name}」を削除しますか？`)) { removeFloor.mutate({ id: activeFloor.id }); setActiveFloorId(null); } }}
                disabled={removeFloor.isPending}>
                <Trash2 className="h-4 w-4 mr-1" /> このフロアを削除
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
