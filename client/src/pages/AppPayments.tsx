import { useState } from "react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  Wallet,
  CheckCircle2,
  Undo2,
  ArrowLeftRight,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  PiggyBank,
} from "lucide-react";

const PAID_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  unpaid: { label: "未払い", className: "bg-amber-500/20 text-amber-400" },
  partial: { label: "一部支払済", className: "bg-blue-500/20 text-blue-400" },
  paid: { label: "支払済", className: "bg-emerald-500/20 text-emerald-400" },
};

const ROW_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "未払い", className: "bg-amber-500/20 text-amber-400" },
  confirmed: { label: "確定", className: "bg-blue-500/20 text-blue-400" },
  paid: { label: "支払済", className: "bg-emerald-500/20 text-emerald-400" },
};

const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: "前借り", repayment: "返済/相殺", adjustment: "調整" };

function formatYen(amount: number) {
  return `¥${Number(amount || 0).toLocaleString("ja-JP")}`;
}

export default function AppPayments() {
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));

  const summaryQuery = trpc.payment.workerMonthSummary.useQuery({ closingMonth });
  const workers = summaryQuery.data?.workers || [];
  const summary = summaryQuery.data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">支払管理</h1>
          <p className="text-muted-foreground mt-1">締め月ごとに作業員単位で支払額・前借り相殺・支払状況を管理します</p>
        </div>
        <div className="space-y-1">
          <Label>締め月</Label>
          <Input type="month" value={closingMonth} onChange={(e) => setClosingMonth(e.target.value)} className="w-[180px]" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3.5 w-3.5" />対象作業員数</div>
            <div className="text-xl font-bold">{summary?.workerCount ?? 0}名</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />支払額合計</div>
            <div className="text-xl font-bold">{formatYen(summary?.totalAmount || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><ArrowLeftRight className="h-3.5 w-3.5" />差引支払合計</div>
            <div className="text-xl font-bold text-gold">{formatYen(summary?.netPayableTotal || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />支払済み人数</div>
            <div className="text-xl font-bold text-emerald-400">{summary?.paidCount ?? 0} / {summary?.workerCount ?? 0}名</div>
          </CardContent>
        </Card>
      </div>

      {summaryQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            この月の支払対象データがありません。月締めを進めると支払行が作成されます。
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {workers.map((worker: any) => (
            <WorkerPaymentCard key={worker.employeeId} worker={worker} closingMonth={closingMonth} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkerPaymentCard({ worker, closingMonth }: { worker: any; closingMonth: string }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState(false);
  const [offsetInput, setOffsetInput] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const invalidate = () => {
    utils.payment.workerMonthSummary.invalidate();
    utils.advance.ledger.invalidate({ employeeId: worker.employeeId });
    utils.advance.overview.invalidate();
  };

  const markPaidMutation = trpc.payment.markWorkerPaid.useMutation({
    onSuccess: () => {
      toast.success(`${worker.name} を支払済みにしました`);
      invalidate();
    },
    onError: (e) => toast.error(`支払更新エラー: ${e.message}`),
  });

  const markUnpaidMutation = trpc.payment.markWorkerUnpaid.useMutation({
    onSuccess: () => {
      toast.success(`${worker.name} を未払いに戻しました`);
      invalidate();
    },
    onError: (e) => toast.error(`支払戻しエラー: ${e.message}`),
  });

  const offsetMutation = trpc.advance.offsetWorkerMonth.useMutation({
    onSuccess: (res) => {
      toast.success(`前借りを ${formatYen(res.applied)} 相殺しました（残高 ${formatYen(res.balance)}）`);
      setOffsetInput(null);
      invalidate();
    },
    onError: (e) => toast.error(`相殺エラー: ${e.message}`),
  });

  // 台帳履歴は展開時のみ取得する。
  const ledgerQuery = trpc.advance.ledger.useQuery(
    { employeeId: worker.employeeId },
    { enabled: expanded }
  );

  const deleteMutation = trpc.advance.deleteEntry.useMutation({
    onSuccess: () => {
      toast.success("台帳エントリを削除しました");
      invalidate();
    },
    onError: (e) => toast.error(`削除エラー: ${e.message}`),
  });

  const statusMeta = PAID_STATUS_LABELS[worker.paidStatus] || PAID_STATUS_LABELS.unpaid;

  const handleOffset = () => {
    const amount = Number(offsetInput ?? worker.maxOffset);
    if (!amount || amount <= 0) { toast.error("相殺額を入力してください"); return; }
    offsetMutation.mutate({ closingMonth, employeeId: worker.employeeId, amount });
  };

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-2 text-left min-w-0">
            {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="font-bold truncate">{worker.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${statusMeta.className}`}>{statusMeta.label}</span>
            {worker.paidStatus === "paid" && worker.lastPaidAt && (
              <span className="text-xs text-muted-foreground shrink-0">支払日 {format(new Date(worker.lastPaidAt), "yyyy/MM/dd")}</span>
            )}
          </button>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setAdvanceOpen(true)}>
              <PiggyBank className="h-3.5 w-3.5" />前借り追加
            </Button>
            {worker.paidStatus !== "paid" ? (
              <Button
                size="sm"
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => markPaidMutation.mutate({ closingMonth, employeeId: worker.employeeId })}
                disabled={markPaidMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />支払済みにする
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => markUnpaidMutation.mutate({ closingMonth, employeeId: worker.employeeId })}
                disabled={markUnpaidMutation.isPending}
              >
                <Undo2 className="h-3.5 w-3.5" />未払いに戻す
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">支払額合計（{worker.projects.length}現場）</div>
            <div className="font-medium">{formatYen(worker.totalAmount)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">前借り残高</div>
            <div className={`font-medium ${worker.advanceBalance > 0 ? "text-amber-400" : ""}`}>{formatYen(worker.advanceBalance)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">適用済み相殺</div>
            <div className={`font-medium ${worker.appliedOffset > 0 ? "text-emerald-400" : ""}`}>{formatYen(worker.appliedOffset)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">差引支払額</div>
            <div className="font-bold text-gold text-base">{formatYen(worker.netPayable)}</div>
          </div>
        </div>

        {worker.maxOffset > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
            <span className="text-xs text-amber-400">前借り相殺（最大 {formatYen(worker.maxOffset)}）</span>
            <Input
              type="number"
              className="h-8 w-28 text-right"
              value={offsetInput ?? String(worker.maxOffset)}
              onChange={(e) => setOffsetInput(e.target.value)}
            />
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleOffset} disabled={offsetMutation.isPending}>
              {offsetMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}相殺
            </Button>
          </div>
        )}

        {expanded && (
          <div className="space-y-3 pt-1">
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>現場</TableHead>
                    <TableHead className="text-right">基本</TableHead>
                    <TableHead className="text-right">交通費</TableHead>
                    <TableHead className="text-right">経費</TableHead>
                    <TableHead className="text-right">調整</TableHead>
                    <TableHead className="text-right">合計</TableHead>
                    <TableHead>状態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {worker.projects.map((row: any) => {
                    const rowMeta = ROW_STATUS_LABELS[row.status] || ROW_STATUS_LABELS.pending;
                    return (
                      <TableRow key={row.paymentId}>
                        <TableCell className="font-medium">{row.projectName}</TableCell>
                        <TableCell className="text-right">{formatYen(row.baseAmount)}</TableCell>
                        <TableCell className="text-right">{formatYen(row.transportAmount)}</TableCell>
                        <TableCell className="text-right">{formatYen(row.expenseAmount)}</TableCell>
                        <TableCell className="text-right">{formatYen(row.adjustmentAmount)}</TableCell>
                        <TableCell className="text-right font-bold">{formatYen(row.totalAmount)}</TableCell>
                        <TableCell><span className={`text-xs px-2 py-0.5 rounded ${rowMeta.className}`}>{rowMeta.label}</span></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground"><PiggyBank className="h-3.5 w-3.5" />前借り台帳</span>
                <span>残高 <span className={`font-bold ${(ledgerQuery.data?.balance || 0) > 0 ? "text-amber-400" : "text-emerald-400"}`}>{formatYen(ledgerQuery.data?.balance || 0)}</span></span>
              </div>
              {ledgerQuery.isLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gold" /></div>
              ) : (ledgerQuery.data?.entries || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">記録がありません</p>
              ) : (
                <div className="max-h-[240px] overflow-y-auto space-y-1.5">
                  {(ledgerQuery.data?.entries || []).map((e: any) => (
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
              )}
            </div>
          </div>
        )}
      </CardContent>

      <AdvanceAddDialog
        employeeId={worker.employeeId}
        name={worker.name}
        open={advanceOpen}
        onClose={() => setAdvanceOpen(false)}
        onAdded={invalidate}
      />
    </Card>
  );
}

function AdvanceAddDialog({ employeeId, name, open, onClose, onAdded }: {
  employeeId: number;
  name: string;
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [entryType, setEntryType] = useState<"advance" | "adjustment">("advance");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const addMutation = trpc.advance.addEntry.useMutation({
    onSuccess: (res) => {
      toast.success(`台帳に登録しました（残高 ${formatYen(res.balance)}）`);
      setAmount("");
      setReason("");
      onClose();
      onAdded();
    },
    onError: (e) => toast.error(`登録エラー: ${e.message}`),
  });

  const handleAdd = () => {
    const value = Number(amount);
    if (!value || value <= 0) { toast.error("金額を入力してください"); return; }
    addMutation.mutate({ employeeId, entryType, amount: value, reason });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{name} の前借り追加</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>種別</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as "advance" | "adjustment")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">前借り(+)</SelectItem>
                <SelectItem value="adjustment">調整(+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>金額</Label>
            <Input type="number" className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label>理由（任意）</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="前借り・立替の理由" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button className="gap-1" onClick={handleAdd} disabled={addMutation.isPending}>
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}登録
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
