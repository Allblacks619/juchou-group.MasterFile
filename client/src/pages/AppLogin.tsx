import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, AlertCircle, Eye, EyeOff, Globe } from "lucide-react";
import { useAppLang } from "@/contexts/AppLanguageContext";

export default function AppLogin() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { lang, toggleLang, t } = useAppLang();

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
    </div>
  );
}
