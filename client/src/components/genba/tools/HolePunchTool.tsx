import { useMemo, useRef, useState } from "react";
import {
  GENBA_PIPES,
  PIPE_KIND_ORDER,
  holePunchPlan,
  type PipeKind,
} from "@shared/genba/tools/pipes";

/** CUD 判定色（テーマ不変） */
const CUD = {
  ok: "#03AF7A", // OK/推奨
  info: "#4DC4FF", // 情報/余裕
  warn: "#F6AA00", // 注意
} as const;

/**
 * 抜き径・貫通穴 検索:
 * 配管種別→呼び径を選ぶと、外径・貫通穴のジャスト/余裕サイズと
 * 工具別（ホールソー/コアドリル/ギムネ）の推奨径を即表示する。
 * データ・計算は shared/genba/tools/pipes.ts（JIS C 8305 / カタログ目安）に集約。
 */
export default function HolePunchTool() {
  const [kind, setKind] = useState<PipeKind | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  const sizes = useMemo(
    () =>
      kind
        ? Object.keys(GENBA_PIPES[kind].sizes)
            .map(Number)
            .sort((a, b) => a - b)
        : [],
    [kind],
  );

  const plan = useMemo(
    () => (kind != null && size != null ? holePunchPlan(kind, size) : null),
    [kind, size],
  );

  const scrollToResult = () => {
    // 選択直後は結果がまだ描画されていないため、次フレームでスクロール
    requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const pickKind = (k: PipeKind) => {
    setKind(k);
    setSize(null);
  };

  const pickSize = (s: number) => {
    setSize(s);
    scrollToResult();
  };

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h2 className="text-base font-bold">抜き径・貫通穴 検索</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          配管の種類と呼び径を選ぶと、貫通穴の推奨サイズを表示します
        </p>
      </div>

      {/* STEP 1: 配管の種類 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">STEP 1｜配管の種類を選ぶ</div>
        <div className="grid grid-cols-2 gap-2">
          {PIPE_KIND_ORDER.map((k) => {
            const p = GENBA_PIPES[k];
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  on ? "border-foreground bg-secondary" : "border-border bg-card/50"
                }`}
              >
                <div className={`text-sm ${on ? "font-bold" : "font-medium"}`}>{p.label}</div>
                <div className="text-[11px] text-muted-foreground">{p.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2: 呼び径 */}
      {kind && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">
            STEP 2｜呼び径を選ぶ（{GENBA_PIPES[kind].label}）
          </div>
          <div className="grid grid-cols-4 gap-2">
            {sizes.map((s) => {
              const on = size === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSize(s)}
                  className={`rounded-lg border py-2 text-sm tabular-nums transition-colors ${
                    on ? "border-foreground bg-secondary font-bold" : "border-border bg-card/50 font-medium"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 結果 */}
      {kind && size != null && plan && (
        <div ref={resultRef} className="rounded-2xl border border-border bg-card/70 p-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            {GENBA_PIPES[kind].label}（{GENBA_PIPES[kind].sub}） 呼び {size} の貫通穴
          </div>

          {/* 配管外径 */}
          <div className="flex items-end gap-1">
            <span className="text-xs text-muted-foreground mb-1.5 mr-1">配管外径</span>
            <span className="text-3xl font-black tabular-nums">φ{plan.od}</span>
            <span className="text-sm font-bold text-muted-foreground mb-1">mm</span>
            {GENBA_PIPES[kind].approx && (
              <span className="ml-auto text-[11px] font-bold mb-1" style={{ color: CUD.warn }}>
                目安値
              </span>
            )}
          </div>

          {/* ジャスト / 余裕 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-card/50 p-3 text-center">
              <div className="text-[11px] text-muted-foreground">ジャスト（ぴったり）</div>
              <div className="text-3xl font-black tabular-nums mt-0.5" style={{ color: CUD.ok }}>
                φ{plan.just}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card/50 p-3 text-center">
              <div className="text-[11px] text-muted-foreground">余裕あり（施工しやすい）</div>
              <div className="text-3xl font-black tabular-nums mt-0.5" style={{ color: CUD.info }}>
                φ{plan.clear}
                {!plan.clearIsStd && <span className="text-sm font-bold ml-0.5">以上</span>}
              </div>
            </div>
          </div>

          {/* 工具別 */}
          <div>
            <div className="text-xs font-bold text-muted-foreground mb-1.5">工具別の推奨サイズ</div>
            <div className="space-y-1.5">
              <ToolRow
                name="ホールソー"
                just={`φ${plan.just}`}
                clear={plan.clearIsStd ? `φ${plan.clear}` : `φ${plan.clear} 以上`}
              />
              <ToolRow
                name="コアドリル"
                just={plan.coreJust != null ? `φ${plan.coreJust}` : "対応サイズなし"}
                clear={plan.coreClear != null ? `φ${plan.coreClear}` : "対応サイズなし"}
              />
              <ToolRow name="ギムネ" just={`φ${plan.gimlet} 程度`} clear={null} />
            </div>
          </div>
        </div>
      )}

      {/* 免責注記 */}
      <div className="px-1 space-y-0.5 text-[11px] text-muted-foreground">
        <p>※ G管・E管は JIS C 8305 規格値。フレキ・プリカ類はメーカーにより外径が異なる場合があります。</p>
        <p>※ PF・CD・FEP・VE・フレキ類は目安値です。現場実測・設計図書を優先してください。</p>
      </div>
    </div>
  );
}

function ToolRow({ name, just, clear }: { name: string; just: string; clear: string | null }) {
  return (
    <div className="flex items-center rounded-lg border border-border bg-card/50 px-3 py-2">
      <span className="text-sm font-medium">{name}</span>
      <span className="ml-auto text-sm font-bold tabular-nums">
        <span style={{ color: CUD.ok }}>{just}</span>
        {clear != null && (
          <>
            <span className="text-muted-foreground font-normal mx-1.5">/</span>
            <span style={{ color: CUD.info }}>{clear}</span>
          </>
        )}
      </span>
    </div>
  );
}
