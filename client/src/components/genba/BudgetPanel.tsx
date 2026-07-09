import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const fmtYen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
const todayStr = () => new Date().toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** 予算トラッカー (プロトタイプ BudgetTab 移植・admin専用): オプトイン→設定→出面→サマリー */
export default function BudgetPanel({
  siteId, siteName, open, onOpenChange,
}: {
  siteId: string;
  siteName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: cfg } = trpc.genba.budgets.get.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: sum } = trpc.genba.budgets.summary.useQuery({ siteId }, { enabled: open, retry: false });
  const { data: att } = trpc.genba.budgets.listAttendance.useQuery({ siteId }, { enabled: open, retry: false });

  const [attDate, setAttDate] = useState(todayStr());
  const [attMd, setAttMd] = useState("");

  const b = cfg?.budget;
  const enabled = !!b?.enabled;
  const summary = sum?.summary || null;

  const invalidate = () => {
    utils.genba.budgets.get.invalidate({ siteId });
    utils.genba.budgets.summary.invalidate({ siteId });
    utils.genba.budgets.listAttendance.invalidate({ siteId });
  };
  const save = trpc.genba.budgets.save.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const addAtt = trpc.genba.budgets.addManualAttendance.useMutation({
    onSuccess: () => { invalidate(); setAttMd(""); toast.success("出面を記録しました"); }, onError: (e) => toast.error(e.message),
  });
  const delAtt = trpc.genba.budgets.removeAttendance.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });

  const set = (patch: Record<string, unknown>) => save.mutate({ siteId, ...patch });
  const num = (v: string) => Number(v.replace(/[^\d]/g, "")) || 0;

  function addAttendance() {
    const md = Number(attMd);
    if (!attDate || !md || md <= 0) { toast.error("日付と人工数を入力してください"); return; }
    addAtt.mutate({ siteId, date: attDate, manDays: md });
  }

  const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div className="rounded-lg border border-border p-2 min-w-[140px] flex-1">
      <div className="text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
  const money = (label: string, key: string) => (
    <label className="flex items-center gap-2 mt-2 text-sm">
      <span className="min-w-[110px] text-muted-foreground">{label}</span>
      <input inputMode="numeric" value={b ? (b as any)[key]?.toLocaleString?.("ja-JP") || "" : ""} placeholder="0"
        onChange={(e) => set({ [key]: num(e.target.value) })}
        className="flex-1 text-right tabular-nums rounded-md border border-border bg-background p-1.5 text-sm" />
      <span className="text-xs text-muted-foreground">円</span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>💰 予算トラッカー</DialogTitle></DialogHeader>

        {!enabled ? (
          <div className="rounded-lg border border-border p-4 text-center space-y-2">
            <div className="text-4xl">💰</div>
            <p className="text-sm text-muted-foreground text-left leading-relaxed">
              工期・契約金額・人工単価から「あと何人工使えるか」を自動計算します。<br />
              <strong>常駐現場（逆算が不要な現場）はこのままでOK</strong>。未設定でも他機能に影響しません。
            </p>
            <Button className="w-full" onClick={() => { set({ enabled: true }); toast.success(`「${siteName}」で予算トラッカーを有効化しました`); }}>
              この現場で予算トラッカーを使う
            </Button>
          </div>
        ) : (
          <>
            {/* サマリー */}
            {summary ? (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="text-xs text-muted-foreground">{siteName} — 集計元: {sum?.source === "project" ? "出面表(プロジェクト連携)" : "手入力"}（{r1(sum?.sourceManDays || 0)}人工）</div>
                <div className="flex gap-2 flex-wrap">
                  <Stat label="残り予算(利益確保後)" value={fmtYen(summary.remainingBudget)} color={summary.remainingBudget < 0 ? "#FF4B00" : "#03AF7A"} />
                  <Stat label={`使用済み(人工${r1(summary.usedManDays)}+経費)`} value={fmtYen(summary.usedTotal)} />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>工期消化 {Math.round(summary.periodPct)}%</span>
                    <span style={{ color: summary.budgetPct > summary.periodPct + 5 ? "#FF4B00" : undefined, fontWeight: summary.budgetPct > summary.periodPct + 5 ? 700 : 400 }}>
                      予算消化 {Math.round(summary.budgetPct)}%{summary.budgetPct > summary.periodPct + 5 ? " ⚠" : ""}
                    </span>
                  </div>
                  <div className="h-2.5 rounded bg-muted mt-1 overflow-hidden"><div className="h-2.5 bg-[#94a3b8]" style={{ width: `${Math.min(summary.periodPct, 100)}%` }} /></div>
                  <div className="h-2.5 rounded bg-muted mt-1 overflow-hidden"><div className="h-2.5" style={{ width: `${Math.min(summary.budgetPct, 100)}%`, background: summary.budgetPct > summary.periodPct + 5 ? "#FF4B00" : "#005AFF" }} /></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Stat label="使用できる人工の上限(月平均)" value={summary.paceNeeded > 0 ? String(r1(summary.paceNeeded)) : "—"} color="#1d4ed8" />
                  <Stat label="現在ペース(人工/月)" value={String(r1(summary.currentPace))} />
                </div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">
                  予算上限 {fmtYen(summary.budgetCap)}（契約 {fmtYen(b!.contractAmount)} − 目標利益 {fmtYen(summary.targetProfit)}）／
                  残工期 {r1(summary.remainingMonths)}ヶ月 ／ 使用可能な残り人工 約{Math.max(Math.floor(summary.allowableManDays), 0)}人工
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">契約金額と工期を設定するとサマリーが表示されます。</p>
            )}

            {/* 設定 */}
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center">
                <strong className="flex-1 text-sm">⚙ プロジェクト設定</strong>
                <button className="text-[11px] text-muted-foreground hover:text-[#FF4B00]"
                  onClick={() => { if (window.confirm("予算トラッカーを無効化しますか？（設定と記録は保持されます）")) { set({ enabled: false }); toast.success("無効化しました（常駐現場向け）"); } }}>
                  この現場では使わない
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2 text-sm">
                <span className="min-w-[110px] text-muted-foreground">工期</span>
                <input type="date" value={b?.periodStart || ""} onChange={(e) => set({ periodStart: e.target.value || null })} className="flex-1 rounded-md border border-border bg-background p-1.5 text-sm" />
                <span>〜</span>
                <input type="date" value={b?.periodEnd || ""} onChange={(e) => set({ periodEnd: e.target.value || null })} className="flex-1 rounded-md border border-border bg-background p-1.5 text-sm" />
              </div>
              {cfg?.projectPeriod?.startDate && (!b?.periodStart || !b?.periodEnd) && (
                <button className="text-[11px] text-[#1d4ed8] mt-1 ml-[118px]"
                  onClick={() => set({ periodStart: cfg.projectPeriod!.startDate, periodEnd: cfg.projectPeriod!.endDate })}>
                  ↩ プロジェクト工期を使う（{cfg.projectPeriod.startDate}〜{cfg.projectPeriod.endDate}）
                </button>
              )}
              {money("契約金額", "contractAmount")}
              <div className="flex items-center gap-2 mt-2 text-sm">
                <span className="min-w-[110px] text-muted-foreground">目標利益</span>
                <select value={b?.targetType || "percent"} onChange={(e) => set({ targetType: e.target.value })} className="w-[70px] rounded-md border border-border bg-background p-1.5 text-sm">
                  <option value="percent">%</option>
                  <option value="amount">円</option>
                </select>
                <input inputMode="numeric" value={b?.targetValue || ""} placeholder="0"
                  onChange={(e) => set({ targetValue: num(e.target.value) })}
                  className="flex-1 text-right tabular-nums rounded-md border border-border bg-background p-1.5 text-sm" />
              </div>
              {money("人工単価", "costPerManDay")}
              {money("月間経費", "monthlyExpense")}
              <label className="flex items-center gap-2 mt-2 text-sm">
                <span className="min-w-[110px] text-muted-foreground">導入前の人工数</span>
                <input inputMode="decimal" value={b?.preManDays && Number(b.preManDays) ? String(Number(b.preManDays)) : ""} placeholder="0"
                  onChange={(e) => set({ preManDays: parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
                  className="flex-1 text-right tabular-nums rounded-md border border-border bg-background p-1.5 text-sm" />
                <span className="text-xs text-muted-foreground">人工</span>
              </label>
              <label className="flex items-center gap-2 mt-2 text-sm">
                <span className="min-w-[110px] text-muted-foreground">連携する出面</span>
                <select value={b?.attendanceSource || "manual"} onChange={(e) => set({ attendanceSource: e.target.value })}
                  className="flex-1 rounded-md border border-border bg-background p-1.5 text-sm">
                  <option value="manual">手入力（このアプリで記録）</option>
                  <option value="project" disabled={!cfg?.hasProject}>出面表（プロジェクト連携）{cfg?.hasProject ? "" : " ※現場に案件リンクが必要"}</option>
                </select>
              </label>
            </div>

            {/* 出面入力 (manual) */}
            <div className="rounded-lg border border-border p-3">
              <strong className="text-sm">👷 出面(人工)を記録</strong>
              <div className="flex gap-2 mt-2 flex-wrap">
                <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="flex-1 min-w-[130px] rounded-md border border-border bg-background p-1.5 text-sm" />
                <input type="number" step="0.5" min="0.5" value={attMd} onChange={(e) => setAttMd(e.target.value)} placeholder="人工(例: 6)" className="w-28 text-right rounded-md border border-border bg-background p-1.5 text-sm" />
                <Button size="sm" onClick={addAttendance} disabled={addAtt.isPending}>登録</Button>
              </div>
              {(att || []).length > 0 && (
                <div className="mt-2">
                  {[...(att as any[])].reverse().slice(0, 10).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 text-sm">
                      <span className="text-muted-foreground tabular-nums">{a.date}</span>
                      <strong className="flex-1 tabular-nums">{a.manDays} 人工</strong>
                      <button className="text-[#b91c1c]" onClick={() => { if (window.confirm(`${a.date} の ${a.manDays}人工を削除しますか？`)) delAtt.mutate({ id: a.id }); }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
