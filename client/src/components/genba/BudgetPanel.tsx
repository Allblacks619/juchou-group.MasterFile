import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmtYen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
const round1 = (n: number) => Math.round(n * 10) / 10;

type BudgetForm = {
  contractAmount: number; targetType: "percent" | "amount"; targetValue: number;
  costPerManDay: number; monthlyExpense: number; periodStart: string; periodEnd: string;
  preManDays: number; attendanceSource: "manual" | "project";
};
const DEFAULT_FORM: BudgetForm = {
  contractAmount: 0, targetType: "percent", targetValue: 10, costPerManDay: 25000,
  monthlyExpense: 0, periodStart: "", periodEnd: "", preManDays: 0, attendanceSource: "manual",
};

/** 予算トラッカー (プロトタイプ BudgetTab 移植・admin 専用): 逆算サマリー + 設定 + 手入力出面 */
export default function BudgetPanel({
  siteId, siteName, open, onOpenChange, embedded,
}: {
  siteId: string;
  siteName: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  embedded?: boolean;
}) {
  const utils = trpc.useUtils();
  const active = embedded || !!open;
  const { data: got } = trpc.genba.budgets.get.useQuery({ siteId }, { enabled: active, retry: false });
  const { data: summary } = trpc.genba.budgets.summary.useQuery({ siteId }, { enabled: active, retry: false });
  const { data: att } = trpc.genba.budgets.listManualAttendance.useQuery({ siteId }, { enabled: active, retry: false });

  const [form, setForm] = useState<BudgetForm>(DEFAULT_FORM);
  const [attDate, setAttDate] = useState("");
  const [attMd, setAttMd] = useState("");

  const enabled = !!got?.budget?.enabled;

  // get 取得時にフォームを seed (未設定なら連携プロジェクトの工期を初期提案)
  useEffect(() => {
    if (!got) return;
    const b = got.budget;
    if (b) {
      setForm({
        contractAmount: b.contractAmount, targetType: b.targetType as any, targetValue: b.targetValue,
        costPerManDay: b.costPerManDay, monthlyExpense: b.monthlyExpense,
        periodStart: b.periodStart || got.project?.startDate || "", periodEnd: b.periodEnd || got.project?.endDate || "",
        preManDays: Number(b.preManDays) || 0, attendanceSource: (b.attendanceSource as any) || "manual",
      });
    } else {
      setForm((f) => ({ ...f, periodStart: got.project?.startDate || "", periodEnd: got.project?.endDate || "" }));
    }
  }, [got]);

  const invalidate = () => {
    utils.genba.budgets.get.invalidate({ siteId });
    utils.genba.budgets.summary.invalidate({ siteId });
    utils.genba.budgets.listManualAttendance.invalidate({ siteId });
  };
  const save = trpc.genba.budgets.save.useMutation({ onSuccess: () => { invalidate(); toast.success("予算設定を保存しました"); }, onError: (e) => toast.error(e.message) });
  const addAtt = trpc.genba.budgets.addManualAttendance.useMutation({ onSuccess: () => { invalidate(); setAttMd(""); toast.success("出面を記録しました"); }, onError: (e) => toast.error(e.message) });
  const rmAtt = trpc.genba.budgets.removeManualAttendance.useMutation({ onSuccess: () => invalidate(), onError: (e) => toast.error(e.message) });

  const calc = summary?.calc || null;
  const rows = (att || []) as { id: string; date: string; manDays: number }[];

  // 空文字の日付は schema(YYYY-MM-DD)を通らないため null に正規化して送る
  const payload = () => ({ ...form, periodStart: form.periodStart || null, periodEnd: form.periodEnd || null });
  function enable() { save.mutate({ siteId, enabled: true, ...payload() }); }
  function persist() { save.mutate({ siteId, enabled: true, ...payload() }); }
  function disable() {
    if (window.confirm("この現場の予算トラッカーを無効化しますか？\n（設定と出面記録は保持され、再有効化で戻ります）")) save.mutate({ siteId, enabled: false });
  }
  function addAttendance() {
    const md = Number(attMd);
    if (!attDate || !md || md <= 0) { toast.error("日付と人工数を入力してください"); return; }
    addAtt.mutate({ siteId, date: attDate, manDays: md });
  }

  const set = (patch: Partial<BudgetForm>) => setForm((f) => ({ ...f, ...patch }));
  const numField = (label: string, key: keyof BudgetForm, suffix = "円") => (
    <label className="flex items-center gap-2 text-sm mt-2">
      <span className="min-w-[110px] text-muted-foreground">{label}</span>
      <input type="number" value={String(form[key] ?? "")} onChange={(e) => set({ [key]: Number(e.target.value) || 0 } as any)}
        className="flex-1 text-right rounded-md border border-border bg-background p-1.5 tabular-nums" />
      <span className="text-xs text-muted-foreground w-7">{suffix}</span>
    </label>
  );

  const profitAmount = form.targetType === "percent" ? (form.contractAmount * form.targetValue) / 100 : form.targetValue;

  const inner = (
      <>
        {!embedded && <DialogHeader><DialogTitle>💰 予算トラッカー</DialogTitle></DialogHeader>}

        {!enabled ? (
          <div className="rounded-lg border border-border p-4 text-center space-y-3">
            <div className="text-4xl">💰</div>
            <div className="text-sm text-muted-foreground text-left leading-relaxed">
              工期・契約金額・人工単価から「あと何人工使えるか」を自動計算します。<br />
              <strong>常駐現場（出勤分だけ請求する現場）など逆算が不要な場合は、このままでOK</strong>。未設定でも他機能に影響はありません。
            </div>
            <Button className="w-full" onClick={enable} disabled={save.isPending}>この現場で予算トラッカーを使う</Button>
          </div>
        ) : (
          <>
            {/* サマリー */}
            {calc && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="text-xs text-muted-foreground">{siteName} — 逆算サマリー（出面: {summary?.source === "project" ? "出面表連携" : "手入力"} / 使用人工 {round1(calc.usedManDays)}）{summary?.periodFromProject && <span className="text-[#005AFF]">・工期は連携案件から自動取得</span>}</div>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex-1 min-w-[140px] rounded-lg border border-border p-2 text-center">
                    <div className="text-xl font-bold tabular-nums" style={{ color: calc.remainingBudget < 0 ? "#FF4B00" : "#03AF7A" }}>{fmtYen(calc.remainingBudget)}</div>
                    <div className="text-[11px] text-muted-foreground">残り予算（利益確保後）</div>
                  </div>
                  <div className="flex-1 min-w-[140px] rounded-lg border border-border p-2 text-center">
                    <div className="text-xl font-bold tabular-nums">{fmtYen(calc.usedTotal)}</div>
                    <div className="text-[11px] text-muted-foreground">使用済み（人工+経費）</div>
                  </div>
                </div>
                {/* 工期 vs 予算 */}
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>工期消化 {Math.round(calc.periodPct)}%</span>
                    <span style={{ color: calc.budgetPct > calc.periodPct + 5 ? "#FF4B00" : undefined, fontWeight: calc.budgetPct > calc.periodPct + 5 ? 700 : 400 }}>
                      予算消化 {Math.round(calc.budgetPct)}%{calc.budgetPct > calc.periodPct + 5 ? " ⚠" : ""}
                    </span>
                  </div>
                  <div className="h-2.5 rounded bg-muted mt-1 overflow-hidden"><div className="h-full bg-[#94a3b8]" style={{ width: `${Math.min(calc.periodPct, 100)}%` }} /></div>
                  <div className="h-2.5 rounded bg-muted mt-1 overflow-hidden"><div className="h-full" style={{ width: `${Math.min(calc.budgetPct, 100)}%`, background: calc.budgetPct > calc.periodPct + 5 ? "#FF4B00" : "#005AFF" }} /></div>
                </div>
                {/* ペース */}
                <div className="flex gap-2 flex-wrap">
                  <div className="flex-1 min-w-[140px] rounded-lg border border-border p-2 text-center bg-[#eff6ff] dark:bg-transparent">
                    <div className="text-2xl font-bold tabular-nums text-[#1d4ed8]">{calc.paceNeeded > 0 ? round1(calc.paceNeeded) : "—"}</div>
                    <div className="text-[11px] text-muted-foreground">使用できる人工の上限（月平均）</div>
                  </div>
                  <div className="flex-1 min-w-[120px] rounded-lg border border-border p-2 text-center">
                    <div className="text-2xl font-bold tabular-nums">{round1(calc.currentPace)}</div>
                    <div className="text-[11px] text-muted-foreground">現在ペース（人工/月）</div>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  予算上限 {fmtYen(calc.budgetCap)}（契約 {fmtYen(form.contractAmount)} − 目標利益 {fmtYen(calc.targetProfit)}）／ 残工期 {round1(calc.remainingMonths)}ヶ月 ／ 使用可能な残り人工 約{Math.max(Math.floor(calc.allowableManDays), 0)}人工
                </div>
              </div>
            )}
            {!calc && (() => {
              // calc が出ない理由を具体的に示す (連携案件の工期もフォールバックとして考慮)。
              const effStart = form.periodStart || got?.project?.startDate || "";
              const effEnd = form.periodEnd || got?.project?.endDate || "";
              const linked = !!got?.projectId;
              if (!form.contractAmount) return <p className="text-xs text-muted-foreground">契約金額を入力すると逆算サマリーが表示されます。</p>;
              if (!effStart || !effEnd) {
                const miss = !effStart && !effEnd ? "工期の開始日と終了日" : !effEnd ? "工期の終了日" : "工期の開始日";
                return (
                  <p className="text-xs text-[#b45309] leading-relaxed">
                    逆算には工期（開始日〜終了日）が必要です。<strong>{miss}</strong>が未入力のため計算できません。上の工期欄に入力して「保存」してください。
                    {linked && "（連携案件に工期が設定されていれば自動で使われます）"}
                  </p>
                );
              }
              return <p className="text-xs text-muted-foreground">設定を「保存」すると逆算サマリーが表示されます。</p>;
            })()}

            {/* 設定 */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center">
                <strong className="flex-1 text-sm">⚙ プロジェクト設定</strong>
                <button className="text-[11px] text-muted-foreground hover:text-[#FF4B00]" onClick={disable}>この現場では使わない</button>
              </div>
              <div className="flex items-center gap-2 text-sm mt-2">
                <span className="min-w-[110px] text-muted-foreground">工期</span>
                <input type="date" value={form.periodStart} onChange={(e) => set({ periodStart: e.target.value })} className="flex-1 rounded-md border border-border bg-background p-1.5" />
                <span>〜</span>
                <input type="date" value={form.periodEnd} onChange={(e) => set({ periodEnd: e.target.value })} className="flex-1 rounded-md border border-border bg-background p-1.5" />
              </div>
              {numField("契約金額", "contractAmount")}
              <div className="flex items-center gap-2 text-sm mt-2">
                <span className="min-w-[110px] text-muted-foreground">目標利益</span>
                <select value={form.targetType} onChange={(e) => set({ targetType: e.target.value as any })} className="w-[70px] rounded-md border border-border bg-background p-1.5">
                  <option value="percent">%</option>
                  <option value="amount">円</option>
                </select>
                <input type="number" value={String(form.targetValue ?? "")} onChange={(e) => set({ targetValue: Number(e.target.value) || 0 })} className="flex-1 text-right rounded-md border border-border bg-background p-1.5 tabular-nums" />
              </div>
              {form.targetType === "percent" && form.contractAmount > 0 && (
                <div className="text-xs text-[#1d4ed8] font-bold mt-1 ml-[118px] tabular-nums">= {fmtYen(profitAmount)}</div>
              )}
              {numField("人工単価", "costPerManDay")}
              {numField("月間経費", "monthlyExpense")}
              {numField("導入前の人工数", "preManDays", "人工")}
              <label className="flex items-center gap-2 text-sm mt-2">
                <span className="min-w-[110px] text-muted-foreground">連携する出面表</span>
                <select value={form.attendanceSource} onChange={(e) => set({ attendanceSource: e.target.value as any })} className="flex-1 rounded-md border border-border bg-background p-1.5">
                  <option value="manual">手入力</option>
                  <option value="project">業務システムの出面表{got?.projectId ? "（連携中）" : "（現場に案件リンク未設定）"}</option>
                </select>
              </label>
              {form.attendanceSource === "project" && !got?.projectId && (
                <div className="text-[11px] text-[#b45309] mt-1 ml-[118px]">この現場に案件（projectId）が未リンクのため、手入力が使われます。</div>
              )}
              <Button className="w-full mt-3" onClick={persist} disabled={save.isPending}>保存</Button>
            </div>

            {/* 手入力出面 */}
            {form.attendanceSource === "manual" && (
              <div className="rounded-lg border border-border p-3">
                <strong className="text-sm">👷 出面（人工）を記録</strong>
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="flex-1 min-w-[130px] rounded-md border border-border bg-background p-1.5" />
                  <input type="number" step="0.5" min="0.5" value={attMd} onChange={(e) => setAttMd(e.target.value)} placeholder="人工数(例: 6)" className="w-[120px] text-right rounded-md border border-border bg-background p-1.5" />
                  <Button size="sm" onClick={addAttendance} disabled={addAtt.isPending}>登録</Button>
                </div>
                {rows.length > 0 && (
                  <div className="mt-2">
                    {[...rows].reverse().slice(0, 10).map((a) => (
                      <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 text-sm">
                        <span className="tabular-nums text-muted-foreground">{a.date}</span>
                        <strong className="flex-1 tabular-nums">{a.manDays} 人工</strong>
                        <button className="text-[#FF4B00]" onClick={() => { if (window.confirm(`${a.date} の ${a.manDays}人工を削除しますか？`)) rmAtt.mutate({ id: a.id }); }}>✕</button>
                      </div>
                    ))}
                    <div className="text-xs text-muted-foreground mt-1">記録合計: {round1(rows.reduce((s, r) => s + r.manDays, 0))}人工（+ 導入前 {form.preManDays || 0}人工）</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </>
  );

  if (embedded) return <div className="space-y-3">{inner}</div>;
  return (
    <Dialog open={!!open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">{inner}</DialogContent>
    </Dialog>
  );
}
