import { useMemo, useState } from "react";
import { Ruler, Table2 } from "lucide-react";
import {
  GENBA_PIPES,
  PIPE_KIND_ORDER,
  type PipeKind,
} from "@shared/genba/tools/pipes";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";
import { romanize } from "@/lib/genbaRomaji";

/**
 * 配管外径 早見: 配管種別 → 呼び径 を選ぶと外径(mm)を即表示する軽量リファレンス。
 * データは shared/genba/tools/pipes.ts（G管・E管は JIS C 8305 規格値、他はカタログ参照の目安値）。
 * 完全クライアント完結（サーバー通信なし）。工具推奨は抜き径ツール側の役割のためここでは出さない。
 */
export default function PipeOuterDiameterTool({ lang }: { lang: GenbaLang }) {
  const t = (ja: string) => genbaTr(ja, lang);
  // 材料名・型番はポルトガル語に訳さず日本語ローマ字表示（オーナー方針）
  const mn = (name: string) => (lang === "pt" ? romanize(name) : name);

  const [kind, setKind] = useState<PipeKind | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [listMode, setListMode] = useState(false);

  const pipe = kind ? GENBA_PIPES[kind] : null;

  // 選択中配管種の呼び径一覧（昇順）
  const sizes = useMemo(() => {
    if (!pipe) return [];
    return Object.keys(pipe.sizes).map(Number).sort((a, b) => a - b);
  }, [pipe]);

  const od = pipe && size != null ? pipe.sizes[size] : null;

  const selectKind = (k: PipeKind) => {
    setKind(k);
    setSize(null);
  };

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Ruler className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">{t("配管外径 早見")}</h2>
        <button
          type="button"
          onClick={() => setListMode((v) => !v)}
          className={`ml-auto flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
            listMode
              ? "border-transparent text-white"
              : "border-border bg-card/50 text-muted-foreground"
          }`}
          style={listMode ? { background: "#4DC4FF" } : undefined}
        >
          <Table2 className="w-3.5 h-3.5" />
          {t("一覧表")}
        </button>
      </div>

      {/* STEP1: 配管種別 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">{t("STEP 1　配管の種類")}</div>
        <div className="grid grid-cols-2 gap-2">
          {PIPE_KIND_ORDER.map((k) => {
            const p = GENBA_PIPES[k];
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
                <div className="text-sm font-bold leading-tight">{mn(p.label)}</div>
                <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>
                  {mn(p.sub)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 一覧表モード: 選択配管種の全呼び径×外径 */}
      {listMode && pipe && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            {mn(pipe.label)}（{mn(pipe.sub)}）{t("呼び径 × 外径 一覧")}
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-bold py-1.5">{t("呼び径")}</th>
                <th className="text-right font-bold py-1.5">{t("外径 (mm)")}</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr
                  key={s}
                  onClick={() => setSize(s)}
                  className={`border-b border-border/50 last:border-0 cursor-pointer ${
                    size === s ? "font-bold" : ""
                  }`}
                  style={size === s ? { color: "#4DC4FF" } : undefined}
                >
                  <td className="py-1.5">{s}</td>
                  <td className="py-1.5 text-right">φ{pipe.sizes[s].toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {pipe.approx ? t("※ カタログ参照の目安値（メーカーにより異なります）") : t("※ JIS C 8305 規格値")}
          </div>
        </div>
      )}
      {listMode && !pipe && (
        <p className="text-sm text-muted-foreground text-center py-2">
          {t("一覧表を見るには配管の種類を選んでください。")}
        </p>
      )}

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
        </div>
      )}

      {/* 結果カード */}
      {pipe && size != null && od != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs text-muted-foreground">
            {mn(pipe.label)}（{mn(pipe.sub)}）{t("呼び径")} {size} {t("の外径")}
          </div>
          <div className="flex items-end gap-1 mt-1">
            <span className="text-lg font-bold text-muted-foreground mb-1.5">φ</span>
            <span className="text-5xl font-black tabular-nums" style={{ color: "#4DC4FF" }}>
              {od.toFixed(1)}
            </span>
            <span className="text-lg font-bold text-muted-foreground mb-1.5">mm</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {pipe.approx
              ? t("※ カタログ参照の目安値です。メーカーにより外径が異なる場合があります。")
              : t("※ JIS C 8305 規格値です。")}
          </div>
        </div>
      )}

      {/* 免責注記 */}
      <p className="text-[11px] text-muted-foreground px-1">
        {t("※ 本ツールの数値は規格・カタログに基づく目安です。実施工では現場実測・設計図書を優先してください。")}
      </p>
    </div>
  );
}
