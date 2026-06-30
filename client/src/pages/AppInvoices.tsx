import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import InvoicePreview from "@/components/InvoicePreview";
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
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  Download,
  FileDown,
  Loader2,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Send,
  Eye,
  PlusCircle,
  Type,
  Pencil,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useEffect } from "react";
import { useLocation } from "wouter";

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

const UNIT_OPTIONS = ["日", "式", "個"];

function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function isInternalRateMappingNote(note: string | null | undefined): boolean {
  if (!note) return false;
  return /(?:^|\s)(?:対象:|対象：)/.test(note) && /(案件一律|個別単価|単価|rate|worker|employee|従業員)/i.test(note);
}

function externalItemNote(note: string | null | undefined): string {
  return isInternalRateMappingNote(note) ? "" : (note || "");
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
    unit: "式",
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

/** Calculate quantity display string based on unit */
function quantityDisplay(quantity: number, unit: string): string {
  if (unit === "日") return `${(quantity / 10).toFixed(1)} ${unit}`;
  return `${quantity} ${unit}`;
}

/** Calculate amount based on quantity, unit, and unitPrice */
function calcAmount(quantity: number, unit: string, unitPrice: number): number {
  if (unit === "日") return Math.round((quantity / 10) * unitPrice);
  return quantity * unitPrice;
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
    onError: (e: any) => toast.error(`追加エラー: ${e.message}`),
  });
  const deleteItemMutation = trpc.invoice.deleteItem.useMutation({
    onSuccess: () => {
      toast.success("項目を削除しました");
      detailQuery.refetch();
    },
    onError: (e: any) => toast.error(`削除エラー: ${e.message}`),
  });
  const updateItemMutation = trpc.invoice.updateItem.useMutation({
    onSuccess: () => {
      toast.success("項目を更新しました");
      detailQuery.refetch();
      setEditItemId(null);
      setEditItem(null);
    },
    onError: (e: any) => toast.error(`更新エラー: ${e.message}`),
  });

  const [newItem, setNewItem] = useState<InvoiceLineItem>(emptyNormalItem(0));
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [editItem, setEditItem] = useState<InvoiceLineItem | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"detail" | "preview">("detail");
  const [attendanceSheets, setAttendanceSheets] = useState<Array<{ projectId: number; projectName: string; url: string; fileName: string; hasData: boolean }>>([]);

  const generateAttendanceSheetsMutation = trpc.invoice.generateAttendanceSheets.useMutation({
    onSuccess: (data: any) => {
      setAttendanceSheets(data.sheets || []);
      const empty = (data.sheets || []).filter((s: any) => !s.hasData);
      toast.success(`出面表を生成しました（${(data.sheets || []).length}件）`);
      if (empty.length) {
        toast.warning(`出面データが無い現場が ${empty.length}件 あります`, { duration: 10000 });
      }
    },
    onError: (e: any) => toast.error(`出面表生成エラー: ${e.message}`),
  });

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const { invoice, items, client, company } = detailQuery.data || { invoice: null, items: [], client: null, company: null };
  if (!invoice) return <p className="text-muted-foreground">請求書が見つかりません</p>;
  const previewItems = items.map((item: any) => ({ ...item, notes: externalItemNote(item.notes) }));

  const handleAddItem = () => {
    if (!newItem.description.trim()) {
      toast.error("摘要を入力してください");
      return;
    }
    const amount = newItem.itemType === "normal" ? calcAmount(newItem.quantity, newItem.unit, newItem.unitPrice) : 0;
    addItemMutation.mutate({
      invoiceId: invoice.id,
      itemType: newItem.itemType,
      description: newItem.description,
      quantity: newItem.quantity,
      unit: newItem.unit,
      unitPrice: newItem.unitPrice,
      amount,
      itemTaxRate: newItem.itemTaxRate,
      notes: newItem.notes || undefined,
      sortOrder: items.length,
    });
    setNewItem(emptyNormalItem(items.length + 1));
    setShowAddForm(false);
  };

  const handleEditSave = () => {
    if (!editItemId || !editItem) return;
    if (!editItem.description.trim()) {
      toast.error("摘要を入力してください");
      return;
    }
    const amount = editItem.itemType === "normal"
      ? calcAmount(editItem.quantity, editItem.unit, editItem.unitPrice)
      : 0;
    updateItemMutation.mutate({
      id: editItemId,
      description: editItem.description,
      quantity: editItem.quantity,
      unit: editItem.unit,
      unitPrice: editItem.unitPrice,
      amount,
      itemTaxRate: editItem.itemTaxRate,
      notes: editItem.notes || undefined,
      sortOrder: editItem.sortOrder,
    });
  };

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab("detail")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "detail"
              ? "border-gold text-gold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          明細編集
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "preview"
              ? "border-gold text-gold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          プレビュー
        </button>
      </div>

      {activeTab === "preview" ? (
        <div className="max-h-[70vh] overflow-y-auto border rounded-md">
          <InvoicePreview invoice={invoice} items={previewItems} client={client} company={company} />
        </div>
      ) : (
      <>
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
        {(invoice as any).subject && (
          <div className="col-span-2">
            <span className="text-muted-foreground">件名:</span>{" "}
            <span className="font-medium">{(invoice as any).subject}</span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">小計:</span> {formatYen(invoice.subtotal)}
        </div>
        <div>
          <span className="text-muted-foreground">消費税:</span> {formatYen(invoice.taxAmount)}
        </div>
        {(invoice as any).internalMemo && (
          <div className="col-span-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs font-medium text-amber-500">社内メモ</p>
            <p className="text-[11px] text-muted-foreground mb-1">外部請求書には表示されません</p>
            <pre className="whitespace-pre-wrap text-xs text-foreground font-sans max-h-32 overflow-y-auto">{(invoice as any).internalMemo}</pre>
          </div>
        )}

        {/* 出面表（添付用）— 取引先へ請求書と一緒に渡すプロジェクト別の出面表を生成 */}
        <div className="col-span-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">出面表（添付用）</p>
              <p className="text-[11px] text-muted-foreground">取引先へ請求書と一緒に渡すプロジェクト別の出面表を生成します</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateAttendanceSheetsMutation.mutate({ invoiceId })}
              disabled={generateAttendanceSheetsMutation.isPending}
              className="gap-1.5 shrink-0"
            >
              {generateAttendanceSheetsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
              出面表を生成
            </Button>
          </div>
          {attendanceSheets.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {attendanceSheets.map((s) => (
                <li key={s.projectId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {s.projectName}
                    {!s.hasData && <span className="ml-2 text-[11px] text-amber-500">（出面データなし）</span>}
                  </span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:text-gold-dim text-xs shrink-0 inline-flex items-center gap-1">
                    <FileDown className="h-3.5 w-3.5" />ダウンロード
                  </a>
                </li>
              ))}
            </ul>
          )}
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
              items.map((item: any, idx: number) => (
                <TableRow key={item.id} className={item.itemType === "text" ? "bg-muted/30" : ""}>
                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div>
                      {item.itemType === "text" && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1 rounded mr-1">テキスト</span>
                      )}
                      {item.description}
                      {item.itemTaxRate === 8 && item.itemType === "normal" && (
                        <span className="text-xs text-amber-400 ml-1">※</span>
                      )}
                      {externalItemNote(item.notes) && (
                        <p className="text-xs text-muted-foreground mt-0.5">{externalItemNote(item.notes)}</p>
                      )}
                      {isInternalRateMappingNote(item.notes) && (
                        <p className="text-xs text-amber-500 mt-0.5">社内メモ（外部請求書には表示されません）</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.itemType === "normal" ? quantityDisplay(item.quantity, item.unit || "式") : "-"}
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
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-blue-400 hover:text-blue-300"
                        onClick={() => {
                          setEditItemId(item.id);
                          setEditItem({
                            itemType: item.itemType,
                            description: item.description || "",
                            quantity: item.quantity || 0,
                            unit: item.unit || "式",
                            unitPrice: item.unitPrice || 0,
                            amount: item.amount || 0,
                            itemTaxRate: item.itemTaxRate || 10,
                            notes: externalItemNote(item.notes),
                            sortOrder: item.sortOrder || idx,
                          });
                          setShowAddForm(false);
                        }}
                        title="編集"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                        onClick={() => {
                          if (confirm("この項目を削除しますか？")) {
                            deleteItemMutation.mutate({ id: item.id });
                          }
                        }}
                        title="削除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reduced tax rate note */}
      {items.some((item: any) => item.itemTaxRate === 8 && item.itemType === "normal") && (
        <p className="text-xs text-muted-foreground">※印は軽減税率対象です。</p>
      )}

      {/* Edit item form */}
      {editItem && editItemId !== null && (
        <Card className="border-blue-500/30">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">項目を編集</Label>
              <Button variant="ghost" size="sm" onClick={() => { setEditItemId(null); setEditItem(null); }}>
                キャンセル
              </Button>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">摘要 *</Label>
              <Input
                value={editItem.description}
                onChange={(e) => setEditItem((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                placeholder="項目名・作業内容など"
              />
            </div>

            {editItem.itemType === "normal" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">数量{editItem.unit === "日" ? "（×10）" : ""}</Label>
                  <Input
                    type="number"
                    value={editItem.quantity}
                    onChange={(e) => {
                      const qty = Number(e.target.value);
                      setEditItem((prev) => prev ? ({
                        ...prev,
                        quantity: qty,
                        amount: calcAmount(qty, prev.unit, prev.unitPrice),
                      }) : prev);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">単位</Label>
                  <Select
                    value={editItem.unit}
                    onValueChange={(v) => {
                      setEditItem((prev) => prev ? ({
                        ...prev,
                        unit: v,
                        amount: calcAmount(prev.quantity, v, prev.unitPrice),
                      }) : prev);
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">単価（円）</Label>
                  <Input
                    type="number"
                    value={editItem.unitPrice}
                    onChange={(e) => {
                      const price = Number(e.target.value);
                      setEditItem((prev) => prev ? ({
                        ...prev,
                        unitPrice: price,
                        amount: calcAmount(prev.quantity, prev.unit, price),
                      }) : prev);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">税率</Label>
                  <Select
                    value={String(editItem.itemTaxRate)}
                    onValueChange={(v) => setEditItem((prev) => prev ? ({ ...prev, itemTaxRate: Number(v) }) : prev)}
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
                <div className="space-y-1">
                  <Label className="text-xs">金額</Label>
                  <div className="h-8 flex items-center text-sm font-medium">{formatYen(editItem.amount)}</div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">備考（任意・外部請求書に表示）</Label>
              <Input
                value={editItem.notes}
                onChange={(e) => setEditItem((prev) => prev ? ({ ...prev, notes: e.target.value }) : prev)}
                placeholder="補足説明..."
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleEditSave}
                disabled={updateItemMutation.isPending}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                {updateItemMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                更新
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditItemId(null); setEditItem(null); }}>
                閉じる
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
            <div className="space-y-1">
              <Label className="text-xs">摘要 *</Label>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="項目名・作業内容など"
              />
            </div>

            {newItem.itemType === "normal" && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">数量{newItem.unit === "日" ? "（×10）" : ""}</Label>
                  <Input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => {
                      const qty = Number(e.target.value);
                      setNewItem((prev) => ({
                        ...prev,
                        quantity: qty,
                        amount: calcAmount(qty, prev.unit, prev.unitPrice),
                      }));
                    }}
                    placeholder={newItem.unit === "日" ? "200=20.0日" : "数量"}
                  />
                  {newItem.unit === "日" && newItem.quantity > 0 && (
                    <span className="text-[10px] text-muted-foreground">{(newItem.quantity / 10).toFixed(1)}日</span>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">単位</Label>
                  <Select
                    value={newItem.unit}
                    onValueChange={(v) => {
                      setNewItem((prev) => ({
                        ...prev,
                        unit: v,
                        amount: calcAmount(prev.quantity, v, prev.unitPrice),
                      }));
                    }}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_OPTIONS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                        amount: calcAmount(prev.quantity, prev.unit, price),
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
                <div className="space-y-1">
                  <Label className="text-xs">金額</Label>
                  <div className="h-8 flex items-center text-sm font-medium">{formatYen(newItem.amount)}</div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">備考（任意・外部請求書に表示）</Label>
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
      </>
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
  const [subject, setSubject] = useState("");
  const [honorific, setHonorific] = useState("御中");
  const [paymentMethod, setPaymentMethod] = useState("口座振込");
  const [withholding, setWithholding] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPostalCode, setNewClientPostalCode] = useState("");
  const [newClientAddress, setNewClientAddress] = useState("");
  const [newClientContactPerson, setNewClientContactPerson] = useState("");
  const [items, setItems] = useState<InvoiceLineItem[]>([emptyNormalItem(0)]);

  const createClientMutation = trpc.clientInfo.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("取引先を追加しました");
      clientsQuery.refetch();
      setSelectedClientId(String(data.id));
      setSelectedProjectId("");
      setShowNewClient(false);
      setNewClientName("");
      setNewClientPostalCode("");
      setNewClientAddress("");
      setNewClientContactPerson("");
    },
    onError: (e: any) => toast.error(`取引先追加エラー: ${e.message}`),
  });

  const createMutation = trpc.invoice.createManual.useMutation({
    onSuccess: (data: any) => {
      toast.success(`請求書 ${data.invoiceNumber} を作成しました（${formatYen(data.totalAmount)}）`);
      onOpenChange(false);
      onSuccess();
      // Reset
      setItems([emptyNormalItem(0)]);
      setSelectedClientId("");
      setSelectedProjectId("");
      setNotes("");
      setDueDate("");
      setSubject("");
    },
    onError: (e: any) => toast.error(`作成エラー: ${e.message}`),
  });

  const projects = projectsQuery.data || [];
  const clients = clientsQuery.data || [];
  const manualClientProjects = useMemo(
    () => selectedClientId
      ? projects.filter((project: any) => Number(project.clientId) === Number(selectedClientId))
      : [],
    [projects, selectedClientId]
  );

  const handleManualClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedProjectId("");
  };

  const addNormalRow = () => setItems((prev) => [...prev, emptyNormalItem(prev.length)]);
  const addTextRow = () => setItems((prev) => [...prev, emptyTextItem(prev.length)]);

  const updateItem = (index: number, updates: Partial<InvoiceLineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...updates };
        // Auto-calc amount for normal items
        if (updated.itemType === "normal" && (updates.quantity !== undefined || updates.unitPrice !== undefined || updates.unit !== undefined)) {
          updated.amount = calcAmount(updated.quantity, updated.unit, updated.unitPrice);
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
  // Withholding tax calculation (10.21% of subtotal)
  const withholdingAmount = withholding ? Math.round(subtotal * 0.1021) : 0;
  const totalAmount = subtotal + totalTax - withholdingAmount;

  const handleCreate = () => {
    if (!selectedClientId) {
      toast.error("取引先を選択してください");
      return;
    }
    if (items.filter((i) => i.description.trim()).length === 0) {
      toast.error("少なくとも1つの項目を入力してください");
      return;
    }
    if (selectedProjectId) {
      const selectedProject = projects.find((project: any) => String(project.id) === selectedProjectId);
      if (!selectedProject || Number(selectedProject.clientId) !== Number(selectedClientId)) {
        toast.error("選択できるのは取引先に紐づく現場だけです");
        return;
      }
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
      subject: subject || undefined,
      honorific: honorific || undefined,
      paymentMethod: paymentMethod || undefined,
      withholding,
      withholdingAmount,
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>請求書を作成</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            {/* Client selection with search */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">取引先 *</Label>
                <button
                  type="button"
                  onClick={() => setShowNewClient(!showNewClient)}
                  className="text-xs text-gold hover:text-gold-dim transition-colors"
                >
                  {showNewClient ? "選択に戻る" : "+ 新規追加"}
                </button>
              </div>
              {showNewClient ? (
                <div className="space-y-2 border border-gold/20 rounded-md p-3 bg-dark-surface/30">
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="会社名 *"
                    className="text-sm"
                  />
                  <Input
                    value={newClientPostalCode}
                    onChange={(e) => setNewClientPostalCode(e.target.value)}
                    placeholder="郵便番号"
                    className="text-sm"
                  />
                  <Input
                    value={newClientAddress}
                    onChange={(e) => setNewClientAddress(e.target.value)}
                    placeholder="住所"
                    className="text-sm"
                  />
                  <Input
                    value={newClientContactPerson}
                    onChange={(e) => setNewClientContactPerson(e.target.value)}
                    placeholder="担当者名"
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newClientName.trim()) {
                        toast.error("会社名を入力してください");
                        return;
                      }
                      createClientMutation.mutate({
                        name: newClientName.trim(),
                        postalCode: newClientPostalCode || undefined,
                        address: newClientAddress || undefined,
                        contactPerson: newClientContactPerson || undefined,
                      });
                    }}
                    disabled={createClientMutation.isPending}
                    className="w-full bg-gold text-background hover:bg-gold-dim"
                  >
                    {createClientMutation.isPending ? "追加中..." : "取引先を追加"}
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="取引先を検索..."
                    className="text-sm mb-1"
                  />
                  <Select value={selectedClientId} onValueChange={handleManualClientChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="取引先を選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients
                        .filter((c: any) =>
                          !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())
                        )
                        .map((c: any) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>

            {/* Honorific */}
            <div className="space-y-1.5">
              <Label className="text-xs">敬称</Label>
              <Select value={honorific} onValueChange={setHonorific}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="御中">御中</SelectItem>
                  <SelectItem value="様">様</SelectItem>
                  <SelectItem value="殿">殿</SelectItem>
                  <SelectItem value="なし">なし</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Project */}
            <div className="space-y-1.5">
              <Label className="text-xs">現場（任意）</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={!selectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder={selectedClientId ? "現場を選択" : "先に取引先を選択"} />
                </SelectTrigger>
                <SelectContent>
                  {!selectedClientId ? (
                    <SelectItem value="__select_client_first" disabled>
                      先に取引先を選択してください
                    </SelectItem>
                  ) : manualClientProjects.length === 0 ? (
                    <SelectItem value="__no_project_for_client" disabled>
                      この取引先に紐づく現場がありません
                    </SelectItem>
                  ) : (
                    manualClientProjects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedClientId && manualClientProjects.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  選択中の取引先に紐づく現場のみ表示しています
                </p>
              )}
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs">支払方法</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="口座振込">口座振込</SelectItem>
                  <SelectItem value="現金">現金</SelectItem>
                  <SelectItem value="小切手">小切手</SelectItem>
                  <SelectItem value="その他">その他</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">件名</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="例: 11月分請求書 藤沢いすゞ新築工場"
              />
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
                  <div>
                    <Label className="text-[10px] text-muted-foreground">摘要 *</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder="作業内容・項目名"
                      className="h-7 text-sm"
                    />
                  </div>

                  {item.itemType === "normal" && (
                    <div className="grid grid-cols-5 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">数量{item.unit === "日" ? "（×10）" : ""}</Label>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="h-7 text-sm"
                          placeholder={item.unit === "日" ? "200=20.0日" : "数量"}
                        />
                        {item.unit === "日" && item.quantity > 0 && (
                          <span className="text-[10px] text-muted-foreground">{(item.quantity / 10).toFixed(1)}日</span>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">単位</Label>
                        <Select
                          value={item.unit}
                          onValueChange={(v) => updateItem(idx, { unit: v })}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    placeholder="備考・説明（任意・外部請求書に表示）"
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
            {Array.from(taxByRate.entries()).sort((a, b) => b[0] - a[0]).map(([rate, base]) => {
              if (rate === 0) return null;
              const rateLabel = rate === 8 ? `軽減税率${rate}%対象（税抜）` : `${rate}%対象（税抜）`;
              return (
                <div key={rate}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{rateLabel}</span>
                    <span>{formatYen(base)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground pl-4">{rate === 8 ? `軽減税率${rate}%消費税` : `${rate}%消費税`}</span>
                    <span>{formatYen(Math.round((base * rate) / 100))}</span>
                  </div>
                </div>
              );
            })}
            {withholding && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">源泉徴収税額 (10.21%)</span>
                <span className="text-destructive">-{formatYen(withholdingAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-1">
              <span>合計金額</span>
              <span className="text-gold">{formatYen(totalAmount)}</span>
            </div>
          </div>

          {/* Reduced tax rate note */}
          {items.some((i) => i.itemTaxRate === 8 && i.itemType === "normal") && (
            <p className="text-xs text-muted-foreground">※印は軽減税率対象です。</p>
          )}

          {/* Withholding tax toggle */}
          <div className="flex items-center justify-between py-2 border-t">
            <div>
              <Label className="text-xs font-medium">源泉徴収</Label>
              <p className="text-xs text-muted-foreground">源泉徴収税 (10.21%) を差し引きます</p>
            </div>
            <button
              type="button"
              onClick={() => setWithholding(!withholding)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                withholding ? "bg-gold" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  withholding ? "translate-x-4.5" : "translate-x-0.5"
                }`}
              />
            </button>
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
  const [location, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [showAutoCreate, setShowAutoCreate] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceIdParam = params.get("invoiceId");
    if (invoiceIdParam) {
      const id = Number(invoiceIdParam);
      if (!Number.isNaN(id)) setDetailInvoiceId(id);
    }
  }, [location]);

  // Auto-create state
  const [autoClientId, setAutoClientId] = useState<string>("");
  const [autoProjectIds, setAutoProjectIds] = useState<number[]>([]);
  const [autoPeriodMonth, setAutoPeriodMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [autoTaxRate, setAutoTaxRate] = useState(10);
  const [autoNotes, setAutoNotes] = useState("");
  const [autoDueDate, setAutoDueDate] = useState("");
  const [autoSubject, setAutoSubject] = useState("");
  const [autoWithholding, setAutoWithholding] = useState(false);

  const invoicesQuery = trpc.invoice.list.useQuery();
  const projectsQuery = trpc.project.list.useQuery();
  const clientsQuery = trpc.clientInfo.list.useQuery();
  const autoClosingsQuery = trpc.closing.listByMonth.useQuery(
    { closingMonth: autoPeriodMonth },
    { enabled: showAutoCreate }
  );

  const createFromAttendanceMutation = trpc.invoice.createFromAttendance.useMutation({
    onSuccess: (data: any) => {
      toast.success(`請求書 ${data.invoiceNumber} を作成しました（${formatYen(data.totalAmount)}）`);
      setShowAutoCreate(false);
      invoicesQuery.refetch();
    },
    onError: (e: any) => toast.error(`作成エラー: ${e.message}`),
  });

  const generatePdfMutation = trpc.invoice.generatePdf.useMutation({
    onSuccess: (data: any) => {
      window.open(data.url, "_blank");
      toast.success("PDFを生成しました");
      invoicesQuery.refetch();
    },
    onError: (e: any) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const updateStatusMutation = trpc.invoice.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("ステータスを更新しました");
      invoicesQuery.refetch();
    },
    onError: (e: any) => toast.error(`更新エラー: ${e.message}`),
  });

  const deleteMutation = trpc.invoice.delete.useMutation({
    onSuccess: () => {
      toast.success("請求書を削除しました");
      invoicesQuery.refetch();
    },
    onError: (e: any) => toast.error(`削除エラー: ${e.message}`),
  });

  const handleAutoCreate = () => {
    if (!autoClientId || autoProjectIds.length === 0) {
      toast.error("取引先と現場を選択してください");
      return;
    }
    const invalidProject = projects.find((p: any) => autoProjectIds.includes(p.id) && Number(p.clientId) !== Number(autoClientId));
    if (invalidProject) {
      toast.error("選択できるのは同一取引先の現場だけです");
      return;
    }
    const [year, month] = autoPeriodMonth.split("-").map(Number);
    const periodStart = format(startOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");
    const periodEnd = format(endOfMonth(new Date(year, month - 1)), "yyyy-MM-dd");

    createFromAttendanceMutation.mutate({
      clientId: Number(autoClientId),
      projectIds: autoProjectIds,
      periodStart,
      periodEnd,
      taxRate: autoTaxRate,
      notes: autoNotes || undefined,
      dueDate: autoDueDate || undefined,
      subject: autoSubject || undefined,
      withholding: autoWithholding,
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
  const autoClientProjects = autoClientId
    ? projects.filter((p: any) => Number(p.clientId) === Number(autoClientId))
    : [];
  const closingRows = autoClosingsQuery.data || [];
  const blockingClosings = autoProjectIds
    .map((projectId) => closingRows.find((row: any) => row.project.id === projectId))
    .filter((row: any) => !row?.closing || !["ready", "closed", "locked"].includes(row.closing.status));
  const canAutoCreate = !!autoClientId && autoProjectIds.length > 0 && blockingClosings.length === 0;

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
              <Select value={autoClientId} onValueChange={(v) => { setAutoClientId(v); setAutoProjectIds([]); }}>
                <SelectTrigger>
                  <SelectValue placeholder="取引先を選択" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>現場 * （複数選択可）</Label>
              <div className="border border-border rounded-md p-2 max-h-[160px] overflow-y-auto space-y-1">
                {!autoClientId ? (
                  <p className="text-xs text-muted-foreground px-2 py-2">先に取引先を選択してください</p>
                ) : autoClientProjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-2">この取引先に紐づく現場がありません</p>
                ) : (
                  autoClientProjects.map((p: any) => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={autoProjectIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAutoProjectIds([...autoProjectIds, p.id]);
                          } else {
                            setAutoProjectIds(autoProjectIds.filter((id: number) => id !== p.id));
                          }
                        }}
                        className="rounded border-border"
                      />
                      {p.name}
                    </label>
                  ))
                )}
              </div>
              {autoProjectIds.length > 0 && (
                <p className="text-xs text-muted-foreground">{autoProjectIds.length}件の現場を選択中</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>件名</Label>
              <Input
                value={autoSubject}
                onChange={(e) => setAutoSubject(e.target.value)}
                placeholder="例: 3月分請求書 藤沢いすゞ新築工場"
              />
            </div>
            <div className="space-y-2">
              <Label>対象月</Label>
              <Input type="month" value={autoPeriodMonth} onChange={(e) => setAutoPeriodMonth(e.target.value)} />
              {blockingClosings.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 space-y-1">
                  <p>以下の案件はまだ締めが完了していないため請求作成できません。</p>
                  {blockingClosings.map((row: any, index: number) => (
                    <div key={row?.project?.id || index}>
                      ・{row?.project?.name || "不明案件"}（{row?.closing ? row.closing.status : "未初期化"}）
                    </div>
                  ))}
                </div>
              )}
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-withholding"
                checked={autoWithholding}
                onChange={(e) => setAutoWithholding(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="auto-withholding" className="cursor-pointer text-sm">源泉徴収あり（10.21%）</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
            <Button
              onClick={handleAutoCreate}
              disabled={createFromAttendanceMutation.isPending || !canAutoCreate}
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
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
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
                    <TableHead>件名</TableHead>
                    <TableHead>取引先</TableHead>
                    <TableHead>現場</TableHead>
                    <TableHead>対象期間</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv: any) => {
                    const status = STATUS_LABELS[inv.status] || STATUS_LABELS.draft;
                    const StatusIcon = status.icon;
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                        <TableCell className="text-sm max-w-[150px] truncate">{inv.subject || "-"}</TableCell>
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
