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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Eye,
  PlusCircle,
  GripVertical,
  Type,
  Edit,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "下書き", color: "bg-gray-500/20 text-gray-400", icon: Clock },
  sent: { label: "送付済", color: "bg-blue-500/20 text-blue-400", icon: Send },
  paid: { label: "入金済", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle },
  overdue: { label: "未入金", color: "bg-red-500/20 text-red-400", icon: AlertCircle },
  cancelled: { label: "取消", color: "bg-gray-500/20 text-gray-500", icon: XCircle },
};

const TAX_RATES = [
  { value: 10, label: "10%" },
  { value: 8, label: "8%（軽減税率）" },
  { value: 0, label: "0%（非課税）" },
];

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

interface InvoiceLineItem {
  itemType: "normal" | "text";
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  itemTaxRate: number;
  notes: string;
  sortOrder: number;
}

function emptyNormalItem(sortOrder: number): InvoiceLineItem {
  return {
    itemType: "normal",
    description: "",
    quantity: 0,
    unit: "日",
    unitPrice: 0,
    amount: 0,
    itemTaxRate: 10,
    notes: "",
    sortOrder,
  };
}

function emptyTextItem(sortOrder: number): InvoiceLineItem {
  return {
    itemType: "text",
    description: "",
    quantity: 0,
    unit: "",
    unitPrice: 0,
    amount: 0,
    itemTaxRate: 0,
    notes: "",
    sortOrder,
  };
}

// ── Invoice Detail Dialog ──
function InvoiceDetailDialog({
  invoiceId,
  onClose,
}: {
  invoiceId: number;
  onClose: () => void;
}) {
  const detailQuery = trpc.invoice.get.useQuery({ id: invoiceId });
  const addItemMutation = trpc.invoice.addItem.useMutation({
    onSuccess: () => {
      toast.success("項目を追加しました");
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`追加エラー: ${e.message}`),
  });
  const deleteItemMutation = trpc.invoice.deleteItem.useMutation({
    onSuccess: () => {
      toast.success("項目を削除しました");
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`削除エラー: ${e.message}`),
  });

  const [newItem, setNewItem] = useState<InvoiceLineItem>(emptyNormalItem(0));
  const [showAddForm, setShowAddForm] = useState(false);

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const { invoice, items } = detailQuery.data || { invoice: null, items: [] };
  if (!invoice) return <p className="text-muted-foreground">請求書が見つかりません</p>;

  const handleAddItem = () => {
    if (!newItem.description.trim()) {
      toast.error("摘要を入力してください");
      return;
    }
    addItemMutation.mutate({
      invoiceId: invoice.id,
      itemType: newItem.itemType,
      description: newItem.description,
      quantity: newItem.quantity,
      unit: newItem.unit,
      unitPrice: newItem.unitPrice,
      amount: newItem.itemType === "normal" ? Math.round((newItem.quantity / 10) * newItem.unitPrice) : 0,
      itemTaxRate: newItem.itemTaxRate,
      notes: newItem.notes || undefined,
      sortOrder: items.length,
    });
    setNewItem(emptyNormalItem(items.length + 1));
    setShowAddForm(false);
  };

  return (
    <div className="space-y-4">
      {/* Invoice header info */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">請求書番号:</span>{" "}
          <span className="font-mono font-medium">{invoice.invoiceNumber}</span>
        </div>
        <div>
          <span className="text-muted-foreground">合計金額:</span>{" "}
          <span className="font-bold text-gold">{formatYen(invoice.totalAmount)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">小計:</span> {formatYen(invoice.subtotal)}
        </div>
        <div>
          <span className="text-muted-foreground">消費税:</span> {formatYen(invoice.taxAmount)}
        </div>
      </div>

      {/* Items table */}
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">No.</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-20">数量</TableHead>
              <TableHead className="w-20">単価</TableHead>
              <TableHead className="w-16">税率</TableHead>
              <TableHead className="w-24 text-right">金額</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  項目がありません
                </TableCell>
              </TableRow>
            ) : (
              items.map((item, idx) => (
                <TableRow key={item.id} className={item.itemType === "text" ? "bg-muted/30" : ""}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div>
                      {item.itemType === "text" && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1 rounded mr-1">テキスト</span>
                      )}
                      {item.description}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.itemType === "normal"
                      ? item.unit === "日"
                        ? `${(item.quantity / 10).toFixed(1)}日`
                        : `${item.quantity}${item.unit || ""}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.itemType === "normal" ? formatYen(item.unitPrice) : "-"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.itemType === "normal" ? `${item.itemTaxRate}%` : "-"}
                  </TableCell>
                  <TableCell className="text-right font-medium text-sm">
                    {item.itemType === "normal" ? formatYen(item.amount) : "-"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                      onClick={() => {
                        if (confirm("この項目を削除しますか？")) {
                          deleteItemMutation.mutate({ id: item.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add item form */}
      {showAddForm ? (
        <Card className="border-gold/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Label className="text-sm font-medium">項目タイプ:</Label>
              <Select
                value={newItem.itemType}
                onValueChange={(v) =>
                  setNewItem((prev) => ({
                    ...prev,
                    itemType: v as "normal" | "text",
                    ...(v === "text" ? { quantity: 0, unitPrice: 0, amount: 0, itemTaxRate: 0 } : {}),
                  }))
                }
              >
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">通常行</SelectItem>
                  <SelectItem value="text">テキスト行（説明のみ）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">摘要</Label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="項目名・作業内容など"
              />
            </div>

            {newItem.itemType === "normal" && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">数量（×10）</Label>
                  <Input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => {
                      const qty = Number(e.target.value);
                      setNewItem((prev) => ({
                        ...prev,
                        quantity: qty,
                        amount: Math.round((qty / 10) * prev.unitPrice),
                      }));
                    }}
                    placeholder="例: 200 = 20.0日"
                  />
                  <p className="text-xs text-muted-foreground">
                    {newItem.quantity > 0 ? `= ${(newItem.quantity / 10).toFixed(1)}日` : ""}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">単位</Label>
                  <Input
                    value={newItem.unit}
                    onChange={(e) => setNewItem((prev) => ({ ...prev, unit: e.target.value }))}
                    placeholder="日"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">単価（円）</Label>
                  <Input
                    type="number"
                    value={newItem.unitPrice}
                    onChange={(e) => {
                      const price = Number(e.target.value);
                      setNewItem((prev) => ({
                        ...prev,
                        unitPrice: price,
                        amount: Math.round((prev.quantity / 10) * price),
                      }));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">税率</Label>
                  <Select
                    value={String(newItem.itemTaxRate)}
                    onValueChange={(v) => setNewItem((prev) => ({ ...prev, itemTaxRate: Number(v) }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_RATES.map((r) => (
                        <SelectItem key={r.value} value={String(r.value)}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {newItem.itemType === "normal" && newItem.amount > 0 && (
              <p className="text-sm text-muted-foreground">
                金額: <span className="font-medium text-foreground">{formatYen(newItem.amount)}</span>
              </p>
            )}

            <div className="space-y-1">
              <Label className="text-xs">備考（任意）</Label>
              <Input
                value={newItem.notes}
                onChange={(e) => setNewItem((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="補足説明..."
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleAddItem}
                disabled={addItemMutation.isPending}
                className="bg-gold text-background hover:bg-gold-dim"
              >
                {addItemMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                追加
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)}>
                キャンセル
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewItem(emptyNormalItem(items.length));
              setShowAddForm(true);
            }}
            className="gap-1"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            通常行を追加
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setNewItem(emptyTextItem(items.length));
              setShowAddForm(true);
            }}
            className="gap-1"
          >
            <Type className="h-3.5 w-3.5" />
            テキスト行を追加
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Manual Invoice Create Dialog ──
function ManualCreateDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const projectsQuery = trpc.project.list.useQuery();
  const clientsQuery = trpc.clientInfo.list.useQuery();

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [defaultTaxRate, setDefaultTaxRate] = useState(10);
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<InvoiceLineItem[]>([emptyNormalItem(0)]);

  const createMutation = trpc.invoice.createManual.useMutation({
    onSuccess: (data) => {
      toast.success(`請求書 ${data.invoiceNumber} を作成しました（${formatYen(data.totalAmount)}）`);
      onOpenChange(false);
      onSuccess();
      // Reset
      setItems([emptyNormalItem(0)]);
      setSelectedClientId("");
      setSelectedProjectId("");
      setNotes("");
      setDueDate("");
    },
    onError: (e) => toast.error(`作成エラー: ${e.message}`),
  });

  const projects = projectsQuery.data || [];
  const clients = clientsQuery.data || [];

  const addNormalRow = () => setItems((prev) => [...prev, emptyNormalItem(prev.length)]);
  const addTextRow = () => setItems((prev) => [...prev, emptyTextItem(prev.length)]);

  const updateItem = (index: number, updates: Partial<InvoiceLineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        // Auto-calc amount for normal items
        if (updated.itemType === "normal" && (updates.quantity !== undefined || updates.unitPrice !== undefined)) {
          updated.amount = Math.round((updated.quantity / 10) * updated.unitPrice);
        }
        return updated;
      })
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => (item.itemType === "normal" ? sum + item.amount : sum), 0);

  // Tax calculation per rate group
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    const existing = taxByRate.get(item.itemTaxRate) || 0;
    taxByRate.set(item.itemTaxRate, existing + item.amount);
  }
  let totalTax = 0;
  for (const [rate, base] of Array.from(taxByRate.entries())) {
    totalTax += Math.round((base * rate) / 100);
  }
  const totalAmount = subtotal + totalTax;

  const handleCreate = () => {
    if (!selectedClientId) {
      toast.error("取引先を選択してください");
      return;
    }
    if (items.filter((i) => i.description.trim()).length === 0) {
      toast.error("少なくとも1つの項目を入力してください");
      return;
    }

    const [year, month] = periodMonth.split("-").map(Number);
    const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

    createMutation.mutate({
      clientId: Number(selectedClientId),
      projectId: selectedProjectId ? Number(selectedProjectId) : undefined,
      periodStart,
      periodEnd,
      taxRate: defaultTaxRate,
      notes: notes || undefined,
      dueDate: dueDate || undefined,
      items: items
        .filter((i) => i.description.trim())
        .map((item, idx) => ({
          ...item,
          sortOrder: idx,
        })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>請求書を作成</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">取引先 *</Label>
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
            <div className="space-y-1.5">
              <Label className="text-xs">現場（任意）</Label>
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
            <div className="space-y-1.5">
              <Label className="text-xs">対象月</Label>
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">支払期限</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">明細項目</Label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="border rounded-md p-3 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                      {item.itemType === "text" && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">テキスト行</span>
                      )}
                    </div>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                        onClick={() => removeItem(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(idx, { description: e.target.value })}
                    placeholder="摘要（作業内容・項目名）"
                    className="h-8"
                  />

                  {item.itemType === "normal" && (
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">数量（×10）</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="h-7 text-sm"
                          placeholder="200=20.0日"
                        />
                        {item.quantity > 0 && (
                          <span className="text-[10px] text-muted-foreground">{(item.quantity / 10).toFixed(1)}日</span>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">単価（円）</Label>
                        <Input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                          className="h-7 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">税率</Label>
                        <Select
                          value={String(item.itemTaxRate)}
                          onValueChange={(v) => updateItem(idx, { itemTaxRate: Number(v) })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TAX_RATES.map((r) => (
                              <SelectItem key={r.value} value={String(r.value)}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">金額</Label>
                        <div className="h-7 flex items-center text-sm font-medium">{formatYen(item.amount)}</div>
                      </div>
                    </div>
                  )}

                  <Input
                    value={item.notes}
                    onChange={(e) => updateItem(idx, { notes: e.target.value })}
                    placeholder="備考・説明（任意）"
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addNormalRow} className="gap-1 text-xs">
                <PlusCircle className="h-3 w-3" />
                通常行を追加
              </Button>
              <Button variant="outline" size="sm" onClick={addTextRow} className="gap-1 text-xs">
                <Type className="h-3 w-3" />
                テキスト行を追加
              </Button>
            </div>
          </div>

          {/* Summary */}
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">小計</span>
              <span>{formatYen(subtotal)}</span>
            </div>
            {Array.from(taxByRate.entries()).map(([rate, base]) => (
              <div key={rate} className="flex justify-between text-xs">
                <span className="text-muted-foreground">消費税 {rate}%（対象: {formatYen(base)}）</span>
                <span>{formatYen(Math.round((base * rate) / 100))}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold text-base border-t pt-1">
              <span>合計金額</span>
              <span className="text-gold">{formatYen(totalAmount)}</span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">備考</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="備考を入力..."
              rows={2}
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
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            作成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ──
export default function AppInvoices() {
  const [showCreate, setShowCreate] = useState(false);
  const [showAutoCreate, setShowAutoCreate] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null);

  // Auto-create state
  const [autoClientId, setAutoClientId] = useState<string>("");
  const [autoProjectId, setAutoProjectId] = useState<string>("");
  const [autoPeriodMonth, setAutoPeriodMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [autoTaxRate, setAutoTaxRate] = useState(10);
  const [autoNotes, setAutoNotes] = useState("");
  const [autoDueDate, setAutoDueDate] = useState("");

  const invoicesQuery = trpc.invoice.list.useQuery();
  const projectsQuery = trpc.project.list.useQuery();
  const clientsQuery = trpc.clientInfo.list.useQuery();

  const createFromAttendanceMutation = trpc.invoice.createFromAttendance.useMutation({
    onSuccess: (data) => {
      toast.success(`請求書 ${data.invoiceNumber} を作成しました（${formatYen(data.totalAmount)}）`);
      setShowAutoCreate(false);
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

  const handleAutoCreate = () => {
    if (!autoClientId || !autoProjectId) {
      toast.error("取引先と現場を選択してください");
      return;
    }
    const [year, month] = autoPeriodMonth.split("-").map(Number);
    const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

    createFromAttendanceMutation.mutate({
      clientId: Number(autoClientId),
      projectId: Number(autoProjectId),
      periodStart,
      periodEnd,
      taxRate: autoTaxRate,
      notes: autoNotes || undefined,
      dueDate: autoDueDate || undefined,
    });
  };

  const clientMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of clientsQuery.data || []) map.set(c.id, c.name);
    return map;
  }, [clientsQuery.data]);

  const projectMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of projectsQuery.data || []) map.set(p.id, p.name);
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
            請求書の作成・管理・PDF出力
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAutoCreate(true)}
            className="gap-1.5"
          >
            <FileText className="h-4 w-4" />
            出面表から自動作成
          </Button>
          <Button
            className="bg-gold text-background hover:bg-gold-dim gap-1.5"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4" />
            手動作成
          </Button>
        </div>
      </div>

      {/* Manual Create Dialog */}
      <ManualCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => invoicesQuery.refetch()}
      />

      {/* Auto Create Dialog */}
      <Dialog open={showAutoCreate} onOpenChange={setShowAutoCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>出面表から請求書を自動作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>取引先 *</Label>
              <Select value={autoClientId} onValueChange={setAutoClientId}>
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
              <Label>現場 *</Label>
              <Select value={autoProjectId} onValueChange={setAutoProjectId}>
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
              <Input type="month" value={autoPeriodMonth} onChange={(e) => setAutoPeriodMonth(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>消費税率 (%)</Label>
              <Select value={String(autoTaxRate)} onValueChange={(v) => setAutoTaxRate(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_RATES.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>支払期限</Label>
              <Input type="date" value={autoDueDate} onChange={(e) => setAutoDueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>備考</Label>
              <Textarea value={autoNotes} onChange={(e) => setAutoNotes(e.target.value)} placeholder="備考を入力..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
            <Button
              onClick={handleAutoCreate}
              disabled={createFromAttendanceMutation.isPending}
              className="bg-gold text-background hover:bg-gold-dim"
            >
              {createFromAttendanceMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog open={detailInvoiceId !== null} onOpenChange={(open) => !open && setDetailInvoiceId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>請求書詳細</DialogTitle>
          </DialogHeader>
          {detailInvoiceId && (
            <InvoiceDetailDialog
              invoiceId={detailInvoiceId}
              onClose={() => {
                setDetailInvoiceId(null);
                invoicesQuery.refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

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
              <p className="text-sm mt-1">「手動作成」または「出面表から自動作成」で請求書を作成してください</p>
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
                        <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                        <TableCell>{clientMap.get(inv.clientId) || `ID:${inv.clientId}`}</TableCell>
                        <TableCell>{inv.projectId ? projectMap.get(inv.projectId) || `ID:${inv.projectId}` : "-"}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(inv.periodStart), "yyyy/MM/dd")} 〜{" "}
                          {format(new Date(inv.periodEnd), "yyyy/MM/dd")}
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatYen(inv.totalAmount)}</TableCell>
                        <TableCell>
                          <Select
                            value={inv.status}
                            onValueChange={(v) =>
                              updateStatusMutation.mutate({ id: inv.id, status: v as any })
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
                              onClick={() => setDetailInvoiceId(inv.id)}
                              title="詳細・項目編集"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
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
