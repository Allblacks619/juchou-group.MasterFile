import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Upload, Trash2, Link2, ImageOff, ListChecks, Users, Megaphone, LayoutGrid } from "lucide-react";
import { fileToResizedImage, pdfToImages, type GenbaUploadImage } from "@/lib/genbaUpload";
import { PRIORITY, polyPath, centroid, type Pt } from "@/lib/genbaMap";
import ProgressBadge from "./ProgressBadge";
import ZoneSheet, { type ZoneWithAgg } from "./ZoneSheet";
import TemplateEditor from "./TemplateEditor";
import TeamManager from "./TeamManager";
import InstructionsPanel from "./InstructionsPanel";
import BoardPanel from "./BoardPanel";

type FloorWorkspaceProps = {
  siteId: string;
  siteName: string;
  driveUrl: string | null;
  canEdit: boolean;
  meUserId: number | null;
  onBack: () => void;
};

type Mode = "view" | "draw" | "edit";

/**
 * 現場ビジョン M2-A/M2-B: 図面(フロア)ワークスペース。
 * 図面アップロード/表示(M2-A) + エリア(ゾーン)のポリゴン描画・頂点編集・優先度・
 * 稼働状態・階層・進捗表示(M2-B)。作業(タスク)は M2-C。
 */
export default function FloorWorkspace({ siteId, siteName, driveUrl, canEdit, meUserId, onBack }: FloorWorkspaceProps) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);

  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showTeams, setShowTeams] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showBoard, setShowBoard] = useState(false);

  const { data: unreadCount } = trpc.genba.instructions.unreadCount.useQuery({ siteId }, { retry: false, staleTime: 30 * 1000 });

  // ゾーン描画/編集の状態機械
  const [mode, setMode] = useState<Mode>("view");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [draftPoly, setDraftPoly] = useState<Pt[]>([]);
  const [draftParentZoneId, setDraftParentZoneId] = useState<string | null>(null);
  const [editZoneId, setEditZoneId] = useState<string | null>(null);
  const [editPoly, setEditPoly] = useState<Pt[]>([]);
  const [selVtx, setSelVtx] = useState<number | null>(null);

  const { data: floors, isLoading } = trpc.genba.floors.list.useQuery({ siteId }, { retry: false });

  const list = floors || [];
  const activeFloor = list.find((f) => f.id === activeFloorId) || list[0] || null;

  const { data: zones } = trpc.genba.zones.listByFloor.useQuery(
    { floorId: activeFloor?.id ?? "" },
    { retry: false, enabled: !!activeFloor },
  );
  const zoneList = (zones || []) as ZoneWithAgg[];

  // フロア切替時に描画/選択状態をリセット
  useEffect(() => {
    setMode("view"); setSelectedZoneId(null); setDraftPoly([]); setDraftParentZoneId(null);
    setEditZoneId(null); setEditPoly([]); setSelVtx(null);
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
  function onPointerMove(evt: React.MouseEvent | React.TouchEvent) {
    if (mode !== "edit" || dragIdx.current === null) return;
    const p = svgPoint(evt);
    if (p) setEditPoly((prev) => prev.map((pt, i) => (i === dragIdx.current ? p : pt)));
  }
  function onPointerUp() { dragIdx.current = null; }

  const selectedZone = zoneList.find((z) => z.id === selectedZoneId) || null;
  const fw = activeFloor?.w ?? 1200;
  const fh = activeFloor?.h ?? 850;
  const scale = Math.max(fw, fh) / 1200;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 現場一覧
        </Button>
        <h2 className="text-lg font-bold truncate">{siteName}</h2>
        {driveUrl && (
          <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-gold hover:underline">
            <Link2 className="h-3.5 w-3.5" /> 図面(Drive)
          </a>
        )}
        <div className={canEdit ? "flex items-center gap-2" : "ml-auto flex items-center gap-2"}>
          <Button size="sm" variant="outline" className="relative" onClick={() => setShowInstructions(true)}>
            <Megaphone className="h-4 w-4 mr-1" /> 指示
            {!!unreadCount && unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF4B00] text-white text-[10px] font-bold flex items-center justify-center">{unreadCount}</span>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowBoard(true)}>
            <LayoutGrid className="h-4 w-4 mr-1" /> 配置
          </Button>
        </div>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowTeams(true)}>
              <Users className="h-4 w-4 mr-1" /> 班管理
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowTemplate(true)}>
              <ListChecks className="h-4 w-4 mr-1" /> 作業テンプレート
            </Button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileChosen} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
              {busy || "図面を追加"}
            </Button>
          </div>
        )}
      </div>

      {showTemplate && <TemplateEditor open={showTemplate} onOpenChange={setShowTemplate} />}
      {showTeams && <TeamManager siteId={siteId} open={showTeams} onOpenChange={setShowTeams} />}
      {showInstructions && (
        <InstructionsPanel
          siteId={siteId}
          canEdit={canEdit}
          open={showInstructions}
          onOpenChange={setShowInstructions}
          onReadChanged={() => utils.genba.instructions.unreadCount.invalidate({ siteId })}
        />
      )}
      {showBoard && <BoardPanel siteId={siteId} meUserId={meUserId} open={showBoard} onOpenChange={setShowBoard} />}

      {/* フロアバー */}
      {list.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
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
        </div>
      )}

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
          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${fw} ${fh}`}
              className="w-full h-auto block"
              style={{ touchAction: mode !== "view" ? "none" : "auto", cursor: mode === "draw" ? "crosshair" : "default" }}
              onClick={onSvgClick}
              onMouseMove={onPointerMove}
              onMouseUp={onPointerUp}
              onMouseLeave={onPointerUp}
              onTouchMove={onPointerMove}
              onTouchEnd={onPointerUp}
            >
              {activeFloor.imageUrl && <image href={activeFloor.imageUrl} x="0" y="0" width={fw} height={fh} />}

              {/* 確定済みゾーン */}
              {[...zoneList].filter((z) => z.id !== editZoneId)
                .sort((a, b) => (a.parentZoneId ? 1 : 0) - (b.parentZoneId ? 1 : 0))
                .map((z) => {
                  const poly = z.polygon as Pt[];
                  if (!Array.isArray(poly) || poly.length < 3) return null;
                  const pr = z.priority ? PRIORITY[z.priority] : null;
                  const sel = selectedZoneId === z.id;
                  const isChild = !!z.parentZoneId;
                  const c = centroid(poly);
                  return (
                    <g key={z.id} style={{ cursor: "pointer" }}
                      onClick={(e) => { if (mode === "draw") return; e.stopPropagation(); setSelectedZoneId(sel ? null : z.id); }}>
                      <path d={polyPath(poly)}
                        fill={pr ? pr.soft : "rgba(100,116,139,0.15)"}
                        stroke={sel ? "#0f172a" : pr ? pr.color : "#64748b"}
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
