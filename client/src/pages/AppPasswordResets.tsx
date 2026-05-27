import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, KeyRound, Link as LinkIcon, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type LinkResult = { loginId: string; resetLink: string; expiresAt: Date | string; warning?: string };
type TempPasswordResult = { loginId: string; temporaryPassword: string };

function statusBadge(status: string) {
  const variant = status === "pending" ? "outline" : status === "rejected" ? "destructive" : "secondary";
  const label: Record<string, string> = { pending: "pending", approved: "approved", rejected: "rejected", completed: "completed" };
  return <Badge variant={variant as any}>{label[status] || status}</Badge>;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label}をコピーしました`);
}

export default function AppPasswordResets() {
  const [search, setSearch] = useState("");
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null);
  const [tempPasswordResult, setTempPasswordResult] = useState<TempPasswordResult | null>(null);

  const requestsQuery = trpc.superAdmin.listPasswordRecoveryRequests.useQuery();
  const usersQuery = trpc.superAdmin.listUsersForPasswordReset.useQuery();
  const utils = trpc.useUtils();

  const approveMutation = trpc.superAdmin.approvePasswordRecoveryRequest.useMutation({
    onSuccess: () => {
      toast.success("復旧依頼を承認しました");
      requestsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.superAdmin.rejectPasswordRecoveryRequest.useMutation({
    onSuccess: () => {
      toast.success("復旧依頼を却下しました");
      requestsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const requestLinkMutation = trpc.superAdmin.generateResetLinkForRequest.useMutation({
    onSuccess: (data) => {
      setLinkResult(data);
      requestsQuery.refetch();
      toast.success("再設定リンクを発行しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const userLinkMutation = trpc.superAdmin.generateUserResetLink.useMutation({
    onSuccess: (data) => {
      setLinkResult(data);
      utils.superAdmin.listPasswordRecoveryRequests.invalidate();
      toast.success("再設定リンクを発行しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const tempPasswordMutation = trpc.superAdmin.resetUserPassword.useMutation({
    onSuccess: (data) => {
      setTempPasswordResult({ loginId: data.loginId, temporaryPassword: data.temporaryPassword });
      toast.success("緊急用の仮パスワードを発行しました");
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return (usersQuery.data || []).filter((user) => {
      if (!q) return true;
      return user.loginId?.toLowerCase().includes(q)
        || user.employeeName?.toLowerCase().includes(q)
        || user.name?.toLowerCase().includes(q)
        || user.appRole?.toLowerCase().includes(q);
    });
  }, [search, usersQuery.data]);

  const requirePrivilegedConfirmation = (user: any) => {
    if (user.appRole !== "admin" && user.appRole !== "super_admin") return true;
    return window.confirm(`${user.appRole} アカウント「${user.loginId}」を対象にします。続行しますか？`);
  };

  const issueUserLink = (user: any) => {
    if (!requirePrivilegedConfirmation(user)) return;
    userLinkMutation.mutate({ userId: user.id, confirmPrivilegedReset: user.appRole === "admin" || user.appRole === "super_admin" });
  };

  const issueTempPassword = (user: any) => {
    if (!requirePrivilegedConfirmation(user)) return;
    tempPasswordMutation.mutate({
      userId: user.id,
      confirmPrivilegedReset: user.appRole === "admin" || user.appRole === "super_admin",
      confirmResetCurrentSuperAdmin: true,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">パスワード再発行</h1>
        <p className="text-muted-foreground mt-1">復旧依頼の承認、再設定リンク発行、緊急用仮パスワード発行を行います。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>復旧依頼</CardTitle>
          <CardDescription>利用者がログイン画面から送信した復旧依頼です。既存パスワードは表示されません。</CardDescription>
        </CardHeader>
        <CardContent>
          {requestsQuery.isLoading ? (
            <p className="text-muted-foreground py-6 text-center">読み込み中...</p>
          ) : !(requestsQuery.data || []).length ? (
            <p className="text-muted-foreground py-6 text-center">復旧依頼はありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>従業員名</TableHead>
                  <TableHead>ログインID</TableHead>
                  <TableHead>依頼日時</TableHead>
                  <TableHead>照合</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(requestsQuery.data || []).map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.employeeName || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{request.loginId}</TableCell>
                    <TableCell>{format(new Date(request.requestedAt), "yyyy/MM/dd HH:mm")}</TableCell>
                    <TableCell>
                      {request.verificationMatched ? <Badge>一致</Badge> : <Badge variant="destructive">不一致</Badge>}
                    </TableCell>
                    <TableCell>{statusBadge(request.status)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => approveMutation.mutate({ requestId: request.id })} disabled={request.status !== "pending" || approveMutation.isPending}>
                          承認
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate({ requestId: request.id })} disabled={request.status === "rejected" || request.status === "completed" || rejectMutation.isPending}>
                          却下
                        </Button>
                        <Button size="sm" className="bg-gold text-background hover:bg-gold-dim" onClick={() => requestLinkMutation.mutate({ requestId: request.id })} disabled={!request.userId || request.status === "rejected" || request.status === "completed" || requestLinkMutation.isPending}>
                          <LinkIcon className="h-3 w-3 mr-1" />
                          再設定リンクを発行
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => issueTempPassword({ id: request.userId, loginId: request.loginId, appRole: request.appRole })}
                          disabled={!request.userId || request.status === "rejected" || request.status === "completed" || tempPasswordMutation.isPending}
                        >
                          <KeyRound className="h-3 w-3 mr-1" />
                          緊急用の仮パスワードを発行
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>管理者による再発行</CardTitle>
          <CardDescription>従業員、管理者、統括管理者アカウントを検索して再設定リンクまたは緊急用仮パスワードを発行します。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="ログインID、氏名、ロールで検索..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>氏名</TableHead>
                <TableHead>ログインID</TableHead>
                <TableHead>ロール</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.employeeName || user.name || "-"}</TableCell>
                  <TableCell className="font-mono text-sm">{user.loginId}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{user.appRole}</Badge>
                      {(user.appRole === "admin" || user.appRole === "super_admin") && <ShieldAlert className="h-4 w-4 text-amber-500" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2 flex-wrap">
                      <Button size="sm" className="bg-gold text-background hover:bg-gold-dim" onClick={() => issueUserLink(user)} disabled={userLinkMutation.isPending}>
                        <LinkIcon className="h-3 w-3 mr-1" />
                        再設定リンクを発行
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => issueTempPassword(user)} disabled={tempPasswordMutation.isPending}>
                        <KeyRound className="h-3 w-3 mr-1" />
                        緊急用の仮パスワードを発行
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!linkResult} onOpenChange={(open) => !open && setLinkResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>再設定リンクを発行しました</DialogTitle>
            <DialogDescription>このリンクは一度だけ使用できます</DialogDescription>
          </DialogHeader>
          {linkResult && (
            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">ログインID</span>
                <code className="text-sm font-mono">{linkResult.loginId}</code>
              </div>
              <div className="space-y-2">
                <span className="text-sm text-muted-foreground">再設定リンク</span>
                <div className="flex items-center gap-2">
                  <Input value={linkResult.resetLink} readOnly />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(linkResult.resetLink, "再設定リンク")}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">有効期限</span>
                <span className="text-sm">{format(new Date(linkResult.expiresAt), "yyyy/MM/dd HH:mm")}</span>
              </div>
              <p className="text-sm text-destructive">このリンクは一度だけ使用できます</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setLinkResult(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!tempPasswordResult} onOpenChange={(open) => !open && setTempPasswordResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>緊急用の仮パスワードを発行しました</DialogTitle>
            <DialogDescription>注意: この仮パスワードは一度だけ表示されます</DialogDescription>
          </DialogHeader>
          {tempPasswordResult && (
            <div className="space-y-3 rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">ログインID</span>
                <code className="text-sm font-mono">{tempPasswordResult.loginId}</code>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">仮パスワード</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono break-all">{tempPasswordResult.temporaryPassword}</code>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(tempPasswordResult.temporaryPassword, "仮パスワード")}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-destructive">注意: この仮パスワードは一度だけ表示されます</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setTempPasswordResult(null)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
