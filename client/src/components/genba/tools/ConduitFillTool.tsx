import { useMemo, useState } from "react";
import { Cable, Minus, Plus } from "lucide-react";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";
import {
  CONDUIT_FILL_PIPES,
  CONDUIT_KIND_ORDER,
  FILL_LIMIT_PERCENT,
  IV_WIRES,
  calcConduitFill,
  conduitInnerDia,
  conduitSizes,
  fillStatus,
  maxWireCount,
  type ConduitKind,
  type FillStatus,
} from "@shared/genba/tools/conduitFill";

/**
 * 占積率 計算: 管種 → 呼び径 → 電線（IV）を +/- で複数追加すると
 * 占積率(%)・判定・最大収容本数を即時表示する。
 * データ・計算は shared/genba/tools/conduitFill.ts（内線規程の一般則 32% 上限、
 * 内径・仕上外径は目安値）。完全クライアント完結（サーバー通信なし）。
 */

/** 判定別の CUD 固定色（テーマ不変） */
const STATUS_COLOR: Record<FillStatus, string> = {
  ok: "#03AF7A",
  warn: "#F6AA00",
  ng: "#FF4B00",
};

const STATUS_LABEL: Record<FillStatus, string> = {
  ok: "OK（収容可）",
  warn: "注意（上限間近）",
  ng: "NG（32%超過）",
};

/** バー表示レンジ [%]（32%閾値線がバーの2/3付近に来るスケール） */
const BAR_MAX_PERCENT = 48;

export default function ConduitFillTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const m = (name: string) => (lang === "pt" ? romanize(name) : name);
  const [kind, setKind] = useState<ConduitKind | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const pipe = kind ? CONDUIT_FILL_PIPES[kind] : null;
  const sizes = useMemo(() => (kind ? conduitSizes(kind) : []), [kind]);
  const innerDia = kind && size != null ? conduitInnerDia(kind, size) : null;

  // 本数が入っている電線のみを計算対象にする
  const usedWires = useMemo(() => IV_WIRES.filter((w) => (counts[w.key] || 0) > 0), [counts]);
  const result = useMemo(() => {
    if (innerDia == null) return null;
    return calcConduitFill(
      innerDia,
      usedWires.map((w) => ({ odMm: w.odMm, count: counts[w.key] || 0 })),
    );
  }, [innerDia, usedWires, counts]);

  const status = result ? fillStatus(result.fillPercent) : null;
  const color = status ? STATUS_COLOR[status] : "#4DC4FF";

  const selectKind = (k: ConduitKind) => {
    setKind(k);
    setSize(null);
  };

  const addCount = (key: string, delta: number) => {
    setCounts((prev) => {
      const next = Math.max(0, (prev[key] || 0) + delta);
      return { ...prev, [key]: next };
    });
  };

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Cable className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("占積率 計算")}</h2>
        {usedWires.length > 0 && (
          <button
            type="button"
            onClick={() => setCounts({})}
            className="ml-auto rounded-lg border border-border bg-card/50 px-2.5 py-1.5 text-xs font-bold text-muted-foreground transition-colors"
          >
            {t("本数クリア")}
          </button>
        )}
      </div>

      {/* STEP1: 管種 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　電線管の種類")}</div>
        <div className="grid grid-cols-2 gap-2">
          {CONDUIT_KIND_ORDER.map((k) => {
            const p = CONDUIT_FILL_PIPES[k];
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => selectKind(k)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: "#4DC4FF" } : undefined}
              >
                <div className="text-sm font-bold leading-tight">{m(p.label)}</div>
                <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>
                  {m(p.sub)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP2: 呼び径 */}
      {pipe && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 2　呼び径")}</div>
          <div className="grid grid-cols-4 gap-2">
            {sizes.map((s) => {
              const on = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSize(s)}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    on ? "border-transparent text-white" : "border-border bg-card/50"
                  }`}
                  style={on ? { background: "#4DC4FF" } : undefined}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {size != null && innerDia != null && (
            <div className="mt-2 text-[11px] text-muted-foreground tabular-nums">
              {t("内径")} φ{innerDia.toFixed(1)}mm（{t(pipe.note)}）
            </div>
          )}
        </div>
      )}

      {/* STEP3: 電線を +/- で追加（複数種混在可） */}
      {innerDia != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            {t("STEP 3　入れる電線（IV）　※複数種の混在可")}
          </div>
          <div className="space-y-1.5">
            {IV_WIRES.map((w) => {
              const n = counts[w.key] || 0;
              return (
                <div
                  key={w.key}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 ${
                    n > 0 ? "border-border bg-card" : "border-border/50 bg-card/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold leading-tight">{m(w.label)}</div>
                    <div className="text-[11px] text-muted-foreground leading-tight tabular-nums">
                      {t("仕上外径")} φ{w.odMm.toFixed(1)}mm（{t("目安")}）
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => addCount(w.key, -1)}
                      disabled={n === 0}
                      aria-label={`${m(w.label)} ${t("を1本減らす")}`}
                      className="w-8 h-8 rounded-lg border border-border bg-card/50 flex items-center justify-center disabled:opacity-30"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span
                      className="w-9 text-center text-base font-black tabular-nums"
                      style={n > 0 ? { color: "#4DC4FF" } : undefined}
                    >
                      {n}
                    </span>
                    <button
                      type="button"
                      onClick={() => addCount(w.key, 1)}
                      aria-label={`${m(w.label)} ${t("を1本増やす")}`}
                      className="w-8 h-8 rounded-lg border border-border bg-card/50 flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {t("※ CV（単心）・CVV 等はメーカーカタログの仕上外径（目安）を確認してください。")}
          </div>
        </div>
      )}

      {/* 結果: 占積率バー + 判定 */}
      {result && innerDia != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs text-muted-foreground">
            {t("占積率")}（{t("上限")} {FILL_LIMIT_PERCENT}%・{t("内線規程の一般則")}）
          </div>
          {result.wireCount > 0 ? (
            <>
              <div className="flex items-end gap-2 mt-1">
                <span className="text-5xl font-black tabular-nums" style={{ color }}>
                  {result.fillPercent.toFixed(1)}
                </span>
                <span className="text-lg font-bold text-muted-foreground mb-1">%</span>
                <span
                  className="ml-auto mb-1 rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                  style={{ background: color }}
                >
                  {status ? t(STATUS_LABEL[status]) : ""}
                </span>
              </div>

              {/* バー（32%閾値ライン付き） */}
              <div className="mt-3 relative h-3.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (result.fillPercent / BAR_MAX_PERCENT) * 100)}%`,
                    background: color,
                  }}
                />
                {/* 32% 閾値ライン */}
                <div
                  className="absolute top-0 bottom-0 w-0.5"
                  style={{ left: `${(FILL_LIMIT_PERCENT / BAR_MAX_PERCENT) * 100}%`, background: "#FF4B00" }}
                />
              </div>
              <div
                className="text-[10px] font-bold tabular-nums mt-0.5"
                style={{
                  marginLeft: `${(FILL_LIMIT_PERCENT / BAR_MAX_PERCENT) * 100}%`,
                  transform: "translateX(-50%)",
                  width: "fit-content",
                  color: "#FF4B00",
                }}
              >
                {FILL_LIMIT_PERCENT}%
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground tabular-nums">
                <div>{t("電線 合計")} {result.wireCount} {t("本")}</div>
                <div className="text-right">{t("電線断面積 計")} {result.wireAreaMm2.toFixed(1)} mm²</div>
                <div>{t("内径")} φ{innerDia.toFixed(1)} mm</div>
                <div className="text-right">{t("管内断面積")} {result.conduitAreaMm2.toFixed(1)} mm²</div>
              </div>
              {status === "ng" && (
                <div className="mt-2 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "#FF4B00" }}>
                  {t("占積率が")} {FILL_LIMIT_PERCENT}% {t("を超えています。管サイズを上げるか本数を減らしてください。")}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              {t("STEP 3 で電線を追加すると占積率を表示します。")}
            </p>
          )}
        </div>
      )}

      {/* 最大収容本数（単独収容時の早見） */}
      {innerDia != null && pipe && size != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            {m(pipe.label)} {size}（{t("内径")} φ{innerDia.toFixed(1)}mm）{t("の最大収容本数　※同一太さ単独時")}
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-bold py-1.5">{t("電線")}</th>
                <th className="text-right font-bold py-1.5">{t("仕上外径")} (mm)</th>
                <th className="text-right font-bold py-1.5">{t("最大本数")}</th>
              </tr>
            </thead>
            <tbody>
              {IV_WIRES.map((w) => {
                const used = (counts[w.key] || 0) > 0;
                return (
                  <tr key={w.key} className={`border-b border-border/50 last:border-0 ${used ? "font-bold" : ""}`}>
                    <td className="py-1.5">{m(w.label)}</td>
                    <td className="py-1.5 text-right">φ{w.odMm.toFixed(1)}</td>
                    <td className="py-1.5 text-right" style={used ? { color: "#4DC4FF" } : undefined}>
                      {maxWireCount(innerDia, w.odMm)} {t("本")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {t("※ 占積率")} {FILL_LIMIT_PERCENT}% {t("以内で単独収容した場合の計算値です。")}
          </div>
        </div>
      )}

      {/* 免責注記 */}
      <p className="text-[11px] text-muted-foreground px-1">
        {t("※ 内径・仕上外径は規格・カタログに基づく目安値です。占積率の上限（")}{FILL_LIMIT_PERCENT}
        {t("%）は内線規程の一般則によります。実施工では現場実測・設計図書・所轄基準を優先してください。")}
      </p>
    </div>
  );
}
