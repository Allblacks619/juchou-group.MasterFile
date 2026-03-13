import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Mail, Plus, Check, X, Clock } from "lucide-react";
import { format } from "date-fns";

export default function AppInvitations() {
  const [open, setOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    token: string;
    loginId: string;
    tempPassword: string;
    expiresAt: Date;
    inviteUrl: string;
  } | null>(null);

  const [loginId, setLoginId] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [assignedRole, setAssignedRole] = useState<"admin" | "leader" | "worker">("worker");
  const [recipientEmail, setRecipientEmail] = useState("");

  const invitationsQuery = trpc.invitation.list.useQuery();
  const createMutation = trpc.invitation.create.useMutation({
    onSuccess: (data) => {
      // Replace __ORIGIN__ with actual origin
      const actualUrl = data.inviteUrl.replace("__ORIGIN__", window.location.origin);
      setInviteResult({ ...data, inviteUrl: actualUrl });
      setOpen(false);
      setResultOpen(true);
      invitationsQuery.refetch();
      // Reset form
      setLoginId("");
      setTempPassword("");
      setAssignedRole("worker");
      setRecipientEmail("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreate = () => {
    if (!loginId || !tempPassword) {
      toast.error("ログインIDと仮パスワードは必須です");
      return;
    }
    if (tempPassword.length < 6) {
      toast.error("仮パスワードは6文字以上にしてください");
      return;
    }
    createMutation.mutate({
      loginId,
      tempPassword,
      assignedRole,
      recipientEmail: recipientEmail || undefined,
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label}をコピーしました`);
  };

  const statusBadge = (status: string, expiresAt: Date) => {
    if (status === "used") {
      return <Badge variant="secondary"><Check className="h-3 w-3 mr-1" />使用済み</Badge>;
    }
    if (new Date() > new Date(expiresAt)) {
      return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />期限切れ</Badge>;
    }
    return <Badge variant="outline" className="border-gold/30 text-gold"><Clock className="h-3 w-3 mr-1" />有効</Badge>;
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-500/10 text-red-500 border-red-500/20",
      leader: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      worker: "bg-green-500/10 text-green-500 border-green-500/20",
    };
    const labels: Record<string, string> = {
      admin: "管理者",
      leader: "責任者",
      worker: "作業員",
    };
    return <Badge variant="outline" className={colors[role]}>{labels[role]}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">招待管理</h1>
          <p className="text-muted-foreground mt-1">
            新しいユーザーを招待してアカウントを作成します
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-background hover:bg-gold-dim">
              <Plus className="h-4 w-4 mr-2" />
              招待を作成
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新しい招待を作成</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>ログインID（ローマ字氏名）</Label>
                <Input
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="例: yamada.taro"
                />
              </div>
              <div className="space-y-2">
                <Label>仮パスワード（6文字以上）</Label>
                <Input
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  placeholder="初回ログイン後に変更必須"
                />
              </div>
              <div className="space-y-2">
                <Label>権限</Label>
                <Select value={assignedRole} onValueChange={(v) => setAssignedRole(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="worker">作業員</SelectItem>
                    <SelectItem value="leader">責任者</SelectItem>
                    <SelectItem value="admin">管理者</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>メールアドレス（任意）</Label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="招待メール送信先"
                />
              </div>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="w-full bg-gold text-background hover:bg-gold-dim"
              >
                {createMutation.isPending ? "作成中..." : "招待リンクを生成"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Invite Result Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>招待リンクが生成されました</DialogTitle>
          </DialogHeader>
          {inviteResult && (
            <div className="space-y-4 pt-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">ログインID</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{inviteResult.loginId}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(inviteResult.loginId, "ログインID")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">仮パスワード</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{inviteResult.tempPassword}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(inviteResult.tempPassword, "仮パスワード")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">有効期限</span>
                  <span className="text-sm">
                    {format(new Date(inviteResult.expiresAt), "yyyy/MM/dd HH:mm")}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">招待リンク</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteResult.inviteUrl}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(inviteResult.inviteUrl, "招待リンク")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const text = `招待情報\nログインID: ${inviteResult.loginId}\n仮パスワード: ${inviteResult.tempPassword}\n招待リンク: ${inviteResult.inviteUrl}\n有効期限: ${format(new Date(inviteResult.expiresAt), "yyyy/MM/dd HH:mm")}\n\n※初回ログイン後にパスワードの変更が必要です。`;
                  copyToClipboard(text, "招待情報全体");
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                すべてコピー
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">招待履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {invitationsQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">読み込み中...</p>
          ) : !invitationsQuery.data?.length ? (
            <p className="text-muted-foreground text-center py-8">
              まだ招待がありません
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ログインID</TableHead>
                  <TableHead>権限</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>作成日</TableHead>
                  <TableHead>有効期限</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitationsQuery.data.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">{inv.loginId}</TableCell>
                    <TableCell>{roleBadge(inv.assignedRole)}</TableCell>
                    <TableCell>{statusBadge(inv.status, inv.expiresAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(inv.createdAt), "yyyy/MM/dd HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(inv.expiresAt), "yyyy/MM/dd HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
