import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import type { ReactNode } from "react";
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
import { Loader2, Lock, LockOpen, FileCheck, Upload, Link as LinkIcon, Trash2, FileDown, Clock, CheckCircle, AlertCircle, XCircle, Receipt, Send, RotateCcw, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: "開放中", className: "bg-slate-500/20 text-slate-300" },
  ready: { label: "準備完了", className: "bg-emerald-500/20 text-emerald-400" },
  closed: { label: "締め完了", className: "bg-blue-500/20 text-blue-400" },
  locked: { label: "ロック", className: "bg-amber-500/20 text-amber-400" },
};

const SUBMISSION_LABELS: Record<string, string> = {
  not_required: "対象外",
  pending: "未提出",
  submitted: "提出済",
  approved: "確認済",
  rejected: "差戻し",
};

const SUBMISSION_ICONS: Record<string, { icon: ReactNode; color: string; dotClassName: string }> = {
  not_required: { icon: <AlertCircle className="h-4 w-4" />, color: "text-orange-400", dotClassName: "bg-orange-400" },
  pending: { icon: <Clock className="h-4 w-4" />, color: "text-red-400", dotClassName: "bg-red-400" },
  submitted: { icon: <CheckCircle className="h-4 w-4" />, color: "text-green-400", dotClassName: "bg-green-400" },
  approved: { icon: <CheckCircle className="h-4 w-4" />, color: "text-blue-400", dotClassName: "bg-blue-400" },
  rejected: { icon: <XCircle className="h-4 w-4" />, color: "text-pink-400", dotClassName: "bg-pink-400" },
};

export default function AppClosings() {
  // React hooks are now imported at the top
  const [location] = useLocation();
  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [invoiceProjectIds, setInvoiceProjectIds] = useState<number[]>([]);
  const [returnReasonMap, setReturnReasonMap] = useState<Record<number, string>>({});

  // Read deep-link query params on mount
  useEffect(() => {
    const queryString = window.location.search;
    const params = new URLSearchParams(queryString);
    const monthParam = params.get("month") || params.get("closingMonth");
    const projectIdParam = params.get("projectId");

    if (monthParam) setClosingMonth(monthParam);
    if (projectIdParam) {
      const id = Number(projectIdParam);
      if (!Number.isNaN(id)) setSelectedProjectId(id);
    }
  }, [location]);

  const listQuery = trpc.closing.listByMonth.useQuery({ closingMonth });
  const detailQuery = trpc.closing.get.useQuery(
    { projectId: selectedProjectId || 0, closingMonth },
    { enabled: !!selectedProjectId }
  );
  const sameClientCandidatesQuery = trpc.closing.sameClientInvoiceCandidates.useQuery(
    { projectId: selectedProjectId!, closingMonth },
    { enabled: !!selectedProjectId && !!closingMonth }
  );

  const initializeMutation = trpc.closing.initialize.useMutation({
    onSuccess: () => {
      toast.success("月締めデータを初期化しました");
      listQuery.refetch();
      detailQuery.refetch();
    },
    onError: (e) => toast.error(`初期化エラー: ${e.message}`),
  });

  const updateSubmissionMutation = trpc.closing.updateSubmission.useMutation({
    onSuccess: () => {
      toast.success("提出状況を更新しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`更新エラー: ${e.message}`),
  });

  const markReadyMutation = trpc.closing.markReady.useMutation({
    onSuccess: () => {
      toast.success("準備完了にしました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`ready化エラー: ${e.message}`),
  });

  const closeMutation = trpc.closing.close.useMutation({
    onSuccess: () => {
      toast.success("締めを完了しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`締め完了エラー: ${e.message}`),
  });

  const reopenMutation = trpc.closing.reopen.useMutation({
    onSuccess: () => {
      toast.success("締めを再開しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`再開エラー: ${e.message}`),
  });

  const [, setLocation] = useLocation();

  const generateInvoiceMutation = trpc.closing.generateForClosing.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message || "請求書ドラフトを作成しました");
      if (data.editUrl) {
        setLocation(data.editUrl);
      } else if (data.invoiceId) {
        setLocation(`/app/invoices?invoiceId=${data.invoiceId}`);
      }
    },
    onError: (e: any) => toast.error(`請求書ドラフト作成エラー: ${e.message}`),
  });

  useEffect(() => {
    if (selectedProjectId) setInvoiceProjectIds([selectedProjectId]);
  }, [selectedProjectId]);

  const uploadReceiptMutation = trpc.closing.uploadReceipt.useMutation({
    onSuccess: () => {
      toast.success("領収書をアップロードしました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`領収書アップロードエラー: ${e.message}`),
  });

  const clearReceiptMutation = trpc.closing.clearReceipt.useMutation({
    onSuccess: () => {
      toast.success("領収書を解除しました");
      detailQuery.refetch();
      listQuery.refetch();
    },
    onError: (e) => toast.error(`領収書解除エラー: ${e.message}`),
  });

  const rows = listQuery.data || [];
  const workerInvoiceReviewQuery = trpc.workerInvoice.listForReview.useQuery();
  const trpcUtils = trpc.useUtils();
  const workerReturnMutation = trpc.workerInvoice.returnInvoice.useMutation({
    onSuccess: () => {
      toast.success("差戻ししました");
      workerInvoiceReviewQuery.refetch();
    },
    onError: (e) => toast.error(`差戻しエラー: ${e.message}`),
  });
  const workerApproveMutation = trpc.workerInvoice.approveInvoice.useMutation({
    onSuccess: () => {
      toast.success("承認しました");
      workerInvoiceReviewQuery.refetch();
    },
    onError: (e) => toast.error(`承認エラー: ${e.message}`),
  });
  const selectedRow = useMemo(
    () => rows.find((row: any) => row.project.id === selectedProjectId) || null,
    [rows, selectedProjectId]
  );
  const detail = detailQuery.data;
  const sameClientProjects = sameClientCandidatesQuery.data || [];

  useEffect(() => {
    if (selectedProjectId) setInvoiceProjectIds([selectedProjectId]);
  }, [selectedProjectId]);

  const toggleInvoiceProject = (projectId: number) => {
    setInvoiceProjectIds((prev) =>
      prev.includes(projectId)
        ? (prev.length > 1 ? prev.filter((id) => id !== projectId) : prev)
        : [...prev, projectId]
    );
  };


  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">締め管理</h1>
          <p className="text-sm text-muted-foreground">案件ごと・月ごとの提出状況と締め状態を管理します。</p>
        </div>
        <div className="w-[180px]">
          <Label className="text-xs text-muted-foreground">対象月</Label>
          <Input type="month" value={closingMonth} onChange={(e) => setClosingMonth(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>作業員請求書レビュー（Phase 3B）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(workerInvoiceReviewQuery.data || []).length === 0 ? (
            <div className="text-sm text-muted-foreground">レビュー対象の作業員請求書はありません。</div>
          ) : (
            <div className="space-y-3">
              {(workerInvoiceReviewQuery.data || []).map((invoice: any) => (
                <div key={invoice.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div>
                      <div className="font-medium">{invoice.subject || `${invoice.closingMonth} 作業請求`}</div>
                      <div className="text-xs text-muted-foreground">#{invoice.id} / worker:{invoice.employeeId} / status:{invoice.status}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={async () => {
                        const data = await trpcUtils.workerInvoice.previewMyInvoice.fetch({ invoiceId: invoice.id });
                        toast.success(`プレビュー: ${data.model.subject}`);
                      }}>
                        <Eye className="h-4 w-4 mr-1" /> プレビュー
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const pdf = await trpcUtils.workerInvoice.downloadMyInvoicePdf.fetch({ invoiceId: invoice.id });
                        window.open(pdf.url, "_blank");
                      }}>
                        <FileDown className="h-4 w-4 mr-1" /> PDFダウンロード
                      </Button>
                      <Button size="sm" variant="outline" onClick={async () => {
                        const data = await trpcUtils.workerInvoice.exportMyInvoicePackage.fetch({ invoiceId: invoice.id });
                        const docs = data.documents || [];
                        if (docs.length === 0) {
                          toast.info("添付資料はありません");
                        } else if (docs.length === 1) {
                          window.open(docs[0].url, "_blank");
                        } else {
                          toast.info(`添付資料が${docs.length}件あります。エクスポート情報から個別ダウンロードしてください。`);
                        }
                      }}>
                        <FileDown className="h-4 w-4 mr-1" /> 添付資料
                      </Button>
                      <Button size="sm" onClick={() => workerApproveMutation.mutate({ invoiceId: invoice.id })} disabled={workerApproveMutation.isPending || invoice.status === "approved"}>
                        承認
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Input
                      value={returnReasonMap[invoice.id] || ""}
                      onChange={(e) => setReturnReasonMap((prev) => ({ ...prev, [invoice.id]: e.target.value }))}
                      placeholder="差戻し理由"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const reason = (returnReasonMap[invoice.id] || "").trim();
                        if (!reason) return toast.error("差戻し理由を入力してください");
                        workerReturnMutation.mutate({ invoiceId: invoice.id, reason });
                      }}
                      disabled={workerReturnMutation.isPending}
                    >
                      差戻し
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
          <CardTitle>案件一覧</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>案件</TableHead>
                    <TableHead>取引先</TableHead>
                    <TableHead>状態</TableHead>
                    <TableHead className="text-right">対象者</TableHead>
                    <TableHead className="text-right">未提出</TableHead>
                    <TableHead className="text-right">領収書不足</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any) => (
                    <TableRow key={row.project.id} className={selectedProjectId === row.project.id ? "bg-muted/50" : ""}>
                      <TableCell className="font-medium">{row.project.name}</TableCell>
                      <TableCell>{row.client?.name || "-"}</TableCell>
                      <TableCell>
                        {row.closing ? (
                          <span className={`px-2 py-1 rounded text-xs ${STATUS_LABELS[row.closing.status]?.className || "bg-muted"}`}>
                            {STATUS_LABELS[row.closing.status]?.label || row.closing.status}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground">未初期化</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.summary.targetCount}</TableCell>
                      <TableCell className="text-right">{row.summary.pendingCount}</TableCell>
                      <TableCell className="text-right">{row.summary.receiptMissingCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setSelectedProjectId(row.project.id)}>
                            詳細
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => initializeMutation.mutate({ projectId: row.project.id, closingMonth })}
                            disabled={initializeMutation.isPending}
                          >
                            初期化
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                        対象案件がありません
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProjectId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span>{selectedRow?.project?.name || "案件"} / {closingMonth} 締め詳細</span>
              {detail?.closing && (
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${STATUS_LABELS[detail.closing.status]?.className || "bg-muted"}`}>
                    {STATUS_LABELS[detail.closing.status]?.label || detail.closing.status}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markReadyMutation.mutate({ projectId: selectedProjectId, closingMonth })}
                    disabled={!detail.summary.canMarkReady || markReadyMutation.isPending}
                  >
                    <FileCheck className="h-3.5 w-3.5 mr-1" />
                    ready
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => closeMutation.mutate({ projectId: selectedProjectId, closingMonth })}
                    disabled={detail.closing.status !== "ready" || closeMutation.isPending}
                  >
                    <Lock className="h-3.5 w-3.5 mr-1" />
                    締める
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reopenMutation.mutate({ projectId: selectedProjectId, closingMonth })}
                    disabled={reopenMutation.isPending}
                  >
                    <LockOpen className="h-3.5 w-3.5 mr-1" />
                    再開
                  </Button>
                  {detail.closing.status === "closed" && (
                    <Button
                      size="sm"
                      onClick={() => generateInvoiceMutation.mutate({ projectId: selectedProjectId!, closingMonth, projectIds: invoiceProjectIds.length ? invoiceProjectIds : [selectedProjectId!] })}
                      disabled={generateInvoiceMutation.isPending || invoiceProjectIds.length === 0}
                    >
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      請求書ドラフト作成
                    </Button>
                  )}
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gold" />
              </div>
            ) : !detail?.closing ? (
              <div className="text-sm text-muted-foreground">まだ初期化されていません。上の「初期化」を押してください。</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <SummaryCard label="対象者" value={detail.summary.targetCount} />
                  <SummaryCard label="未提出" value={detail.summary.pendingCount} />
                  <SummaryCard label="提出済" value={detail.summary.submittedCount} />
                  <SummaryCard label="確認済" value={detail.summary.approvedCount} />
                  <SummaryCard label="領収書不足" value={detail.summary.receiptMissingCount} />
                </div>

                {detail.closing.status === "closed" && sameClientProjects.length > 0 && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-blue-300">請求書に含める案件</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        初期状態は現在の案件のみです。同一取引先の締め完了案件だけを選択して、1枚の請求書にまとめられます。
                      </p>
                    </div>
                    <div className="grid gap-2 grid-cols-1 md:grid-cols-2">
                      {sameClientProjects.map((project: any) => (
                        <label key={project.projectId} className="flex items-center gap-2 rounded border border-border px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                          <input
                            type="checkbox"
                            checked={invoiceProjectIds.includes(project.projectId)}
                            onChange={() => toggleInvoiceProject(project.projectId)}
                          />
                          <span>{project.projectName}</span>
                          {project.projectId === selectedProjectId && <span className="text-xs text-gold">現在の案件</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>作業員</TableHead>
                        <TableHead>状態</TableHead>
                        <TableHead className="text-right">交通費</TableHead>
                        <TableHead className="text-right">経費</TableHead>
                        <TableHead className="text-center">領収書</TableHead>
                        <TableHead>メモ</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.submissions.map((submission: any) => (
                        <SubmissionRow
                          key={submission.id}
                          submission={submission}
                          onUpdate={(payload) => updateSubmissionMutation.mutate({ id: submission.id, ...payload })}
                          onUploadReceipt={(payload) => uploadReceiptMutation.mutate({ submissionId: submission.id, ...payload })}
                          onClearReceipt={() => clearReceiptMutation.mutate({ submissionId: submission.id })}
                          busy={updateSubmissionMutation.isPending || uploadReceiptMutation.isPending || clearReceiptMutation.isPending}
                        />
                      ))}
                      {detail.submissions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                            対象提出データがありません
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {!detail.summary.canMarkReady && (
                  <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3">
                    未提出または領収書不足があるため、まだ ready にできません。
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Worker Invoice Review Section ── */}
      <WorkerInvoiceReviewSection />
    </div>
  );
}

const INVOICE_STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "下書き", className: "bg-slate-500/20 text-slate-300" },
  submitted: { label: "提出済", className: "bg-blue-500/20 text-blue-400" },
  returned: { label: "差戻し", className: "bg-red-500/20 text-red-400" },
  approved: { label: "承認済", className: "bg-emerald-500/20 text-emerald-400" },
  locked: { label: "ロック", className: "bg-amber-500/20 text-amber-400" },
};

function WorkerInvoiceReviewSection() {
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnInvoiceId, setReturnInvoiceId] = useState<number | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const reviewQuery = trpc.workerInvoice.listForReview.useQuery();
  const approveMutation = trpc.workerInvoice.approve.useMutation({
    onSuccess: () => { toast.success("請求書を承認しました"); reviewQuery.refetch(); },
    onError: (e) => toast.error(`承認エラー: ${e.message}`),
  });
  const returnMutation = trpc.workerInvoice.returnInvoice.useMutation({
    onSuccess: () => { toast.success("請求書を差戻しました"); reviewQuery.refetch(); setReturnDialogOpen(false); setReturnReason(""); },
    onError: (e) => toast.error(`差戻しエラー: ${e.message}`),
  });
  const downloadPdfMutation = trpc.workerInvoice.downloadPdf.useMutation({
    onSuccess: (data) => { window.open(data.url, "_blank"); },
    onError: (e) => toast.error(`PDFエラー: ${e.message}`),
  });

  const invoices = reviewQuery.data || [];
  if (invoices.length === 0 && !reviewQuery.isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-gold" />
          作業員請求書レビュー
          {invoices.length > 0 && <span className="text-sm font-normal text-muted-foreground">({invoices.length}件)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {reviewQuery.isLoading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {invoices.map((inv: any) => {
              const statusInfo = INVOICE_STATUS_MAP[inv.status] || INVOICE_STATUS_MAP.draft;
              return (
                <div key={inv.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">{inv.employeeName || `従業員${inv.employeeId}`}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${statusInfo.className}`}>{statusInfo.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>対象月: <span className="text-foreground">{inv.closingMonth}</span></div>
                    <div>現場: <span className="text-foreground truncate">{inv.projectName || "-"}</span></div>
                    <div>合計: <span className="text-foreground font-medium">¥{Number(inv.totalAmount || 0).toLocaleString()}</span></div>
                    <div>添付: <span className="text-foreground">{inv.docsCount != null ? `${inv.docsCount}件` : "なし"}</span></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(inv.status === "submitted" || inv.status === "approved") && (
                      <Button size="sm" variant="outline" onClick={() => downloadPdfMutation.mutate({ invoiceId: inv.id })} disabled={downloadPdfMutation.isPending}>
                        <FileDown className="h-3.5 w-3.5 mr-1" />PDF
                      </Button>
                    )}
                    {inv.status === "submitted" && (
                      <>
                        <Button size="sm" onClick={() => approveMutation.mutate({ invoiceId: inv.id })} disabled={approveMutation.isPending}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" />承認
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-400 border-red-400/30" onClick={() => { setReturnInvoiceId(inv.id); setReturnDialogOpen(true); }}>
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />差戻し
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Return dialog */}
        <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>請求書差戻し</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>差戻し理由</Label>
              <Textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="差戻し理由を入力してください" rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>キャンセル</Button>
              <Button
                onClick={() => { if (returnInvoiceId) returnMutation.mutate({ invoiceId: returnInvoiceId, reason: returnReason }); }}
                disabled={!returnReason.trim() || returnMutation.isPending}
              >
                差戻し実行
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function SubmissionRow({
  submission,
  onUpdate,
  onUploadReceipt,
  onClearReceipt,
  busy,
}: {
  submission: any;
  onUpdate: (payload: any) => void;
  onUploadReceipt: (payload: { base64: string; mimeType: string; fileName: string }) => void;
  onClearReceipt: () => void;
  busy?: boolean;
}) {
  const [transportAmount, setTransportAmount] = useState<number>(submission.transportAmount || 0);
  const [expenseAmount, setExpenseAmount] = useState<number>(submission.expenseAmount || 0);
  const [status, setStatus] = useState<string>(submission.status);
  const [notes, setNotes] = useState<string>(submission.notes || "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const receiptRequired = transportAmount > 0 || expenseAmount > 0;

  const handleReceiptFile = async (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      onUploadReceipt({
        base64,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <span className={SUBMISSION_ICONS[status]?.color || "text-muted-foreground"} title={SUBMISSION_LABELS[status] || status}>
            {SUBMISSION_ICONS[status]?.icon}
          </span>
          <span className={`h-2.5 w-2.5 rounded-full ${SUBMISSION_ICONS[status]?.dotClassName || "bg-muted"}`} />
          <span>{submission.employee?.nameKanji || `従業員${submission.employeeId}`}</span>
        </div>
      </TableCell>
      <TableCell>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SUBMISSION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-right"><Input type="number" className="h-8 text-right" value={transportAmount} onChange={(e) => setTransportAmount(Number(e.target.value))} /></TableCell>
      <TableCell className="text-right"><Input type="number" className="h-8 text-right" value={expenseAmount} onChange={(e) => setExpenseAmount(Number(e.target.value))} /></TableCell>
      <TableCell className="text-center">
        <div className="flex flex-col items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf"
            onChange={(e) => handleReceiptFile(e.target.files?.[0] || null)}
          />
          <Button
            variant={submission.receiptUploaded ? "default" : "outline"}
            size="sm"
            disabled={!receiptRequired || busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 mr-1" />
            {submission.receiptUploaded ? "差替" : "アップ"}
          </Button>
          {submission.receiptFileUrl ? (
            <div className="flex items-center gap-1 text-[11px] max-w-[180px]">
              <a href={submission.receiptFileUrl} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 truncate">
                <LinkIcon className="h-3 w-3 shrink-0" />
                <span className="truncate">{submission.receiptFileName || "領収書"}</span>
              </a>
              <button type="button" className="text-red-400 hover:text-red-300 shrink-0" onClick={onClearReceipt} disabled={busy}>
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <span className={`text-[11px] ${receiptRequired ? "text-amber-400" : "text-muted-foreground"}`}>
              {receiptRequired ? "未添付" : "不要"}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="メモ" /></TableCell>
      <TableCell className="text-right"><Button size="sm" disabled={busy} onClick={() => onUpdate({ status, transportAmount, expenseAmount, receiptUploaded: submission.receiptUploaded, notes })}>保存</Button></TableCell>
    </TableRow>
  );
}
