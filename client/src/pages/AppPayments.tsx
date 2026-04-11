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
import { toast } from "sonner";
import { Loader2, Wallet, RefreshCw, CheckCircle2, Undo2, Save } from "lucide-react";

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
                        <TableHead>備考</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.payments.length === 0 ? (
                        <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">支払対象データがありません</TableCell></TableRow>
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
    </div>
  );
}
