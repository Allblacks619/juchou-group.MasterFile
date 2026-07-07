import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MATERIAL_MASTER, MASTER_FLAT, UNITS, MREQ_STATUS } from "@shared/genba/catalog";

type ReqItem = { id: string; name: string; qty: number; unit: string | null };
type MatRequest = {
  id: string; byUserId: number | null; status: "pending" | "ordered" | "delivered";
  note: string | null; createdAt: string | Date; items: ReqItem[];
};
type Preset = { id: string; siteId: string | null; workName: string; parts: string[] };
type CartLine = { name: string; qty: number; unit: string };

const norm = (s: string) => String(s).toLowerCase().replace(/\s/g, "");

/** 材料発注パネル (プロトタイプ MaterialSection 移植): 依頼作成・一覧・Σ集計(発注用) */
export default function MaterialsPanel({
  siteId, canEdit, meUserId, open, onOpenChange,
}: {
  siteId: string;
  canEdit: boolean;
  meUserId: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [view, setView] = useState<"list" | "agg">("list");
  const [aggPeriod, setAggPeriod] = useState<"today" | "week" | "all">("week");
  const [aggPendingOnly, setAggPendingOnly] = useState(true);

  const [groupSel, setGroupSel] = useState("");
  const [presetPart, setPresetPart] = useState("");
  const [freeName, setFreeName] = useState("");
  const [unit, setUnit] = useState<string>("個");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");

  const { data: reqData } = trpc.genba.materials.listRequests.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: presetData } = trpc.genba.materials.listPresets.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: aggData } = trpc.genba.materials.aggregate.useQuery(
    { siteId, period: aggPeriod, pendingOnly: aggPendingOnly },
    { enabled: open && canEdit && view === "agg", retry: false },
  );

  const requests = (reqData || []) as MatRequest[];
  const presets = (presetData || []) as Preset[];

  const invalidate = () => {
    utils.genba.materials.listRequests.invalidate({ siteId });
    utils.genba.materials.aggregate.invalidate({ siteId });
  };
  const create = trpc.genba.materials.createRequest.useMutation({
    onSuccess: () => { invalidate(); setCart([]); setNote(""); toast.success("材料の発注依頼を送信しました 📦"); },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.genba.materials.updateRequestStatus.useMutation({
    onSuccess: () => invalidate(), onError: (e) => toast.error(e.message),
  });
  const cancel = trpc.genba.materials.cancelRequest.useMutation({
    onSuccess: () => { invalidate(); toast.success("依頼を取り消しました"); }, onError: (e) => toast.error(e.message),
  });
  const savePreset = trpc.genba.materials.savePreset.useMutation({
    onSuccess: () => { utils.genba.materials.listPresets.invalidate(); toast.success("プリセットを保存しました"); },
    onError: (e) => toast.error(e.message),
  });

  // カタログ + カスタムプリセット
  const groups = useMemo(() => [
    ...MATERIAL_MASTER.map((m, i) => ({ key: `b${i}`, name: m.g, parts: m.parts.map(([label, u]) => ({ label, unit: u })) })),
    ...presets.map((p) => ({ key: `c${p.id}`, name: `★ ${p.workName}`, parts: p.parts.map((label) => ({ label, unit: "個" })) })),
  ], [presets]);
  const group = groups.find((g) => g.key === groupSel) || null;

  // 手入力サジェスト (型番部分一致)
  const allParts = useMemo(() => [
    ...MASTER_FLAT,
    ...presets.flatMap((p) => p.parts.map((label) => ({ label, unit: "個", g: p.workName }))),
  ], [presets]);
  const suggestions = freeName.trim().length >= 1
    ? allParts.filter((p) => norm(p.label).includes(norm(freeName))).slice(0, 6)
    : [];

  function pickPresetPart(label: string) {
    setPresetPart(label);
    const p = group?.parts.find((x) => x.label === label);
    if (p) setUnit(p.unit);
  }
  function addToCart(name: string, u?: string) {
    const nm = (name || "").trim();
    const n = Math.max(1, Math.floor(Number(qty) || 1));
    if (!nm) { toast.error("材料名を選択または入力してください"); return; }
    const useUnit = u || unit || "個";
    setCart((c) => {
      const exists = c.find((x) => x.name === nm && x.unit === useUnit);
      if (exists) return c.map((x) => (x === exists ? { ...x, qty: x.qty + n } : x));
      return [...c, { name: nm, qty: n, unit: useUnit }];
    });
    setFreeName(""); setPresetPart(""); setQty(1);
  }
  function send() {
    if (cart.length === 0) { toast.error("材料をリストに追加してください"); return; }
    create.mutate({ siteId, note: note.trim() || undefined, items: cart });
  }
  function saveCartAsPreset() {
    if (cart.length === 0) { toast.error("リストが空です"); return; }
    const name = window.prompt("プリセット名 (工事名など)", "よく使う材料");
    if (!name || !name.trim()) return;
    savePreset.mutate({ siteId, workName: name.trim(), parts: cart.map((c) => c.name) });
  }

  const fmtDateTime = (d: string | Date) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  };
  const aggRows = (aggData?.rows || []) as { name: string; unit: string; qty: number; count: number }[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>📦 材料発注</DialogTitle></DialogHeader>

        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-lg text-sm border ${view === "list" ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>📋 依頼一覧</button>
            <button onClick={() => setView("agg")} className={`px-3 py-1.5 rounded-lg text-sm border ${view === "agg" ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>Σ 集計(発注用)</button>
          </div>
        )}

        {canEdit && view === "agg" ? (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <strong className="text-sm">Σ 材料の必要数 集計</strong>
            <div className="flex gap-2 flex-wrap items-center">
              {([["today", "今日"], ["week", "今週"], ["all", "全期間"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setAggPeriod(k)} className={`px-2.5 py-1 rounded-md text-xs border ${aggPeriod === k ? "bg-gold/10 text-gold border-gold/40" : "border-border text-muted-foreground"}`}>{label}</button>
              ))}
              <label className="ml-auto text-xs flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={aggPendingOnly} onChange={(e) => setAggPendingOnly(e.target.checked)} /> 依頼中のみ
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground">依頼日ベースで集計（今週=月曜起点）。このまま上位への発注リストに使えます。</p>
            {aggRows.length === 0 && <p className="text-sm text-muted-foreground py-2">該当する依頼はありません。</p>}
            {aggRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2 py-1.5 border-b border-border/50">
                <span className="text-sm flex-1">{row.name}</span>
                <span className="text-[11px] text-muted-foreground">{row.count}件</span>
                <strong className="text-base tabular-nums">{row.qty}</strong>
                <span className="text-xs text-muted-foreground min-w-[20px]">{row.unit}</span>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* 依頼作成 */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <strong className="text-sm">📦 材料の発注を依頼する</strong>
              <div className="text-xs text-muted-foreground">カタログから選択（未来工業・ネグロス電工 他）</div>
              <div className="flex gap-2 flex-wrap">
                <select value={groupSel} onChange={(e) => { setGroupSel(e.target.value); setPresetPart(""); }} className="flex-1 min-w-[130px] rounded-md border border-border bg-background p-2 text-sm">
                  <option value="">分類を選択</option>
                  {groups.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
                </select>
                <select value={presetPart} onChange={(e) => pickPresetPart(e.target.value)} disabled={!group} className="flex-[1.4] min-w-[150px] rounded-md border border-border bg-background p-2 text-sm disabled:opacity-50">
                  <option value="">材料を選択</option>
                  {group?.parts.map((pt, i) => <option key={i} value={pt.label}>{pt.label}</option>)}
                </select>
              </div>

              <div className="text-xs text-muted-foreground">または直接入力（型番の一部で候補が出ます）</div>
              <div className="relative">
                <input value={freeName} onChange={(e) => { setFreeName(e.target.value); setPresetPart(""); }}
                  placeholder="材料名・型番（例: D1、VVF、ビニテ）" className="w-full rounded-md border border-border bg-background p-2 text-sm" />
                {suggestions.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-border bg-background shadow-lg max-h-52 overflow-y-auto">
                    {suggestions.map((sug, i) => (
                      <button key={i} className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted text-left"
                        onClick={() => { setFreeName(sug.label); setUnit(sug.unit); }}>
                        <span className="flex-1">{sug.label}</span>
                        <span className="text-[10px] text-muted-foreground">{sug.g}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-sm text-muted-foreground">個数</span>
                <button className="w-8 h-8 rounded-md border border-border" onClick={() => setQty((q) => Math.max(1, Math.floor(Number(q) || 1) - 1))}>−</button>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-16 text-center rounded-md border border-border bg-background p-1.5 text-sm" />
                <button className="w-8 h-8 rounded-md border border-border" onClick={() => setQty((q) => Math.max(1, Math.floor(Number(q) || 1) + 1))}>＋</button>
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className="w-[70px] rounded-md border border-border bg-background p-1.5 text-sm">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <Button size="sm" className="ml-auto" onClick={() => addToCart(presetPart || freeName)}>＋ リストに追加</Button>
              </div>

              {cart.length > 0 && (
                <div className="rounded-md border border-border p-2 space-y-1">
                  {cart.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 py-1 border-b border-border/40 last:border-0">
                      <span className="text-sm flex-1">{item.name}</span>
                      <strong className="tabular-nums text-sm">× {item.qty}{item.unit}</strong>
                      <button className="text-[#FF4B00] text-sm" onClick={() => setCart((c) => c.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                  {canEdit && <button className="text-xs text-muted-foreground hover:text-gold mt-1" onClick={saveCartAsPreset}>★ このリストをプリセット保存</button>}
                </div>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="ひとこと（例: 1-1エリアの建て込み分）" className="w-full rounded-md border border-border bg-background p-2 text-sm" />
              <Button className="w-full" onClick={send} disabled={create.isPending}>📦 材料の発注を依頼する（{cart.length}）</Button>
            </div>

            {/* 依頼一覧 */}
            {requests.length === 0 && <p className="text-sm text-muted-foreground py-2">発注依頼はまだありません。</p>}
            {requests.map((r) => {
              const st = MREQ_STATUS[r.status] || MREQ_STATUS.pending;
              const mine = r.byUserId === meUserId;
              return (
                <div key={r.id} className="rounded-lg border border-border p-2" style={{ borderLeft: `4px solid ${st.color}` }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: st.color, color: st.text }}>{st.label}</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  {r.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm py-0.5 border-b border-border/30">
                      <span>{item.name}</span>
                      <strong className="tabular-nums">× {item.qty}{item.unit || "個"}</strong>
                    </div>
                  ))}
                  {r.note && <div className="text-xs text-muted-foreground mt-1">💬 {r.note}</div>}
                  <div className="flex gap-2 mt-2">
                    {canEdit && r.status === "pending" && (
                      <Button size="sm" className="flex-1" onClick={() => setStatus.mutate({ id: r.id, status: "ordered" })}>📦 発注済にする</Button>
                    )}
                    {canEdit && r.status === "ordered" && (
                      <Button size="sm" className="flex-1" style={{ background: "#03AF7A" }} onClick={() => setStatus.mutate({ id: r.id, status: "delivered" })}>✅ 納品済にする</Button>
                    )}
                    {mine && r.status === "pending" && !canEdit && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => { if (window.confirm("この依頼を取り消しますか？")) cancel.mutate({ id: r.id }); }}>依頼を取り消す</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
