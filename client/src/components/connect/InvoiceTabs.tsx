import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Send, CheckCircle2, Undo2, Scale, Plus, Trash2, Banknote } from "lucide-react";
import { format } from "date-fns";

/**
 * 会社間 請求連携タブ — Phase 3 UI (docs/multitenant/PLAN_v1.md §2.4)
 * 請求受領箱（突合・査定承認・買掛）/ 請求提出箱（提出・再提出・支払状況の対称表示）
 */

const INV_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "提出済み", variant: "secondary" },
  received: { label: "確認中", variant: "secondary" },
  under_review: { label: "査定中", variant: "secondary" },
  approved: { label: "承認済み", variant: "default" },
  returned: { label: "差戻しあり", variant: "destructive" },
  superseded: { label: "旧版", variant: "outline" },
};

const PAYABLE_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  unpaid: { label: "未払い", variant: "secondary" },
  scheduled: { label: "支払予定", variant: "outline" },
  paid: { label: "支払済み", variant: "default" },
};

const CMP_RESULT: Record<string, { label: string; className: string }> = {
  match: { label: "一致", className: "text-muted-foreground" },
  hours_mismatch: { label: "時間不一致", className: "text-destructive font-medium" },
  missing_in_receiver: { label: "自社側に無し", className: "text-amber-600 font-medium" },
  missing_in_submitter: { label: "相手側に無し", className: "text-amber-600 font-medium" },
};

function Status({ map, status }: { map: typeof INV_STATUS; status: string }) {
  const s = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

const yen = (n: number | null | undefined) => (n == null ? "—" : `¥${Number(n).toLocaleString()}`);
const t10 = (n: number) => (n / 10).toFixed(1);

// ── 出面突合ビュー ──

function AttendanceComparison({ submissionId }: { submissionId: number }) {
  const projectsQuery = trpc.project.list.useQuery();
  const [projectId, setProjectId] = useState<string>("");
  const cmpQuery = trpc.connect.invoice.attendanceComparison.useQuery(
    { submissionId, projectId: Number(projectId) },
    { enabled: !!projectId, retry: false },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label className="shrink-0">自社の現場と突合:</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="現場を選択" /></SelectTrigger>
          <SelectContent>
            {(projectsQuery.data ?? []).map((p: any) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {cmpQuery.data && (
        <>
          <p className="text-sm">
            一致 <span className="font-medium">{cmpQuery.data.matchCount}</span> 件 / 要確認 <span className={cmpQuery.data.mismatchCount > 0 ? "font-medium text-destructive" : "font-medium"}>{cmpQuery.data.mismatchCount}</span> 件
          </p>
          <div className="max-h-64 overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>作業員</TableHead>
                  <TableHead>日付</TableHead>
                  <TableHead>判定</TableHead>
                  <TableHead>申告（実働/残業）</TableHead>
                  <TableHead>自社記録（実働/残業）</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cmpQuery.data.rows.map((r: any, i: number) => (
                  <TableRow key={i} className={r.result !== "match" ? "bg-destructive/5" : undefined}>
                    <TableCell>{r.workerName}</TableCell>
                    <TableCell className="text-sm">{r.workDate}</TableCell>
                    <TableCell><span className={CMP_RESULT[r.result]?.className}>{CMP_RESULT[r.result]?.label ?? r.result}</span></TableCell>
                    <TableCell className="text-sm">{r.submitted ? `${t10(r.submitted.hoursWorkedTimes10)}h / ${t10(r.submitted.overtimeHoursTimes10)}h` : "—"}</TableCell>
                    <TableCell className="text-sm">{r.receiver ? `${t10(r.receiver.hoursWorkedTimes10)}h / ${t10(r.receiver.overtimeHoursTimes10)}h` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

// ── 査定承認ダイアログ ──

function ApproveDialog({ submission, onDone }: { submission: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [adjustments, setAdjustments] = useState<{ label: string; amount: string }[]>([]);
  const approve = trpc.connect.invoice.approve.useMutation({
    onSuccess: (d) => { setOpen(false); onDone(); toast.success(`承認しました（承認額 ${yen(d.approvedAmount)}）`); },
    onError: (e) => toast.error(e.message),
  });

  const totalAdj = adjustments.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const approvedPreview = submission.submittedAmount - totalAdj;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Scale className="w-4 h-4 mr-1" />査定して承認</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>査定・承認 — 申告額 {yen(submission.submittedAmount)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>控除明細（協力会費・安全協力費など）</Label>
            {adjustments.map((a, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="名目" value={a.label} onChange={(e) => setAdjustments((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input type="number" placeholder="金額" className="w-32" value={a.amount} onChange={(e) => setAdjustments((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" onClick={() => setAdjustments((p) => p.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setAdjustments((p) => [...p, { label: "", amount: "" }])}>
              <Plus className="w-4 h-4 mr-1" />控除を追加
            </Button>
          </div>
          <div className="border-t pt-3 flex justify-between text-sm">
            <span>承認額（申告 − 控除 {yen(totalAdj)}）</span>
            <span className={`font-semibold ${approvedPreview < 0 ? "text-destructive" : ""}`}>{yen(approvedPreview)}</span>
          </div>
          <p className="text-xs text-muted-foreground">承認すると承認額で買掛（支払予定）が自動起票されます。承認後の差替えはできません。</p>
          <Button
            disabled={approve.isPending || approvedPreview < 0 || adjustments.some((a) => a.label.trim() === "" && a.amount !== "")}
            onClick={() => approve.mutate({
              submissionId: submission.id,
              adjustments: adjustments.filter((a) => a.label.trim() && Number(a.amount)).map((a) => ({ label: a.label.trim(), amount: Math.trunc(Number(a.amount)) })),
            })}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />承認する
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 請求受領箱 ──

export function InvoiceInboxTab() {
  const utils = trpc.useUtils();
  const inboxQuery = trpc.connect.invoice.inbox.useQuery();
  const payablesQuery = trpc.connect.payable.list.useQuery();
  const markReceived = trpc.connect.invoice.markReceived.useMutation({
    onSuccess: () => utils.connect.invoice.inbox.invalidate(),
  });
  const returnMutation = trpc.connect.invoice.returnSubmission.useMutation({
    onSuccess: () => { utils.connect.invoice.inbox.invalidate(); setReturnTarget(null); setReason(""); toast.success("差戻しました"); },
    onError: (e) => toast.error(e.message),
  });
  const setPayableStatus = trpc.connect.payable.setStatus.useMutation({
    onSuccess: () => { utils.connect.payable.list.invalidate(); toast.success("支払状況を更新しました"); },
    onError: (e) => toast.error(e.message),
  });
  const [returnTarget, setReturnTarget] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => { utils.connect.invoice.inbox.invalidate(); utils.connect.payable.list.invalidate(); };
  const active = (inboxQuery.data ?? []).filter((s: any) => s.status !== "superseded");

  return (
    <div className="space-y-4">
      {active.map((s: any) => {
        const snap = s.snapshotJson ?? {};
        return (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {snap.invoiceNumber}{s.version > 1 ? `（第${s.version}版）` : ""} — {yen(s.submittedAmount)}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  会社#{s.fromCompanyId} から / 対象期間 {s.billingPeriodFrom} 〜 {s.billingPeriodTo} / {snap.subject ?? ""}
                </p>
                {s.status === "approved" && (
                  <p className="text-sm mt-1">承認額 <span className="font-medium">{yen(s.approvedAmount)}</span>
                    {Array.isArray(s.adjustmentsJson) && s.adjustmentsJson.length > 0 && (
                      <span className="text-muted-foreground">（控除: {s.adjustmentsJson.map((a: any) => `${a.label} ${yen(a.amount)}`).join(" / ")}）</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Status map={INV_STATUS} status={s.status} />
                {s.status === "submitted" && (
                  <Button size="sm" variant="outline" onClick={() => markReceived.mutate({ submissionId: s.id })}>受領して確認開始</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-48 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>摘要</TableHead><TableHead>数量</TableHead><TableHead>単価</TableHead><TableHead>金額</TableHead><TableHead>税率</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(snap.items ?? []).map((i: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>{i.description}</TableCell>
                        <TableCell className="text-sm">{i.itemType === "normal" ? `${i.quantity / 10}${i.unit ?? ""}` : ""}</TableCell>
                        <TableCell className="text-sm">{i.itemType === "normal" ? yen(i.unitPrice) : ""}</TableCell>
                        <TableCell className="text-sm">{i.itemType === "normal" ? yen(i.amount) : ""}</TableCell>
                        <TableCell className="text-sm">{i.itemType === "normal" ? `${i.itemTaxRate}%` : ""}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right text-sm">小計 {yen(snap.subtotal)} / 消費税 {yen(snap.taxAmount)}</TableCell>
                      <TableCell colSpan={2} className="font-semibold">{yen(snap.totalAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {["received", "under_review", "submitted"].includes(s.status) && (
                <>
                  <AttendanceComparison submissionId={s.id} />
                  <div className="flex gap-2">
                    <ApproveDialog submission={s} onDone={refresh} />
                    <Button size="sm" variant="ghost" onClick={() => setReturnTarget(s.id)}>
                      <Undo2 className="w-4 h-4 mr-1" />差戻し
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
      {active.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground"><FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />受領した請求はありません</CardContent></Card>
      )}

      {(payablesQuery.data ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base"><Banknote className="w-4 h-4 inline mr-1" />買掛（承認済み請求の支払予定）</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>提出#</TableHead><TableHead>相手</TableHead><TableHead>金額</TableHead><TableHead>状態</TableHead><TableHead /></TableRow>
              </TableHeader>
              <TableBody>
                {(payablesQuery.data ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>#{p.submissionId}</TableCell>
                    <TableCell>会社#{p.counterpartyCompanyId}</TableCell>
                    <TableCell>{yen(p.amount)}</TableCell>
                    <TableCell><Status map={PAYABLE_STATUS} status={p.status} /></TableCell>
                    <TableCell className="space-x-1">
                      {p.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => setPayableStatus.mutate({ payableId: p.id, status: "paid" })}>支払済みにする</Button>
                      )}
                      {p.status === "paid" && p.paidAt && (
                        <span className="text-xs text-muted-foreground">{format(new Date(p.paidAt), "yyyy/MM/dd")} 支払</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={returnTarget != null} onOpenChange={(o) => { if (!o) { setReturnTarget(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>請求を差戻し</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>差戻し理由（必須・提出元に表示されます）</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例: 2/10 の残業時間が自社記録と一致しません" />
            <Button variant="destructive" disabled={!reason.trim() || returnMutation.isPending}
              onClick={() => returnTarget != null && returnMutation.mutate({ submissionId: returnTarget, reason: reason.trim() })}>
              差戻す
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── 請求提出箱 ──

export function InvoiceOutboxTab() {
  const utils = trpc.useUtils();
  const outboxQuery = trpc.connect.invoice.outbox.useQuery();
  const linksQuery = trpc.connect.partner.list.useQuery();
  const invoicesQuery = trpc.invoice.list.useQuery();

  const [open, setOpen] = useState(false);
  const [linkId, setLinkId] = useState<string>("");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [resubmitOf, setResubmitOf] = useState<number | null>(null);

  const submit = trpc.connect.invoice.submit.useMutation({
    onSuccess: (d) => {
      utils.connect.invoice.outbox.invalidate();
      setOpen(false); setInvoiceId(""); setResubmitOf(null);
      toast.success(`請求書を提出しました（申告額 ${yen(d.submittedAmount)}${d.version > 1 ? `・第${d.version}版` : ""}）`);
    },
    onError: (e) => toast.error(e.message),
  });

  const acceptedLinks = (linksQuery.data ?? []).filter((l: any) => l.status === "accepted");
  const invoiceLabel = useMemo(() => {
    const m = new Map<number, string>();
    (invoicesQuery.data ?? []).forEach((i: any) => m.set(i.id, `${i.invoiceNumber}（${yen(i.totalAmount)}）`));
    return m;
  }, [invoicesQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setResubmitOf(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={acceptedLinks.length === 0}><Send className="w-4 h-4 mr-1" />請求書を提出</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{resubmitOf ? `再提出（元: #${resubmitOf}）` : "取引先請求書をシステムで提出"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>提出先（連携中の取引先）</Label>
                <Select value={linkId} onValueChange={setLinkId}>
                  <SelectTrigger><SelectValue placeholder="連携先を選択" /></SelectTrigger>
                  <SelectContent>
                    {acceptedLinks.map((l: any) => (
                      <SelectItem key={l.id} value={String(l.id)}>会社#{l.counterpartyCompanyId}（連携 #{l.id}）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>請求書</Label>
                <Select value={invoiceId} onValueChange={setInvoiceId}>
                  <SelectTrigger><SelectValue placeholder="請求書を選択" /></SelectTrigger>
                  <SelectContent>
                    {(invoicesQuery.data ?? []).map((i: any) => (
                      <SelectItem key={i.id} value={String(i.id)}>{invoiceLabel.get(i.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">提出時点の請求書・明細・出面明細が凍結されて相手に届きます。社内メモ・単価メモは含まれません。</p>
              <Button
                disabled={!linkId || !invoiceId || submit.isPending}
                onClick={() => submit.mutate({
                  partnerLinkId: Number(linkId), invoiceId: Number(invoiceId),
                  supersedesId: resubmitOf ?? undefined,
                })}
              >
                提出する
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(outboxQuery.data ?? []).map((s: any) => {
        const snap = s.snapshotJson ?? {};
        return (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {snap.invoiceNumber}{s.version > 1 ? `（第${s.version}版）` : ""} — {yen(s.submittedAmount)}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  会社#{s.toCompanyId} へ / 対象期間 {s.billingPeriodFrom} 〜 {s.billingPeriodTo}
                </p>
                {s.status === "approved" && (
                  <p className="text-sm mt-1">
                    承認額 <span className="font-medium">{yen(s.approvedAmount)}</span>
                    {Array.isArray(s.adjustmentsJson) && s.adjustmentsJson.length > 0 && (
                      <span className="text-muted-foreground">（控除: {s.adjustmentsJson.map((a: any) => `${a.label} ${yen(a.amount)}`).join(" / ")}）</span>
                    )}
                    {s.payableStatus && <span className="ml-2">相手の支払: <Status map={PAYABLE_STATUS} status={s.payableStatus} /></span>}
                  </p>
                )}
                {s.status === "returned" && s.returnReason && (
                  <p className="text-sm text-destructive mt-1">差戻し理由: {s.returnReason}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Status map={INV_STATUS} status={s.status} />
                {s.status === "returned" && (
                  <Button size="sm" variant="outline" onClick={() => { setResubmitOf(s.id); setInvoiceId(String(s.invoiceRef)); setOpen(true); }}>修正して再提出</Button>
                )}
              </div>
            </CardHeader>
          </Card>
        );
      })}
      {(outboxQuery.data ?? []).length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground"><Send className="w-8 h-8 mx-auto mb-2 opacity-40" />提出した請求はありません</CardContent></Card>
      )}
    </div>
  );
}
