import { useMemo, useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Wallet, RefreshCw, CheckCircle2, Undo2, Save, PiggyBank, Plus, Trash2, ArrowLeftRight } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "未確定", className: "bg-amber-500/20 text-amber-400" },
  confirmed: { label: "確定", className: "bg-blue-500/20 text-blue-400" },
  paid: { label: "支払済", className: "bg-emerald-500/20 text-emerald-400" },
};

function formatYen(amount: number) {
  return `¥${Number(amount || 0).toLocaleString("ja-JP")}`;
}

export default function AppPayments() {
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [adjustments, setAdjustments] = useState<Record<number, string>>({});
  const [notesMap, setNotesMap] = useState<Record<number, string>>({});

  const listQuery = trpc.payment.listByMonth.useQuery({ closingMonth });
  const detailQuery = trpc.payment.get.useQuery(
    { projectId: selectedProjectId || 0, closingMonth },
    { enabled: !!selectedProjectId }
  );

  const refreshMutation = trpc.payment.refresh.useMutation({
    onSuccess: () => {
      toast.success("支払データを再計算しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`再計算エラー: ${e.message}`),
  });

  const updateMutation = trpc.payment.update.useMutation({
    onSuccess: () => {
      toast.success("支払行を更新しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`更新エラー: ${e.message}`),
  });

  const markPaidMutation = trpc.payment.markPaid.useMutation({
    onSuccess: () => {
      toast.success("支払済みにしました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`支払更新エラー: ${e.message}`),
  });

  const markUnpaidMutation = trpc.payment.markUnpaid.useMutation({
    onSuccess: () => {
      toast.success("未払いに戻しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`支払戻しエラー: ${e.message}`),
  });

  // 前借り台帳のコンテキスト（支払行ごとの残高・相殺可能額・差引支払額）。
  const advanceCtxQuery = trpc.advance.paymentContext.useQuery(
    { projectId: selectedProjectId || 0, closingMonth },
    { enabled: !!selectedProjectId }
  );
  const advanceCtx = advanceCtxQuery.data?.byPayment || {};
  const [offsetInputs, setOffsetInputs] = useState<Record<number, string>>({});

  const offsetMutation = trpc.advance.offsetPayment.useMutation({
    onSuccess: (res) => {
      toast.success(`前借りを ${formatYen(res.applied)} 相殺しました（残高 ${formatYen(res.balance)}）`);
      advanceCtxQuery.refetch();
      detailQuery.refetch();
      setOffsetInputs({});
    },
    onError: (e) => toast.error(`相殺エラー: ${e.message}`),
  });

  const rows = listQuery.data || [];
  const detail = detailQuery.data;

  const selectedListRow = useMemo(
    () => rows.find((r: any) => r.project.id === selectedProjectId) || null,
    [rows, selectedProjectId]
  );

  const handleSaveRow = (payment: any) => {
    const adjustmentAmount = Number(adjustments[payment.id] ?? payment.adjustmentAmount ?? 0);
    const notes = notesMap[payment.id] ?? payment.notes ?? "";
    updateMutation.mutate({
      id: payment.id,
      adjustmentAmount,
      notes,
      status: payment.status === "pending" ? "confirmed" : payment.status,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">支払管理</h1>
          <p className="text-muted-foreground mt-1">案件ごとの従業員支払額を確認・確定・支払済みにします</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>締め月</Label>
            <Input type="month" value={closingMonth} onChange={(e) => {
              setClosingMonth(e.target.value);
              setSelectedProjectId(null);
            }} className="w-[180px]" />
          </div>
          <div className="space-y-1 min-w-[280px]">
            <Label>案件</Label>
            <Select value={selectedProjectId?.toString() || ""} onValueChange={(v) => setSelectedProjectId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="案件を選択" />
              </SelectTrigger>
              <SelectContent>
                {rows.map((row: any) => (
                  <SelectItem key={row.project.id} value={String(row.project.id)}>
                    {row.project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProjectId && (
            <Button
              variant="outline"
              onClick={() => refreshMutation.mutate({ projectId: selectedProjectId, closingMonth })}
              disabled={refreshMutation.isPending}
              className="gap-2"
            >
              {refreshMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              支払再計算
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">案件一覧</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">この月の締め案件がありません</p>
            ) : rows.map((row: any) => (
              <button
                key={row.project.id}
                onClick={() => setSelectedProjectId(row.project.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${selectedProjectId === row.project.id ? "border-gold bg-gold/10" : "border-border hover:bg-muted/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{row.project.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_LABELS[row.summary.paidCount === row.summary.targetCount && row.summary.targetCount > 0 ? "paid" : row.summary.confirmedCount > 0 ? "confirmed" : "pending"].className}`}>
                    {row.summary.targetCount}名
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  未払い {row.summary.unpaidCount} / 支払済 {row.summary.paidCount}
                </div>
                <div className="mt-1 text-sm font-medium text-gold">{formatYen(row.summary.totalAmount)}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {detail?.project?.name || selectedListRow?.project?.name || "支払詳細"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedProjectId ? (
              <p className="text-sm text-muted-foreground">案件を選択してください</p>
            ) : detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
            ) : !detail ? (
              <p className="text-sm text-muted-foreground">支払データがありません</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">対象人数</div><div className="text-xl font-bold">{detail.summary.targetCount}</div></CardContent></Card>
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">未払い</div><div className="text-xl font-bold text-amber-400">{detail.summary.unpaidCount}</div></CardContent></Card>
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">支払済</div><div className="text-xl font-bold text-emerald-400">{detail.summary.paidCount}</div></CardContent></Card>
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">合計支払額</div><div className="text-xl font-bold text-gold">{formatYen(detail.summary.totalAmount)}</div></CardContent></Card>
                </div>

                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>従業員</TableHead>
                        <TableHead>状態</TableHead>
                        <TableHead className="text-right">日数</TableHead>
                        <TableHead className="text-right">基本給</TableHead>
                        <TableHead className="text-right">交通費</TableHead>
                        <TableHead className="text-right">経費</TableHead>
                        <TableHead className="text-right">調整</TableHead>
                        <TableHead className="text-right">合計</TableHead>
                        <TableHead className="text-right">前借り相殺</TableHead>
                        <TableHead>備考</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.payments.length === 0 ? (
                        <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">支払対象データがありません</TableCell></TableRow>
                      ) : detail.payments.map((row: any) => {
                        const statusMeta = STATUS_LABELS[row.payment.status] || STATUS_LABELS.pending;
                        return (
                          <TableRow key={row.payment.id}>
                            <TableCell>
                              <div className="font-medium">{row.employee?.nameKanji || `従業員${row.payment.employeeId}`}</div>
                              {row.submission?.receiptRequired && !row.submission?.receiptUploaded && (
                                <div className="text-[11px] text-red-400">領収書未提出</div>
                              )}
                            </TableCell>
                            <TableCell><span className={`text-xs px-2 py-0.5 rounded ${statusMeta.className}`}>{statusMeta.label}</span></TableCell>
                            <TableCell className="text-right">{(Number(row.payment.baseDaysTimes10 || 0) / 10).toFixed(1)}</TableCell>
                            <TableCell className="text-right">{formatYen(row.payment.baseAmount)}</TableCell>
                            <TableCell className="text-right">{formatYen(row.payment.transportAmount)}</TableCell>
                            <TableCell className="text-right">{formatYen(row.payment.expenseAmount)}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="h-8 w-24 ml-auto text-right"
                                value={adjustments[row.payment.id] ?? row.payment.adjustmentAmount ?? 0}
                                onChange={(e) => setAdjustments((prev) => ({ ...prev, [row.payment.id]: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell className="text-right font-bold">{formatYen(row.payment.totalAmount)}</TableCell>
                            <TableCell className="text-right">
                              {(() => {
                                const adv = advanceCtx[row.payment.id];
                                if (!adv) return <span className="text-muted-foreground">—</span>;
                                const canOffset = adv.maxOffset > 0;
                                return (
                                  <div className="flex flex-col items-end gap-1">
                                    {adv.appliedOffset > 0 && (
                                      <span className="text-xs text-emerald-400">相殺 {formatYen(adv.appliedOffset)} → 差引 {formatYen(adv.netPayable)}</span>
                                    )}
                                    {adv.balance > 0 ? (
                                      <span className="text-[11px] text-amber-400">残高 {formatYen(adv.balance)}</span>
                                    ) : adv.appliedOffset === 0 ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : null}
                                    {canOffset && (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          className="h-7 w-20 text-right"
                                          value={offsetInputs[row.payment.id] ?? String(adv.maxOffset)}
                                          onChange={(e) => setOffsetInputs((prev) => ({ ...prev, [row.payment.id]: e.target.value }))}
                                        />
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 gap-1 px-2"
                                          disabled={offsetMutation.isPending}
                                          onClick={() => {
                                            const amount = Number(offsetInputs[row.payment.id] ?? adv.maxOffset);
                                            if (!amount || amount <= 0) { toast.error("相殺額を入力してください"); return; }
                                            offsetMutation.mutate({ paymentId: row.payment.id, amount });
                                          }}
                                        >
                                          <ArrowLeftRight className="h-3 w-3" />相殺
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8 min-w-[180px]"
                                value={notesMap[row.payment.id] ?? row.payment.notes ?? ""}
                                onChange={(e) => setNotesMap((prev) => ({ ...prev, [row.payment.id]: e.target.value }))}
                                placeholder="備考"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Button size="sm" variant="outline" className="gap-1" onClick={() => handleSaveRow(row.payment)} disabled={updateMutation.isPending}>
                                  <Save className="h-3.5 w-3.5" />保存
                                </Button>
                                {row.payment.status !== "paid" ? (
                                  <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => markPaidMutation.mutate({ id: row.payment.id })} disabled={markPaidMutation.isPending}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />支払済
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => markUnpaidMutation.mutate({ id: row.payment.id })} disabled={markUnpaidMutation.isPending}>
                                    <Undo2 className="h-3.5 w-3.5" />戻す
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AdvanceLedgerPanel />
    </div>
  );
}

// ─── 前借り／立替 台帳パネル ───────────────────────────────────────────────
function AdvanceLedgerPanel() {
  const utils = trpc.useUtils();
  const overviewQuery = trpc.advance.overview.useQuery();
  const employeesQuery = trpc.employee.list.useQuery();
  const [ledgerEmpId, setLedgerEmpId] = useState<number | null>(null);
  const [formEmpId, setFormEmpId] = useState<string>("");
  const [formType, setFormType] = useState<"advance" | "repayment">("advance");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formReason, setFormReason] = useState<string>("");

  const addMutation = trpc.advance.addEntry.useMutation({
    onSuccess: () => {
      toast.success("台帳に登録しました");
      overviewQuery.refetch();
      utils.advance.ledger.invalidate();
      utils.advance.paymentContext.invalidate();
      setFormAmount("");
      setFormReason("");
    },
    onError: (e) => toast.error(`登録エラー: ${e.message}`),
  });

  const rows = overviewQuery.data?.rows || [];
  const totalOutstanding = overviewQuery.data?.totalOutstanding || 0;
  const employees = employeesQuery.data || [];

  const handleAdd = () => {
    const employeeId = Number(formEmpId);
    const amount = Number(formAmount);
    if (!employeeId) { toast.error("作業員を選択してください"); return; }
    if (!amount || amount <= 0) { toast.error("金額を入力してください"); return; }
    addMutation.mutate({ employeeId, entryType: formType, amount, reason: formReason });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><PiggyBank className="h-4 w-4" />前借り／立替 台帳</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 登録フォーム */}
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <div className="space-y-1">
            <Label>作業員</Label>
            <Select value={formEmpId} onValueChange={setFormEmpId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="作業員を選択" /></SelectTrigger>
              <SelectContent>
                {employees.map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.nameKanji || e.nameRomaji || `ID:${e.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>種別</Label>
            <Select value={formType} onValueChange={(v) => setFormType(v as "advance" | "repayment")}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">前借り(+)</SelectItem>
                <SelectItem value="repayment">返済/相殺(−)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>金額</Label>
            <Input type="number" className="w-[120px] text-right" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <Label>理由（任意）</Label>
            <Input value={formReason} onChange={(e) => setFormReason(e.target.value)} placeholder="前借り・立替の理由" />
          </div>
          <Button className="gap-1" onClick={handleAdd} disabled={addMutation.isPending}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}登録
          </Button>
        </div>

        {/* 残高一覧 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">残高のある作業員</span>
          <span>前借り残高合計 <span className="font-bold text-gold">{formatYen(totalOutstanding)}</span></span>
        </div>
        {overviewQuery.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">前借り残高のある作業員はいません</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r: any) => (
              <button
                key={r.employeeId}
                onClick={() => setLedgerEmpId(r.employeeId)}
                className={`text-left rounded-lg border p-3 transition-colors hover:bg-muted/30 ${r.balance > 0 ? "border-amber-500/30" : "border-emerald-500/30"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.name}</span>
                  <span className={`font-bold ${r.balance > 0 ? "text-amber-400" : "text-emerald-400"}`}>{formatYen(r.balance)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{r.entryCount}件の記録</div>
              </button>
            ))}
          </div>
        )}
      </CardContent>
      <AdvanceLedgerDialog employeeId={ledgerEmpId} onClose={() => setLedgerEmpId(null)} />
    </Card>
  );
}

const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: "前借り", repayment: "返済/相殺", adjustment: "調整" };

function AdvanceLedgerDialog({ employeeId, onClose }: { employeeId: number | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const ledgerQuery = trpc.advance.ledger.useQuery({ employeeId: employeeId || 0 }, { enabled: !!employeeId });
  const deleteMutation = trpc.advance.deleteEntry.useMutation({
    onSuccess: () => {
      toast.success("削除しました");
      ledgerQuery.refetch();
      utils.advance.overview.invalidate();
      utils.advance.paymentContext.invalidate();
    },
    onError: (e) => toast.error(`削除エラー: ${e.message}`),
  });
  const data = ledgerQuery.data;

  return (
    <Dialog open={!!employeeId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{data?.name || "台帳"} の前借り台帳</DialogTitle></DialogHeader>
        {ledgerQuery.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm text-muted-foreground">現在残高</span>
              <span className={`text-lg font-bold ${(data?.balance || 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>{formatYen(data?.balance || 0)}</span>
            </div>
            <div className="max-h-[320px] overflow-y-auto space-y-2">
              {(data?.entries || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">記録がありません</p>
              ) : (data?.entries || []).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${e.amount >= 0 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>{ADVANCE_TYPE_LABELS[e.entryType] || e.entryType}</span>
                      <span className={`font-medium ${e.amount >= 0 ? "text-amber-400" : "text-emerald-400"}`}>{e.amount >= 0 ? "+" : ""}{formatYen(e.amount)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {e.reason || "—"}{e.closingMonth ? ` / ${e.closingMonth}` : ""} ・ {e.createdAt ? format(new Date(e.createdAt), "yyyy/MM/dd") : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 shrink-0" onClick={() => deleteMutation.mutate({ id: e.id })} disabled={deleteMutation.isPending}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
