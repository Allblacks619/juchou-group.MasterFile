import React, { useState, useRef, useMemo } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePdfViewer } from "@/components/PdfViewer";
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
import {
  Loader2,
  Receipt,
  Upload,
  Link as LinkIcon,
  Trash2,
  Send,
  FileCheck2,
  CalendarDays,
  Eye,
  FileDown,
  Plus,
  ChevronUp,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useLocation } from "wouter";

type InvoiceLineItemDraft = {
  label: string;
  quantity: number | string;
  unitPrice: number | string;
  unit: string;
  category: string;
  itemType?: "normal" | "text";
};

type NormalizedInvoiceLineItem = {
  label: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  category: string;
  amount: number;
  itemType: "normal" | "text";
};

const DEFAULT_INVOICE_ITEM: InvoiceLineItemDraft = {
  label: "",
  quantity: 1,
  unitPrice: 0,
  unit: "式",
  category: "",
  itemType: "normal",
};

const DEFAULT_TEXT_ITEM: InvoiceLineItemDraft = {
  label: "",
  quantity: 0,
  unitPrice: 0,
  unit: "",
  category: "",
  itemType: "text",
};

function toFiniteNumber(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeInvoiceItems(
  items: InvoiceLineItemDraft[]
): NormalizedInvoiceLineItem[] {
  return items
    .map(item => {
      const isText = item.itemType === "text";
      const label = String(item.label || "").trim();
      const quantity = isText ? 0 : toFiniteNumber(item.quantity);
      const unitPrice = isText ? 0 : toFiniteNumber(item.unitPrice);
      const amount = isText ? 0 : Math.round(quantity * unitPrice);

      return {
        label,
        quantity,
        unitPrice,
        unit: isText ? "" : (String(item.unit || "").trim() || "式"),
        category: String(item.category || "").trim(),
        amount,
        itemType: (isText ? "text" : "normal") as "normal" | "text",
      };
    })
    // テキスト行は摘要があれば残す。通常行は摘要かつ金額>0のもののみ。
    .filter(item => item.label && (item.itemType === "text" || item.amount > 0));
}

function calculateInvoiceTotals(items: NormalizedInvoiceLineItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const tax = 0;
  return { subtotal, tax, total: subtotal + tax };
}

function isInvoiceReadOnly(invoice?: { status?: string | null } | null) {
  return invoice?.status === "approved" || invoice?.status === "submitted";
}

// 作業員フローの5ステップ。「進む＝出面確定」なので①は月締めに入った時点で完了扱い。
// ⑤は提出後の「次」: 会社確認 → 支払（支払待ち/支払済みは作業員側でも見える）。
const CLOSING_STEPS = [
  { n: 1, title: "出面確定", desc: "マイ出面表で確定済み" },
  { n: 2, title: "交通費・領収書", desc: "交通費／経費を入力・領収書を添付" },
  { n: 3, title: "確認", desc: "請求書プレビューで金額を確認" },
  { n: 4, title: "提出", desc: "会社へ提出＝請求を確定" },
  { n: 5, title: "支払", desc: "会社確認のあと支払われます" },
];

/**
 * 作業員月締めフローの進捗ステッパー。
 * 黒×ゴールドのテーマに合わせ、完了＝ゴールド塗り／現在地＝ゴールド枠＋淡い光、未完了＝グレー。
 * stepDescOverrides で状況に応じた説明（例: ⑤ 支払済み 2/15）に差し替えられる。
 */
function ClosingStepper({ currentStep, stepDescOverrides }: { currentStep: number; stepDescOverrides?: Record<number, string> }) {
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-card/60 to-card/20 px-3 py-3 sm:px-4 sm:py-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5 sm:gap-3">
        {CLOSING_STEPS.map(step => {
          const done = step.n < currentStep;
          const current = step.n === currentStep;
          return (
            <div
              key={step.n}
              className={[
                "relative rounded-lg border px-3 py-2.5 transition-all duration-300",
                current
                  ? "border-gold/70 bg-gold/[0.06] shadow-[0_0_0_1px_rgba(212,175,55,0.25)]"
                  : done
                    ? "border-gold/30 bg-gold/[0.03]"
                    : "border-border/60",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    done
                      ? "bg-gold text-black"
                      : current
                        ? "border border-gold text-gold"
                        : "border border-border text-muted-foreground",
                  ].join(" ")}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : step.n}
                </span>
                <span
                  className={`text-sm font-medium ${current || done ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {step.title}
                </span>
              </div>
              <p className="mt-1 pl-8 text-[11px] leading-tight text-muted-foreground">
                {stepDescOverrides?.[step.n] || step.desc}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  not_required: {
    label: "対象外",
    className: "bg-slate-500/20 text-slate-300",
  },
  pending: { label: "未提出", className: "bg-amber-500/20 text-amber-400" },
  submitted: { label: "提出済", className: "bg-blue-500/20 text-blue-400" },
  approved: {
    label: "確認済",
    className: "bg-emerald-500/20 text-emerald-400",
  },
  rejected: { label: "差戻し", className: "bg-red-500/20 text-red-400" },
};

const CLOSING_STATUS_LABELS: Record<
  string,
  { label: string; className: string }
> = {
  open: { label: "開放中", className: "bg-slate-500/20 text-slate-300" },
  reopened: { label: "再開", className: "bg-emerald-500/20 text-emerald-300" },
  ready: { label: "準備完了", className: "bg-emerald-500/20 text-emerald-400" },
  closed: { label: "締め完了", className: "bg-blue-500/20 text-blue-400" },
  locked: { label: "ロック", className: "bg-amber-500/20 text-amber-400" },
};

function formatYen(amount: number) {
  return `¥${Number(amount || 0).toLocaleString("ja-JP")}`;
}

/** 請求書件名のデフォルト。closingMonth "YYYY-MM" → "YYYY年M月分請求書" */
function defaultInvoiceSubject(closingMonth: string): string {
  const [y, m] = (closingMonth || "").split("-");
  if (!y || !m) return "請求書";
  return `${y}年${Number(m)}月分請求書`;
}

function canWorkerEdit(
  closingStatus?: string | null,
  submissionStatus?: string | null
) {
  if (
    closingStatus === "closed" ||
    closingStatus === "locked" ||
    closingStatus === "completed"
  )
    return false;
  if (closingStatus === "ready") return submissionStatus === "rejected";
  return true;
}

export default function AppMyClosing() {
  const [location] = useLocation();
  // wouter の location はクエリ文字列を含まないため、URLパラメータは window.location.search から読む。
  // （ダッシュボードの「月締め提出」は ?projectId=..&month=.. を付けて遷移する）
  const params = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const queryProjectId = Number(params.get("projectId") || 0) || null;
  const queryMonth = params.get("month") || null;
  const queryEmployeeId = Number(params.get("employeeId") || 0) || undefined;
  const [closingMonth, setClosingMonth] = useState(
    queryMonth || format(new Date(), "yyyy-MM")
  );
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    queryProjectId
  );
  const [transportAmount, setTransportAmount] = useState(0);
  const [expenseAmount, setExpenseAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [showInvoiceReview, setShowInvoiceReview] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [invoiceSubject, setInvoiceSubject] = useState("");
  const [invoiceItems, setInvoiceItems] = useState<InvoiceLineItemDraft[]>([
    { ...DEFAULT_INVOICE_ITEM },
  ]);
  const loadedInvoiceDraftKeyRef = useRef<string | null>(null);
  const loadedSubmissionKeyRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const projectsQuery = trpc.attendance.myProjects.useQuery();
  const detailQuery = trpc.closing.mySubmission.useQuery(
    { projectId: selectedProjectId || 0, closingMonth, employeeId: queryEmployeeId },
    {
      enabled: !!selectedProjectId,
      refetchOnWindowFocus: true,
      refetchInterval: 15000,
    }
  );
  const overviewQuery = trpc.closing.workerMonthlyOverview.useQuery(
    { closingMonth, employeeId: queryEmployeeId, projectId: selectedProjectId || undefined },
    { enabled: !!closingMonth, refetchOnWindowFocus: true }
  );
  React.useEffect(() => {
    if (queryProjectId) setSelectedProjectId(queryProjectId);
    if (queryMonth) setClosingMonth(queryMonth);
  }, [queryProjectId, queryMonth]);
  const workerInvoiceDraftQuery = trpc.workerInvoice.getMyDraft.useQuery(
    { projectId: selectedProjectId || 0, closingMonth, employeeId: queryEmployeeId },
    { enabled: !!selectedProjectId && !!detailQuery.data?.eligible }
  );

  React.useEffect(() => {
    if (!selectedProjectId) return;
    const key = `${selectedProjectId}:${closingMonth}`;
    // サーバ値はこの現場×月を初めて読んだ時だけ反映する。以降のポーリング(15秒)再取得で
    // 未保存の入力（交通費・経費・メモ）を上書きしない＝「数秒後に金額が0に戻る」不具合の修正。
    if (loadedSubmissionKeyRef.current === key) return;
    if (detailQuery.isLoading) return;
    const sub = detailQuery.data?.submission;
    setTransportAmount(sub?.transportAmount || 0);
    setExpenseAmount(sub?.expenseAmount || 0);
    setNotes(sub?.notes || "");
    loadedSubmissionKeyRef.current = key;
  }, [detailQuery.data, detailQuery.isLoading, selectedProjectId, closingMonth]);

  React.useEffect(() => {
    loadedInvoiceDraftKeyRef.current = null;
    setInvoiceSubject("");
    setInvoiceItems([{ ...DEFAULT_INVOICE_ITEM }]);
  }, [selectedProjectId, closingMonth]);

  React.useEffect(() => {
    if (!selectedProjectId || !workerInvoiceDraftQuery.data) return;
    const draftKey = `${selectedProjectId}:${closingMonth}`;
    if (loadedInvoiceDraftKeyRef.current === draftKey) return;

    const draft = workerInvoiceDraftQuery.data as any;
    const draftItems = Array.isArray(draft.items) ? draft.items : [];
    setInvoiceSubject(draft.subject || "");
    setInvoiceItems(
      draftItems.length > 0
        ? draftItems.map((item: any) => ({
            label: item.label || "",
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice ?? 0,
            unit: item.unit || "式",
            category: item.category || "",
            itemType: item.itemType === "text" ? "text" : "normal",
          }))
        : [{ ...DEFAULT_INVOICE_ITEM }]
    );
    loadedInvoiceDraftKeyRef.current = draftKey;
  }, [workerInvoiceDraftQuery.data, selectedProjectId, closingMonth]);

  const saveMutation = trpc.closing.saveMySubmission.useMutation({
    onSuccess: () => {
      toast.success("月締め内容を保存しました");
      detailQuery.refetch();
    },
    onError: e => toast.error(`保存エラー: ${e.message}`),
  });

  const saveWorkerDraftMutation = trpc.workerInvoice.saveMyDraft.useMutation();
  const submitWorkerInvoiceMutation =
    trpc.workerInvoice.submitMyInvoice.useMutation();

  const submitMutation = trpc.closing.submitMySubmission.useMutation({
    onSuccess: () => {
      toast.success("月締めを提出しました");
      detailQuery.refetch();
    },
    onError: e => toast.error(`提出エラー: ${e.message}`),
  });

  const uploadMutation = trpc.closing.uploadMyReceiptDocument.useMutation({
    onSuccess: () => {
      toast.success("領収書をアップロードしました");
      detailQuery.refetch();
    },
    onError: e => toast.error(`アップロードエラー: ${e.message}`),
  });

  const clearMutation = trpc.closing.deleteMyReceiptDocument.useMutation({
    onSuccess: () => {
      toast.success("領収書を解除しました");
      detailQuery.refetch();
    },
    onError: e => toast.error(`解除エラー: ${e.message}`),
  });
  // 旧仕様の単一領収書(receiptFileUrl)を作業員が解除するためのミューテーション。
  const clearLegacyReceiptMutation = trpc.closing.clearMyReceipt.useMutation({
    onSuccess: () => {
      toast.success("領収書を解除しました");
      detailQuery.refetch();
    },
    onError: e => toast.error(`解除エラー: ${e.message}`),
  });

  // 代行モード(?employeeId=)では対象作業員の当月出面がある現場を出す。
  // attendance.myProjects はログイン中の管理者自身の現場を返すため、代行では使わない（データ混在の原因）。
  const projects = queryEmployeeId
    ? ((overviewQuery.data as any)?.projectLines || []).map((line: any) => ({ id: Number(line.projectId), name: line.projectName }))
    : projectsQuery.data || [];
  const workerInvoicesQuery = trpc.workerInvoice.listMyInvoices.useQuery({ employeeId: queryEmployeeId });
  const trpcUtils = trpc.useUtils();
  const detail: any = detailQuery.data ?? null;
  const monthlyOverview = detail?.monthlyOverview || overviewQuery.data || null;
  const isMonthlyTarget = Boolean(monthlyOverview?.isTarget || detail?.eligible);
  const receiptRequired = transportAmount > 0 || expenseAmount > 0;
  const busy =
    saveMutation.isPending ||
    submitMutation.isPending ||
    uploadMutation.isPending ||
    clearMutation.isPending;
  const canEdit =
    !!detail?.eligible &&
    !!detail?.closing &&
    canWorkerEdit(detail.closing.status, detail.submission?.status);
  const selectedProject = useMemo(
    () => projects.find((p: any) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );
  const currentWorkerInvoice = useMemo(
    () =>
      (workerInvoicesQuery.data || []).find(
        (invoice: any) =>
          invoice.projectId === selectedProjectId &&
          invoice.closingMonth === closingMonth
      ) || (workerInvoiceDraftQuery.data as any) || null,
    [
      workerInvoicesQuery.data,
      workerInvoiceDraftQuery.data,
      selectedProjectId,
      closingMonth,
    ]
  );
  const invoiceReadOnly = isInvoiceReadOnly(currentWorkerInvoice);
  const invoiceBusy =
    isCreatingInvoice ||
    saveWorkerDraftMutation.isPending ||
    submitWorkerInvoiceMutation.isPending;
  const normalizedInvoiceItems = useMemo(
    () => normalizeInvoiceItems(invoiceItems),
    [invoiceItems]
  );
  const invoiceTotals = useMemo(
    () => calculateInvoiceTotals(normalizedInvoiceItems),
    [normalizedInvoiceItems]
  );
  const invoiceSubjectPreview =
    invoiceSubject.trim() || defaultInvoiceSubject(closingMonth);
  // 作業員フローの5ステップ（①出面確定 ②交通費・領収書 ③確認 ④提出 ⑤支払）の現在地。
  // 「進む＝出面確定」なので①は対象月なら完了扱い。提出後は⑤（会社確認→支払待ち→支払済み）へ。
  const submissionStatusForStep = detail?.submission?.status as string | undefined;
  const isSubmittedStep = ["submitted", "accepted", "ready_to_close", "closed", "approved"].includes(submissionStatusForStep || "");
  const hasMoneyOrReceipt = transportAmount > 0 || expenseAmount > 0 || !!detail?.submission?.receiptUploaded;
  // 提出後の支払状況（支払待ち/支払済み）。選択中の現場分を参照。
  const myPaymentQuery = trpc.closing.myPaymentStatus.useQuery(
    { closingMonth, employeeId: queryEmployeeId },
    { enabled: isSubmittedStep, staleTime: 30_000 }
  );
  const myPaymentLine = (myPaymentQuery.data?.lines || []).find(
    (l: any) => Number(l.projectId) === Number(selectedProjectId)
  );
  const isPaid = myPaymentLine?.status === "paid";
  const currentStep = isSubmittedStep ? (isPaid ? 6 : 5) : hasMoneyOrReceipt ? 3 : 2;
  const paymentStepDesc = !isSubmittedStep
    ? undefined
    : isPaid
      ? `支払済み${myPaymentLine?.paidAt ? `（${format(new Date(myPaymentLine.paidAt), "M/d")}）` : ""}`
      : submissionStatusForStep === "approved"
        ? "承認済み・支払待ちです"
        : "会社が内容を確認しています";
  // 自動生成の状態・警告（空になった理由を画面に表示して原因を分かるようにする）。
  const workerInvoiceDraftData = workerInvoiceDraftQuery.data as any;
  const workerInvoiceWarnings: string[] = workerInvoiceDraftData?.warnings || [];
  const workerInvoiceAutoGenerated: boolean = !!workerInvoiceDraftData?.autoGenerated;
  const supportingDocumentStatus = receiptRequired
    ? detail?.submission?.receiptUploaded
      ? "添付済"
      : "未添付"
    : "不要";
  const canEditInvoice =
    !!detail?.eligible &&
    !!detail?.closing &&
    !["closed", "locked", "completed"].includes(detail.closing.status || "") &&
    !invoiceReadOnly;

  const buildWorkerDraftInput = () => ({
    employeeId: queryEmployeeId,
    projectId: selectedProjectId!,
    closingMonth,
    subject: invoiceSubject.trim() || undefined,
    items: normalizedInvoiceItems.map(item => ({
      label: item.label,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unit: item.unit,
      category: item.category,
      itemType: item.itemType,
    })),
  });

  const updateInvoiceItem = (
    idx: number,
    patch: Partial<InvoiceLineItemDraft>
  ) => {
    setInvoiceItems(prev =>
      prev.map((item, itemIdx) =>
        itemIdx === idx ? { ...item, ...patch } : item
      )
    );
  };

  const removeInvoiceItem = (idx: number) => {
    setInvoiceItems(prev =>
      prev.length === 1
        ? [{ ...DEFAULT_INVOICE_ITEM }]
        : prev.filter((_, itemIdx) => itemIdx !== idx)
    );
  };

  // 行の並び替え（上へ: dir=-1 / 下へ: dir=+1）
  const moveInvoiceItem = (idx: number, dir: -1 | 1) => {
    setInvoiceItems(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const openInvoiceConfirmation = () => {
    if (!selectedProjectId || !canEditInvoice || invoiceBusy) return;
    if (normalizedInvoiceItems.length === 0) {
      toast.error(
        "請求書に作成できる明細がありません。明細名・数量・単価を確認してください。"
      );
      return;
    }
    setShowInvoiceReview(true);
  };

  const handleSave = () => {
    if (!selectedProjectId) return;
    saveMutation.mutate({
      projectId: selectedProjectId,
      closingMonth,
      transportAmount,
      expenseAmount,
      notes,
      employeeId: queryEmployeeId,
    });
    if (canEditInvoice) saveWorkerDraftMutation.mutate(buildWorkerDraftInput());
  };

  const handleSubmit = () => {
    if (!selectedProjectId) return;
    submitMutation.mutate({ projectId: selectedProjectId, closingMonth, employeeId: queryEmployeeId });
  };

  const handleOneClickInvoice = async () => {
    if (!selectedProjectId || invoiceBusy) return;
    if (normalizedInvoiceItems.length === 0) {
      toast.error(
        "請求書に作成できる明細がありません。明細名・数量・単価を確認してください。"
      );
      return;
    }

    setIsCreatingInvoice(true);
    try {
      await saveWorkerDraftMutation.mutateAsync(buildWorkerDraftInput());
      const submitted = await submitWorkerInvoiceMutation.mutateAsync({
        employeeId: queryEmployeeId,
        projectId: selectedProjectId,
        closingMonth,
      });

      let invoiceId = (submitted as any)?.id;
      if (!invoiceId) {
        const list = await trpcUtils.workerInvoice.listMyInvoices.fetch();
        const match = [...(list || [])]
          .reverse()
          .find(
            (v: any) =>
              v.projectId === selectedProjectId &&
              v.closingMonth === closingMonth
          );
        invoiceId = match?.id;
      }

      toast.success("請求書を作成しました。PDFを準備しています。");

      if (invoiceId) {
        try {
          const pdf = await trpcUtils.workerInvoice.downloadMyInvoicePdf.fetch({
            invoiceId,
          });
          window.open(pdf.url, "_blank");
        } catch (pdfError: any) {
          toast.error(
            `請求書は作成済みですが、PDFを開けませんでした: ${pdfError.message}`
          );
        }
      } else {
        toast.error(
          "請求書は作成済みですが、PDF用の請求書IDを取得できませんでした。請求書一覧からPDFを開いてください。"
        );
      }

      setShowInvoiceReview(false);
      await workerInvoicesQuery.refetch();
    } catch (e: any) {
      toast.error(`請求書作成エラー: ${e.message}`);
    } finally {
      setIsCreatingInvoice(false);
    }
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
        employeeId: queryEmployeeId,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {detailQuery.data?.actorEmployeeId && detailQuery.data?.employee?.id && detailQuery.data.actorEmployeeId !== detailQuery.data.employee.id
              ? "月締め提出（代行）"
              : "月締め提出"}
          </h1>
          <p className="text-sm text-muted-foreground">
            交通費・経費・領収書を提出して、月締めを完了します。
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="w-full sm:w-[180px]">
            <Label className="text-xs text-muted-foreground">対象月</Label>
            <Input
              type="month"
              value={closingMonth}
              onChange={e => setClosingMonth(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-[260px]">
            <Label className="text-xs text-muted-foreground">現場</Label>
            <Select
              value={selectedProjectId?.toString() || ""}
              onValueChange={v => setSelectedProjectId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="現場を選択" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {detailQuery.data && (
        <div className="text-sm text-muted-foreground">
          <span className="mr-4">対象者: {detailQuery.data.employee?.nameKanji || detailQuery.data.employee?.nameRomaji || "-"}</span>
          <span className="mr-4">現場: {detailQuery.data.project?.name || "-"}</span>
          <span>対象月: {closingMonth.replace(/^(\d{4})-(\d{2})$/, "$1年$2月")}</span>
        </div>
      )}

      {selectedProjectId && isMonthlyTarget && detail && (
        <ClosingStepper currentStep={currentStep} stepDescOverrides={paymentStepDesc ? { 5: paymentStepDesc } : undefined} />
      )}

      {monthlyOverview?.isTarget && monthlyOverview.projectLines?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>現場別明細</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">現場をタップすると、その現場の月締めを作業できます。</p>
            {monthlyOverview.projectLines.map((line: any) => (
              <button
                type="button"
                key={line.projectId}
                onClick={() => setSelectedProjectId(Number(line.projectId))}
                className={`w-full text-left text-sm border rounded p-2 transition-colors hover:bg-muted/30 ${
                  Number(selectedProjectId) === Number(line.projectId) ? "border-gold bg-gold/10" : ""
                }`}
              >
                <div className="font-medium">{line.projectName}</div>
                {/* 工数(時間数)は現時点で運用に不要なため非表示。出勤日数と残業のみ表示。 */}
                <div className="text-muted-foreground">出勤日数: {line.attendanceDays}日 / 残業: {line.overtimeHours}h</div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <MonthlyInvoicePanel closingMonth={closingMonth} employeeId={queryEmployeeId} />
{!selectedProjectId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>現場と対象月を選択してください</p>
          </CardContent>
        </Card>
      ) : detailQuery.isLoading || overviewQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </CardContent>
        </Card>
      ) : overviewQuery.error?.message?.includes("target employee required") ? (
        <Card>
          <CardContent className="py-10 space-y-3">
            <div className="text-lg font-medium">対象作業員を選択してください</div>
          </CardContent>
        </Card>
      ) : !isMonthlyTarget ? (
        <Card>
          <CardContent className="py-10 space-y-3">
            <div className="text-lg font-medium">提出対象外です</div>
            <p className="text-sm text-muted-foreground">
              {detail?.nonTargetReason === "no_attendance_for_selected_project"
                ? `${selectedProject?.name || "選択中の現場"} ではこの月の出面が見つかりません。別の現場を選択してください。`
                : `${closingMonth} の出面実績が見つからないため提出対象外です。`}
            </p>
          </CardContent>
        </Card>
      ) : !detail ? (
        // 出面はあるが提出明細(detail)がまだ取れていない/取得失敗時。null を参照してクラッシュさせない。
        <Card>
          <CardContent className="py-10 space-y-3 text-center">
            {detailQuery.error ? (
              <>
                <div className="text-lg font-medium">月締め情報の取得に失敗しました</div>
                <p className="text-sm text-muted-foreground">{detailQuery.error.message}</p>
              </>
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-gold mx-auto" />
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
                <span>
                  {detail.project?.name || selectedProject?.name} /{" "}
                  {closingMonth}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {detail.closing?.status && (
                    <span
                      className={`px-2 py-1 rounded text-xs ${CLOSING_STATUS_LABELS[detail.closing.status]?.className || "bg-muted"}`}
                    >
                      {CLOSING_STATUS_LABELS[detail.closing.status]?.label ||
                        detail?.closing?.status}
                    </span>
                  )}
                  {detail.submission?.status && (
                    <span
                      className={`px-2 py-1 rounded text-xs ${STATUS_LABELS[detail.submission.status]?.className || "bg-muted"}`}
                    >
                      {STATUS_LABELS[detail.submission.status]?.label ||
                        detail?.submission?.status}
                    </span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {detail?.submission?.status === "rejected" && (
                <div className="text-sm bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3 text-red-300 space-y-1">
                  <div className="font-medium">会社から差し戻されました</div>
                  {(detail as any)?.sendBackReason && (
                    <div>理由: {(detail as any).sendBackReason}</div>
                  )}
                  <div className="text-red-300/80">内容を修正して、もう一度提出してください。</div>
                </div>
              )}
              {detail?.submission?.status === "submitted" && (
                <div className="text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300">
                  提出済みです。会社が内容を確認しています。差し戻しがあればホームとこの画面に表示されます。
                </div>
              )}
              {detail?.submission?.status === "approved" && !isPaid && (
                <div className="text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-300">
                  会社の確認が完了しました。支払待ちです（支払われるとステップ⑤に表示されます）。
                </div>
              )}
              {isPaid && (
                <div className="text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 text-emerald-300">
                  支払済みです{myPaymentLine?.totalAmount ? `（${formatYen(myPaymentLine.totalAmount)}）` : ""}。この月の流れはすべて完了しました。
                </div>
              )}
              {!canEdit && (
                <div className="text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300">
                  この月締めはすでに確定済みのため、作業員側では編集できません。
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <SummaryCard
                  label="交通費"
                  value={formatYen(transportAmount)}
                />
                <SummaryCard label="経費" value={formatYen(expenseAmount)} />
                <SummaryCard
                  label="領収書"
                  value={
                    receiptRequired
                      ? detail.submission?.receiptUploaded
                        ? "添付済"
                        : "必要"
                      : "不要"
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>交通費（円）</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={transportAmount === 0 ? "" : transportAmount}
                    onChange={e => setTransportAmount(Number(e.target.value) || 0)}
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground">
                    往復交通費や事後報告分を入力します。
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>経費（円）</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={expenseAmount === 0 ? "" : expenseAmount}
                    onChange={e => setExpenseAmount(Number(e.target.value) || 0)}
                    disabled={!canEdit}
                  />
                  <p className="text-xs text-muted-foreground">
                    材料立替やその他経費があれば入力します。
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>メモ</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={!canEdit}
                  placeholder="補足があれば入力"
                />
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-gold" />
                  <span className="font-medium">領収書</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  領収書・ETC・会社カード利用明細などを添付できます。
                  交通費・経費が0円でも証憑として提出できます。
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpeg,.jpg,.png,image/jpeg,image/png,application/pdf"
                  onChange={e => handleReceiptFile(e.target.files?.[0] || null)}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant={
                      detail.submission?.receiptUploaded ? "default" : "outline"
                    }
                    disabled={!canEdit || busy}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {detail.submission?.receiptUploaded
                      ? "領収書を差し替え"
                      : "領収書をアップロード"}
                  </Button>
                  <div className="w-full space-y-2">
                    {detail.submission?.documents?.map((doc: any) => (
                      <div key={doc.id} className="flex items-center gap-2">
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline inline-flex items-center gap-1 max-w-[320px] truncate">
                          <LinkIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{doc.fileName}</span>
                        </a>
                        <Button variant="ghost" size="icon" className="text-red-400" disabled={!canEdit || busy} onClick={() => clearMutation.mutate({ projectId: selectedProjectId, closingMonth, documentId: doc.id, employeeId: queryEmployeeId })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {detail?.submission?.receiptFileUrl && (
                      <div className="flex items-center gap-2">
                        <a href={detail?.submission?.receiptFileUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline inline-flex items-center gap-1 max-w-[320px] truncate">
                          <LinkIcon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{detail?.submission?.receiptFileName || "領収書(旧)"}</span>
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-400"
                          disabled={!canEdit || busy || clearLegacyReceiptMutation.isPending}
                          onClick={() => clearLegacyReceiptMutation.mutate({ projectId: selectedProjectId!, closingMonth, employeeId: queryEmployeeId })}
                          aria-label="領収書を削除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">作業員請求書を作成</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {currentWorkerInvoice?.status === "approved" && (
                    <div className="text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300">
                      承認済みの請求書は編集できません。内容確認やPDF出力は下の請求書一覧から行ってください。
                    </div>
                  )}

                  {currentWorkerInvoice?.status === "submitted" && (
                    <div className="text-sm bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-blue-300">
                      提出済みの請求書は、差戻しされるまで編集できません。
                    </div>
                  )}

                  {currentWorkerInvoice?.status === "returned" && (
                    <div className="text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300">
                      差戻し中の請求書です。明細を修正して再度作成できます。
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>請求書 件名</Label>
                    <Input
                      value={invoiceSubject}
                      onChange={e => setInvoiceSubject(e.target.value)}
                      placeholder={defaultInvoiceSubject(closingMonth)}
                      disabled={!canEditInvoice || invoiceBusy}
                    />
                    <p className="text-xs text-muted-foreground">
                      PDFに表示する請求内容の見出しです。未入力の場合は対象月から自動設定します。
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <Label>請求明細</Label>
                        <p className="text-xs text-muted-foreground">
                          明細名が空の行、または金額0円の通常行は請求書に含めません。テキスト行は見出し・区切りとして残ります（行は上下ボタンで並び替え可）。
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setInvoiceItems(prev => [
                              ...prev,
                              { ...DEFAULT_INVOICE_ITEM },
                            ])
                          }
                          disabled={!canEditInvoice || invoiceBusy}
                        >
                          行追加
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setInvoiceItems(prev => [
                              ...prev,
                              { ...DEFAULT_TEXT_ITEM },
                            ])
                          }
                          disabled={!canEditInvoice || invoiceBusy}
                        >
                          テキスト追加
                        </Button>
                      </div>
                    </div>

                    {workerInvoiceAutoGenerated && (
                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                        出面と単価設定から明細を自動計算しました。内容を確認し、必要に応じて編集してください。
                      </div>
                    )}
                    {workerInvoiceWarnings.length > 0 && (
                      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 space-y-1">
                        {workerInvoiceWarnings.map((warning, warningIdx) => (
                          <p key={warningIdx}>・{warning}</p>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3">
                      {invoiceItems.map((item, idx) => {
                        const rowAmount = Math.round(
                          toFiniteNumber(item.quantity) *
                            toFiniteNumber(item.unitPrice)
                        );
                        if (item.itemType === "text") {
                          return (
                            <div
                              key={idx}
                              className="rounded-lg border border-dashed border-border bg-card/40 p-3 flex items-end gap-2"
                            >
                              <div className="flex-1 space-y-1">
                                <Label className="text-xs text-muted-foreground">テキスト行（見出し・区切り）</Label>
                                <Input
                                  placeholder="例：読売ランド新南山水族館 ぶん"
                                  value={item.label}
                                  onChange={e => updateInvoiceItem(idx, { label: e.target.value })}
                                  disabled={!canEditInvoice || invoiceBusy}
                                />
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveInvoiceItem(idx, -1)} disabled={!canEditInvoice || invoiceBusy || idx === 0} aria-label="行を上へ">
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveInvoiceItem(idx, 1)} disabled={!canEditInvoice || invoiceBusy || idx === invoiceItems.length - 1} aria-label="行を下へ">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-400 h-8 w-8" onClick={() => removeInvoiceItem(idx)} disabled={!canEditInvoice || invoiceBusy} aria-label="テキスト行を削除">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div
                            key={idx}
                            className="rounded-lg border border-border bg-card/60 p-3 space-y-3 md:grid md:grid-cols-12 md:gap-3 md:space-y-0 md:items-end"
                          >
                            <div className="space-y-1 md:col-span-3">
                              <Label className="text-xs text-muted-foreground">
                                明細名
                              </Label>
                              <Input
                                placeholder="例：現場作業費"
                                value={item.label}
                                onChange={e =>
                                  updateInvoiceItem(idx, {
                                    label: e.target.value,
                                  })
                                }
                                disabled={!canEditInvoice || invoiceBusy}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3 md:contents">
                              <div className="space-y-1 md:col-span-1">
                                <Label className="text-xs text-muted-foreground">
                                  数量
                                </Label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.01"
                                  value={item.quantity}
                                  onChange={e =>
                                    updateInvoiceItem(idx, {
                                      quantity: e.target.value,
                                    })
                                  }
                                  disabled={!canEditInvoice || invoiceBusy}
                                />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <Label className="text-xs text-muted-foreground">
                                  単価
                                </Label>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  step="1"
                                  value={item.unitPrice}
                                  onChange={e =>
                                    updateInvoiceItem(idx, {
                                      unitPrice: e.target.value,
                                    })
                                  }
                                  disabled={!canEditInvoice || invoiceBusy}
                                />
                              </div>
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label className="text-xs text-muted-foreground">
                                単位
                              </Label>
                              <Input
                                value={item.unit}
                                onChange={e =>
                                  updateInvoiceItem(idx, {
                                    unit: e.target.value,
                                  })
                                }
                                placeholder="式"
                                disabled={!canEditInvoice || invoiceBusy}
                              />
                            </div>
                            <div className="rounded-md bg-muted/40 px-3 py-2 md:col-span-3">
                              <div className="text-xs text-muted-foreground">
                                金額
                              </div>
                              <div className="font-semibold text-right md:text-left">
                                {formatYen(rowAmount)}
                              </div>
                            </div>
                            <div className="flex justify-end gap-1 md:col-span-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => moveInvoiceItem(idx, -1)}
                                disabled={!canEditInvoice || invoiceBusy || idx === 0}
                                aria-label="行を上へ"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => moveInvoiceItem(idx, 1)}
                                disabled={!canEditInvoice || invoiceBusy || idx === invoiceItems.length - 1}
                                aria-label="行を下へ"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-red-400 h-8 w-8"
                                onClick={() => removeInvoiceItem(idx)}
                                disabled={!canEditInvoice || invoiceBusy}
                                aria-label="明細行を削除"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">小計</span>
                      <span className="font-medium">
                        {formatYen(invoiceTotals.subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">消費税（現在は0円固定）</span>
                      <span className="font-medium">
                        {formatYen(invoiceTotals.tax)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 text-base">
                      <span className="font-semibold">合計</span>
                      <span className="font-bold text-gold">
                        {formatYen(invoiceTotals.total)}
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={openInvoiceConfirmation}
                    className="w-full md:w-auto"
                    disabled={!canEditInvoice || invoiceBusy}
                  >
                    {invoiceBusy && (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    )}
                    請求書作成前確認
                  </Button>
                </CardContent>
              </Card>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  disabled={!canEdit || busy}
                  onClick={handleSave}
                >
                  {saveMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  )}
                  保存
                </Button>
                <Button
                  disabled={!canEdit || busy}
                  onClick={() => {
                    if (
                      receiptRequired &&
                      !detail.submission?.receiptUploaded
                    ) {
                      toast.error(
                        "領収書が必要です。提出前にアップロードしてください。"
                      );
                      return;
                    }
                    setShowReview(true);
                  }}
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
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
              <CardTitle>請求書一覧</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                作成済みの請求書をプレビュー・エクスポートできます。
              </p>
              {(workerInvoicesQuery.data || []).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  請求書データはまだありません。
                </div>
              ) : (
                <div className="space-y-2">
                  {(workerInvoicesQuery.data || []).map((invoice: any) => (
                    <div
                      key={invoice.id}
                      className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                    >
                      <div>
                        <div className="font-medium">
                          {invoice.subject ||
                            defaultInvoiceSubject(invoice.closingMonth)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          #{invoice.id} / {invoice.closingMonth} /{" "}
                          {INVOICE_STATUS_LABELS[invoice.status]?.label || invoice.status}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const data =
                              await trpcUtils.workerInvoice.previewMyInvoice.fetch(
                                { invoiceId: invoice.id }
                              );
                            toast.success(`プレビュー: ${data.model.subject}`);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" /> プレビュー
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            const pdf =
                              await trpcUtils.workerInvoice.downloadMyInvoicePdf.fetch(
                                { invoiceId: invoice.id }
                              );
                            window.open(pdf.url, "_blank");
                          }}
                        >
                          <FileDown className="h-4 w-4 mr-1" /> PDFダウンロード
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            const data =
                              await trpcUtils.workerInvoice.exportMyInvoicePackage.fetch(
                                { invoiceId: invoice.id }
                              );
                            if (data.invoicePdf?.url)
                              window.open(data.invoicePdf.url, "_blank");
                            toast.success(
                              `エクスポート準備完了（添付資料 ${data.documents?.length || 0}件）`
                            );
                          }}
                        >
                          <FileDown className="h-4 w-4 mr-1" /> エクスポート
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>提出の流れ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground font-medium">① 出面確定</span>
                ：マイ出面表で確定済みのため、ここでの再確認は不要です。
              </p>
              <p>
                <span className="text-foreground font-medium">② 交通費・領収書</span>
                ：交通費／経費を入力し、金額がある場合は領収書を添付します。
              </p>
              <p>
                <span className="text-foreground font-medium">③ 確認</span>
                ：請求書プレビューで金額を確認します（自動計算のためほぼ誤りはありません）。
              </p>
              <p>
                <span className="text-foreground font-medium">④ 提出</span>
                ：「提出」を押すと会社へ請求が確定し、管理者側の月締めに反映されます。
              </p>
            </CardContent>
          </Card>

          {/* ── Worker Invoice Section (post-submission view) ── */}
          {detail?.submission?.status === "submitted" || detail?.submission?.status === "approved" ? (
            <WorkerInvoiceSection projectId={selectedProjectId!} closingMonth={closingMonth} employeeId={queryEmployeeId} />
          ) : null}

          <Dialog
            open={showInvoiceReview}
            onOpenChange={open => {
              if (!invoiceBusy) setShowInvoiceReview(open);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>請求書作成前確認</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">現場</div>
                    <div className="font-medium">
                      {detail?.project?.name || selectedProject?.name}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">対象月</div>
                    <div className="font-medium">{closingMonth}</div>
                  </div>
                  <div className="rounded-md border p-3 md:col-span-2">
                    <div className="text-muted-foreground text-xs">
                      請求書 件名
                    </div>
                    <div className="font-medium">{invoiceSubjectPreview}</div>
                  </div>
                  <div className="rounded-md border p-3 md:col-span-2">
                    <div className="text-muted-foreground text-xs">
                      添付資料・領収書
                    </div>
                    <div className="font-medium">
                      {supportingDocumentStatus}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border">
                  <div className="border-b px-3 py-2 font-medium">請求明細</div>
                  <div className="divide-y">
                    {normalizedInvoiceItems.map((item, idx) => (
                      <div
                        key={`${item.label}-${idx}`}
                        className="p-3 space-y-1 md:flex md:items-center md:justify-between md:gap-3 md:space-y-0"
                      >
                        {item.itemType === "text" ? (
                          <div className="font-medium text-muted-foreground">{item.label}</div>
                        ) : (
                          <>
                            <div>
                              <div className="font-medium">{item.label}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.quantity.toLocaleString("ja-JP")} {item.unit}{" "}
                                × {formatYen(item.unitPrice)}
                              </div>
                            </div>
                            <div className="font-semibold text-right">
                              {formatYen(item.amount)}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">小計</span>
                    <span className="font-medium">
                      {formatYen(invoiceTotals.subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">消費税（現在は0円固定）</span>
                    <span className="font-medium">
                      {formatYen(invoiceTotals.tax)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base">
                    <span className="font-semibold">合計</span>
                    <span className="font-bold text-gold">
                      {formatYen(invoiceTotals.total)}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  「この内容で請求書を作成」を押すと、下書きを保存して請求書を提出し、PDFを開きます。
                </p>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowInvoiceReview(false)}
                  disabled={invoiceBusy}
                >
                  戻る
                </Button>
                <Button
                  onClick={handleOneClickInvoice}
                  disabled={invoiceBusy || normalizedInvoiceItems.length === 0}
                >
                  {invoiceBusy && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  )}
                  この内容で請求書を作成
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showReview} onOpenChange={setShowReview}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>月締め提出前確認</DialogTitle>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="rounded-md border p-3">
                  <div className="text-muted-foreground text-xs">現場</div>
                  <div className="font-medium">
                    {detail?.project?.name || selectedProject?.name}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">対象月</div>
                    <div className="font-medium">{closingMonth}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">領収書</div>
                    <div className="font-medium">
                      {receiptRequired
                        ? detail?.submission?.receiptUploaded
                          ? "添付済"
                          : "未添付"
                        : "不要"}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">交通費</div>
                    <div className="font-medium">
                      {formatYen(transportAmount)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-muted-foreground text-xs">経費</div>
                    <div className="font-medium">
                      {formatYen(expenseAmount)}
                    </div>
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
                <Button variant="outline" onClick={() => setShowReview(false)}>
                  戻る
                </Button>
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
      <div className="text-xl font-bold flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-gold" />
        {value}
      </div>
    </div>
  );
}

/**
 * 月次請求書（全現場まとめ）パネル。
 * ・請求書は月に1枚（全現場まとめ、FREEEの見本と同じ形）。
 * ・全現場の月締め提出が完了すると発行できる（②B: 途中でも下書きプレビューは見える）。
 * ・各現場の月締め状況をチェックリストで表示。交通費0円は「なし(0円)」＝入力済み扱い。
 */
function MonthlyInvoicePanel({ closingMonth, employeeId }: { closingMonth: string; employeeId?: number }) {
  const monthlyQuery = trpc.workerInvoice.getMyMonthlyInvoice.useQuery(
    { closingMonth, employeeId },
    { enabled: !!closingMonth }
  );
  const data = monthlyQuery.data as any;
  const pdfViewer = usePdfViewer();

  const issueMutation = trpc.workerInvoice.issueMyMonthlyInvoice.useMutation({
    onSuccess: (res: any) => {
      toast.success(`請求書を発行しました（${res?.invoiceNumber || ""}）`);
      if (res?.url) pdfViewer.open(res.url, `${res?.subject || "請求書"}.pdf`, res?.subject || "請求書");
    },
    onError: (e) => toast.error(`発行エラー: ${e.message}`),
  });

  if (monthlyQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }
  if (!data || !Array.isArray(data.sites) || data.sites.length === 0) return null;

  const { sites, canIssue, pendingSites, draft } = data;
  const items: any[] = draft?.items || [];

  return (
    <>
    {pdfViewer.dialog}
    <Card>
      <CardHeader>
        <CardTitle>月次請求書（全現場まとめ）</CardTitle>
        <p className="text-xs text-muted-foreground">
          請求書は月に1枚（全現場まとめ）です。全現場の月締め提出が完了すると発行できます。下は現在の自動計算プレビューです。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 現場ごとの月締め状況（チェックリスト） */}
        <div className="space-y-2">
          <div className="text-sm font-medium">現場ごとの月締め状況</div>
          {sites.map((s: any) => (
            <div
              key={s.projectId}
              className="flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-2"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{s.projectName}</div>
                <div className="text-xs text-muted-foreground">
                  出勤{s.attendanceDays}日 ・ 交通費 {s.transportAmount > 0 ? formatYen(s.transportAmount) : "なし(0円)"}
                  {s.expenseAmount > 0 ? ` ・ 経費 ${formatYen(s.expenseAmount)}` : ""}
                </div>
              </div>
              <span
                className={`shrink-0 text-xs px-2 py-1 rounded-full border ${
                  s.submitted
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }`}
              >
                {s.submitted ? "提出済み" : "未提出"}
              </span>
            </div>
          ))}
        </div>

        {/* 発行ゲート */}
        {canIssue ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 flex items-center justify-between gap-3 flex-wrap">
            <span>全現場の月締めが完了しました。請求書を発行できます。</span>
            <Button
              size="sm"
              onClick={() => issueMutation.mutate({ closingMonth, employeeId })}
              disabled={issueMutation.isPending || items.length === 0}
              className="bg-gold text-background hover:bg-gold-dim"
            >
              {issueMutation.isPending ? "発行中..." : "請求書を発行（PDF）"}
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            未提出の現場があります：{(pendingSites || []).join("、")}。全現場の月締め提出が終わると請求書を発行できます。
          </div>
        )}

        {/* 集計プレビュー（自動計算） */}
        <div className="space-y-1">
          <div className="text-sm font-medium">請求プレビュー（自動計算）</div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              まだ明細がありません。マイ出面表の出面や単価設定をご確認ください。
            </p>
          ) : (
            <div className="rounded-lg border divide-y divide-border">
              {items.map((it: any, idx: number) =>
                it.itemType === "text" ? (
                  <div key={idx} className="px-3 py-2 text-sm font-semibold bg-muted/30">
                    {it.label}
                  </div>
                ) : (
                  <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{it.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {it.quantity}
                        {it.unit} × {formatYen(it.unitPrice)}（税{it.taxRate || 0}%）
                      </div>
                    </div>
                    <div className="shrink-0 font-medium">{formatYen(it.amount)}</div>
                  </div>
                )
              )}
            </div>
          )}
          {items.length > 0 && (
            <div className="flex justify-end gap-6 text-sm pt-1">
              <span className="text-muted-foreground">小計 {formatYen(draft.subtotal)}</span>
              <span className="text-muted-foreground">消費税 {formatYen(draft.taxAmount)}</span>
              <span className="font-semibold text-gold">合計 {formatYen(draft.totalAmount)}</span>
            </div>
          )}
        </div>

        {/* 要確認（自動計算の警告） */}
        {Array.isArray(draft?.warnings) && draft.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 space-y-1">
            {draft.warnings.map((w: string, i: number) => (
              <p key={i}>・{w}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </>
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

function WorkerInvoiceSection({ projectId, closingMonth, employeeId }: { projectId: number; closingMonth: string; employeeId?: number }) {
  const draftQuery = trpc.workerInvoice.getMyDraft.useQuery({ projectId, closingMonth, employeeId });
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
      setSubject(invoice.subject || defaultInvoiceSubject(closingMonth));
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
    saveDraftMutation.mutate({ projectId, closingMonth, subject, notes, items, employeeId });
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
    saveDraftMutation.mutate({ projectId, closingMonth, subject, notes, items, employeeId }, {
      onSuccess: () => {
        submitInvoiceMutation.mutate({ projectId, closingMonth, employeeId });
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
            <div className="font-medium">{formatYen(canEdit ? subtotal : (invoice.subtotalAmount ?? 0))}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">消費税</div>
            <div className="font-medium">{formatYen(canEdit ? tax : (invoice.taxAmount ?? 0))}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">合計</div>
            <div className="font-bold text-lg">{formatYen(canEdit ? total : (invoice.totalAmount ?? 0))}</div>
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
              onClick={() => downloadPdfMutation.mutate({ invoiceId: invoice.id! })}
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
