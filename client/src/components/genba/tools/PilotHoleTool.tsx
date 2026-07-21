import { useMemo, useState } from "react";
import { Drill } from "lucide-react";
import {
  TAP_PILOT_HOLES,
  KNOCKOUT_PIPE_KINDS,
  KNOCKOUT_PIPE_ORDER,
  knockoutSizes,
  findKnockout,
  findTapPilotHole,
  formatHoleMm,
  type TapSize,
  type KnockoutPipeKind,
} from "@shared/genba/tools/pilotHoles";

/**
 * 下穴径 早見: タップ下穴（M4〜M12 並目ねじ）と配管コネクタ用ノックアウト径を
 * 選択のみで即表示する軽量リファレンス。データは shared/genba/tools/pilotHoles.ts。
 * 完全クライアント完結（サーバー通信なし）。
 */
export default function PilotHoleTool() {
  const [mode, setMode] = useState<"tap" | "knockout" | null>(null);
  const [tapSize, setTapSize] = useState<TapSize | null>(null);
  const [pipe, setPipe] = useState<KnockoutPipeKind | null>(null);
  const [pipeSize, setPipeSize] = useState<number | null>(null);

  const selectMode = (m: "tap" | "knockout") => {
    setMode(m);
    setTapSize(null);
    setPipe(null);
    setPipeSize(null);
  };

  const selectPipe = (p: KnockoutPipeKind) => {
    setPipe(p);
    setPipeSize(null);
  };

  // 選択中配管種の呼び径一覧（データテーブルから生成）
  const sizes = useMemo(() => (pipe ? knockoutSizes(pipe) : []), [pipe]);

  const tapResult = mode === "tap" && tapSize ? findTapPilotHole(tapSize) : null;
  const knockResult =
    mode === "knockout" && pipe && pipeSize != null ? findKnockout(pipe, pipeSize) : null;

  return (
    <div className="space-y-4">
      {/* 見出し */}
      <div className="flex items-center gap-2">
        <Drill className="w-5 h-5 text-muted-foreground" />
        <h2 className="text-base font-bold">下穴径 早見</h2>
      </div>

      {/* STEP1: 下穴の種類 */}
      <div className="rounded-2xl border border-border bg-card/70 p-4">
        <div className="text-xs font-bold text-muted-foreground mb-2">STEP 1　下穴の種類</div>
        <div className="grid grid-cols-2 gap-2">
          <ModeButton
            on={mode === "tap"}
            title="タップ下穴"
            sub="M4〜M12 並目ねじ"
            onClick={() => selectMode("tap")}
          />
          <ModeButton
            on={mode === "knockout"}
            title="コネクタ下穴"
            sub="PF・E管・G管・プリカ・防水プリカ"
            onClick={() => selectMode("knockout")}
          />
        </div>
      </div>

      {/* STEP2 (タップ): ネジサイズ */}
      {mode === "tap" && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">STEP 2　ネジサイズ</div>
          <div className="grid grid-cols-3 gap-2">
            {TAP_PILOT_HOLES.map((e) => {
              const on = tapSize === e.size;
              return (
                <button
                  key={e.size}
                  type="button"
                  onClick={() => setTapSize(e.size)}
                  className={`rounded-xl border px-2 py-2.5 text-sm font-bold tabular-nums transition-colors ${
                    on ? "border-transparent text-white" : "border-border bg-card/50"
                  }`}
                  style={on ? { background: "#4DC4FF" } : undefined}
                >
                  {e.size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP2 (コネクタ): 配管の種類 */}
      {mode === "knockout" && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">STEP 2　配管の種類</div>
          <div className="grid grid-cols-2 gap-2">
            {KNOCKOUT_PIPE_ORDER.map((k) => {
              const def = KNOCKOUT_PIPE_KINDS[k];
              const on = pipe === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectPipe(k)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    on ? "border-transparent text-white" : "border-border bg-card/50"
                  }`}
                  style={on ? { background: "#4DC4FF" } : undefined}
                >
                  <div className="text-sm font-bold leading-tight">{def.label}</div>
                  <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>
                    {def.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP3 (コネクタ): 呼び径 */}
      {mode === "knockout" && pipe && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs font-bold text-muted-foreground mb-2">STEP 3　呼び径</div>
          <div className="grid grid-cols-4 gap-2">
            {sizes.map((s) => {
              const on = pipeSize === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPipeSize(s)}
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

      {/* 結果 (タップ) */}
      {tapSize && tapResult != null && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs text-muted-foreground">{tapSize} 並目ねじ のタップ下穴径</div>
          <div className="flex items-end gap-1 mt-1">
            <span className="text-lg font-bold text-muted-foreground mb-1.5">φ</span>
            <span className="text-5xl font-black tabular-nums" style={{ color: "#4DC4FF" }}>
              {formatHoleMm(tapResult)}
            </span>
            <span className="text-lg font-bold text-muted-foreground mb-1.5">mm</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            ※ メートル並目ねじの標準下穴径（JIS B 1004 に一致する目安値）です。
          </div>
        </div>
      )}

      {/* 結果 (コネクタ) */}
      {knockResult && pipe && (
        <div className="rounded-2xl border border-border bg-card/70 p-4">
          <div className="text-xs text-muted-foreground">
            {KNOCKOUT_PIPE_KINDS[pipe].label} 呼び{knockResult.size} のノックアウト径
          </div>
          <div className="flex items-end gap-1 mt-1 flex-wrap">
            {knockResult.knockMm.map((v, i) => (
              <span key={v} className="flex items-end gap-1">
                {i > 0 && <span className="text-lg font-bold text-muted-foreground mb-1.5 mx-1">/</span>}
                <span className="text-lg font-bold text-muted-foreground mb-1.5">φ</span>
                <span
                  className={`font-black tabular-nums ${knockResult.knockMm.length > 1 ? "text-4xl" : "text-5xl"}`}
                  style={{ color: "#4DC4FF" }}
                >
                  {formatHoleMm(v)}
                </span>
                <span className="text-lg font-bold text-muted-foreground mb-1.5">mm</span>
              </span>
            ))}
          </div>
          {knockResult.note && (
            <div
              className="mt-2 rounded-lg border px-3 py-2 text-xs font-bold"
              style={{ borderColor: "#F6AA00", color: "#F6AA00" }}
            >
              ⚠ {knockResult.note}
            </div>
          )}
          <div className="mt-2 text-[11px] text-muted-foreground">
            ※ コネクタカタログ参照の目安値です。メーカー・コネクタ種類により異なる場合があります。
          </div>
        </div>
      )}

      {/* 免責注記 */}
      <p className="text-[11px] text-muted-foreground px-1">
        ※ 本ツールの数値は規格・カタログに基づく目安です。実施工では現場実測・設計図書・メーカー資料を優先してください。
      </p>
    </div>
  );
}

function ModeButton({ on, title, sub, onClick }: { on: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
        on ? "border-transparent text-white" : "border-border bg-card/50"
      }`}
      style={on ? { background: "#4DC4FF" } : undefined}
    >
      <div className="text-sm font-bold leading-tight">{title}</div>
      <div className={`text-[11px] leading-tight ${on ? "text-white/80" : "text-muted-foreground"}`}>{sub}</div>
    </button>
  );
}
