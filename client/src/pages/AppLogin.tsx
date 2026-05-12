import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, AlertCircle, Eye, EyeOff, Globe } from "lucide-react";
import { useAppLang } from "@/contexts/AppLanguageContext";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AppLogin() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { lang, toggleLang, t } = useAppLang();
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryLoginId, setRecoveryLoginId] = useState("");
  const [recoveryBirthDate, setRecoveryBirthDate] = useState("");
  const [recoveryPhone, setRecoveryPhone] = useState("");
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);

  const recoveryMutation = trpc.passwordRecovery.request.useMutation({
    onSuccess: () => {
      setRecoverySubmitted(true);
      setRecoveryLoginId("");
      setRecoveryBirthDate("");
      setRecoveryPhone("");
    },
    onError: () => {
      setRecoverySubmitted(true);
    },
  });

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    recoveryMutation.mutate({ loginId: recoveryLoginId, birthDate: recoveryBirthDate, phone: recoveryPhone });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, password }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || t("login_error"));
        setLoading(false);
        return;
      }

      if (data.mustChangePassword) {
        window.location.href = "/app/change-password";
      } else {
        window.location.href = "/app";
      }
    } catch {
      setError(lang === "pt" ? "Não foi possível conectar ao servidor" : "サーバーに接続できません");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Language toggle - top right */}
      <div className="fixed top-4 right-4 z-50">
        <Button variant="outline" size="sm" onClick={toggleLang} className="text-xs">
          <Globe className="h-3 w-3 mr-1.5" />
          {lang === "ja" ? "PT" : "JP"}
        </Button>
      </div>

      <div className="w-full max-w-md">
        {/* Logo / Branding */}
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
            <CardTitle className="text-xl text-center">{t("login_title")}</CardTitle>
            <CardDescription className="text-center">
              {lang === "pt" ? "Digite seu ID e senha" : "ログインIDとパスワードを入力してください"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="loginId" className="text-sm font-medium">
                  {t("login_id")}
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="loginId"
                    type="text"
                    placeholder={lang === "pt" ? "Digite seu ID" : "ログインIDを入力"}
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  {t("login_password")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder={lang === "pt" ? "Digite sua senha" : "パスワードを入力"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gold text-background hover:bg-gold-dim font-medium"
                disabled={loading || !loginId || !password}
              >
                {loading
                  ? (lang === "pt" ? "Entrando..." : "ログイン中...")
                  : t("login_button")}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm text-gold hover:text-gold-dim transition-colors"
                onClick={() => {
                  setRecoverySubmitted(false);
                  setRecoveryOpen(true);
                }}
              >
                パスワードを忘れた方はこちら
              </button>
            </div>

            <div className="mt-6 text-center">
              <a
                href="/"
                className="text-sm text-muted-foreground hover:text-gold transition-colors no-underline"
              >
                {t("nav_corporateSite")}
              </a>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center mt-6">
          {lang === "pt"
            ? "Se você tem um link de convite, crie sua conta através dele"
            : "招待リンクをお持ちの方は、リンクからアカウントを作成してください"}
        </p>
      </div>

      <Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>パスワード復旧依頼</DialogTitle>
            <DialogDescription>
              ログインID、生年月日、電話番号を入力してください。結果にかかわらず、確認後に管理者が対応します。
            </DialogDescription>
          </DialogHeader>
          {recoverySubmitted ? (
            <div className="py-4 text-sm">
              復旧依頼を送信しました。管理者の確認をお待ちください。
            </div>
          ) : (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recovery-loginId">ログインID</Label>
                <Input id="recovery-loginId" value={recoveryLoginId} onChange={(e) => setRecoveryLoginId(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-birthDate">生年月日</Label>
                <Input id="recovery-birthDate" type="date" value={recoveryBirthDate} onChange={(e) => setRecoveryBirthDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recovery-phone">電話番号</Label>
                <Input id="recovery-phone" value={recoveryPhone} onChange={(e) => setRecoveryPhone(e.target.value)} required />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRecoveryOpen(false)}>キャンセル</Button>
                <Button type="submit" disabled={recoveryMutation.isPending}>
                  {recoveryMutation.isPending ? "送信中..." : "復旧依頼を送信"}
                </Button>
              </DialogFooter>
            </form>
          )}
          {recoverySubmitted && (
            <DialogFooter>
              <Button onClick={() => setRecoveryOpen(false)}>閉じる</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
