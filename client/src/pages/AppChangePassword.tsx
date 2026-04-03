import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, AlertCircle, CheckCircle, Eye, EyeOff, Globe } from "lucide-react";
import { useAppLang } from "@/contexts/AppLanguageContext";

export default function AppChangePassword() {
  const [, navigate] = useLocation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { lang, toggleLang, t } = useAppLang();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError(t("changePassword_mismatch"));
      return;
    }

    if (newPassword.length < 6) {
      setError(t("changePassword_minLength"));
      return;
    }

    if (currentPassword === newPassword) {
      setError(lang === "pt" ? "A nova senha deve ser diferente da atual" : "新しいパスワードは現在のパスワードと異なるものにしてください");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || (lang === "pt" ? "Falha ao alterar a senha" : "パスワードの変更に失敗しました"));
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        navigate("/app");
      }, 2000);
    } catch {
      setError(lang === "pt" ? "Não foi possível conectar ao servidor" : "サーバーに接続できません");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">{t("changePassword_success")}</h2>
            <p className="text-sm text-muted-foreground">
              {lang === "pt" ? "Redirecionando para o painel..." : "ダッシュボードに移動します..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Language toggle */}
      <div className="fixed top-4 right-4 z-50">
        <Button variant="outline" size="sm" onClick={toggleLang} className="text-xs">
          <Globe className="h-3 w-3 mr-1.5" />
          {lang === "ja" ? "PT" : "JP"}
        </Button>
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            充寵グループ
          </h1>
          <div className="w-16 h-0.5 bg-gold mx-auto mt-4" />
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">{t("changePassword_title")}</CardTitle>
            <CardDescription className="text-center">
              {t("changePassword_mustChange")}
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
                <Label htmlFor="currentPassword" className="text-sm font-medium">
                  {lang === "pt" ? "Senha atual (temporária)" : "現在のパスワード（仮パスワード）"}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    placeholder={lang === "pt" ? "Digite a senha atual" : "現在のパスワードを入力"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    autoComplete="current-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium">
                  {t("changePassword_new")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    placeholder={lang === "pt" ? "Nova senha (mínimo 6 caracteres)" : "6文字以上の新しいパスワード"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">
                  {t("changePassword_confirm")}
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showNew ? "text" : "password"}
                    placeholder={lang === "pt" ? "Confirme a nova senha" : "新しいパスワードを再入力"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">{t("changePassword_mismatch")}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gold text-background hover:bg-gold-dim font-medium"
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
              >
                {loading
                  ? (lang === "pt" ? "Alterando..." : "変更中...")
                  : t("changePassword_button")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
