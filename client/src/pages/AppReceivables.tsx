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
import { Loader2, CheckCircle2, Undo2, Save, Landmark, ArrowRightLeft, Download } from "lucide-react";

type CsvFormat = "freee" | "mf" | "detail";
const CSV_FORMAT_LABELS: Record<CsvFormat, string> = {
  freee: "freee（取引）",
  mf: "マネーフォワード（仕訳）",
  detail: "汎用明細（Excel）",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: "入金待ち", className: "bg-amber-500/20 text-amber-400" },
  partial: { label: "一部入金", className: "bg-blue-500/20 text-blue-400" },
  received: { label: "入金済", className: "bg-emerald-500/20 text-emerald-400" },
  overdue: { label: "期限超過", className: "bg-red-500/20 text-red-400" },
  cancelled: { label: "取消", className: "bg-slate-500/20 text-slate-300" },
};

function formatYen(amount: number) {
  return `¥${Number(amount || 0).toLocaleString("ja-JP")}`;
}

function formatDateStr(value?: string | Date | null) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "yyyy/MM/dd");
}

export default function AppReceivables() {
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [receivedAmounts, setReceivedAmounts] = useState<Record<number, string>>({});
  const [receivedDates, setReceivedDates] = useState<Record<number, string>>({});
  const [memoMap, setMemoMap] = useState<Record<number, string>>({});
  const [csvFormat, setCsvFormat] = useState<CsvFormat>("freee");
  const [exporting, setExporting] = useState(false);

  const utils = trpc.useUtils();
  const listQuery = trpc.receivable.listByMonth.useQuery({ closingMonth });
  const detailQuery = trpc.receivable.get.useQuery({ id: selectedInvoiceId || 0 }, { enabled: !!selectedInvoiceId });

  const updateMutation = trpc.receivable.update.useMutation({
    onSuccess: () => {
      toast.success("入金情報を更新しました");
      listQuery.refetch();
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`更新エラー: ${e.message}`),
  });

  const markReceivedMutation = trpc.receivable.markReceived.useMutation({
    onSuccess: () => {
      toast.success("入金済みにしました");
      listQuery.refetch();
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`入金更新エラー: ${e.message}`),
  });

  const markUnreceivedMutation = trpc.receivable.markUnreceived.useMutation({
    onSuccess: () => {
      toast.success("入金待ちに戻しました");
      listQuery.refetch();
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`入金戻しエラー: ${e.message}`),
  });

  const rows = listQuery.data?.rows || [];
  const summary = listQuery.data?.summary || {
    invoiceCount: 0,
    expectedTotal: 0,
    receivedTotal: 0,
    outstandingTotal: 0,
    employeePaymentTotal: 0,
    employeePaidTotal: 0,
    cashBalance: 0,
  };
  const detail = detailQuery.data;

  const selectedRow = useMemo(
    () => rows.find((r: any) => r.invoice.id === selectedInvoiceId) || null,
    [rows, selectedInvoiceId]
  );

  const handleSave = (invoice: any) => {
    const receivedAmount = Number(receivedAmounts[invoice.id] ?? invoice.receivedAmount ?? 0);
    const receivedAt = receivedDates[invoice.id] ?? (invoice.receivedAt ? format(new Date(invoice.receivedAt), "yyyy-MM-dd") : "");
    const paymentMemo = memoMap[invoice.id] ?? invoice.paymentMemo ?? "";
    updateMutation.mutate({
      id: invoice.id,
      receivedAmount,
      receivedAt: receivedAt || undefined,
      paymentMemo,
    });
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const result = await utils.receivable.exportCsv.fetch({ closingMonth, format: csvFormat });
      if (!result.count) {
        toast.info("この月の請求書がありません");
        return;
      }
      // BOM付きUTF-8のCSVをそのままBlob化してダウンロード。
      const blob = new Blob([result.content], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${result.count}件をCSV出力しました`);
    } catch (e: any) {
      toast.error(`CSV出力エラー: ${e?.message || "不明なエラー"}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">入金管理</h1>
          <p className="text-muted-foreground mt-1">請求書ごとの入金予定・入金済み状況と、支払との見比べを行います</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>対象月</Label>
            <Input type="month" value={closingMonth} onChange={(e) => {
              setClosingMonth(e.target.value);
              setSelectedInvoiceId(null);
            }} className="w-[180px]" />
          </div>
          <div className="space-y-1 min-w-[280px]">
            <Label>請求書</Label>
            <Select value={selectedInvoiceId?.toString() || ""} onValueChange={(v) => setSelectedInvoiceId(Number(v))}>
              <SelectTrigger>
                <SelectValue placeholder="請求書を選択" />
              </SelectTrigger>
              <SelectContent>
                {rows.map((row: any) => (
                  <SelectItem key={row.invoice.id} value={String(row.invoice.id)}>
                    {row.invoice.invoiceNumber} / {row.client?.name || "取引先"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 会計ソフト向けCSV出力 */}
          <div className="ml-auto flex items-end gap-2">
            <div className="space-y-1">
              <Label>会計ソフト出力</Label>
              <Select value={csvFormat} onValueChange={(v) => setCsvFormat(v as CsvFormat)}>
                <SelectTrigger className="w-[210px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CSV_FORMAT_LABELS) as CsvFormat[]).map((f) => (
                    <SelectItem key={f} value={f}>{CSV_FORMAT_LABELS[f]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleExportCsv} disabled={exporting || rows.length === 0} className="gap-1.5">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              CSV出力
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">請求書数</div><div className="text-xl font-bold">{summary.invoiceCount}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">請求合計</div><div className="text-xl font-bold text-gold">{formatYen(summary.expectedTotal)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">入金済合計</div><div className="text-xl font-bold text-emerald-400">{formatYen(summary.receivedTotal)}</div></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">未入金残</div><div className="text-xl font-bold text-amber-400">{formatYen(summary.outstandingTotal)}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" />請求一覧</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">この月の請求書がありません</p>
            ) : rows.map((row: any) => {
              const statusMeta = STATUS_LABELS[row.receivableStatus] || STATUS_LABELS.pending;
              return (
                <button
                  key={row.invoice.id}
                  onClick={() => setSelectedInvoiceId(row.invoice.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${selectedInvoiceId === row.invoice.id ? "border-gold bg-gold/10" : "border-border hover:bg-muted/30"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{row.client?.name || "取引先"}</div>
                    <span className={`text-xs px-2 py-0.5 rounded ${statusMeta.className}`}>{statusMeta.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.invoice.invoiceNumber}</div>
                  <div className="mt-1 text-xs text-muted-foreground">期限 {formatDateStr(row.invoice.dueDate)}</div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">入金 {formatYen(row.receivedAmount)}</span>
                    <span className="font-medium text-gold">{formatYen(row.invoice.totalAmount)}</span>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              {detail?.invoice?.invoiceNumber || selectedRow?.invoice?.invoiceNumber || "入金詳細"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedInvoiceId ? (
              <p className="text-sm text-muted-foreground">請求書を選択してください</p>
            ) : detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
            ) : !detail ? (
              <p className="text-sm text-muted-foreground">入金データがありません</p>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">請求額</div><div className="text-xl font-bold text-gold">{formatYen(detail.invoice.totalAmount)}</div></CardContent></Card>
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">入金額</div><div className="text-xl font-bold text-emerald-400">{formatYen(detail.receivedAmount)}</div></CardContent></Card>
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">未入金</div><div className="text-xl font-bold text-amber-400">{formatYen(detail.outstandingAmount)}</div></CardContent></Card>
                  <Card><CardContent className="pt-4"><div className="text-xs text-muted-foreground">月次差額</div><div className={`text-xl font-bold ${Number(detail.monthSummary.cashBalance) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatYen(detail.monthSummary.cashBalance)}</div></CardContent></Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">請求情報</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">取引先</span><span>{detail.client?.name || "-"}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">案件</span><span>{detail.project?.name || "-"}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">請求書番号</span><span className="font-mono">{detail.invoice.invoiceNumber}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">請求日</span><span>{formatDateStr(detail.invoice.issueDate)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">支払期限</span><span>{formatDateStr(detail.invoice.dueDate)}</span></div>
                      <div className="flex justify-between gap-4"><span className="text-muted-foreground">状態</span><span className={`text-xs px-2 py-0.5 rounded ${STATUS_LABELS[detail.receivableStatus]?.className || STATUS_LABELS.pending.className}`}>{STATUS_LABELS[detail.receivableStatus]?.label || "入金待ち"}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-sm">入金更新</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1">
                        <Label>入金額</Label>
                        <Input type="number" value={receivedAmounts[detail.invoice.id] ?? detail.receivedAmount ?? 0} onChange={(e) => setReceivedAmounts((prev) => ({ ...prev, [detail.invoice.id]: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>入金日</Label>
                        <Input type="date" value={receivedDates[detail.invoice.id] ?? (detail.invoice.receivedAt ? format(new Date(detail.invoice.receivedAt), "yyyy-MM-dd") : "")} onChange={(e) => setReceivedDates((prev) => ({ ...prev, [detail.invoice.id]: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>入金メモ</Label>
                        <Input value={memoMap[detail.invoice.id] ?? detail.invoice.paymentMemo ?? ""} onChange={(e) => setMemoMap((prev) => ({ ...prev, [detail.invoice.id]: e.target.value }))} placeholder="振込メモ" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => handleSave(detail.invoice)} disabled={updateMutation.isPending}>
                          <Save className="h-3.5 w-3.5" />保存
                        </Button>
                        {detail.receivableStatus !== "received" ? (
                          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => markReceivedMutation.mutate({ id: detail.invoice.id, receivedAmount: Number(receivedAmounts[detail.invoice.id] ?? detail.invoice.totalAmount), receivedAt: receivedDates[detail.invoice.id] || undefined })} disabled={markReceivedMutation.isPending}>
                            <CheckCircle2 className="h-3.5 w-3.5" />入金済
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => markUnreceivedMutation.mutate({ id: detail.invoice.id })} disabled={markUnreceivedMutation.isPending}>
                            <Undo2 className="h-3.5 w-3.5" />戻す
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>比較項目</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>この月の請求合計</TableCell>
                        <TableCell className="text-right font-medium">{formatYen(detail.monthSummary.expectedTotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>この月の入金済合計</TableCell>
                        <TableCell className="text-right font-medium text-emerald-400">{formatYen(detail.monthSummary.receivedTotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>この月の従業員支払合計</TableCell>
                        <TableCell className="text-right font-medium text-gold">{formatYen(detail.monthSummary.employeePaymentTotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>この月の支払済合計</TableCell>
                        <TableCell className="text-right font-medium text-blue-400">{formatYen(detail.monthSummary.employeePaidTotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>入金済 − 支払済</TableCell>
                        <TableCell className={`text-right font-bold ${Number(detail.monthSummary.cashBalance) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatYen(detail.monthSummary.cashBalance)}</TableCell>
                      </TableRow>
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
