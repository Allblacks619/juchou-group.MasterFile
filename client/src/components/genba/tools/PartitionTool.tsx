import { useMemo, useState } from "react";
import { Magnet, PanelsTopLeft, Plus, X } from "lucide-react";
import {
  INSTRUMENT_TYPES,
  PF_AVG_DEFAULT_M,
  PF_AVG_MAX_M,
  PF_AVG_MIN_M,
  PF_ROLL_LENGTH_M,
  REN_TYPES,
  calcPartition,
  parseNonNegative,
  type InstrumentType,
  type PartitionCard,
  type RenType,
} from "@shared/genba/tools/partition";

/** 器具カード1枚（UI状態: 数値は文字列で保持し計算時に数値化） */
type CardInput = {
  id: number;
  type: InstrumentType;
  ren: RenType;
  count: string;
  pf16: string;
  pf22: string;
};

/**
 * 間仕切り 仕込み材 拾い出し: 器具カード（種類・塗代カバー連数・箇所数・PF管立ち上げ本数）を
 * 追加入力するだけで、PF管（50m巻換算・切り上げ）・4×4 BOX・塗代カバー・PF管コネクタ・
 * ボックス取付金物・ボックス探知マグネットを即時集計する。
 * データ・計算は shared/genba/tools/partition.ts。完全クライアント完結（サーバー通信なし）。
 */
export default function PartitionTool() {
  const [pfEnabled, setPfEnabled] = useState(true);
  const [pf16Avg, setPf16Avg] = useState(String(PF_AVG_DEFAULT_M));
  const [pf22Avg, setPf22Avg] = useState(String(PF_AVG_DEFAULT_M));
  const [useMagnet, setUseMagnet] = useState(false);
  const [nextId, setNextId] = useState(1);
  const [cards, setCards] = useState<CardInput[]>([]);

  const parsedCards = useMemo<PartitionCard[]>(
    () =>
      cards.map((c) => ({
        type: c.type,
        ren: c.ren,
        count: parseNonNegative(c.count),
        pf16: parseNonNegative(c.pf16),
        pf22: parseNonNegative(c.pf22),
      })),
    [cards],
  );
  const result = useMemo(
    () =>
      calcPartition(parsedCards, {
        pfEnabled,
        pf16AvgM: parseNonNegative(pf16Avg),
        pf22AvgM: parseNonNegative(pf22Avg),
        useMagnet,
      }),
    [parsedCards, pfEnabled, pf16Avg, pf22Avg, useMagnet],
  );

  const addCard = () => {
    setCards((prev) => [...prev, { id: nextId, type: INSTRUMENT_TYPES[0], ren: REN_TYPES[0], count: "1", pf16: "0", pf22: "0" }]);
    setNextId((n) => n + 1);
  };
  const removeCard = (id: number) => setCards((prev) => prev.filter((c) => c.id !== id));
  const patchCard = (id: number, patch: Partial<Omit<CardInput, "id">>) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <PanelsTopLeft className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">間仕切り 仕込み材 拾い出し</h2>
      </div>
      <p className="text-[11px] text-muted-foreground px-1 -mt-2">器具カードを追加すると必要材料を即時集計します</p>

      {/* STEP1: PF管の設定 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="flex items-center">
          <div className="text-xs font-bold text-muted-foreground">STEP 1　PF管の設定</div>
          <ToggleButton on={pfEnabled} onLabel="PF計算 ON" offLabel="PF計算 OFF" onClick={() => setPfEnabled((v) => !v)} />
        </div>
        {pfEnabled ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <AvgInput label="PF16 平均使用長" value={pf16Avg} onChange={setPf16Avg} />
            <AvgInput label="PF22 平均使用長" value={pf22Avg} onChange={setPf22Avg} />
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">PF管の使用長・巻数の集計を省略します（コネクタは集計されます）</p>
        )}
      </div>

      {/* STEP2: 器具カード */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground">STEP 2　器具カード</div>
        <div className="text-[11px] text-muted-foreground mt-0.5 mb-2">設置箇所ごとに種類・箇所数・立ち上げ本数を入力</div>
        {cards.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">「器具カードを追加」を押して入力を始めてください</p>
        )}
        <div className="space-y-3">
          {cards.map((c, idx) => (
            <div key={c.id} className="rounded-xl border border-border bg-card/50 p-3">
              <div className="flex items-center mb-2">
                <span className="text-sm font-bold">器具 {idx + 1}</span>
                <button
                  type="button"
                  onClick={() => removeCard(c.id)}
                  className="ml-auto rounded-lg p-1 text-muted-foreground hover:text-foreground"
                  aria-label={`器具 ${idx + 1} を削除`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">器具種類</label>
                  <select
                    value={c.type}
                    onChange={(e) => patchCard(c.id, { type: e.target.value as InstrumentType })}
                    className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm"
                  >
                    {INSTRUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-muted-foreground mb-1">塗代カバー</label>
                  <select
                    value={c.ren}
                    onChange={(e) => patchCard(c.id, { ren: e.target.value as RenType })}
                    className="w-full rounded-lg border border-border bg-card px-2 py-2 text-sm"
                  >
                    {REN_TYPES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <NumField label="箇所数" value={c.count} onChange={(v) => patchCard(c.id, { count: v })} />
                <div />
                <NumField label="PF16 立ち上げ本数" value={c.pf16} onChange={(v) => patchCard(c.id, { pf16: v })} />
                <NumField label="PF22 立ち上げ本数" value={c.pf22} onChange={(v) => patchCard(c.id, { pf22: v })} />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addCard}
          className="mt-3 w-full rounded-xl border border-dashed border-border bg-card/50 px-3 py-2.5 text-sm font-bold text-muted-foreground flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          器具カードを追加
        </button>
      </div>

      {/* STEP3: マグネット */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="flex items-center">
          <div className="flex items-center gap-1.5">
            <Magnet className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold">ボックス探知マグネット</span>
          </div>
          <ToggleButton on={useMagnet} onLabel="ON" offLabel="OFF" onClick={() => setUseMagnet((v) => !v)} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">ON にすると BOX と同数のマグネットを集計します</p>
      </div>

      {/* 結果（即時計算） */}
      {pfEnabled && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-1">PF 材料</div>
          <div className="text-[11px] text-muted-foreground mb-3">1巻 = {PF_ROLL_LENGTH_M} m 換算・切り上げ</div>
          <div className="space-y-3">
            <ResultRow label={`PF16（総 ${result.pf16TotalM} m）`} value={result.pf16Rolls} unit="巻" color="#4DC4FF" big />
            <ResultRow label={`PF22（総 ${result.pf22TotalM} m）`} value={result.pf22Rolls} unit="巻" color="#4DC4FF" big />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-3">ボックス系</div>
        <div className="space-y-3">
          <ResultRow label="4×4 BOX" value={result.boxes} unit="個" color="#03AF7A" big />
          {REN_TYPES.map((r) => (
            <ResultRow key={r} label={`${r} 塗代カバー`} value={result.covers[r]} unit="枚" color="#03AF7A" />
          ))}
        </div>
      </div>

      {pfEnabled && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-3">配管部材</div>
          <div className="space-y-3">
            <ResultRow label="PF16 コネクタ" value={result.pf16Connectors} unit="個" color="#4DC4FF" />
            <ResultRow label="PF22 コネクタ" value={result.pf22Connectors} unit="個" color="#4DC4FF" />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-3">その他</div>
        <div className="space-y-3">
          <ResultRow label="ボックス取付金物" value={result.brackets} unit="個" color="#03AF7A" />
          {useMagnet && <ResultRow label="ボックス探知マグネット" value={result.magnets} unit="個" color="#03AF7A" />}
        </div>
      </div>

      {/* 常時集計バー */}
      <div className="sticky bottom-2 rounded-2xl border border-border bg-card p-3 shadow-lg">
        <div className="grid grid-cols-3 gap-2 text-center">
          <SummaryCell label="PF16" value={pfEnabled ? String(result.pf16Rolls) : "-"} unit="巻" dim={!pfEnabled} />
          <SummaryCell label="PF22" value={pfEnabled ? String(result.pf22Rolls) : "-"} unit="巻" dim={!pfEnabled} />
          <SummaryCell label="4×4 BOX" value={String(result.boxes)} unit="個" />
        </div>
      </div>

      {/* 免責注記 */}
      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>※ 1巻=50m・平均使用長は目安値による切り上げ集計です。ロス・予備は含みません。</p>
        <p>※ 集計値は目安です。実施工では現場実測・設計図書・施工要領書を優先し、余裕分を確認してください。</p>
      </div>
    </div>
  );
}

/** ON/OFF トグルボタン（右寄せ） */
function ToggleButton({ on, onLabel, offLabel, onClick }: { on: boolean; onLabel: string; offLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
        on ? "border-transparent text-white" : "border-border bg-card/50 text-muted-foreground"
      }`}
      style={on ? { background: "#03AF7A" } : undefined}
      aria-pressed={on}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

/** 平均使用長入力（1〜99 m） */
function AvgInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-muted-foreground mb-1">{label}（m/カ所）</label>
      <input
        type="number"
        inputMode="decimal"
        min={PF_AVG_MIN_M}
        max={PF_AVG_MAX_M}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
    </div>
  );
}

/** 非負整数入力フィールド */
function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-muted-foreground mb-1">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm tabular-nums"
      />
    </div>
  );
}

/** 数量1行（数値を大きく表示） */
function ResultRow({ label, value, unit, color, big }: { label: string; value: number; unit: string; color: string; big?: boolean }) {
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

/** 常時集計バーの1セル */
function SummaryCell({ label, value, unit, dim }: { label: string; value: string; unit: string; dim?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      <div className={`tabular-nums font-black text-xl leading-tight ${dim ? "text-muted-foreground" : ""}`}>
        {value}
        <span className="text-[10px] font-bold text-muted-foreground ml-0.5">{unit}</span>
      </div>
    </div>
  );
}
