import { useMemo, useState, type ReactNode } from "react";
import { Cable, RotateCcw } from "lucide-react";
import {
  CE_WIRES,
  P_WIRES,
  R_WIRES,
  T_WIRE_SIZES,
  findCESleeves,
  findPSleeve,
  findTSleeve,
  judgeRingSleeve,
  nextTapCount,
  ringComboText,
  sumWireArea,
  type ConnectorWire,
} from "@shared/genba/tools/connectors";

/**
 * 接続材 選定: 電線サイズ・本数から接続材（T形コネクタ/P形スリーブ/リングスリーブ/CE形）を
 * 即時判定するリファレンス。リングスリーブはサイズに加えて圧着マーク（○/小/中/大）も表示。
 * データ・判定は shared/genba/tools/connectors.ts（ニチフ カタログ・内線規程・JIS C 2806 準拠の目安値）。
 * 完全クライアント完結（サーバー通信なし）。タブを切り替えても各タブの入力状態は保持される。
 */

type TabKey = "t" | "p" | "r" | "ce";

const TABS: { key: TabKey; label: string }[] = [
  { key: "t", label: "T形コネクタ" },
  { key: "p", label: "P形スリーブ" },
  { key: "r", label: "リングスリーブ" },
  { key: "ce", label: "CE形" },
];

export default function ConnectorPickTool() {
  const [tab, setTab] = useState<TabKey>("t");

  // T形: 幹線・分岐の選択（断面積で保持。選択肢の area は互いに重複しない）
  const [tMain, setTMain] = useState<number | null>(null);
  const [tBranch, setTBranch] = useState<number | null>(null);

  // P形 / リング / CE形: 電線ごとの本数カウント
  const [pCounts, setPCounts] = useState<number[]>(() => Array(P_WIRES.length).fill(0));
  const [rCounts, setRCounts] = useState<number[]>(() => Array(R_WIRES.length).fill(0));
  const [ceCounts, setCeCounts] = useState<number[]>(() => Array(CE_WIRES.length).fill(0));

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Cable className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">接続材 選定</h2>
      </div>

      {/* タブバー */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-card/50 p-1">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-1 py-2 text-[11px] font-bold leading-tight transition-colors ${
                on ? "text-white" : "text-muted-foreground"
              }`}
              style={on ? { background: "#4DC4FF" } : undefined}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "t" && (
        <TTab main={tMain} branch={tBranch} onMain={setTMain} onBranch={setTBranch} />
      )}
      {tab === "p" && (
        <CounterTab
          wires={P_WIRES}
          counts={pCounts}
          setCounts={setPCounts}
          cols={5}
          renderTotalBar={(total) => `断面積合計 ${total.toFixed(2)} mm²`}
          renderResult={(total) => <PResult total={total} />}
          notes={["※ ニチフ P形裸圧着スリーブカタログ準拠。"]}
        />
      )}
      {tab === "r" && (
        <CounterTab
          wires={R_WIRES}
          counts={rCounts}
          setCounts={setRCounts}
          cols={3}
          renderTotalBar={(_total, counts) => {
            const text = ringComboText(counts[0] ?? 0, counts[1] ?? 0, counts[2] ?? 0);
            return text === "" ? "電線の合計" : `電線の合計: ${text}`;
          }}
          renderResult={(_total, counts) => (
            <RingResult n16={counts[0] ?? 0} n20={counts[1] ?? 0} n26={counts[2] ?? 0} />
          )}
          notes={[
            "※ 内線規程・JIS C 2806準拠。1.6mm・2.0mm・2.6mm単線用。",
            "※ より線・CV等は断面積に応じて別途確認してください。",
          ]}
        />
      )}
      {tab === "ce" && (
        <CounterTab
          wires={CE_WIRES}
          counts={ceCounts}
          setCounts={setCeCounts}
          cols={4}
          renderTotalBar={(total) => `断面積合計 ${total.toFixed(2)} mm²`}
          renderResult={(total) => <CEResult total={total} />}
          notes={[
            "※ ニチフ CE形裸圧着スリーブカタログ準拠。",
            "※ 断面積合計から号数を目安として表示します。必ずカタログで確認してください。",
          ]}
        />
      )}

      {/* 免責注記（共通） */}
      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>※ メーカーカタログ・規格に基づく目安値です。</p>
        <p>※ 実施工では現場実測・設計図書・メーカーカタログを優先してください。</p>
      </div>
    </div>
  );
}

/* ───────────── T形コネクタタブ ───────────── */

function TTab({
  main,
  branch,
  onMain,
  onBranch,
}: {
  main: number | null;
  branch: number | null;
  onMain: (a: number) => void;
  onBranch: (a: number) => void;
}) {
  const match = useMemo(
    () => (main != null && branch != null ? findTSleeve(main, branch) : null),
    [main, branch],
  );
  const mainWire = T_WIRE_SIZES.find((w) => w.area === main);
  const branchWire = T_WIRE_SIZES.find((w) => w.area === branch);
  const total = main != null && branch != null ? Math.round((main + branch) * 100) / 100 : null;

  return (
    <div className="space-y-4">
      {/* STEP1: 幹線サイズ */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">STEP 1　幹線サイズを選ぶ（mm²）</div>
        <WireGrid wires={T_WIRE_SIZES} cols={4} isOn={(w) => w.area === main} onColor="#4DC4FF" onTap={(w) => onMain(w.area)} />
      </div>

      {/* STEP2: 分岐サイズ */}
      {main != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">STEP 2　分岐サイズを選ぶ（mm²）</div>
          <WireGrid wires={T_WIRE_SIZES} cols={4} isOn={(w) => w.area === branch} onColor="#F6AA00" onTap={(w) => onBranch(w.area)} />
        </div>
      )}

      {/* 結果 */}
      {main != null && branch != null && total != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          {match ? (
            <>
              <div className="text-xs font-bold text-muted-foreground">使用するT形コネクタ</div>
              <div className="mt-1 text-5xl font-black leading-tight tabular-nums" style={{ color: "#03AF7A" }}>
                {match.name}
              </div>
              <div className="mt-2 text-sm">
                適用範囲：{match.min}〜{match.max} mm²
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold text-muted-foreground">判定</div>
              <div className="mt-1 text-4xl font-black leading-tight" style={{ color: "#FF4B00" }}>
                範囲外
              </div>
              <div className="mt-2 text-sm">
                T形コネクタの適用範囲を超えています。電線の組み合わせを見直してください。
              </div>
            </>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground">
            幹線 {mainWire?.label}mm² ＋ 分岐 {branchWire?.label}mm² ＝ 合計 {total} mm²
          </div>
        </div>
      )}

      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        <p>※ ニチフ T形コネクタ（分岐接続用）カタログ準拠。</p>
        <p>※ 適用電線断面積の合計から号数を選定します。</p>
      </div>
    </div>
  );
}

/** サイズ選択グリッド（T形の幹線・分岐で共用） */
function WireGrid({
  wires,
  cols,
  isOn,
  onColor,
  onTap,
}: {
  wires: readonly ConnectorWire[];
  cols: number;
  isOn: (w: ConnectorWire) => boolean;
  onColor: string;
  onTap: (w: ConnectorWire) => void;
}) {
  return (
    <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : cols === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
      {wires.map((w) => {
        const on = isOn(w);
        return (
          <button
            key={w.label + w.sub}
            type="button"
            onClick={() => onTap(w)}
            className={`rounded-xl border px-1 py-2 text-center transition-colors ${
              on ? "border-transparent text-white" : "border-border bg-card/50"
            }`}
            style={on ? { background: onColor } : undefined}
          >
            <div className="text-sm font-bold leading-tight tabular-nums">{w.label}</div>
            <div className={`text-[10px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>{w.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── カウンター共通タブ（P形 / リング / CE形） ───────────── */

function CounterTab({
  wires,
  counts,
  setCounts,
  cols,
  renderTotalBar,
  renderResult,
  notes,
}: {
  wires: readonly ConnectorWire[];
  counts: number[];
  setCounts: (c: number[]) => void;
  cols: number;
  renderTotalBar: (total: number, counts: number[]) => string;
  renderResult: (total: number, counts: number[]) => ReactNode;
  notes: string[];
}) {
  const total = useMemo(() => sumWireArea(wires, counts), [wires, counts]);
  const totalCount = counts.reduce((a, c) => a + c, 0);

  const tap = (i: number) => {
    const next = counts.slice();
    next[i] = nextTapCount(next[i] ?? 0);
    setCounts(next);
  };
  const reset = () => setCounts(Array(wires.length).fill(0));

  return (
    <div className="space-y-4">
      {/* 電線カウンター */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">電線をタップして本数を追加（10回目で1本に戻る）</div>
        <div className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : cols === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
          {wires.map((w, i) => {
            const n = counts[i] ?? 0;
            return (
              <button
                key={w.label + w.sub}
                type="button"
                onClick={() => tap(i)}
                className={`relative rounded-xl border px-1 py-2 text-center transition-colors ${
                  n > 0 ? "border-transparent text-white" : "border-border bg-card/50"
                }`}
                style={n > 0 ? { background: "#4DC4FF" } : undefined}
              >
                {n > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[11px] font-black text-white flex items-center justify-center tabular-nums"
                    style={{ background: "#F6AA00" }}
                  >
                    {n}
                  </span>
                )}
                <div className="text-sm font-bold leading-tight tabular-nums">{w.label}</div>
                <div className={`text-[10px] leading-tight ${n > 0 ? "text-white/80" : "text-muted-foreground"}`}>{w.sub}</div>
              </button>
            );
          })}
        </div>

        {/* 合計バー + リセット */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-muted px-3 py-2 text-sm font-bold tabular-nums">
            {renderTotalBar(total, counts)}
          </div>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border bg-card/50 px-3 py-2 text-xs font-bold text-muted-foreground flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            リセット
          </button>
        </div>
      </div>

      {/* 結果（本数0は非表示） */}
      {totalCount > 0 && renderResult(total, counts)}

      <div className="text-[11px] text-muted-foreground px-1 space-y-0.5">
        {notes.map((n, i) => (
          <p key={i}>{n}</p>
        ))}
      </div>
    </div>
  );
}

/* ───────────── 各タブの結果カード ───────────── */

function PResult({ total }: { total: number }) {
  const match = findPSleeve(total);
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      {match ? (
        <>
          <div className="text-xs font-bold text-muted-foreground">使用するP形スリーブ</div>
          <div className="mt-1 text-5xl font-black leading-tight tabular-nums" style={{ color: "#03AF7A" }}>
            {match.name}
          </div>
          <div className="mt-2 text-sm">
            抱合範囲：{match.min}〜{match.max} mm²
          </div>
        </>
      ) : (
        <>
          <div className="text-xs font-bold text-muted-foreground">判定</div>
          <div className="mt-1 text-4xl font-black leading-tight" style={{ color: "#FF4B00" }}>
            範囲外
          </div>
          <div className="mt-2 text-sm">Pスリーブの抱合範囲を超えています。電線の組み合わせを見直してください。</div>
        </>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">合計 {total.toFixed(2)} mm²</div>
    </div>
  );
}

function RingResult({ n16, n20, n26 }: { n16: number; n20: number; n26: number }) {
  const judge = judgeRingSleeve(n16, n20, n26);
  if (judge == null) {
    return (
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-sm text-muted-foreground">電線を合計2本以上追加すると判定します。</div>
      </div>
    );
  }
  const combo = ringComboText(n16, n20, n26);
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      {judge.kind === "ok" ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-xs font-bold text-muted-foreground">スリーブサイズ</div>
              <div className="mt-1 text-5xl font-black leading-tight" style={{ color: "#03AF7A" }}>
                {judge.size}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-muted-foreground">圧着マーク</div>
              <div className="mt-1 text-5xl font-black leading-tight" style={{ color: "#4DC4FF" }}>
                {judge.mark}
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">{combo}の接続。</div>
        </>
      ) : (
        <>
          <div className="text-xs font-bold text-muted-foreground">判定</div>
          <div className="mt-1 text-4xl font-black leading-tight" style={{ color: "#FF4B00" }}>
            範囲外
          </div>
          <div className="mt-2 text-sm">組み合わせ範囲外です。電線の組み合わせを見直してください。</div>
          <div className="mt-2 text-[11px] text-muted-foreground">{combo}</div>
        </>
      )}
    </div>
  );
}

function CEResult({ total }: { total: number }) {
  const matches = findCESleeves(total);
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      {matches.length > 0 ? (
        <>
          <div className="text-xs font-bold text-muted-foreground">使用するCE形スリーブ（候補）</div>
          <div className="mt-1 text-4xl font-black leading-tight tabular-nums" style={{ color: "#03AF7A" }}>
            {matches.map((m) => m.name).join(" / ")}
          </div>
          <div className="mt-2 text-sm space-y-0.5">
            {matches.map((m) => (
              <div key={m.name}>
                {m.name}：抱合範囲 {m.min}〜{m.max} mm²
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="text-xs font-bold text-muted-foreground">判定</div>
          <div className="mt-1 text-4xl font-black leading-tight" style={{ color: "#FF4B00" }}>
            範囲外
          </div>
          <div className="mt-2 text-sm">CE形スリーブの抱合範囲を超えています。電線の組み合わせを見直してください。</div>
        </>
      )}
      <div className="mt-2 text-[11px] text-muted-foreground">合計 {total.toFixed(2)} mm²</div>
    </div>
  );
}
