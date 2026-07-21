import { useMemo, useState } from "react";
import { AlertTriangle, Layers, Plus, X } from "lucide-react";
import {
  RACK_TYPES,
  RACK_TYPE_ORDER,
  RACK_WIDTHS,
  calcCableRackRoute,
  calcCableRackTotals,
  type CableRackRouteInput,
  type RackType,
  type RackWidth,
} from "@shared/genba/tools/cableRack";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";

/**
 * ケーブルラック 材料計算: ルートごとにラック種別/幅/延長/付属部材/セパレータ/
 * ダクターレール寸法を入力すると、本体・ジョイント・ふれどめ・全ネジ・レール定尺本数を
 * ルート別と全材料合計で即時計算する。データ/計算は shared/genba/tools/cableRack.ts
 * （内線規程・メーカー標準の目安値）。完全クライアント完結（サーバー通信なし）。
 */

type RailRowState = { size: string; count: string };
type RouteState = {
  id: number;
  type: RackType;
  width: RackWidth;
  len: string;
  corner: string;
  rise: string;
  lr: string;
  expansion: string;
  tBranch: string;
  xBranch: string;
  hasSep: boolean;
  rails: RailRowState[];
};

let nextId = 1;
const newRoute = (): RouteState => ({
  id: nextId++,
  type: "QR",
  width: 300,
  len: "",
  corner: "",
  rise: "",
  lr: "",
  expansion: "",
  tBranch: "",
  xBranch: "",
  hasSep: false,
  rails: [{ size: "", count: "" }],
});

const num = (s: string): number => {
  const v = parseFloat(s);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

const toInput = (r: RouteState): CableRackRouteInput => ({
  type: r.type,
  width: r.width,
  lengthM: num(r.len),
  corner: Math.floor(num(r.corner)),
  rise: Math.floor(num(r.rise)),
  lr: Math.floor(num(r.lr)),
  expansion: Math.floor(num(r.expansion)),
  tBranch: Math.floor(num(r.tBranch)),
  xBranch: Math.floor(num(r.xBranch)),
  hasSep: r.hasSep,
  rails: r.rails.map((row) => ({ size: Math.floor(num(row.size)), count: Math.floor(num(row.count)) })),
});

export default function CableRackTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  // 材料名・型番はポルトガル語に訳さず日本語ローマ字表示（オーナー方針）
  const mn = (name: string) => (lang === "pt" ? romanize(name) : name);

  const [routes, setRoutes] = useState<RouteState[]>(() => [newRoute()]);

  const inputs = useMemo(() => routes.map(toInput), [routes]);
  const routeResults = useMemo(() => inputs.map(calcCableRackRoute), [inputs]);
  const totals = useMemo(() => calcCableRackTotals(inputs), [inputs]);

  const hasAnything = routeResults.some((r) => r.hasBody || r.rails.length > 0);

  const patch = (id: number, p: Partial<RouteState>) =>
    setRoutes((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Layers className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("ケーブルラック 材料計算")}</h2>
      </div>
      <p className="text-xs text-muted-foreground px-1 -mt-2">
        {t("ルートごとに入力すると、本体・ジョイント・支持材を即時計算します。")}
      </p>

      {/* STEP 1: ルート入力 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-3">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 1　ラックルートを入力")}</div>
        {routes.map((r, i) => (
          <RouteCard
            key={r.id}
            index={i}
            route={r}
            removable={routes.length > 1}
            lang={lang}
            onPatch={(p) => patch(r.id, p)}
            onRemove={() => setRoutes((rs) => rs.filter((x) => x.id !== r.id))}
          />
        ))}
        <button
          type="button"
          onClick={() => setRoutes((rs) => [...rs, newRoute()])}
          className="w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-bold text-muted-foreground flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {t("ルートを追加")}
        </button>
      </div>

      {/* 結果（即時） */}
      {!hasAnything && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("延長・部材・ダクターレールを入力すると自動で計算します。")}
        </p>
      )}
      {hasAnything && (
        <div className="space-y-3">
          {/* ルート別 */}
          {routes.map((r, i) => {
            const res = routeResults[i];
            if (!res || !res.hasBody) return null;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card/70 p-4">
                <div className="text-xs font-bold text-muted-foreground mb-2">
                  {t("ルート")}{i + 1}　W{r.width} {r.type}
                </div>
                <div>
                  {res.racks > 0 && <Row label={mn(`ラック本体（定尺 ${3}m）`)} value={res.racks} unit={t("本")} big color="#4DC4FF" />}
                  {res.straightJoints > 0 && <Row label={mn("ジョイント（直線用）")} value={res.straightJoints} unit={t("枚")} />}
                  {inputs[i]!.corner > 0 && (
                    <>
                      <Row label={mn("L形分岐")} value={inputs[i]!.corner} unit={t("個")} />
                      <Row label={mn("ジョイント（コーナー用）")} value={res.cornerJoints} unit={t("枚")} />
                    </>
                  )}
                  {inputs[i]!.rise > 0 && (
                    <>
                      <Row label={mn("上下自在")} value={inputs[i]!.rise} unit={t("箇所")} />
                      <Row label={mn("上下自在継手")} value={res.riseJoints} unit={t("対")} />
                      {res.riseSepJoints > 0 && <Row label={mn("セパレータ用上下自在継手")} value={res.riseSepJoints} unit={t("対")} />}
                    </>
                  )}
                  {inputs[i]!.lr > 0 && (
                    <>
                      <Row label={mn("左右自在")} value={inputs[i]!.lr} unit={t("箇所")} />
                      <Row label={mn("左右自在継手")} value={res.lrJoints} unit={t("対")} />
                    </>
                  )}
                  {inputs[i]!.expansion > 0 && (
                    <>
                      <Row label={mn("伸縮")} value={inputs[i]!.expansion} unit={t("箇所")} />
                      <Row label={mn("伸縮継手")} value={res.expJoints} unit={t("枚")} />
                    </>
                  )}
                  {inputs[i]!.tBranch > 0 && (
                    <>
                      <Row label={mn("T形分岐")} value={inputs[i]!.tBranch} unit={t("個")} />
                      <Row label={mn("ジョイント（T形用）")} value={res.tBranchJoints} unit={t("枚")} />
                    </>
                  )}
                  {inputs[i]!.xBranch > 0 && (
                    <>
                      <Row label={mn("X形分岐")} value={inputs[i]!.xBranch} unit={t("個")} />
                      <Row label={mn("ジョイント（X形用）")} value={res.xBranchJoints} unit={t("枚")} />
                    </>
                  )}
                  {res.fure > 0 && <Row label={mn(`ふれどめ（${r.type}用）`)} value={res.fure} unit={t("個")} />}
                  {res.sepSheets > 0 && (
                    <>
                      <Row label={mn("セパレータ（約1500mm）")} value={res.sepSheets} unit={t("枚")} />
                      {res.sepJointPlates > 0 && <Row label={mn("セパレータ用ジョイントプレート")} value={res.sepJointPlates} unit={t("枚")} />}
                      <Row label={mn("押さえ金具")} value={res.sepClamps} unit={t("個")} />
                    </>
                  )}
                </div>
                {/* レール（ルート別内訳） */}
                {res.rails.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <div className="text-[11px] font-bold text-muted-foreground mb-1">
                      {mn("ダクターレール")}（{t("定尺")} 2500mm・{res.railClass}）
                    </div>
                    {res.rails.map((row) => (
                      <div key={row.size} className="flex items-baseline justify-between gap-2 py-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {row.size}mm × {row.count}{t("か所")}（{t("1本から")}{row.perBar}{t("本取り　余り")}{row.remainder}mm）
                        </span>
                        <span className="text-sm font-bold tabular-nums shrink-0">{row.bars}{t("本")}</span>
                      </div>
                    ))}
                    {res.rails.length > 1 && <Row label={t("定尺 小計")} value={res.railBarsSubtotal} unit={t("本")} />}
                  </div>
                )}
                {/* コーナー×セパレータの手動加算注記 */}
                {res.cSepSheets > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "#F6AA00" }}>
                    {t("※ L形分岐")} {inputs[i]!.corner}{t("か所分：セパレータ +")}{res.cSepSheets}{t("枚、押さえ金具 +")}{res.cSepClampsMin}〜{res.cSepClampsMax}{t("個を加算してください")}
                    {res.cSepJoints > 0 ? `${t("（セパレータ用ジョイント +")}${res.cSepJoints}${t("枚）")}` : ""}
                  </p>
                )}
              </div>
            );
          })}

          {/* 支持材（合計） */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs font-bold text-muted-foreground mb-2">{t("支持材（合計）")}</div>
            <Row label={t("支持箇所（ダクターレール合計）")} value={totals.totalRailCount} unit={t("か所")} big color="#4DC4FF" />
            {totals.boltsSmall > 0 && <Row label={mn("全ネジボルト（W3/8）")} value={totals.boltsSmall} unit={t("本")} />}
            {totals.boltsLarge > 0 && <Row label={mn("全ネジボルト（W1/2）")} value={totals.boltsLarge} unit={t("本")} />}
            {totals.avgIntervalM != null && totals.intervalWarning && (
              <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#FF4B00" }} />
                <span>
                  {t("支持間隔が平均")} {totals.avgIntervalM.toFixed(1)}{t("m になっています。内線規程では2m以内が推奨です。")}
                </span>
              </p>
            )}
          </div>

          {/* ダクターレール（定尺） */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs font-bold text-muted-foreground mb-2">{mn("ダクターレール")}（{t("定尺")} 2500mm）</div>
            {totals.railsD1.totalBars === 0 && totals.railsD2.totalBars === 0 ? (
              <p className="text-sm text-muted-foreground">{t("※ ダクターレールの入力なし")}</p>
            ) : (
              <>
                {totals.railsD1.totalBars > 0 && <Row label={t("D1（W600以下）")} value={totals.railsD1.totalBars} unit={t("本")} big color="#03AF7A" />}
                {totals.railsD2.totalBars > 0 && <Row label={t("D2（W800以上）")} value={totals.railsD2.totalBars} unit={t("本")} big color="#03AF7A" />}
                <div className="mt-1.5 space-y-0.5">
                  {(["D1", "D2"] as const).map((cls) => {
                    const agg = cls === "D1" ? totals.railsD1 : totals.railsD2;
                    return agg.items.map((row) => (
                      <p key={`${cls}-${row.size}`} className="text-[11px] text-muted-foreground">
                        {cls}：{row.size}mm × {row.count}{t("本")}　{t("定尺1本から")} {row.perBar}{t("本取り（余り")} {row.remainder}mm）
                      </p>
                    ));
                  })}
                </div>
              </>
            )}
          </div>

          {/* 全材料 合計 */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs font-bold text-muted-foreground mb-2">{t("全材料 合計")}</div>
            <div>
              {totals.rackBodies.map((b) => (
                <Row key={`rk-${b.type}-${b.width}`} label={mn(`ケーブルラック ${b.type} W${b.width}（定尺 3m）`)} value={b.count} unit={t("本")} big color="#4DC4FF" />
              ))}
              {totals.corners.map((c) => (
                <Row key={`cn-${c.type}-${c.width}`} label={mn(`L形分岐 ${c.type} W${c.width}`)} value={c.count} unit={t("個")} />
              ))}
              {RACK_TYPE_ORDER.map((rt) => (
                <RowsPerType
                  key={rt}
                  lang={lang}
                  totals={{
                    [`ジョイント（${rt}用）|枚`]: totals.joints[rt],
                    [`上下自在継手（${rt}用）|対`]: totals.riseJoints[rt],
                    [`左右自在継手（${rt}用）|対`]: totals.lrJoints[rt],
                    [`伸縮継手（${rt}用）|枚`]: totals.expJoints[rt],
                    [`T形分岐（${rt}）|個`]: totals.tBranch[rt],
                    [`X形分岐（${rt}）|個`]: totals.xBranch[rt],
                    [`ふれどめ（${rt}用）|個`]: totals.fure[rt],
                    [`セパレータ 約1500mm（${rt}）|枚`]: totals.sepSheets[rt],
                    [`セパレータ用ジョイントプレート（${rt}）|枚`]: totals.sepJointPlates[rt],
                    [`セパレータ用上下自在継手（${rt}）|対`]: totals.riseSepJoints[rt],
                  }}
                />
              ))}
              {totals.sepClamps > 0 && <Row label={mn("押さえ金具（直線分）")} value={totals.sepClamps} unit={t("個")} />}
              {totals.boltsSmall > 0 && <Row label={mn("全ネジボルト W3/8")} value={totals.boltsSmall} unit={t("本")} />}
              {totals.boltsLarge > 0 && <Row label={mn("全ネジボルト W1/2")} value={totals.boltsLarge} unit={t("本")} />}
              {totals.railsD1.totalBars > 0 && <Row label={mn("ダクターレール D1（定尺 2500mm）")} value={totals.railsD1.totalBars} unit={t("本")} />}
              {totals.railsD2.totalBars > 0 && <Row label={mn("ダクターレール D2（定尺 2500mm）")} value={totals.railsD2.totalBars} unit={t("本")} />}
            </div>
            {totals.cornerSepNote && (
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "#F6AA00" }}>
                {t("※ L形分岐のあるルートはセパレータ・押さえ金具を別途加算してください。W500以下：+1枚/か所、W600以上：+2枚/か所。押さえ金具はL形分岐の箇所数 × 2〜3個が目安です。")}
              </p>
            )}
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground leading-relaxed">
              <p>{t("※ ジョイント枚数はラックの延長から算出した概算です。加工や施工手順により前後します。")}</p>
              <p>{t("※ 各数量は経験則に基づく目安です。現場の状況や施工方法により変動します。")}</p>
              <p>{t("※ ダクターレール・全ネジボルトのサイズはラック幅による目安です。実際の選定はラックにかかる荷重・現場条件で判断してください。")}</p>
              <p>{t("※ 計算値は最低限の数量です。現場の状況に応じて余裕分を確認してください。")}</p>
            </div>
          </div>
        </div>
      )}

      {/* 免責注記 */}
      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>{t("※ 支持間隔2m以内（内線規程 目安）・ラック定尺3m・ダクターレール定尺2500mm基準の概算です。")}</p>
        <p>{t("※ 規格・経験則に基づく目安値です。実施工では現場実測・設計図書・施工要領書を優先してください。")}</p>
      </div>
    </div>
  );
}

/** ルート1本分の入力カード */
function RouteCard({
  index,
  route,
  removable,
  lang,
  onPatch,
  onRemove,
}: {
  index: number;
  route: RouteState;
  removable: boolean;
  lang: GenbaLang;
  onPatch: (p: Partial<RouteState>) => void;
  onRemove: () => void;
}) {
  const t = (ja: string) => genbaTr(ja, lang);
  const mn = (name: string) => (lang === "pt" ? romanize(name) : name);
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2.5">
      <div className="flex items-center">
        <span className="text-sm font-bold">{t("ルート")} {index + 1}</span>
        {removable && (
          <button type="button" onClick={onRemove} className="ml-auto p-1 text-muted-foreground" aria-label={t("このルートを削除")}>
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 種別 + 幅 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="grid grid-cols-2 gap-1.5">
          {RACK_TYPE_ORDER.map((rt) => {
            const on = route.type === rt;
            return (
              <button
                key={rt}
                type="button"
                onClick={() => onPatch({ type: rt })}
                className={`rounded-lg border px-2 py-1.5 text-center transition-colors ${on ? "border-transparent text-white" : "border-border bg-card/50"}`}
                style={on ? { background: "#4DC4FF" } : undefined}
              >
                <div className="text-sm font-bold leading-tight">{RACK_TYPES[rt].label}</div>
                <div className={`text-[10px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>{mn(RACK_TYPES[rt].sub)}</div>
              </button>
            );
          })}
        </div>
        <label className="block">
          <span className="text-[11px] text-muted-foreground">{t("ラック幅")}</span>
          <select
            value={route.width}
            onChange={(e) => onPatch({ width: Number(e.target.value) as RackWidth })}
            className="mt-0.5 w-full rounded-lg border border-border bg-card/50 px-2 py-1.5 text-sm"
          >
            {RACK_WIDTHS.map((w) => (
              <option key={w} value={w}>W{w}</option>
            ))}
          </select>
        </label>
      </div>

      {/* 延長 */}
      <NumField label={t("延長")} unit="m" step="0.1" placeholder="例：15" value={route.len} onChange={(v) => onPatch({ len: v })} />

      {/* 部材（か所） */}
      <div className="grid grid-cols-3 gap-2">
        <NumField label={mn("コーナー")} unit={t("か所")} value={route.corner} onChange={(v) => onPatch({ corner: v })} />
        <NumField label={mn("上下自在")} unit={t("か所")} value={route.rise} onChange={(v) => onPatch({ rise: v })} />
        <NumField label={mn("左右自在")} unit={t("か所")} value={route.lr} onChange={(v) => onPatch({ lr: v })} />
        <NumField label={mn("伸縮")} unit={t("か所")} value={route.expansion} onChange={(v) => onPatch({ expansion: v })} />
        <NumField label={mn("T形分岐")} unit={t("か所")} value={route.tBranch} onChange={(v) => onPatch({ tBranch: v })} />
        <NumField label={mn("X形分岐")} unit={t("か所")} value={route.xBranch} onChange={(v) => onPatch({ xBranch: v })} />
      </div>

      {/* セパレータ */}
      <button
        type="button"
        onClick={() => onPatch({ hasSep: !route.hasSep })}
        className={`w-full rounded-lg border px-3 py-2 flex items-center justify-between transition-colors ${route.hasSep ? "border-transparent text-white" : "border-border bg-card/50"}`}
        style={route.hasSep ? { background: "#03AF7A" } : undefined}
      >
        <span className="text-sm font-bold">{mn("セパレータ")}</span>
        <span className={`text-xs font-bold ${route.hasSep ? "text-white/90" : "text-muted-foreground"}`}>{route.hasSep ? "ON" : "OFF"}</span>
      </button>

      {/* ダクターレール */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold text-muted-foreground">{mn("ダクターレール")}（{t("支持か所")}）</div>
        {route.rails.map((row, ri) => (
          <div key={ri} className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={t("寸法")}
              value={row.size}
              onChange={(e) => onPatch({ rails: route.rails.map((x, xi) => (xi === ri ? { ...x, size: e.target.value } : x)) })}
              className="w-full min-w-0 rounded-lg border border-border bg-card/50 px-2 py-1.5 text-sm tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">mm ×</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder={t("箇所")}
              value={row.count}
              onChange={(e) => onPatch({ rails: route.rails.map((x, xi) => (xi === ri ? { ...x, count: e.target.value } : x)) })}
              className="w-full min-w-0 rounded-lg border border-border bg-card/50 px-2 py-1.5 text-sm tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground shrink-0">{t("か所")}</span>
            {route.rails.length > 1 && (
              <button
                type="button"
                onClick={() => onPatch({ rails: route.rails.filter((_, xi) => xi !== ri) })}
                className="p-1 text-muted-foreground shrink-0"
                aria-label={t("このレール行を削除")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => onPatch({ rails: [...route.rails, { size: "", count: "" }] })}
          className="w-full rounded-lg border border-dashed border-border px-2 py-1.5 text-xs font-bold text-muted-foreground flex items-center justify-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> {t("レール寸法を追加")}
        </button>
      </div>
    </div>
  );
}

/** ラベル付き number 入力 */
function NumField({
  label,
  unit,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="mt-0.5 flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step ?? "1"}
          placeholder={placeholder ?? "0"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 rounded-lg border border-border bg-card/50 px-2 py-1.5 text-sm tabular-nums"
        />
        <span className="text-[11px] text-muted-foreground shrink-0">{unit}</span>
      </div>
    </label>
  );
}

/** 結果1行（数量は大きめ表示） */
function Row({ label, value, unit, big, color }: { label: string; value: number; unit: string; big?: boolean; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1 border-b border-border/50 last:border-0">
      <span className="text-xs">{label}</span>
      <span
        className={`${big ? "text-2xl" : "text-lg"} font-black tabular-nums shrink-0`}
        style={color ? { color } : undefined}
      >
        {value}
        <span className="text-[11px] font-bold text-muted-foreground ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

/** 「ラベル|単位」→数量 のマップから 0 を除いて行を並べる（種別別合計用） */
function RowsPerType({ lang, totals }: { lang: GenbaLang; totals: Record<string, number> }) {
  const tr = (ja: string) => genbaTr(ja, lang);
  const mn = (name: string) => (lang === "pt" ? romanize(name) : name);
  return (
    <>
      {Object.entries(totals)
        .filter(([, v]) => v > 0)
        .map(([key, v]) => {
          const [label, unit] = key.split("|");
          return <Row key={key} label={mn(label ?? key)} value={v} unit={tr(unit ?? "")} />;
        })}
    </>
  );
}
