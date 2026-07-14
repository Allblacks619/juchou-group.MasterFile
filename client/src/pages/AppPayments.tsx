/*
 * AppPayments — 支払管理（作業員単位・一覧＋検算ドリルダウン）
 * 年月を選ぶだけで対象作業員を「行」で一覧表示。各行をタップすると現場別内訳＋
 * 前借り台帳を展開して金額の根拠を確認（検算）できる。
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Undo2,
  ArrowLeftRight,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  PiggyBank,
  Search,
  AlertTriangle,
} from "lucide-react";

const PAID_STATUS: Record<string, { label: string; className: string }> = {
  unpaid: { label: "未払い", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  partial: { label: "一部", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  paid: { label: "支払済", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};
const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: "前借り", repayment: "返済/相殺", adjustment: "調整" };

function yen(n: number) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return y && mo ? `${y}年${Number(mo)}月` : m;
}

export default function AppPayments() {
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const summaryQuery = trpc.payment.workerMonthSummary.useQuery({ closingMonth });
  const workers = summaryQuery.data?.workers || [];
  const summary = summaryQuery.data?.summary;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return workers;
    return workers.filter((w: any) => String(w.name).includes(q));
  }, [workers, query]);

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">支払管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            年月を選ぶと対象作業員が一覧表示されます。行をタップで内訳（検算）を確認できます。
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">対象月</Label>
            <Input type="month" value={closingMonth} onChange={(e) => { setClosingMonth(e.target.value); setExpanded(null); }} className="w-[160px]" />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="作業員名で絞り込み" className="w-[180px] pl-8" />
          </div>
        </div>
      </div>

      {/* サマリー（コンパクト） */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="対象作業員" value={`${summary?.workerCount ?? 0}名`} />
        <MiniStat label="支給合計" value={yen(summary?.totalAmount || 0)} />
        <MiniStat label="差引支払合計" value={yen(summary?.netPayableTotal || 0)} accent />
        <MiniStat label="支払済" value={`${summary?.paidCount ?? 0} / ${summary?.workerCount ?? 0}名`} />
      </div>

      {/* 検算アラート: 出面日数と算定日数が食い違う作業員 */}
      {(summary?.dayMismatchCount ?? 0) > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="text-amber-200">
            <span className="font-semibold">{summary?.dayMismatchCount}名</span> の作業員で、出面日数と支払の算定日数が一致していません。
            <span className="text-amber-200/80">行の <AlertTriangle className="inline h-3 w-3 mb-0.5" /> をタップして内訳を確認してください（同日に昼勤と夜勤の両方がある、または重複記録が原因のことが多いです）。</span>
          </div>
        </div>
      )}

      {/* 一覧テーブル */}
      <Card>
        <CardContent className="p-0">
          {summaryQuery.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {workers.length === 0 ? `${monthLabel(closingMonth)} の支払対象がありません（月締めを進めると作成されます）` : "該当する作業員がいません"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2.5 w-8"></th>
                    <th className="text-left font-medium px-2 py-2.5">作業員</th>
                    <th className="text-right font-medium px-2 py-2.5">総支給</th>
                    <th className="text-right font-medium px-2 py-2.5">前借り残高</th>
                    <th className="text-right font-medium px-2 py-2.5">相殺</th>
                    <th className="text-right font-medium px-2 py-2.5">差引支払</th>
                    <th className="text-center font-medium px-2 py-2.5">状況</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w: any) => {
                    const st = PAID_STATUS[w.paidStatus] || PAID_STATUS.unpaid;
                    const isOpen = expanded === w.employeeId;
                    return (
                      <>
                        <tr
                          key={w.employeeId}
                          className={`border-b border-border/60 cursor-pointer transition-colors hover:bg-muted/20 ${isOpen ? "bg-muted/20" : ""}`}
                          onClick={() => setExpanded(isOpen ? null : w.employeeId)}
                        >
                          <td className="px-3 py-3 text-muted-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-1.5 font-medium">
                              {w.name}
                              {w.hasDayMismatch && (
                                <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-400" title="出面日数と算定日数が一致しません">
                                  <AlertTriangle className="h-3 w-3" />検算
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {w.projects.length}現場
                              {w.hasDayMismatch && (
                                <span className="text-amber-400/90"> ・ 出面{w.attendanceDaysTotal}日 / 算定{Number(w.payDaysTotal || 0).toFixed(1)}日</span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums">{yen(w.totalAmount)}</td>
                          <td className={`px-2 py-3 text-right tabular-nums ${w.advanceBalance > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{yen(w.advanceBalance)}</td>
                          <td className={`px-2 py-3 text-right tabular-nums ${w.appliedOffset > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>{w.appliedOffset > 0 ? `-${yen(w.appliedOffset)}` : "—"}</td>
                          <td className="px-2 py-3 text-right tabular-nums font-bold text-gold">{yen(w.netPayable)}</td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-block rounded border px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                          </td>
                          <td className="px-2 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <WorkerPaidToggle worker={w} closingMonth={closingMonth} />
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${w.employeeId}-d`} className="bg-muted/10">
                            <td colSpan={8} className="px-3 py-4">
                              <WorkerDrilldown worker={w} closingMonth={closingMonth} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-gold" : ""}`}>{value}</div>
    </div>
  );
}

function WorkerPaidToggle({ worker, closingMonth }: { worker: any; closingMonth: string }) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.payment.workerMonthSummary.invalidate();
  const markPaid = trpc.payment.markWorkerPaid.useMutation({
    onSuccess: () => { toast.success(`${worker.name} を支払済みにしました`); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const markUnpaid = trpc.payment.markWorkerUnpaid.useMutation({
    onSuccess: () => { toast.success(`${worker.name} を未払いに戻しました`); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  if (worker.paidStatus === "paid") {
    return (
      <Button size="sm" variant="outline" className="h-8 gap-1" disabled={markUnpaid.isPending} onClick={() => markUnpaid.mutate({ closingMonth, employeeId: worker.employeeId })}>
        <Undo2 className="h-3.5 w-3.5" />戻す
      </Button>
    );
  }
  return (
    <Button size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={markPaid.isPending} onClick={() => markPaid.mutate({ closingMonth, employeeId: worker.employeeId })}>
      <CheckCircle2 className="h-3.5 w-3.5" />支払済みに
    </Button>
  );
}

/** 検算ドリルダウン: 現場別内訳＋前借り台帳（残高・履歴・相殺・追加）。 */
function WorkerDrilldown({ worker, closingMonth }: { worker: any; closingMonth: string }) {
  const utils = trpc.useUtils();
  const [offsetInput, setOffsetInput] = useState<string>("");
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const ledgerQuery = trpc.advance.ledger.useQuery({ employeeId: worker.employeeId });

  const invalidate = () => {
    utils.payment.workerMonthSummary.invalidate();
    utils.advance.ledger.invalidate({ employeeId: worker.employeeId });
  };
  const offsetMutation = trpc.advance.offsetWorkerMonth.useMutation({
    onSuccess: (r) => { toast.success(`前借りを ${yen(r.applied)} 相殺しました（残高 ${yen(r.balance)}）`); setOffsetInput(""); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.advance.deleteEntry.useMutation({
    onSuccess: () => { toast.success("台帳から削除しました"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* 現場別内訳（検算の根拠） */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1.5">現場別内訳（この金額の根拠）</div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[600px] text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                <th className="text-left font-medium px-2 py-1.5">現場</th>
                <th className="text-right font-medium px-2 py-1.5">出面</th>
                <th className="text-right font-medium px-2 py-1.5">算定</th>
                <th className="text-right font-medium px-2 py-1.5">基本給</th>
                <th className="text-right font-medium px-2 py-1.5">交通費</th>
                <th className="text-right font-medium px-2 py-1.5">経費</th>
                <th className="text-right font-medium px-2 py-1.5">調整</th>
                <th className="text-right font-medium px-2 py-1.5">小計</th>
                <th className="text-center font-medium px-2 py-1.5">状況</th>
              </tr>
            </thead>
            <tbody>
              {worker.projects.map((p: any) => {
                const payDays = Number(p.baseDaysTimes10 || 0) / 10;
                const attDays = Number(p.attendanceDays || 0);
                const mismatch = Number(p.baseDaysTimes10 || 0) !== attDays * 10;
                return (
                  <tr key={p.paymentId} className="border-b border-border/50 last:border-0">
                    <td className="px-2 py-1.5">{p.projectName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{attDays}日</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${mismatch ? "text-amber-400 font-semibold" : ""}`}>
                      {mismatch && <AlertTriangle className="inline h-3 w-3 mr-0.5 mb-0.5" />}{payDays.toFixed(1)}日
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{yen(p.baseAmount)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.transportAmount ? yen(p.transportAmount) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.expenseAmount ? yen(p.expenseAmount) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.adjustmentAmount ? yen(p.adjustmentAmount) : "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">{yen(p.totalAmount)}</td>
                    <td className="px-2 py-1.5 text-center">{p.status === "paid" ? "支払済" : "未払い"}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-2 py-1.5">合計</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{worker.attendanceDaysTotal}日</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{Number(worker.payDaysTotal || 0).toFixed(1)}日</td>
                <td colSpan={3}></td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gold">{yen(worker.totalAmount)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        {worker.hasDayMismatch && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-400/90">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              出面日数（実働の重複なし日数）と算定日数が一致しません。日数は出面日数で算定するため通常は一致します。作業日報・出面表で該当日を確認し、同日に昼勤と夜勤の両方や重複記録があれば修正すると一致します。金額の例外対応が必要な場合は「調整」で補正できます。
            </span>
          </p>
        )}
      </div>

      {/* 前借り／相殺 */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <PiggyBank className="h-4 w-4 text-gold" />
            前借り残高 <span className={`font-bold ${worker.advanceBalance > 0 ? "text-amber-400" : ""}`}>{yen(worker.advanceBalance)}</span>
            {worker.appliedOffset > 0 && <span className="text-xs text-emerald-400">（相殺済 {yen(worker.appliedOffset)}）</span>}
          </div>
          <AdvanceAddButton employeeId={worker.employeeId} onDone={invalidate} open={advanceOpen} setOpen={setAdvanceOpen} />
        </div>
        {worker.maxOffset > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">相殺額</span>
            <Input
              type="number"
              className="h-8 w-28 text-right"
              placeholder={String(worker.maxOffset)}
              value={offsetInput}
              onChange={(e) => setOffsetInput(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-8 gap-1" disabled={offsetMutation.isPending}
              onClick={() => {
                const amount = Number(offsetInput || worker.maxOffset);
                if (!amount || amount <= 0) { toast.error("相殺額を入力してください"); return; }
                offsetMutation.mutate({ closingMonth, employeeId: worker.employeeId, amount });
              }}>
              <ArrowLeftRight className="h-3.5 w-3.5" />相殺（最大 {yen(worker.maxOffset)}）
            </Button>
          </div>
        )}
        {/* 台帳履歴 */}
        {(ledgerQuery.data?.entries || []).length > 0 && (
          <div className="space-y-1 pt-1">
            {(ledgerQuery.data?.entries || []).slice(0, 8).map((e: any) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {e.createdAt ? format(new Date(e.createdAt), "M/d") : ""} ・ {ADVANCE_TYPE_LABELS[e.entryType] || e.entryType}
                  {e.reason ? ` ・ ${e.reason}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`tabular-nums ${e.amount < 0 ? "text-emerald-400" : "text-amber-400"}`}>{yen(e.amount)}</span>
                  <button className="text-muted-foreground hover:text-red-400" onClick={() => deleteMutation.mutate({ id: e.id })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AdvanceAddButton({ employeeId, onDone, open, setOpen }: { employeeId: number; onDone: () => void; open: boolean; setOpen: (v: boolean) => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [entryType, setEntryType] = useState<"advance" | "adjustment">("advance");
  const addMutation = trpc.advance.addEntry.useMutation({
    onSuccess: () => { toast.success("前借り台帳に追加しました"); setOpen(false); setAmount(""); setReason(""); onDone(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <>
      <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />前借り追加
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>前借り／調整の追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">種別</Label>
              <Select value={entryType} onValueChange={(v) => setEntryType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">前借り（残高が増える）</SelectItem>
                  <SelectItem value="adjustment">調整（残高が増える）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">金額（円）</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">理由（任意）</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="前借り・立替の理由" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button disabled={addMutation.isPending} onClick={() => {
              const n = Number(amount);
              if (!n || n <= 0) { toast.error("金額を入力してください"); return; }
              addMutation.mutate({ employeeId, entryType, amount: n, reason });
            }}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
