import { useMemo, useState } from "react";
import { AlertTriangle, Cable, Droplets, Plus, X } from "lucide-react";
import {
  CONDUIT_LOCATIONS,
  CONDUIT_LOCATION_ORDER,
  END_TYPES,
  END_TYPE_ORDER,
  NOTE_INDOOR,
  NOTE_OUTDOOR,
  PIPE_LENGTH_M,
  SADDLE_INTERVAL_M,
  WALL_DATA,
  WALL_ORDER,
  WATERPROOF_NOTE,
  calcMetalConduit,
  needsWaterproofNote,
  parseRouteLength,
  validateMetalConduit,
  type ConduitLocation,
  type ConduitRoute,
  type EndType,
  type WallKey,
} from "@shared/genba/tools/metalConduit";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";

/** ルート入力1件（UI状態: 延長は文字列で保持し計算時に数値化） */
type RouteInput = {
  id: number;
  len: string;
  startType: EndType;
  endType: EndType;
};

/**
 * 金属管 拾い出し: 設置場所（屋内E管/屋外G管）と配管ルート（延長・両端の施工方法）から
 * 金属管本数・カップリング・サドル等支持材・末端処理材料を即時計算する。
 * 定尺3.66m（JIS C 8305）・サドル間隔1.5m（目安）で切り上げ計算。
 * 壁材質を選ぶと固定方法の候補（情報表示のみ・計算結果には影響しない）を表示。
 * データは shared/genba/tools/metalConduit.ts。完全クライアント完結（サーバー通信なし）。
 */
export default function MetalConduitTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  // 材料名・型番はポルトガル語に訳さず日本語ローマ字表示（オーナー方針）
  const mn = (name: string) => (lang === "pt" ? romanize(name) : name);

  const [location, setLocation] = useState<ConduitLocation>("indoor");
  const [wall, setWall] = useState<WallKey | null>(null);
  const [nextId, setNextId] = useState(2);
  const [routes, setRoutes] = useState<RouteInput[]>([
    { id: 1, len: "", startType: "pullbox", endType: "pullbox" },
  ]);

  const parsedRoutes = useMemo<ConduitRoute[]>(
    () =>
      routes.map((r) => ({
        lengthM: parseRouteLength(r.len),
        startType: r.startType,
        endType: r.endType,
      })),
    [routes],
  );
  const error = useMemo(() => validateMetalConduit(parsedRoutes), [parsedRoutes]);
  const result = useMemo(() => calcMetalConduit(parsedRoutes), [parsedRoutes]);

  const loc = CONDUIT_LOCATIONS[location];
  const wallInfo = wall ? WALL_DATA[wall] : null;

  const addRoute = () => {
    setRoutes((prev) => [...prev, { id: nextId, len: "", startType: "pullbox", endType: "pullbox" }]);
    setNextId((n) => n + 1);
  };
  const removeRoute = (id: number) => setRoutes((prev) => prev.filter((r) => r.id !== id));
  const patchRoute = (id: number, patch: Partial<Omit<RouteInput, "id">>) =>
    setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Cable className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("金属管 拾い出し")}</h2>
      </div>

      {/* STEP1: 設置場所 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　設置場所")}</div>
        <div className="grid grid-cols-2 gap-2">
          {CONDUIT_LOCATION_ORDER.map((k) => {
            const on = location === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setLocation(k)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: "#4DC4FF" } : undefined}
              >
                {t(CONDUIT_LOCATIONS[k].label)}
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP2: 壁の材質（任意） */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 2　壁の材質（任意）")}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 mb-2">
          {t("支持材の固定方法の候補を表示します（計算結果には影響しません）")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {WALL_ORDER.map((k) => {
            const on = wall === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setWall(on ? null : k)}
                className={`rounded-xl border px-2 py-2.5 text-xs font-bold leading-tight transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: "#4DC4FF" } : undefined}
              >
                {mn(WALL_DATA[k].label)}
              </button>
            );
          })}
        </div>

        {/* 固定方法の候補カード */}
        {wallInfo && (
          <div className="mt-3 rounded-xl border border-border bg-card/50 p-3">
            <div className="text-xs font-bold mb-2">【{mn(wallInfo.fullLabel)}】{t("固定方法の候補")}</div>
            <div className="space-y-1.5">
              {wallInfo.methods.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      m.tagKind === "main" ? "text-white" : "bg-muted text-muted-foreground"
                    }`}
                    style={m.tagKind === "main" ? { background: "#4DC4FF" } : undefined}
                  >
                    {t(m.tag)}
                  </span>
                  <span className="leading-tight">{mn(m.name)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "#F6AA00" }} />
              <span>{t(wallInfo.warning)}</span>
            </p>
          </div>
        )}
      </div>

      {/* STEP3: 配管ルート */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 3　配管ルート")}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 mb-2">
          {t("ルートごとに延長と両端の施工方法を入力")}
        </div>
        <div className="space-y-3">
          {routes.map((r, idx) => (
            <div key={r.id} className="rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center mb-2">
                <span className="text-sm font-bold">{t("ルート")} {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRoute(r.id)}
                  className="ml-auto rounded-lg p-1 text-muted-foreground hover:text-foreground"
                  aria-label={`${t("ルート")} ${idx + 1} ${t("削除")}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* 延長 */}
              <label className="block text-[11px] font-bold text-muted-foreground mb-1">{t("延長")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.1}
                  placeholder={t("例：10")}
                  value={r.len}
                  onChange={(e) => patchRoute(r.id, { len: e.target.value })}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
                />
                <span className="text-sm text-muted-foreground shrink-0">m</span>
              </div>
              {/* 始端 → 配管 → 終端 */}
              <label className="block text-[11px] font-bold text-muted-foreground mt-2 mb-1">{t("始端")}</label>
              <EndSelect value={r.startType} onChange={(v) => patchRoute(r.id, { startType: v })} lang={lang} />
              <div className="my-1.5 text-center text-[10px] text-muted-foreground">│ {t("配管")} │</div>
              <label className="block text-[11px] font-bold text-muted-foreground mb-1">{t("終端")}</label>
              <EndSelect value={r.endType} onChange={(v) => patchRoute(r.id, { endType: v })} lang={lang} />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRoute}
          className="mt-3 w-full rounded-xl border border-dashed border-border bg-card/50 px-3 py-2.5 text-sm font-bold text-muted-foreground flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {t("ルートを追加")}
        </button>
      </div>

      {/* 結果（即時計算） */}
      {error != null ? (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <p className="text-sm text-muted-foreground text-center">{t(error)}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 配管材料 */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs font-bold text-muted-foreground mb-1">{t("必要材料リスト")}</div>
            <div className="text-[11px] text-muted-foreground mb-3">
              {t("合計延長")} {result.totalLengthM} m｜{t("定尺")} {PIPE_LENGTH_M} m・{t("サドル間隔")} {SADDLE_INTERVAL_M} m
            </div>
            <div className="space-y-3">
              <ResultRow label={mn(loc.pipeLabel)} value={result.pipes} unit={t("本")} color="#4DC4FF" big />
              <ResultRow label={mn(loc.couplingLabel)} value={result.couplings} unit={t("個")} color="#4DC4FF" />
              <ResultRow label={mn("サドル等（支持材）")} value={result.saddles} unit={t("個")} color="#4DC4FF" />
            </div>
          </div>

          {/* 末端処理 内訳 */}
          {END_TYPE_ORDER.some((t2) => result.endCounts[t2] > 0) && (
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="text-xs font-bold text-muted-foreground mb-2">{t("末端処理 内訳")}</div>
              <div className="space-y-1.5">
                {END_TYPE_ORDER.filter((t2) => result.endCounts[t2] > 0).map((t2) => (
                  <div key={t2} className="flex items-baseline text-sm">
                    <span>{mn(END_TYPES[t2].countLabel)}</span>
                    <span className="ml-auto font-bold tabular-nums">
                      {result.endCounts[t2]}
                      <span className="text-xs font-normal text-muted-foreground ml-0.5">{t("か所")}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 末端処理材料 */}
          {(result.materials.connectors > 0 ||
            result.materials.locknuts > 0 ||
            result.materials.bushings > 0 ||
            result.materials.endcaps > 0) && (
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="text-xs font-bold text-muted-foreground mb-2">{t("末端処理材料")}</div>
              <div className="space-y-3">
                {result.materials.connectors > 0 && (
                  <ResultRow label={mn("コネクタ")} value={result.materials.connectors} unit={t("個")} color="#03AF7A" />
                )}
                {result.materials.locknuts > 0 && (
                  <ResultRow label={mn("ロックナット")} value={result.materials.locknuts} unit={t("個")} color="#03AF7A" />
                )}
                {result.materials.bushings > 0 && (
                  <ResultRow label={mn("絶縁ブッシング")} value={result.materials.bushings} unit={t("個")} color="#03AF7A" />
                )}
                {result.materials.endcaps > 0 && (
                  <ResultRow
                    label={mn("エンドキャップ（サンピーキャップ）")}
                    value={result.materials.endcaps}
                    unit={t("個")}
                    color="#03AF7A"
                  />
                )}
              </div>
            </div>
          )}

          {/* 数量・材質の注記 */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            {location === "indoor" ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{t(NOTE_INDOOR)}</p>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-bold leading-relaxed" style={{ color: "#F6AA00" }}>
                  {t(NOTE_OUTDOOR[0])}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">{t(NOTE_OUTDOOR[1])}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{t(NOTE_OUTDOOR[2])}</p>
              </div>
            )}
          </div>

          {/* 屋外×プールボックス 防水処理注記 */}
          {needsWaterproofNote(location, result) && (
            <div className="rounded-2xl border p-4" style={{ borderColor: "#4DC4FF" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Droplets className="w-4 h-4 shrink-0" style={{ color: "#4DC4FF" }} />
                <div className="text-sm font-bold" style={{ color: "#4DC4FF" }}>
                  {t(WATERPROOF_NOTE.title)}
                </div>
              </div>
              <div className="space-y-2">
                {WATERPROOF_NOTE.sections.map((s, i) => (
                  <div key={i}>
                    <div className="text-xs font-bold">{t(s.heading)}</div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{t(s.body)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs font-bold">{t(WATERPROOF_NOTE.material)}</p>
            </div>
          )}
        </div>
      )}

      {/* 免責注記 */}
      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>{t("※ 定尺3.66m（JIS C 8305）・サドル間隔1.5m（目安）による切り上げ計算です。ロス・予備は含みません。")}</p>
        <p>{t("※ 計算値は目安です。実施工では現場実測・設計図書・施工要領書を優先し、余裕分を確認してください。")}</p>
      </div>
    </div>
  );
}

/** 末端処理タイプのセレクト */
function EndSelect({
  value,
  onChange,
  lang,
}: {
  value: EndType;
  onChange: (v: EndType) => void;
  lang: GenbaLang;
}) {
  const mn = (name: string) => (lang === "pt" ? romanize(name) : name);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as EndType)}
      className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm"
    >
      {END_TYPE_ORDER.map((t) => (
        <option key={t} value={t}>
          {mn(END_TYPES[t].label)}
        </option>
      ))}
    </select>
  );
}

/** 数量1行（数値を大きく表示） */
function ResultRow({
  label,
  value,
  unit,
  color,
  big,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
  big?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm leading-tight">{label}</span>
      <span className="ml-auto shrink-0 tabular-nums font-black leading-tight" style={{ color }}>
        <span className={big ? "text-4xl" : "text-2xl"}>{value}</span>
        <span className="text-sm font-bold text-muted-foreground ml-1">{unit}</span>
      </span>
    </div>
  );
}
