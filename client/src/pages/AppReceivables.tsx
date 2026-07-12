/*
 * AppReceivables — 入金管理（請求書単位・一覧＋検算ドリルダウン）
 * 年月を選ぶだけで対象請求書を「行」で一覧表示。各行をタップすると明細（検算）と
 * 入金更新フォームを展開して確認・更新できる。
 */
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
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  Undo2,
  ChevronDown,
  ChevronRight,
  Download,
  Save,
} from "lucide-react";

type CsvFormat = "freee" | "mf" | "detail";
const CSV_FORMAT_LABELS: Record<CsvFormat, string> = {
  freee: "freee（取引）",
  mf: "マネーフォワード（仕訳）",
  detail: "汎用明細（Excel）",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "入金待ち", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  partial: { label: "一部入金", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  received: { label: "入金済", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  overdue: { label: "期限超過", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  cancelled: { label: "取消", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

function yen(n: number) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}
function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return y && mo ? `${y}年${Number(mo)}月` : m;
}
function dateStr(value?: string | Date | null) {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "yyyy/MM/dd");
}

export default function AppReceivables() {
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));
  const [expanded, setExpanded] = useState<number | null>(null);
  const [csvFormat, setCsvFormat] = useState<CsvFormat>("freee");
  const [exporting, setExporting] = useState(false);

  const utils = trpc.useUtils();
  const listQuery = trpc.receivable.listByMonth.useQuery({ closingMonth });
  const rows = listQuery.data?.rows || [];
  const summary = listQuery.data?.summary;

  const invalidate = () => utils.receivable.listByMonth.invalidate();
  const markReceivedMutation = trpc.receivable.markReceived.useMutation({
    onSuccess: () => { toast.success("入金済みにしました"); invalidate(); },
    onError: (e) => toast.error(`入金更新エラー: ${e.message}`),
  });
  const markUnreceivedMutation = trpc.receivable.markUnreceived.useMutation({
    onSuccess: () => { toast.success("入金待ちに戻しました"); invalidate(); },
    onError: (e) => toast.error(`入金戻しエラー: ${e.message}`),
  });

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
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">入金管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            年月を選ぶと請求書が一覧表示されます。行をタップで明細（検算）を確認できます。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">対象月</Label>
            <Input
              type="month"
              value={closingMonth}
              onChange={(e) => { setClosingMonth(e.target.value); setExpanded(null); }}
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">会計ソフト出力</Label>
            <Select value={csvFormat} onValueChange={(v) => setCsvFormat(v as CsvFormat)}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CSV_FORMAT_LABELS) as CsvFormat[]).map((f) => (
                  <SelectItem key={f} value={f}>{CSV_FORMAT_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleExportCsv} disabled={exporting || rows.length === 0} className="h-9 gap-1.5">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            CSV出力
          </Button>
        </div>
      </div>

      {/* サマリー（コンパクト） */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="請求書数" value={`${summary?.invoiceCount ?? 0}件`} />
        <MiniStat label="請求合計" value={yen(summary?.expectedTotal || 0)} />
        <MiniStat label="入金済合計" value={yen(summary?.receivedTotal || 0)} />
        <MiniStat label="未入金残" value={yen(summary?.outstandingTotal || 0)} accent />
      </div>

      {/* 一覧テーブル */}
      <Card>
        <CardContent className="p-0">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {monthLabel(closingMonth)} の請求書がありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2.5 w-8"></th>
                    <th className="text-left font-medium px-2 py-2.5">取引先</th>
                    <th className="text-left font-medium px-2 py-2.5">請求書番号</th>
                    <th className="text-right font-medium px-2 py-2.5">請求額</th>
                    <th className="text-right font-medium px-2 py-2.5">入金額</th>
                    <th className="text-right font-medium px-2 py-2.5">未入金</th>
                    <th className="text-left font-medium px-2 py-2.5">期限</th>
                    <th className="text-center font-medium px-2 py-2.5">状態</th>
                    <th className="px-2 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => {
                    const st = STATUS_META[row.receivableStatus] || STATUS_META.pending;
                    const isOpen = expanded === row.invoice.id;
                    return (
                      <>
                        <tr
                          key={row.invoice.id}
                          className={`border-b border-border/60 cursor-pointer transition-colors hover:bg-muted/20 ${isOpen ? "bg-muted/20" : ""}`}
                          onClick={() => setExpanded(isOpen ? null : row.invoice.id)}
                        >
                          <td className="px-3 py-3 text-muted-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-2 py-3 font-medium">{row.client?.name || "取引先"}</td>
                          <td className="px-2 py-3 font-mono text-xs">{row.invoice.invoiceNumber}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{yen(row.invoice.totalAmount)}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{yen(row.receivedAmount)}</td>
                          <td className={`px-2 py-3 text-right tabular-nums font-bold ${row.outstandingAmount > 0 ? "text-gold" : "text-muted-foreground"}`}>
                            {yen(row.outstandingAmount)}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-xs text-muted-foreground">{dateStr(row.invoice.dueDate)}</td>
                          <td className="px-2 py-3 text-center">
                            <span className={`inline-block rounded border px-2 py-0.5 text-xs ${st.className}`}>{st.label}</span>
                          </td>
                          <td className="px-2 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {row.receivableStatus === "received" ? (
                              <Button
                                size="sm" variant="outline" className="h-8 gap-1"
                                disabled={markUnreceivedMutation.isPending}
                                onClick={() => markUnreceivedMutation.mutate({ id: row.invoice.id })}
                              >
                                <Undo2 className="h-3.5 w-3.5" />戻す
                              </Button>
                            ) : (
                              <Button
                                size="sm" className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={markReceivedMutation.isPending}
                                onClick={() => markReceivedMutation.mutate({ id: row.invoice.id, receivedAmount: Number(row.invoice.totalAmount) })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />入金済に
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={`${row.invoice.id}-d`} className="bg-muted/10">
                            <td colSpan={9} className="px-3 py-4">
                              <ReceivableDrilldown row={row} />
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

/** 検算ドリルダウン: 明細（invoice.get の items）＋請求情報＋入金更新フォーム。 */
function ReceivableDrilldown({ row }: { row: any }) {
  const invoiceId = row.invoice.id;
  const utils = trpc.useUtils();
  const detailQuery = trpc.invoice.get.useQuery({ id: invoiceId });
  const [receivedAmount, setReceivedAmount] = useState<string>(String(row.receivedAmount ?? 0));
  const [receivedAt, setReceivedAt] = useState<string>(
    row.invoice.receivedAt ? format(new Date(row.invoice.receivedAt), "yyyy-MM-dd") : ""
  );
  const [paymentMemo, setPaymentMemo] = useState<string>(row.invoice.paymentMemo || "");

  const updateMutation = trpc.receivable.update.useMutation({
    onSuccess: () => { toast.success("入金情報を更新しました"); utils.receivable.listByMonth.invalidate(); },
    onError: (e) => toast.error(`更新エラー: ${e.message}`),
  });

  const items = detailQuery.data?.items || [];
  const invoice = detailQuery.data?.invoice || row.invoice;

  return (
    <div className="space-y-4">
      {/* 明細（検算の根拠） */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground mb-1.5">明細（この金額の根拠）</div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-muted-foreground">
                <th className="text-left font-medium px-2 py-1.5">摘要</th>
                <th className="text-right font-medium px-2 py-1.5">数量</th>
                <th className="text-left font-medium px-2 py-1.5">単位</th>
                <th className="text-right font-medium px-2 py-1.5">単価</th>
                <th className="text-right font-medium px-2 py-1.5">金額</th>
              </tr>
            </thead>
            <tbody>
              {detailQuery.isLoading ? (
                <tr><td colSpan={5} className="px-2 py-3 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">明細がありません</td></tr>
              ) : items.map((item: any) => (
                <tr key={item.id} className="border-b border-border/50 last:border-0">
                  <td className="px-2 py-1.5">{item.description}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{(item.quantity / 10).toLocaleString("ja-JP")}</td>
                  <td className="px-2 py-1.5">{item.unit || "-"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{yen(item.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">{yen(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 請求情報 */}
        <div className="rounded-md border border-border p-3 space-y-1.5 text-sm">
          <div className="text-xs font-semibold text-muted-foreground mb-1">請求情報</div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">発行日</span><span>{dateStr(invoice.issueDate)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">支払期限</span><span>{dateStr(invoice.dueDate)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">小計</span><span className="tabular-nums">{yen(invoice.subtotal)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">消費税</span><span className="tabular-nums">{yen(invoice.taxAmount)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-muted-foreground">合計</span><span className="tabular-nums font-bold text-gold">{yen(invoice.totalAmount)}</span></div>
        </div>

        {/* 入金更新フォーム */}
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground mb-1">入金更新</div>
          <div className="space-y-1">
            <Label className="text-xs">入金額</Label>
            <Input type="number" className="h-8" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">入金日</Label>
            <Input type="date" className="h-8" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">入金メモ</Label>
            <Input className="h-8" value={paymentMemo} onChange={(e) => setPaymentMemo(e.target.value)} placeholder="振込メモ" />
          </div>
          <Button
            size="sm" variant="outline" className="h-8 gap-1"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate({
              id: invoiceId,
              receivedAmount: Number(receivedAmount || 0),
              receivedAt: receivedAt || undefined,
              paymentMemo,
            })}
          >
            <Save className="h-3.5 w-3.5" />保存
          </Button>
        </div>
      </div>
    </div>
  );
}
