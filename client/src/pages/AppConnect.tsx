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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Copy, Plus, Inbox, Send, Link2, CheckCircle2, Undo2 } from "lucide-react";
import { format } from "date-fns";

/**
 * 会社間連携（コネクト層）— Phase 2 UI (docs/multitenant/PLAN_v1.md §2.3-§2.6)
 * 連携管理 / 受領箱 / 提出箱 の3タブ。MULTI_TENANT フラグ off の環境では
 * メニュー非表示（AppLayout 側で connect.status を見る）。
 */

const LINK_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  invited: { label: "招待中", variant: "secondary" },
  accepted: { label: "連携中", variant: "default" },
  rejected: { label: "辞退", variant: "outline" },
  suspended: { label: "停止", variant: "destructive" },
};

const SUB_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  submitted: { label: "提出済み", variant: "secondary" },
  received: { label: "確認中", variant: "secondary" },
  registered: { label: "登録完了", variant: "default" },
  returned: { label: "差戻しあり", variant: "destructive" },
  superseded: { label: "旧版", variant: "outline" },
};

const WORKER_STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "未確認", variant: "secondary" },
  registered: { label: "受理", variant: "default" },
  returned: { label: "差戻し", variant: "destructive" },
};

function StatusBadge({ map, status }: { map: typeof SUB_STATUS_LABEL; status: string }) {
  const s = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

// ── 連携管理タブ ──

function PartnersTab() {
  const linksQuery = trpc.connect.partner.list.useQuery();
  const clientsQuery = trpc.clientInfo.list.useQuery();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [clientId, setClientId] = useState<string>("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [acceptToken, setAcceptToken] = useState("");

  const inviteMutation = trpc.connect.partner.invite.useMutation({
    onSuccess: (d) => {
      setInviteUrl(d.inviteUrl.replace("__ORIGIN__", window.location.origin));
      linksQuery.refetch();
      toast.success("連携招待を発行しました");
    },
    onError: (e) => toast.error(e.message),
  });
  const acceptMutation = trpc.connect.partner.accept.useMutation({
    onSuccess: () => { setAcceptToken(""); linksQuery.refetch(); toast.success("連携を承諾しました"); },
    onError: (e) => toast.error(e.message),
  });
  const suspendMutation = trpc.connect.partner.suspend.useMutation({
    onSuccess: () => { linksQuery.refetch(); toast.success("連携を停止しました"); },
    onError: (e) => toast.error(e.message),
  });

  const clientNameById = useMemo(() => {
    const m = new Map<number, string>();
    (clientsQuery.data ?? []).forEach((c: any) => m.set(c.id, c.name));
    return m;
  }, [clientsQuery.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">取引先との連携</CardTitle>
          <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteUrl(null); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />連携に招待</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>取引先をシステム連携に招待</DialogTitle></DialogHeader>
              {inviteUrl ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">このURLを相手会社の管理者に渡してください（相手がこのシステムのアカウントで承諾すると連携が成立します）。</p>
                  <div className="flex gap-2">
                    <Input readOnly value={inviteUrl} />
                    <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success("コピーしました"); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label>取引先（自社マスタ）</Label>
                    <Select value={clientId} onValueChange={setClientId}>
                      <SelectTrigger><SelectValue placeholder="取引先を選択" /></SelectTrigger>
                      <SelectContent>
                        {(clientsQuery.data ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={!clientId || inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate({ clientId: Number(clientId) })}
                  >
                    招待URLを発行
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>取引先</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>状態</TableHead>
                <TableHead>成立日</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(linksQuery.data ?? []).map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.clientMaps?.length
                      ? l.clientMaps.map((m: any) => clientNameById.get(m.clientId) ?? `取引先#${m.clientId}`).join(" / ")
                      : `会社#${l.counterpartyCompanyId ?? "未承諾"}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.isRequester ? "自社から招待" : "相手から招待"}</TableCell>
                  <TableCell><StatusBadge map={LINK_STATUS_LABEL} status={l.status} /></TableCell>
                  <TableCell className="text-sm">{l.acceptedAt ? format(new Date(l.acceptedAt), "yyyy/MM/dd") : "—"}</TableCell>
                  <TableCell>
                    {l.status === "accepted" && (
                      <Button variant="ghost" size="sm" onClick={() => suspendMutation.mutate({ linkId: l.id })}>停止</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(linksQuery.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">連携はまだありません</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">招待を受け取った場合（トークンで承諾）</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="招待トークンまたはURL" value={acceptToken} onChange={(e) => setAcceptToken(e.target.value)} />
          <Button
            disabled={!acceptToken.trim() || acceptMutation.isPending}
            onClick={() => {
              const raw = acceptToken.trim();
              const token = raw.includes("/") ? raw.split("/").filter(Boolean).pop()! : raw;
              acceptMutation.mutate({ token });
            }}
          >
            <Link2 className="w-4 h-4 mr-1" />承諾
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 受領箱タブ ──

function InboxTab() {
  const inboxQuery = trpc.connect.roster.inbox.useQuery();
  const utils = trpc.useUtils();
  const [reviewTarget, setReviewTarget] = useState<{ workerId: number; name: string } | null>(null);
  const [returnReason, setReturnReason] = useState("");

  const markReceived = trpc.connect.roster.markReceived.useMutation({
    onSuccess: () => utils.connect.roster.inbox.invalidate(),
  });
  const review = trpc.connect.roster.reviewWorker.useMutation({
    onSuccess: (d) => {
      utils.connect.roster.inbox.invalidate();
      setReviewTarget(null); setReturnReason("");
      toast.success(d.submissionStatus === "registered" ? "全員の登録が完了しました" : "反映しました");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {(inboxQuery.data ?? []).filter((s: any) => s.status !== "superseded").map((s: any) => (
        <Card key={s.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                名簿提出 #{s.id}{s.version > 1 ? `（第${s.version}版）` : ""} — {s.projectRef ?? "現場未指定"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                会社#{s.fromCompanyId} から / {format(new Date(s.createdAt), "yyyy/MM/dd HH:mm")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge map={SUB_STATUS_LABEL} status={s.status} />
              {s.status === "submitted" && (
                <Button size="sm" variant="outline" onClick={() => markReceived.mutate({ submissionId: s.id })}>受領して確認開始</Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>作業員</TableHead>
                  <TableHead>CCUS</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="text-right">確認</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(s.workers ?? []).map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell>{w.displayName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{w.ccusNumber ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge map={WORKER_STATUS_LABEL} status={w.status} />
                      {w.status === "returned" && w.returnReason && (
                        <span className="ml-2 text-xs text-muted-foreground">{w.returnReason}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm" variant="outline"
                        disabled={review.isPending || w.status === "registered"}
                        onClick={() => review.mutate({ rosterWorkerId: w.id, action: "registered" })}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />受理
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        disabled={review.isPending || w.status === "returned"}
                        onClick={() => setReviewTarget({ workerId: w.id, name: w.displayName })}
                      >
                        <Undo2 className="w-4 h-4 mr-1" />差戻し
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
      {(inboxQuery.data ?? []).filter((s: any) => s.status !== "superseded").length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground"><Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />受領した名簿はありません</CardContent></Card>
      )}

      <Dialog open={!!reviewTarget} onOpenChange={(o) => { if (!o) { setReviewTarget(null); setReturnReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{reviewTarget?.name} を差戻し</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>差戻し理由（必須・提出元に表示されます）</Label>
            <Textarea value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="例: 資格証書の画像が不鮮明です" />
            <Button
              variant="destructive"
              disabled={!returnReason.trim() || review.isPending}
              onClick={() => reviewTarget && review.mutate({ rosterWorkerId: reviewTarget.workerId, action: "returned", returnReason: returnReason.trim() })}
            >
              差戻す
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── 提出箱タブ ──

function OutboxTab() {
  const outboxQuery = trpc.connect.roster.outbox.useQuery();
  const linksQuery = trpc.connect.partner.list.useQuery();
  const employeesQuery = trpc.employee.list.useQuery();
  const utils = trpc.useUtils();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [linkId, setLinkId] = useState<string>("");
  const [projectRef, setProjectRef] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [resubmitOf, setResubmitOf] = useState<number | null>(null);

  const submitMutation = trpc.connect.roster.submit.useMutation({
    onSuccess: (d) => {
      utils.connect.roster.outbox.invalidate();
      setSubmitOpen(false); setSelected(new Set()); setProjectRef(""); setResubmitOf(null);
      toast.success(`${d.workerCount}名の名簿を提出しました${d.version > 1 ? `（第${d.version}版）` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const acceptedLinks = (linksQuery.data ?? []).filter((l: any) => l.status === "accepted");
  const toggle = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={submitOpen} onOpenChange={(o) => { setSubmitOpen(o); if (!o) setResubmitOf(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={acceptedLinks.length === 0}><Send className="w-4 h-4 mr-1" />名簿を提出</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{resubmitOf ? `再提出（元: #${resubmitOf}）` : "作業員名簿・資格書を提出"}</DialogTitle></DialogHeader>
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
                <Label>現場名（相手側の呼び名）</Label>
                <Input value={projectRef} onChange={(e) => setProjectRef(e.target.value)} placeholder="例: 甲野タワー新築工事" />
              </div>
              <div>
                <Label>提出する作業員（{selected.size}名選択中）</Label>
                <div className="max-h-56 overflow-y-auto border rounded-md p-2 space-y-1">
                  {(employeesQuery.data ?? []).map((e: any) => (
                    <label key={e.id} className="flex items-center gap-2 py-1 cursor-pointer">
                      <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                      <span className="text-sm">{e.nameKanji}</span>
                      {e.careerUpNumber && <span className="text-xs text-muted-foreground">CCUS: {e.careerUpNumber}</span>}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">氏名・生年月日・国籍/在留・資格・書類の期限のみが送られます。単価・支払情報は含まれません。</p>
              </div>
              <Button
                disabled={!linkId || selected.size === 0 || submitMutation.isPending}
                onClick={() => submitMutation.mutate({
                  partnerLinkId: Number(linkId),
                  employeeIds: Array.from(selected),
                  projectRef: projectRef.trim() || undefined,
                  supersedesId: resubmitOf ?? undefined,
                })}
              >
                提出する
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(outboxQuery.data ?? []).map((s: any) => (
        <Card key={s.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                名簿提出 #{s.id}{s.version > 1 ? `（第${s.version}版）` : ""} — {s.projectRef ?? "現場未指定"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                会社#{s.toCompanyId} へ / {format(new Date(s.createdAt), "yyyy/MM/dd HH:mm")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge map={SUB_STATUS_LABEL} status={s.status} />
              {s.status === "returned" && (
                <Button size="sm" variant="outline" onClick={() => { setResubmitOf(s.id); setSubmitOpen(true); }}>修正して再提出</Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(s.workers ?? []).map((w: any) => (
                <span key={w.id} className="inline-flex items-center gap-1 text-sm border rounded-full px-3 py-1">
                  {w.displayName}
                  <StatusBadge map={WORKER_STATUS_LABEL} status={w.status} />
                </span>
              ))}
            </div>
            {(s.workers ?? []).some((w: any) => w.status === "returned" && w.returnReason) && (
              <div className="mt-3 text-sm text-destructive space-y-1">
                {(s.workers ?? []).filter((w: any) => w.status === "returned" && w.returnReason).map((w: any) => (
                  <p key={w.id}>差戻し（{w.displayName}）: {w.returnReason}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {(outboxQuery.data ?? []).length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground"><Send className="w-8 h-8 mx-auto mb-2 opacity-40" />提出した名簿はありません</CardContent></Card>
      )}
    </div>
  );
}

export default function AppConnect() {
  const statusQuery = trpc.connect.status.useQuery();

  if (statusQuery.data && !statusQuery.data.enabled) {
    return (
      <div className="p-6">
        <Card><CardContent className="py-10 text-center text-muted-foreground">会社間連携はまだ有効化されていません（MULTI_TENANT フラグ off）。</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-xl font-semibold">会社間連携</h1>
      <Tabs defaultValue="inbox">
        <TabsList>
          <TabsTrigger value="inbox"><Inbox className="w-4 h-4 mr-1" />受領箱</TabsTrigger>
          <TabsTrigger value="outbox"><Send className="w-4 h-4 mr-1" />提出箱</TabsTrigger>
          <TabsTrigger value="partners"><Link2 className="w-4 h-4 mr-1" />連携管理</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox"><InboxTab /></TabsContent>
        <TabsContent value="outbox"><OutboxTab /></TabsContent>
        <TabsContent value="partners"><PartnersTab /></TabsContent>
      </Tabs>
    </div>
  );
}
