import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";
import {
  BOND_WIRE_SIMPLE_MAX_A,
  GROUND_CLASS_NOTES,
  GROUND_WIRE_TABLE,
  INSTALL_CONDITIONS,
  IV_AMPACITY,
  VOLTAGE_PRESETS,
  WIRE_SECTION_PRESETS_SQ,
  WIRING_METHODS,
  allowableCurrent,
  bondWireSize,
  calcVoltDrop,
  groundWireSize,
  voltDropLimitPercent,
  voltDropPercent,
  voltDropStatus,
  type WiringJudge,
  type WiringMethodKey,
} from "@shared/genba/tools/wiring";

/**
 * 配線 計算: 電圧降下 / 許容電流 / 接地線太さ / ボンド線目安 の4タブ複合ツール。
 * データ・計算は shared/genba/tools/wiring.ts（内線規程・電技解釈の一般値目安）。
 * 選択・入力で即時再計算（計算ボタンなし）。完全クライアント完結。
 */

/** 判定別の CUD 固定色（テーマ不変） */
const JUDGE_COLOR: Record<WiringJudge, string> = {
  ok: "#03AF7A",
  warn: "#F6AA00",
  ng: "#FF4B00",
};

const JUDGE_LABEL: Record<WiringJudge, string> = {
  ok: "OK（目安内）",
  warn: "注意（上限間近）",
  ng: "NG（目安超過）",
};

/** 情報表示の CUD 固定色 */
const INFO_COLOR = "#4DC4FF";

type TabKey = "drop" | "ampacity" | "ground" | "bond";

const TABS: { key: TabKey; label: string }[] = [
  { key: "drop", label: "電圧降下" },
  { key: "ampacity", label: "許容電流" },
  { key: "ground", label: "接地線" },
  { key: "bond", label: "ボンド線" },
];

export default function WiringCalcTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const [tab, setTab] = useState<TabKey>("drop");

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("配線 計算")}</h2>
      </div>

      {/* タブ切替 */}
      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map((tb) => {
          const on = tab === tb.key;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`rounded-xl border px-1 py-2 text-xs font-bold transition-colors ${
                on ? "border-transparent text-white" : "border-border bg-card/50 text-muted-foreground"
              }`}
              style={on ? { background: INFO_COLOR } : undefined}
            >
              {t(tb.label)}
            </button>
          );
        })}
      </div>

      {tab === "drop" && <VoltDropTab lang={lang} />}
      {tab === "ampacity" && <AmpacityTab lang={lang} />}
      {tab === "ground" && <GroundTab lang={lang} />}
      {tab === "bond" && <BondTab lang={lang} />}

      {/* 免責注記 */}
      <p className="text-[11px] text-muted-foreground px-1">
        {t("※ 本ツールは内線規程・電技解釈等の一般周知値に基づく目安です。最終判断は設計図書・電力会社基準・所轄基準・現場実測を優先してください。")}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 共通小物                                                            */
/* ------------------------------------------------------------------ */

function NumField({
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-muted-foreground">{label}</span>
      <span className="mt-0.5 flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-base font-bold tabular-nums outline-none"
        />
        <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
      </span>
    </label>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-2 py-2 text-sm font-bold tabular-nums transition-colors ${
        on ? "border-transparent text-white" : "border-border bg-card/50"
      }`}
      style={on ? { background: INFO_COLOR } : undefined}
    >
      {children}
    </button>
  );
}

function parseNum(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* タブ1: 電圧降下                                                      */
/* ------------------------------------------------------------------ */

function VoltDropTab({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const [methodKey, setMethodKey] = useState<WiringMethodKey>("single2");
  const [lStr, setLStr] = useState("");
  const [iStr, setIStr] = useState("");
  const [aStr, setAStr] = useState("");
  const [vStr, setVStr] = useState("100");

  const method = WIRING_METHODS.find((m) => m.key === methodKey)!;
  const lengthM = parseNum(lStr);
  const currentA = parseNum(iStr);
  const sectionSq = parseNum(aStr);
  const voltage = parseNum(vStr);

  const result = useMemo(() => {
    if (lengthM == null || currentA == null || sectionSq == null || voltage == null) return null;
    const dropV = calcVoltDrop(method.k, lengthM, currentA, sectionSq);
    const percent = voltDropPercent(dropV, voltage);
    const limit = voltDropLimitPercent(lengthM);
    const status = voltDropStatus(percent, limit);
    return { dropV, percent, limit, status };
  }, [method.k, lengthM, currentA, sectionSq, voltage]);

  const color = result ? JUDGE_COLOR[result.status] : INFO_COLOR;

  return (
    <>
      {/* STEP1: 配電方式 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　配電方式")}</div>
        <div className="space-y-1.5">
          {WIRING_METHODS.map((wm) => {
            const on = methodKey === wm.key;
            return (
              <button
                key={wm.key}
                type="button"
                onClick={() => setMethodKey(wm.key)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: INFO_COLOR } : undefined}
              >
                <div className="text-sm font-bold leading-tight">{t(wm.label)}</div>
                <div className={`text-[11px] leading-tight tabular-nums ${on ? "text-white/80" : "text-muted-foreground"}`}>
                  {t(wm.sub)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP2: 条件入力 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-3">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 2　条件入力")}</div>
        <div className="grid grid-cols-2 gap-2">
          <NumField label={t("こう長 L")} unit="m" value={lStr} onChange={setLStr} placeholder={t("例: 30")} />
          <NumField label={t("電流 I")} unit="A" value={iStr} onChange={setIStr} placeholder={t("例: 20")} />
        </div>
        <div>
          <NumField label={t("電線断面積 A")} unit="sq" value={aStr} onChange={setAStr} placeholder={t("例: 5.5")} />
          <div className="mt-1.5 grid grid-cols-5 gap-1.5">
            {WIRE_SECTION_PRESETS_SQ.map((sq) => (
              <Chip key={sq} on={sectionSq === sq} onClick={() => setAStr(String(sq))}>
                {sq}
              </Chip>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {t("※ 単線は 1.6mm ≒ 2sq / 2.0mm ≒ 3.5sq（一般換算目安）")}
          </div>
        </div>
        <div>
          <NumField label={t("回路電圧 V")} unit="V" value={vStr} onChange={setVStr} placeholder={t("例: 100")} />
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {VOLTAGE_PRESETS.map((v) => (
              <Chip key={v} on={voltage === v} onClick={() => setVStr(String(v))}>
                {v}V
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* 結果 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs text-muted-foreground">
          {t("電圧降下")}　e = K・L・I ÷ (1000・A)（K = {method.k}）
        </div>
        {result ? (
          <>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-5xl font-black tabular-nums" style={{ color }}>
                {result.dropV.toFixed(2)}
              </span>
              <span className="text-lg font-bold text-muted-foreground mb-1">V</span>
              <span
                className="ml-auto mb-1 rounded-lg px-2.5 py-1 text-xs font-bold text-white"
                style={{ background: color }}
              >
                {t(JUDGE_LABEL[result.status])}
              </span>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-2xl font-black tabular-nums" style={{ color }}>
                {result.percent.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-muted-foreground mb-0.5">%</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums mb-0.5">
                {t("目安 上限")} {result.limit}%（{t("こう長")} {lengthM}m）
              </span>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              {t("※ 降下率の上限目安（内線規程系）: こう長60m以下 2% / 120m以下 4% / 200m以下 5% / 200m超 6%")}
            </div>
            {result.status === "ng" && (
              <div className="mt-2 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "#FF4B00" }}>
                {t("降下率が目安上限を超えています。電線サイズを上げるか、こう長・電流を見直してください。")}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">{t("STEP 2 の条件を入力すると即時計算します。")}</p>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* タブ2: 幹線・許容電流                                                */
/* ------------------------------------------------------------------ */

function AmpacityTab({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const m = (name: string) => (lang === "pt" ? romanize(name) : name);
  const [condKey, setCondKey] = useState<string>(INSTALL_CONDITIONS[0].key);
  const [wireKey, setWireKey] = useState<string | null>(null);

  const cond = INSTALL_CONDITIONS.find((c) => c.key === condKey)!;
  const wire = wireKey ? IV_AMPACITY.find((w) => w.key === wireKey) : null;

  return (
    <>
      {/* STEP1: 敷設条件 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　敷設条件")}</div>
        <div className="grid grid-cols-2 gap-2">
          {INSTALL_CONDITIONS.map((c) => {
            const on = condKey === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCondKey(c.key)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: INFO_COLOR } : undefined}
              >
                <div className="text-sm font-bold leading-tight">{t(c.label)}</div>
                <div className={`text-[11px] leading-tight tabular-nums ${on ? "text-white/80" : "text-muted-foreground"}`}>
                  {t(c.sub)}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {t("※ 同一管内4本以上はさらに低減されます（内線規程の低減係数表を参照）。")}
        </div>
      </div>

      {/* STEP2: 電線サイズ */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 2　電線サイズ（IV）")}</div>
        <div className="grid grid-cols-3 gap-1.5">
          {IV_AMPACITY.map((w) => (
            <Chip key={w.key} on={wireKey === w.key} onClick={() => setWireKey(w.key)}>
              {m(w.label.replace("IV ", ""))}
            </Chip>
          ))}
        </div>
      </div>

      {/* 結果 */}
      {wire && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs text-muted-foreground">
            {m(wire.label)} {t("の許容電流")}（{t(cond.label)}）
          </div>
          <div className="flex items-end gap-2 mt-1">
            <span className="text-5xl font-black tabular-nums" style={{ color: "#03AF7A" }}>
              {allowableCurrent(wire.baseA, cond.factor).toFixed(cond.factor === 1 ? 0 : 1)}
            </span>
            <span className="text-lg font-bold text-muted-foreground mb-1">A</span>
            {cond.factor !== 1 && (
              <span className="ml-auto text-xs text-muted-foreground tabular-nums mb-1">
                {t("基準")} {wire.baseA}A × {cond.factor.toFixed(2)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 一覧表 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("許容電流 一覧（周知目安値）")}</div>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left font-bold py-1.5">{t("電線")}</th>
              <th className="text-right font-bold py-1.5">{t("がいし引き")} (A)</th>
              <th className="text-right font-bold py-1.5">{cond.factor === 1 ? `${t("適用値")} (A)` : `×${cond.factor.toFixed(2)} (A)`}</th>
            </tr>
          </thead>
          <tbody>
            {IV_AMPACITY.map((w) => {
              const on = wireKey === w.key;
              return (
                <tr key={w.key} className={`border-b border-border/50 last:border-0 ${on ? "font-bold" : ""}`}>
                  <td className="py-1.5">{m(w.label)}</td>
                  <td className="py-1.5 text-right">{w.baseA}</td>
                  <td className="py-1.5 text-right" style={on ? { color: INFO_COLOR } : undefined}>
                    {allowableCurrent(w.baseA, cond.factor).toFixed(cond.factor === 1 ? 0 : 1)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* タブ3: アース線（接地線）太さ                                         */
/* ------------------------------------------------------------------ */

function GroundTab({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const m = (name: string) => (lang === "pt" ? romanize(name) : name);
  const [aStr, setAStr] = useState("");
  const breakerA = parseNum(aStr);
  const entry = breakerA != null ? groundWireSize(breakerA) : null;
  const over = breakerA != null && entry == null;

  return (
    <>
      {/* STEP1: 遮断器容量 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-2">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 1　過電流遮断器の定格容量")}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {GROUND_WIRE_TABLE.map((e) => (
            <Chip key={e.maxA} on={breakerA === e.maxA} onClick={() => setAStr(String(e.maxA))}>
              {e.maxA}A
            </Chip>
          ))}
        </div>
        <NumField label={t("容量を直接入力")} unit="A" value={aStr} onChange={setAStr} placeholder={t("例: 75")} />
      </div>

      {/* 結果 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs text-muted-foreground">{t("接地線の太さ（内線規程 1350-3 系の一般表）")}</div>
        {entry ? (
          <>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-4xl font-black tabular-nums" style={{ color: "#03AF7A" }}>
                {m(entry.label)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {t("遮断器")} {entry.maxA}A {t("以下の欄を適用（入力:")} {breakerA}A）
            </div>
          </>
        ) : over ? (
          <div className="mt-2 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "#FF4B00" }}>
            {t("600Aを超える容量は一般表の範囲外です。設計図書に基づき個別に選定してください。")}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">{t("遮断器容量を選択・入力すると太さを表示します。")}</p>
        )}
      </div>

      {/* 一覧表 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("遮断器容量 → 接地線太さ 一覧")}</div>
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left font-bold py-1.5">{t("遮断器容量")}</th>
              <th className="text-right font-bold py-1.5">{t("接地線の太さ")}</th>
            </tr>
          </thead>
          <tbody>
            {GROUND_WIRE_TABLE.map((e) => {
              const on = entry != null && entry.maxA === e.maxA;
              return (
                <tr key={e.maxA} className={`border-b border-border/50 last:border-0 ${on ? "font-bold" : ""}`}>
                  <td className="py-1.5">{e.maxA}A {t("以下")}</td>
                  <td className="py-1.5 text-right" style={on ? { color: INFO_COLOR } : undefined}>
                    {m(e.label)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* C種/D種の説明 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-2">
        <div className="text-xs font-bold text-muted-foreground">{t("C種 / D種 接地工事（電技解釈の一般周知値）")}</div>
        {GROUND_CLASS_NOTES.map((n) => (
          <div key={n.key} className="rounded-xl border border-border bg-card/50 px-3 py-2">
            <div className="text-sm font-bold" style={{ color: INFO_COLOR }}>{t(n.label)}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t(n.text)}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* タブ4: ボンド線 目安                                                 */
/* ------------------------------------------------------------------ */

function BondTab({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const m = (name: string) => (lang === "pt" ? romanize(name) : name);
  const [aStr, setAStr] = useState("");
  const breakerA = parseNum(aStr);
  const result = breakerA != null ? bondWireSize(breakerA) : null;
  const over = breakerA != null && result == null;

  return (
    <>
      {/* STEP1: 遮断器容量 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-2">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 1　回路の過電流遮断器容量")}</div>
        <div className="grid grid-cols-4 gap-1.5">
          {GROUND_WIRE_TABLE.map((e) => (
            <Chip key={e.maxA} on={breakerA === e.maxA} onClick={() => setAStr(String(e.maxA))}>
              {e.maxA}A
            </Chip>
          ))}
        </div>
        <NumField label={t("容量を直接入力")} unit="A" value={aStr} onChange={setAStr} placeholder={t("例: 60")} />
      </div>

      {/* 結果 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs text-muted-foreground">{t("ボンド線の太さ（一般目安値）")}</div>
        {result ? (
          <>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-4xl font-black tabular-nums" style={{ color: "#03AF7A" }}>
                {m(result.label)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{t(result.note)}</div>
          </>
        ) : over ? (
          <div className="mt-2 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: "#FF4B00" }}>
            {t("600Aを超える容量は目安表の範囲外です。設計図書に基づき個別に選定してください。")}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">{t("遮断器容量を選択・入力すると目安を表示します。")}</p>
        )}
      </div>

      {/* 解説 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-1">{t("ボンド線とは")}</div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("金属管相互・金属管とボックス等を電気的に接続（ボンディング）し、接地の連続性を確保するための電線です。一般に過電流遮断器")} {BOND_WIRE_SIMPLE_MAX_A}
          {t("A 以下の回路では 5.5sq が目安とされ、それを超える回路では接地線太さの一般表に準じた太さを目安とします。")}
        </p>
      </div>
    </>
  );
}
