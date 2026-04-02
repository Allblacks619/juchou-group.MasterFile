import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Download,
  Loader2,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Send,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ja } from "date-fns/locale";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "下書き", color: "bg-gray-500/20 text-gray-400", icon: Clock },
  sent: { label: "送付済", color: "bg-blue-500/20 text-blue-400", icon: Send },
  paid: { label: "入金済", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle },
  overdue: { label: "未入金", color: "bg-red-500/20 text-red-400", icon: AlertCircle },
  cancelled: { label: "取消", color: "bg-gray-500/20 text-gray-500", icon: XCircle },
};

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export default function AppInvoices() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [taxRate, setTaxRate] = useState(10);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");

  const invoicesQuery = trpc.invoice.list.useQuery();
  const projectsQuery = trpc.project.list.useQuery();
  const clientsQuery = trpc.clientInfo.list.useQuery();

  const createMutation = trpc.invoice.createFromAttendance.useMutation({
    onSuccess: (data) => {
      toast.success(`請求書 ${data.invoiceNumber} を作成しました（${formatYen(data.totalAmount)}）`);
      setShowCreate(false);
      invoicesQuery.refetch();
    },
    onError: (e) => toast.error(`作成エラー: ${e.message}`),
  });

  const generatePdfMutation = trpc.invoice.generatePdf.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("PDFを生成しました");
      invoicesQuery.refetch();
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const updateStatusMutation = trpc.invoice.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("ステータスを更新しました");
      invoicesQuery.refetch();
    },
    onError: (e) => toast.error(`更新エラー: ${e.message}`),
  });

  const deleteMutation = trpc.invoice.delete.useMutation({
    onSuccess: () => {
      toast.success("請求書を削除しました");
      invoicesQuery.refetch();
    },
    onError: (e) => toast.error(`削除エラー: ${e.message}`),
  });

  const handleCreate = () => {
    if (!selectedProjectId || !selectedClientId) {
      toast.error("取引先と現場を選択してください");
      return;
    }
    const [year, month] = periodMonth.split("-").map(Number);
    const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

    createMutation.mutate({
      clientId: Number(selectedClientId),
      projectId: Number(selectedProjectId),
      periodStart,
      periodEnd,
      taxRate,
      notes: notes || undefined,
      dueDate: dueDate || undefined,
    });
  };

  // Build client/project maps for display
  const clientMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of clientsQuery.data || []) {
      map.set(c.id, c.name);
    }
    return map;
  }, [clientsQuery.data]);

  const projectMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of projectsQuery.data || []) {
      map.set(p.id, p.name);
    }
    return map;
  }, [projectsQuery.data]);

  const invoices = invoicesQuery.data || [];
  const projects = projectsQuery.data || [];
  const clients = clientsQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">請求書管理</h1>
          <p className="text-muted-foreground mt-1">
            出面表データから請求書を自動生成します
          </p>
        </div>

        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-background hover:bg-gold-dim gap-1.5">
              <Plus className="h-4 w-4" />
              請求書作成
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>請求書を作成</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>取引先</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="取引先を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>現場</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="現場を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>対象月</Label>
                <Input
                  type="month"
                  value={periodMonth}
                  onChange={(e) => setPeriodMonth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>消費税率 (%)</Label>
                <Input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  min={0}
                  max={100}
                />
              </div>
              <div className="space-y-2">
                <Label>支払期限</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>備考</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="備考を入力..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">キャンセル</Button>
              </DialogClose>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-gold text-background hover:bg-gold-dim"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                作成
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Invoice List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">請求書一覧</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>請求書がまだありません</p>
              <p className="text-sm mt-1">出面表データから請求書を作成してください</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>請求書番号</TableHead>
                    <TableHead>取引先</TableHead>
                    <TableHead>現場</TableHead>
                    <TableHead>対象期間</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const status = STATUS_LABELS[inv.status] || STATUS_LABELS.draft;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm">
                          {inv.invoiceNumber}
                        </TableCell>
                        <TableCell>
                          {clientMap.get(inv.clientId) || `ID:${inv.clientId}`}
                        </TableCell>
                        <TableCell>
                          {inv.projectId ? projectMap.get(inv.projectId) || `ID:${inv.projectId}` : "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(inv.periodStart), "yyyy/MM/dd")} 〜{" "}
                          {format(new Date(inv.periodEnd), "yyyy/MM/dd")}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatYen(inv.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={inv.status}
                            onValueChange={(v) =>
                              updateStatusMutation.mutate({
                                id: inv.id,
                                status: v as any,
                              })
                            }
                          >
                            <SelectTrigger className="w-[120px] h-8">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 ${status.color}`}>
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([key, val]) => (
                                <SelectItem key={key} value={key}>
                                  {val.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => generatePdfMutation.mutate({ id: inv.id })}
                              disabled={generatePdfMutation.isPending}
                              title="PDF生成"
                            >
                              {generatePdfMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            {inv.pdfUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(inv.pdfUrl!, "_blank")}
                                title="PDF表示"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (confirm("この請求書を削除しますか？")) {
                                  deleteMutation.mutate({ id: inv.id });
                                }
                              }}
                              title="削除"
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
