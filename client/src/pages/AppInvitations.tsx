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
import { Copy, Plus, Check, X, Clock, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useAppLang } from "@/contexts/AppLanguageContext";

export default function AppInvitations() {
  const { t, lang } = useAppLang();
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
      const actualUrl = data.inviteUrl.replace("__ORIGIN__", window.location.origin);
      setInviteResult({ ...data, inviteUrl: actualUrl });
      setOpen(false);
      setResultOpen(true);
      invitationsQuery.refetch();
      setLoginId("");
      setTempPassword("");
      setAssignedRole("worker");
      setRecipientEmail("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteExpiredMutation = trpc.invitation.deleteExpired.useMutation({
    onSuccess: (data) => {
      toast.success(
        lang === "pt"
          ? `${data.deleted} convite(s) expirado(s) removido(s)`
          : `${data.deleted}件の期限切れ招待を削除しました`
      );
      invitationsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteMutation = trpc.invitation.delete.useMutation({
    onSuccess: () => {
      toast.success(lang === "pt" ? "Convite removido" : "招待を削除しました");
      invitationsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleCreate = () => {
    if (!loginId || !tempPassword) {
      toast.error(lang === "pt" ? "ID de login e senha temporária são obrigatórios" : "ログインIDと仮パスワードは必須です");
      return;
    }
    if (tempPassword.length < 6) {
      toast.error(lang === "pt" ? "A senha temporária deve ter no mínimo 6 caracteres" : "仮パスワードは6文字以上にしてください");
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
    toast.success(lang === "pt" ? `${label} copiado` : `${label}をコピーしました`);
  };

  const roleLabelsJa: Record<string, string> = { admin: "管理者", leader: "責任者", worker: "作業員" };
  const roleLabelsPt: Record<string, string> = { admin: "Administrador", leader: "Gerente", worker: "Trabalhador" };
  const roleLabels = lang === "pt" ? roleLabelsPt : roleLabelsJa;

  const statusBadge = (status: string, expiresAt: Date) => {
    if (status === "used") {
      return <Badge variant="secondary"><Check className="h-3 w-3 mr-1" />{lang === "pt" ? "Usado" : "使用済み"}</Badge>;
    }
    if (new Date() > new Date(expiresAt)) {
      return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />{lang === "pt" ? "Expirado" : "期限切れ"}</Badge>;
    }
    return <Badge variant="outline" className="border-gold/30 text-gold"><Clock className="h-3 w-3 mr-1" />{lang === "pt" ? "Válido" : "有効"}</Badge>;
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-500/10 text-red-500 border-red-500/20",
      leader: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      worker: "bg-green-500/10 text-green-500 border-green-500/20",
    };
    return <Badge variant="outline" className={colors[role]}>{roleLabels[role]}</Badge>;
  };

  // Count expired invitations
  const expiredCount = invitationsQuery.data?.filter(
    (inv) => inv.status === "pending" && new Date() > new Date(inv.expiresAt)
  ).length ?? 0;

  // Check if an invitation can be deleted (expired or used)
  const canDelete = (inv: { status: string; expiresAt: Date }) => {
    return inv.status === "used" || (inv.status === "pending" && new Date() > new Date(inv.expiresAt));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("nav_invitations")}</h1>
          <p className="text-muted-foreground mt-1">
            {lang === "pt" ? "Convide novos usuários para criar contas" : "新しいユーザーを招待してアカウントを作成します"}
          </p>
        </div>
        <div className="flex gap-2">
          {expiredCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => deleteExpiredMutation.mutate()}
              disabled={deleteExpiredMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {lang === "pt"
                ? `Remover expirados (${expiredCount})`
                : `期限切れを削除 (${expiredCount})`}
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gold text-background hover:bg-gold-dim">
                <Plus className="h-4 w-4 mr-2" />
                {t("invitations_create")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("invitations_createNew")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>{lang === "pt" ? "ID de login (nome em romaji)" : "ログインID（ローマ字氏名）"}</Label>
                  <Input
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder={lang === "pt" ? "Ex: yamada.taro" : "例: yamada.taro"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{lang === "pt" ? "Senha temporária (mín. 6 caracteres)" : "仮パスワード（6文字以上）"}</Label>
                  <Input
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder={lang === "pt" ? "Deve ser alterada no primeiro login" : "初回ログイン後に変更必須"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("invitations_role")}</Label>
                  <Select value={assignedRole} onValueChange={(v) => setAssignedRole(v as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="worker">{roleLabels.worker}</SelectItem>
                      <SelectItem value="leader">{roleLabels.leader}</SelectItem>
                      <SelectItem value="admin">{roleLabels.admin}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "pt" ? "E-mail (opcional)" : "メールアドレス（任意）"}</Label>
                  <Input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder={lang === "pt" ? "Enviar convite por e-mail" : "招待メール送信先"}
                  />
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="w-full bg-gold text-background hover:bg-gold-dim"
                >
                  {createMutation.isPending
                    ? (lang === "pt" ? "Criando..." : "作成中...")
                    : (lang === "pt" ? "Gerar link de convite" : "招待リンクを生成")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Invite Result Dialog */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{lang === "pt" ? "Link de convite gerado" : "招待リンクが生成されました"}</DialogTitle>
          </DialogHeader>
          {inviteResult && (
            <div className="space-y-4 pt-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("invite_loginId")}</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{inviteResult.loginId}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(inviteResult.loginId, lang === "pt" ? "ID de login" : "ログインID")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{lang === "pt" ? "Senha temporária" : "仮パスワード"}</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{inviteResult.tempPassword}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(inviteResult.tempPassword, lang === "pt" ? "Senha temporária" : "仮パスワード")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("invitations_expiry")}</span>
                  <span className="text-sm">
                    {format(new Date(inviteResult.expiresAt), "yyyy/MM/dd HH:mm")}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm">{lang === "pt" ? "Link de convite" : "招待リンク"}</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteResult.inviteUrl}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(inviteResult.inviteUrl, lang === "pt" ? "Link de convite" : "招待リンク")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const text = lang === "pt"
                    ? `Informações de convite\nID de login: ${inviteResult.loginId}\nSenha temporária: ${inviteResult.tempPassword}\nLink: ${inviteResult.inviteUrl}\nValidade: ${format(new Date(inviteResult.expiresAt), "yyyy/MM/dd HH:mm")}\n\n* Altere a senha no primeiro login.`
                    : `招待情報\nログインID: ${inviteResult.loginId}\n仮パスワード: ${inviteResult.tempPassword}\n招待リンク: ${inviteResult.inviteUrl}\n有効期限: ${format(new Date(inviteResult.expiresAt), "yyyy/MM/dd HH:mm")}\n\n※初回ログイン後にパスワードの変更が必要です。`;
                  copyToClipboard(text, lang === "pt" ? "Todas as informações" : "招待情報全体");
                }}
              >
                <Copy className="h-4 w-4 mr-2" />
                {lang === "pt" ? "Copiar tudo" : "すべてコピー"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Invitations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("invitations_history")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitationsQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">{t("loading")}</p>
          ) : !invitationsQuery.data?.length ? (
            <p className="text-muted-foreground text-center py-8">
              {lang === "pt" ? "Nenhum convite ainda" : "まだ招待がありません"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invite_loginId")}</TableHead>
                  <TableHead>{t("invitations_role")}</TableHead>
                  <TableHead>{t("invitations_status")}</TableHead>
                  <TableHead>{t("invitations_createdAt")}</TableHead>
                  <TableHead>{t("invitations_expiry")}</TableHead>
                  <TableHead className="w-12"></TableHead>
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
                    <TableCell>
                      {canDelete(inv) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm(lang === "pt" ? "Remover este convite?" : "この招待を削除しますか？")) {
                              deleteMutation.mutate({ id: inv.id });
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
