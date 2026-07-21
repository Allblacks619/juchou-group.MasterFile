import { useMemo, useState } from "react";
import { Package, Plus, X } from "lucide-react";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";
import {
  VVF_SIZES,
  VVF_LINE_TYPES,
  VVF_SIZE_COLORS,
  VVF_ROLL_M,
  VVF_DRUM_M,
  VVF_LOSS_DEFAULT,
  VVF_LOSS_MIN,
  VVF_LOSS_MAX,
  calcVvfOrder,
  type VvfSize,
  type VvfLineType,
  type VvfRowInput,
} from "@shared/genba/tools/vvfOrder";

type RowState = {
  id: number;
  size: VvfSize;
  lineType: VvfLineType;
  len: string;
  circuits: string;
};

let nextId = 1;
const newRow = (): RowState => ({ id: nextId++, size: "1.6-2C", lineType: "ノーマル", len: "", circuits: "" });

const num = (s: string) => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
};

function RemainBadge({ remain, lang }: { remain: number; lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  if (remain === 0) {
    return <span className="text-[11px] font-bold" style={{ color: "#03AF7A" }}>{t("ちょうど")}</span>;
  }
  return <span className="text-[11px] text-muted-foreground">{t("余り")} {remain}m</span>;
}

/**
 * VVF 発注計算: 回路ごとの長さ×回路数からサイズ×種別別に集計し、
 * ロス率込みの必要長さと 100m巻 / 500mドラム の必要数を即時計算する。
 */
export default function VvfOrderTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  const m = (name: string) => (lang === "pt" ? romanize(name) : name);
  const [rows, setRows] = useState<RowState[]>(() => [newRow()]);
  const [loss, setLoss] = useState(String(VVF_LOSS_DEFAULT));

  const lossRate = useMemo(() => {
    const v = num(loss);
    if (!Number.isFinite(v)) return 0;
    return Math.min(VVF_LOSS_MAX, Math.max(VVF_LOSS_MIN, v));
  }, [loss]);

  const results = useMemo(() => {
    const inputs: VvfRowInput[] = rows.map((r) => ({
      size: r.size,
      lineType: r.lineType,
      lengthM: num(r.len),
      circuits: num(r.circuits),
    }));
    return calcVvfOrder(inputs, lossRate);
  }, [rows, lossRate]);

  const patch = (id: number, p: Partial<RowState>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("VVF 発注計算")}</h2>
      </div>
      <p className="text-xs text-muted-foreground px-1 -mt-2">
        {t("回路ごとに長さと回路数を入力すると、ロス率込みの発注数量を即時計算します。")}
      </p>

      {/* STEP 1: ロス率 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　ロス率を設定")}</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={VVF_LOSS_MIN}
            max={VVF_LOSS_MAX}
            value={loss}
            onChange={(e) => setLoss(e.target.value)}
            className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-base font-bold text-right"
          />
          <span className="text-sm font-bold">%</span>
          <span className="text-[11px] text-muted-foreground">{t("入力長さに上乗せして計算します")}（{VVF_LOSS_MIN}〜{VVF_LOSS_MAX}%）</span>
        </div>
      </div>

      {/* STEP 2: 回路入力 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4 space-y-3">
        <div className="text-xs font-bold text-muted-foreground">{t("STEP 2　回路を入力")}</div>
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="rounded-xl border border-border p-3 space-y-2"
            style={{ borderLeftWidth: 4, borderLeftColor: VVF_SIZE_COLORS[r.size] }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">{t("回路")} {i + 1}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={t("この回路を削除")}
                  onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                  className="rounded-lg border border-border p-1 text-muted-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{t("サイズ")}</span>
                <select
                  value={r.size}
                  onChange={(e) => patch(r.id, { size: e.target.value as VvfSize })}
                  className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm font-bold"
                  style={{ borderColor: VVF_SIZE_COLORS[r.size] }}
                >
                  {VVF_SIZES.map((s) => (
                    <option key={s} value={s}>VVF {m(s)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{t("種別")}</span>
                <select
                  value={r.lineType}
                  onChange={(e) => patch(r.id, { lineType: e.target.value as VvfLineType })}
                  className="w-full rounded-xl border border-border bg-background px-2 py-2 text-sm font-bold"
                >
                  {VVF_LINE_TYPES.map((lt) => (
                    <option key={lt.key} value={lt.key}>{t(lt.key)}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{t("長さ（m/回路）")}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder={t("例: 30")}
                  value={r.len}
                  onChange={(e) => patch(r.id, { len: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] text-muted-foreground">{t("回路数")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder={t("例: 3")}
                  value={r.circuits}
                  onChange={(e) => patch(r.id, { circuits: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold"
                />
              </label>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, newRow()])}
          className="w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-bold text-muted-foreground flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {t("回路を追加")}
        </button>
      </div>

      {/* 結果（即時） */}
      {results.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("長さと回路数を入力すると集計結果が表示されます。")}
        </p>
      )}
      {results.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-muted-foreground px-1">
            {t("集計結果（ロス率")} {lossRate}% {t("込み）")}
          </div>
          {results.map((g) => (
            <div
              key={`${g.size}-${g.lineType}`}
              className="rounded-2xl border border-border bg-card/70 p-4"
              style={{ borderLeftWidth: 4, borderLeftColor: VVF_SIZE_COLORS[g.size] }}
            >
              <div className="text-sm font-bold" style={{ color: VVF_SIZE_COLORS[g.size] }}>
                VVF {m(g.size)}　{t(g.lineType)}
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">（{t(g.colors)}）</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {t("入力合計")} {g.rawTotalM}m → {t("ロス込み")} <span className="font-bold text-foreground">{g.withLossM}m</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-border p-2.5 text-center">
                  <div className="text-[11px] text-muted-foreground">{VVF_ROLL_M}m{t("巻")}</div>
                  <div className="text-2xl font-bold leading-tight" style={{ color: "#4DC4FF" }}>
                    {g.rolls100}<span className="text-sm">{t("巻")}</span>
                  </div>
                  <RemainBadge remain={g.remain100} lang={lang} />
                </div>
                <div className="rounded-xl border border-border p-2.5 text-center">
                  <div className="text-[11px] text-muted-foreground">{VVF_DRUM_M}m{t("ドラム")}</div>
                  <div className="text-2xl font-bold leading-tight">
                    {g.drums500}<span className="text-sm">{t("本")}</span>
                  </div>
                  <RemainBadge remain={g.remain500} lang={lang} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground px-1">
        {t("※ ロス率・梱包単位（")}{VVF_ROLL_M}m{t("巻")} / {VVF_DRUM_M}m{t("ドラム")}
        {t("）は一般的な目安です。実際の発注は納入仕様・メーカーの販売単位を確認してください。")}
      </p>
    </div>
  );
}
