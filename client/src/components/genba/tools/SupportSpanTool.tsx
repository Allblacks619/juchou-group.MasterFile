import { useMemo, useState } from "react";
import { AlertTriangle, Anchor, Lightbulb } from "lucide-react";
import {
  SEISMIC_S_BASIS,
  SUPPORT_MATERIAL_ORDER,
  findSupportCondition,
  getSupportMaterial,
  isSeismicCondition,
  type SupportMaterialKey,
  type SupportNote,
} from "@shared/genba/tools/supports";

/**
 * 支持間隔 早見: 電材の種類 → 施工条件 を選ぶと支持間隔と根拠条文を即表示するリファレンス。
 * データは shared/genba/tools/supports.ts（電技解釈・内線規程・公共建築工事標準仕様書・
 * 耐震設計施工マニュアルに基づく目安値）。完全クライアント完結（サーバー通信なし）。
 * 条件が1つしかない電材はSTEP1選択と同時に結果を自動表示する。
 */
export default function SupportSpanTool() {
  const [material, setMaterial] = useState<SupportMaterialKey | null>(null);
  const [condIdx, setCondIdx] = useState<number | null>(null);

  const mat = material ? getSupportMaterial(material) : null;
  const cond = useMemo(
    () => (material != null && condIdx != null ? findSupportCondition(material, condIdx) : null),
    [material, condIdx],
  );

  const selectMaterial = (k: SupportMaterialKey) => {
    setMaterial(k);
    // 条件が1つしかない電材は即結果表示
    setCondIdx(getSupportMaterial(k).conditions.length === 1 ? 0 : null);
  };

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Anchor className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">支持間隔 早見</h2>
      </div>

      {/* STEP1: 電材の種類 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">STEP 1　電材の種類</div>
        <div className="grid grid-cols-2 gap-2">
          {SUPPORT_MATERIAL_ORDER.map((k) => {
            const m = getSupportMaterial(k);
            const on = material === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => selectMaterial(k)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={on ? { background: "#4DC4FF" } : undefined}
              >
                <div className="text-sm font-bold leading-tight">{m.label}</div>
                {m.sub !== "" && (
                  <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>
                    {m.sub}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP2: 施工条件（縦並び） */}
      {mat && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">STEP 2　施工条件</div>
          <div className="space-y-2">
            {mat.conditions.map((c, i) => {
              const on = condIdx === i;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCondIdx(i)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on ? "border-transparent text-white" : "border-border bg-card/50"
                  }`}
                  style={on ? { background: "#4DC4FF" } : undefined}
                >
                  <div className="text-sm font-bold leading-tight">{c.label}</div>
                  {c.note !== "" && (
                    <div className={`text-[11px] leading-tight mt-0.5 ${on ? "text-white/80" : "text-muted-foreground"}`}>
                      {c.note}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 結果 */}
      {mat && cond && (
        <div className="space-y-3">
          {/* 支持間隔カード */}
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <div className="text-xs text-muted-foreground">
              {mat.name}｜{cond.label}
            </div>
            <div className="text-xs font-bold text-muted-foreground mt-2">
              {isSeismicCondition(cond) ? "耐震支持間隔（クラスA・B）" : "支持間隔"}
            </div>
            <div className="mt-1 text-4xl font-black leading-tight tabular-nums" style={{ color: "#4DC4FF" }}>
              {cond.interval}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">{cond.basis}</div>
          </div>

          {/* ラック上ケーブルの固定間隔カード */}
          {cond.cableInterval != null && (
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="text-xs font-bold text-muted-foreground">ラック上ケーブルの固定間隔</div>
              <div className="mt-1 text-3xl font-black leading-tight tabular-nums" style={{ color: "#03AF7A" }}>
                {cond.cableInterval}
              </div>
              {cond.cableBasis != null && (
                <div className="mt-2 text-[11px] text-muted-foreground">{cond.cableBasis}</div>
              )}
            </div>
          )}

          {/* 耐震クラスSカード */}
          {cond.seismicInterval != null && (
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="text-xs font-bold text-muted-foreground">耐震クラスS</div>
              <div className="mt-1 text-3xl font-black leading-tight tabular-nums" style={{ color: "#F6AA00" }}>
                {cond.seismicInterval}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{SEISMIC_S_BASIS}</div>
            </div>
          )}

          {/* 備考カード */}
          {cond.notes.length > 0 && (
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <div className="text-xs font-bold text-muted-foreground mb-2">備考</div>
              <div className="space-y-2">
                {cond.notes.map((n, i) => (
                  <NoteLine key={i} note={n} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 免責注記 */}
      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>※ 電気設備技術基準の解釈・内線規程等に基づく目安値です。</p>
        <p>※ 現場条件・施工方法により異なる場合があります。実施工では現場実測・設計図書・施工要領書を優先してください。</p>
      </div>
    </div>
  );
}

/** 備考1行の表示（種別ごとにスタイルを変える） */
function NoteLine({ note }: { note: SupportNote }) {
  switch (note.kind) {
    case "sub":
      return <p className="text-[11px] text-muted-foreground leading-relaxed">{note.text}</p>;
    case "highlight":
      return (
        <p
          className="text-sm font-bold leading-relaxed rounded-lg border px-2.5 py-1.5"
          style={{ borderColor: "#03AF7A", color: "#03AF7A" }}
        >
          {note.text}
        </p>
      );
    case "warn":
      return (
        <p className="flex items-start gap-1.5 text-sm leading-relaxed">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#FF4B00" }} />
          <span>{note.text}</span>
        </p>
      );
    case "recommend":
      return (
        <p
          className="flex items-start gap-1.5 text-sm leading-relaxed rounded-lg border px-2.5 py-1.5"
          style={{ borderColor: "#4DC4FF" }}
        >
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#4DC4FF" }} />
          <span>{note.text}</span>
        </p>
      );
    default:
      return <p className="text-sm leading-relaxed">{note.text}</p>;
  }
}
