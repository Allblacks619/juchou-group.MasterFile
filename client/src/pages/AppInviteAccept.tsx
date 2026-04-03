import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle, Loader2, UserPlus, Globe } from "lucide-react";
import { useAppLang } from "@/contexts/AppLanguageContext";

export default function AppInviteAccept() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [, navigate] = useLocation();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const { lang, toggleLang, t } = useAppLang();

  const { data: verification, isLoading, error: verifyError } = trpc.invitation.verify.useQuery(
    { token },
    { enabled: !!token, retry: false }
  );

  const handleAccept = async () => {
    setError("");
    setAccepting(true);

    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (lang === "pt" ? "Falha ao aceitar o convite" : "招待の受諾に失敗しました"));
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/app/change-password");
      }, 2000);
    } catch {
      setError(lang === "pt" ? "Não foi possível conectar ao servidor" : "サーバーに接続できません");
    } finally {
      setAccepting(false);
    }
  };

  const langToggleBtn = (
    <div className="fixed top-4 right-4 z-50">
      <Button variant="outline" size="sm" onClick={toggleLang} className="text-xs">
        <Globe className="h-3 w-3 mr-1.5" />
        {lang === "ja" ? "PT" : "JP"}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        {langToggleBtn}
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
            <p className="text-muted-foreground">
              {lang === "pt" ? "Verificando link de convite..." : "招待リンクを確認中..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        {langToggleBtn}
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">
              {lang === "pt" ? "Conta criada com sucesso!" : "アカウントが作成されました"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {lang === "pt" ? "Redirecionando para alteração de senha..." : "パスワード変更ページに移動します..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!verification?.valid) {
    const reason = verification?.reason || verifyError?.message || t("invite_invalid");
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        {langToggleBtn}
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              充寵グループ
            </h1>
            <div className="w-16 h-0.5 bg-gold mx-auto mt-4" />
          </div>

          <Card className="border-border bg-card">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-xl font-bold">{t("invite_invalid")}</h2>
              <p className="text-sm text-muted-foreground">{reason}</p>
              <Button
                variant="outline"
                onClick={() => navigate("/app/login")}
                className="mt-4"
              >
                {lang === "pt" ? "Ir para login" : "ログインページへ"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const roleLabelsJa: Record<string, string> = {
    admin: "統合管理者",
    leader: "責任者",
    worker: "作業員",
  };
  const roleLabelsPt: Record<string, string> = {
    admin: "Administrador",
    leader: "Gerente",
    worker: "Trabalhador",
  };
  const roleLabels = lang === "pt" ? roleLabelsPt : roleLabelsJa;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {langToggleBtn}
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            充寵グループ
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {lang === "pt" ? "Sistema de Gestão" : "業務管理システム"}
          </p>
          <div className="w-16 h-0.5 bg-gold mx-auto mt-4" />
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center flex items-center justify-center gap-2">
              <UserPlus className="h-5 w-5" />
              {t("invite_title")}
            </CardTitle>
            <CardDescription className="text-center">
              {lang === "pt" ? "Uma conta será criada com as informações abaixo" : "以下の内容でアカウントが作成されます"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t("invite_loginId")}</span>
                <span className="text-sm font-medium">{verification.loginId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{t("invitations_role")}</span>
                <span className="text-sm font-medium">
                  {roleLabels[verification.assignedRole || "worker"] || verification.assignedRole}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              {lang === "pt"
                ? "Após aceitar, faça login com a senha temporária e altere sua senha"
                : "受諾後、仮パスワードでログインし、パスワードの変更が必要です"}
            </p>

            <Button
              onClick={handleAccept}
              className="w-full bg-gold text-background hover:bg-gold-dim font-medium"
              disabled={accepting}
            >
              {accepting
                ? (lang === "pt" ? "Processando..." : "処理中...")
                : (lang === "pt" ? "Aceitar convite e criar conta" : "招待を受諾してアカウントを作成")}
            </Button>

            <div className="text-center">
              <a
                href="/app/login"
                className="text-sm text-muted-foreground hover:text-gold transition-colors no-underline"
              >
                {lang === "pt" ? "Já tem uma conta? Faça login" : "既にアカウントをお持ちの方はこちら"}
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
