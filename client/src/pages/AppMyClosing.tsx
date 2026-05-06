import React, { useState, useRef, useMemo } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Receipt, Upload, Link as LinkIcon, Trash2, Send, FileCheck2, CalendarDays, FileDown, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  not_required: { label: "対象外", className: "bg-slate-500/20 text-slate-300" },
  pending: { label: "未提出", className: "bg-amber-500/20 text-amber-400" },
  submitted: { label: "提出済", className: "bg-blue-500/20 text-blue-400" },
  approved: { label: "確認済", className: "bg-emerald-500/20 text-emerald-400" },
  rejected: { label: "差戻し", className: "bg-red-500/20 text-red-400" },
};

const CLOSING_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "開放中", className: "bg-slate-500/20 text-slate-300" },
  reopened: { label: "再開", className: "bg-emerald-500/20 text-emerald-300" },
  ready: { label: "準備完了", className: "bg-emerald-500/20 text-emerald-400" },
  closed: { label: "締め完了", className: "bg-blue-500/20 text-blue-400" },
  locked: { label: "ロック", className: "bg-amber-500/20 text-amber-400" },
};

function formatYen(amount: number) {
  return `¥${Number(amount || 0).toLocaleString("ja-JP")}`;
}

function canWorkerEdit(closingStatus?: string | null, submissionStatus?: string | null) {
  if (closingStatus === "closed" || closingStatus === "locked" || closingStatus === "completed") return false;
  if (closingStatus === "ready") return submissionStatus === "rejected";
  return true;
}

export default function AppMyClosing() {
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [transportAmount, setTransportAmount] = useState(0);
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [showReview, setShowReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const projectsQuery = trpc.attendance.myProjects.useQuery();
  const detailQuery = trpc.closing.mySubmission.useQuery(
    { projectId: selectedProjectId || 0, closingMonth },
    {
      enabled: !!selectedProjectId,
      refetchOnWindowFocus: true,
      refetchInterval: 15000,
    }
  );

  React.useEffect(() => {
    if (detailQuery.data?.submission) {
      setTransportAmount(detailQuery.data.submission.transportAmount || 0);
      setExpenseAmount(detailQuery.data.submission.expenseAmount || 0);
      setNotes(detailQuery.data.submission.notes || "");
    } else {
      setTransportAmount(0);
      setExpenseAmount(0);
      setNotes("");
    }
  }, [detailQuery.data]);

  const saveMutation = trpc.closing.saveMySubmission.useMutation({
    onSuccess: () => {
      toast.success("月締め内容を保存しました");
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`保存エラー: ${e.message}`),
  });

  const submitMutation = trpc.closing.submitMySubmission.useMutation({
    onSuccess: () => {
      toast.success("月締めを提出しました");
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`提出エラー: ${e.message}`),
  });

  const uploadMutation = trpc.closing.uploadMyReceipt.useMutation({
    onSuccess: () => {
      toast.success("領収書をアップロードしました");
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`アップロードエラー: ${e.message}`),
  });

  const clearMutation = trpc.closing.clearMyReceipt.useMutation({
    onSuccess: () => {
      toast.success("領収書を解除しました");
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`解除エラー: ${e.message}`),
  });

  const projects = projectsQuery.data || [];
  const detail = detailQuery.data;
  const receiptRequired = transportAmount > 0 || expenseAmount > 0;
  const busy = saveMutation.isPending || submitMutation.isPending || uploadMutation.isPending || clearMutation.isPending;
  const canEdit = !!detail?.eligible && !!detail?.closing && canWorkerEdit(detail.closing.status, detail.submission?.status);
  const selectedProject = useMemo(() => projects.find((p: any) => p.id === selectedProjectId) || null, [projects, selectedProjectId]);

  const handleSave = () => {
    if (!selectedProjectId) return;
    saveMutation.mutate({
      projectId: selectedProjectId,
      closingMonth,
      transportAmount,
      expenseAmount,
      notes,
    });
  };

  const handleSubmit = () => {
    if (!selectedProjectId) return;
    submitMutation.mutate({ projectId: selectedProjectId, closingMonth });
  };

  const handleReceiptFile = async (file?: File | null) => {
    if (!file || !selectedProjectId) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      uploadMutation.mutate({
        projectId: selectedProjectId,
        closingMonth,
        base64,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">月締め提出</h1>
          <p className="text-sm text-muted-foreground">交通費・経費・領収書を提出して、月締めを完了します。</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-[180px]">
            <Label className="text-xs text-muted-foreground">対象月</Label>
            <Input type="month" value={closingMonth} onChange={(e) => setClosingMonth(e.target.value)} />
          </div>
          <div className="w-[260px]">
            <Label className="text-xs text-muted-foreground">現場</Label>
            <Select
              value={selectedProjectId?.toString() || ""}
              onValueChange={(v) => setSelectedProjectId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="現場を選択" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!selectedProjectId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>現場と対象月を選択してください</p>
          </CardContent>
        </Card>
      ) : detailQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </CardContent>
        </Card>
      ) : !detail?.eligible ? (
        <Card>
          <CardContent className="py-10 space-y-3">
            <div className="text-lg font-medium">提出対象外です</div>
            <p className="text-sm text-muted-foreground">
              {selectedProject?.name || "この現場"} の {closingMonth} は、まだあなたの提出対象として初期化されていません。
            </p>
            <p className="text-sm text-muted-foreground">
              まず出面表を保存してから、もう一度この画面を開いてください。対象外のままなら管理者に確認してください。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
                <span>{detail.project?.name || selectedProject?.name} / {closingMonth}</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {detail.closing?.status && (
                    <span className={`px-2 py-1 rounded text-xs ${CLOSING_STATUS_LABELS[detail.closing.status]?.className || "bg-muted"}`}>
                      {CLOSING_STATUS_LABELS[detail.closing.status]?.label || detail.closing.status}
                    </span>
                  )}
                  {detail.submission?.status && (
                    <span className={`px-2 py-1 rounded text-xs ${STATUS_LABELS[detail.submission.status]?.className || "bg-muted"}`}>
                      {STATUS_LABELS[detail.submission.status]?.label || detail.submission.status}
                    </span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {!canEdit && (
                <div className="text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300">
                  この月締めはすでに確定済みのため、作業員側では編集できません。
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryCard label="交通費" value={formatYen(transportAmount)} />
                <SummaryCard label="経費" value={formatYen(expenseAmount)} />
                <SummaryCard label="領収書" value={receiptRequired ? (detail.submission?.receiptUploaded ? "添付済" : "必要") : "不要"} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>交通費（円）</Label>
                  <Input type="number" value={transportAmount} onChange={(e) => setTransportAmount(Number(e.target.value))} disabled={!canEdit} />
                  <p className="text-xs text-muted-foreground">往復交通費や事後報告分を入力します。</p>
                </div>
                <div className="space-y-2">
                  <Label>経費（円）</Label>
                  <Input type="number" value={expenseAmount} onChange={(e) => setExpenseAmount(Number(e.target.value))} disabled={!canEdit} />
                  <p className="text-xs text-muted-foreground">材料立替やその他経費があれば入力します。</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>メモ</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="補足があれば入力" />
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-gold" />
                  <span className="font-medium">領収書</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  交通費または経費を入力した場合は、領収書の添付が必須です。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => handleReceiptFile(e.target.files?.[0] || null)}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant={detail.submission?.receiptUploaded ? "default" : "outline"} disabled={!canEdit || !receiptRequired || busy} onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-1" />
                    {detail.submission?.receiptUploaded ? "領収書を差し替え" : "領収書をアップロード"}
                  </Button>
                  {detail.submission?.receiptFileUrl ? (
                    <>
                      <a href={detail.submission.receiptFileUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline inline-flex items-center gap-1 max-w-[320px] truncate">
                        <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{detail.submission.receiptFileName || "領収書"}</span>
                      </a>
                      <Button variant="ghost" size="icon" className="text-red-400" disabled={!canEdit || busy} onClick={() => clearMutation.mutate({ projectId: selectedProjectId, closingMonth })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <span className={`text-sm ${receiptRequired ? "text-amber-400" : "text-muted-foreground"}`}>
                      {receiptRequired ? "未添付" : "不要"}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" disabled={!canEdit || busy} onClick={handleSave}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  保存
                </Button>
                <Button disabled={!canEdit || busy} onClick={() => {
                  if (receiptRequired && !detail.submission?.receiptUploaded) {
                    toast.error("領収書が必要です。提出前にアップロードしてください。");
                    return;
                  }
                  setShowReview(true);
                }}>
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  提出前確認
                </Button>
              </div>

              {receiptRequired && !detail.submission?.receiptUploaded && (
                <div className="text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300">
                  領収書が未添付のため、このままでは提出できません。
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>提出の流れ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. まず「マイ出面表」で対象月の出面を保存します。</p>
              <p>2. この画面で交通費・経費・メモを入力します。</p>
              <p>3. 金額がある場合は領収書を添付します。</p>
              <p>4. 「提出」を押すと、管理者側の締め管理に反映されます。</p>
            </CardContent>
          </Card>

          {/* ── Worker Invoice Section ── */}
          {detail?.submission?.status === "submitted" || detail?.submission?.status === "approved" ? (
            <WorkerInvoiceSection projectId={selectedProjectId!} closingMonth={closingMonth} />
          ) : null}

          <Dialog open={showReview} onOpenChange={setShowReview}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>月締め提出前確認</DialogTitle>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">現場</div>
                  <div className="font-medium">{detail?.project?.name || selectedProject?.name}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">対象月</div>
                    <div className="font-medium">{closingMonth}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">領収書</div>
                    <div className="font-medium">
                      {receiptRequired ? (detail?.submission?.receiptUploaded ? "添付済" : "未添付") : "不要"}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">交通費</div>
                    <div className="font-medium">{formatYen(transportAmount)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">経費</div>
                    <div className="font-medium">{formatYen(expenseAmount)}</div>
                  </div>
                </div>

                {notes && (
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">メモ</div>
                    <div className="whitespace-pre-wrap">{notes}</div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  内容を確認してから会社へ提出します。修正する場合は戻って保存し直してください。
                </p>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowReview(false)}>戻る</Button>
                <Button
                  onClick={() => {
                    setShowReview(false);
                    handleSubmit();
                  }}
                  disabled={submitMutation.isPending}
                >
                  この内容で提出
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-gold" />{value}</div>
    </div>
  );
}

const INVOICE_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-slate-500/20 text-slate-300" },
  submitted: { label: "提出済", className: "bg-blue-500/20 text-blue-400" },
  returned: { label: "差戻し", className: "bg-red-500/20 text-red-400" },
  approved: { label: "承認済", className: "bg-emerald-500/20 text-emerald-400" },
  locked: { label: "ロック", className: "bg-amber-500/20 text-amber-400" },
};

type LineItem = {
  category: "labor" | "transport" | "expense" | "materials" | "misc";
  label: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  labor: "労務",
  transport: "交通費",
  expense: "経費",
  materials: "材料",
  misc: "その他",
};

const TAX_RATES = [0, 8, 10];

function WorkerInvoiceSection({ projectId, closingMonth }: { projectId: number; closingMonth: string }) {
  const draftQuery = trpc.workerInvoice.getMyDraft.useQuery({ projectId, closingMonth });
  const saveDraftMutation = trpc.workerInvoice.saveMyDraft.useMutation({
    onSuccess: () => { toast.success("下書きを保存しました"); draftQuery.refetch(); },
    onError: (e) => toast.error(`保存エラー: ${e.message}`),
  });
  const submitInvoiceMutation = trpc.workerInvoice.submitMyInvoice.useMutation({
    onSuccess: () => { toast.success("請求書を提出しました"); draftQuery.refetch(); },
    onError: (e) => toast.error(`提出エラー: ${e.message}`),
  });
  const downloadPdfMutation = trpc.workerInvoice.downloadPdf.useMutation({
    onSuccess: (data) => { window.open(data.url, "_blank"); },
    onError: (e) => toast.error(`PDFエラー: ${e.message}`),
  });
  const docsQuery = trpc.workerInvoice.getSupportingDocs.useQuery(
    { invoiceId: draftQuery.data?.id || 0 },
    { enabled: !!draftQuery.data?.id }
  );

  const invoice = draftQuery.data;
  const [items, setItems] = useState<LineItem[]>([]);
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Initialize local state from server data
  React.useEffect(() => {
    if (invoice && !initialized) {
      setSubject(invoice.subject || `${closingMonth} 作業請求`);
      setNotes(invoice.notes || "");
      if (invoice.items && invoice.items.length > 0) {
        setItems(invoice.items.map((i: any) => ({
          category: i.category || "labor",
          label: i.label || "",
          quantity: i.quantity || 1,
          unit: i.unit || "式",
          unitPrice: i.unitPrice || 0,
          taxRate: i.taxRate ?? 10,
        })));
      }
      setInitialized(true);
    }
  }, [invoice, initialized, closingMonth]);

  if (draftQuery.isLoading) return <Card><CardContent className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  if (!invoice) return null;

  const status = invoice.status || "draft";
  const statusInfo = INVOICE_STATUS_LABELS[status] || INVOICE_STATUS_LABELS.draft;
  const isApproved = status === "approved" || status === "locked";
  const isReturned = status === "returned";
  const canEdit = status === "draft" || status === "returned";
  const canSubmitInvoice = canEdit;
  const docs = docsQuery.data || [];

  // Calculate totals
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const tax = items.reduce((sum, i) => sum + Math.floor(i.quantity * i.unitPrice * i.taxRate / 100), 0);
  const total = subtotal + tax;

  const addItem = () => {
    setItems([...items, { category: "labor", label: "", quantity: 1, unit: "式", unitPrice: 0, taxRate: 10 }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof LineItem, value: any) => {
    setItems(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSaveDraft = () => {
    saveDraftMutation.mutate({ projectId, closingMonth, subject, notes, items });
  };

  const handleSubmit = () => {
    if (items.length === 0) {
      toast.error("明細行を1つ以上追加してください");
      return;
    }
    if (items.some(i => !i.label.trim())) {
      toast.error("すべての明細行に摘要を入力してください");
      return;
    }
    // Save first, then submit
    saveDraftMutation.mutate({ projectId, closingMonth, subject, notes, items }, {
      onSuccess: () => {
        submitInvoiceMutation.mutate({ projectId, closingMonth });
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
          <span className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-gold" />
            作業員請求書
          </span>
          <span className={`px-2 py-1 rounded text-xs ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isApproved && (
          <div className="text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-300">
            この請求書は承認済みです。内容の変更はできません。
          </div>
        )}
        {isReturned && (
          <div className="text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-300 space-y-2">
            <div className="font-medium">差戻し理由:</div>
            <div>{(invoice as any).returnReason || "理由が記載されていません"}</div>
            <div className="text-xs text-red-400">内容を修正して再提出してください。</div>
          </div>
        )}

        {/* Subject & Notes (editable in draft/returned) */}
        {canEdit && (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">件名</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="請求件名" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">備考</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="備考（任意）" rows={2} className="mt-1" />
            </div>
          </div>
        )}

        {/* Line items editor (mobile-first stacked cards) */}
        {canEdit && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">明細行</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />追加
              </Button>
            </div>
            {items.length === 0 && (
              <div className="text-sm text-muted-foreground border border-dashed rounded-lg p-4 text-center">
                明細行がありません。「追加」ボタンで項目を追加してください。
              </div>
            )}
            {items.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between gap-2">
                  <Select value={item.category} onValueChange={(v) => updateItem(idx, "category", v)}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={item.label}
                  onChange={(e) => updateItem(idx, "label", e.target.value)}
                  placeholder="摘要（例: 電気工事作業）"
                  className="h-8 text-sm"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">数量</Label>
                    <Input
                      type="number"
                      min={0}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, "quantity", Number(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">単位</Label>
                    <Input
                      value={item.unit}
                      onChange={(e) => updateItem(idx, "unit", e.target.value)}
                      className="h-8 text-sm"
                      placeholder="式"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">税率</Label>
                    <Select value={String(item.taxRate)} onValueChange={(v) => updateItem(idx, "taxRate", Number(v))}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_RATES.map(r => (
                          <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">単価 (円)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={item.unitPrice}
                    onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  金額: <span className="font-medium text-foreground">{formatYen(item.quantity * item.unitPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Read-only items display (for submitted/approved) */}
        {!canEdit && invoice.items && invoice.items.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">明細行</Label>
            {invoice.items.map((item: any, idx: number) => (
              <div key={idx} className="border rounded-lg p-3 bg-card text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{CATEGORY_LABELS[item.category] || item.category}</span>
                  <span className="text-xs text-muted-foreground">{item.taxRate}%</span>
                </div>
                <div className="mt-1 font-medium">{item.label}</div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>{item.quantity} {item.unit} × {formatYen(item.unitPrice)}</span>
                  <span className="font-medium text-foreground">{formatYen(item.amount || item.quantity * item.unitPrice)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Totals summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">小計</div>
            <div className="font-medium">{formatYen(canEdit ? subtotal : invoice.subtotalAmount)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">消費税</div>
            <div className="font-medium">{formatYen(canEdit ? tax : invoice.taxAmount)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">合計</div>
            <div className="font-bold text-lg">{formatYen(canEdit ? total : invoice.totalAmount)}</div>
          </div>
        </div>

        {/* Supporting documents list */}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground font-medium">添付資料:</div>
          {docs.length === 0 ? (
            <div className="text-sm text-muted-foreground">添付資料なし</div>
          ) : (
            docs.map((doc: any) => (
              <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-blue-400 hover:underline">
                <LinkIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{doc.originalFileName || "資料"}</span>
              </a>
            ))
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              disabled={saveDraftMutation.isPending}
            >
              {saveDraftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileCheck2 className="h-4 w-4 mr-1" />}
              下書き保存
            </Button>
          )}
          {canSubmitInvoice && (
            <Button
              onClick={handleSubmit}
              disabled={submitInvoiceMutation.isPending || saveDraftMutation.isPending}
              size="sm"
            >
              {submitInvoiceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              {isReturned ? "再提出" : "請求書を提出"}
            </Button>
          )}
          {(status === "submitted" || status === "approved" || status === "locked") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadPdfMutation.mutate({ invoiceId: invoice.id })}
              disabled={downloadPdfMutation.isPending}
            >
              {downloadPdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileDown className="h-4 w-4 mr-1" />}
              PDFダウンロード
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
