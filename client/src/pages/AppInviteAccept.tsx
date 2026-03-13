import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle, Loader2, UserPlus } from "lucide-react";

export default function AppInviteAccept() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [, navigate] = useLocation();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Verify invitation token
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
        setError(data.error || "招待の受諾に失敗しました");
        return;
      }

      setSuccess(true);
      // Redirect to password change page after 2 seconds
      setTimeout(() => {
        navigate("/app/change-password");
      }, 2000);
    } catch {
      setError("サーバーに接続できません");
    } finally {
      setAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-gold mx-auto" />
            <p className="text-muted-foreground">招待リンクを確認中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">アカウントが作成されました</h2>
            <p className="text-sm text-muted-foreground">
              パスワード変更ページに移動します...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!verification?.valid) {
    const reason = verification?.reason || verifyError?.message || "招待リンクが無効です";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
              <h2 className="text-xl font-bold">招待リンクが無効です</h2>
              <p className="text-sm text-muted-foreground">{reason}</p>
              <Button
                variant="outline"
                onClick={() => navigate("/app/login")}
                className="mt-4"
              >
                ログインページへ
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const roleLabels: Record<string, string> = {
    admin: "統合管理者",
    leader: "責任者",
    worker: "作業員",
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            充寵グループ
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            業務管理システム
          </p>
          <div className="w-16 h-0.5 bg-gold mx-auto mt-4" />
        </div>

        <Card className="border-border bg-card">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center flex items-center justify-center gap-2">
              <UserPlus className="h-5 w-5" />
              招待を受諾
            </CardTitle>
            <CardDescription className="text-center">
              以下の内容でアカウントが作成されます
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
                <span className="text-sm text-muted-foreground">ログインID</span>
                <span className="text-sm font-medium">{verification.loginId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">権限</span>
                <span className="text-sm font-medium">
                  {roleLabels[verification.assignedRole || "worker"] || verification.assignedRole}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              受諾後、仮パスワードでログインし、パスワードの変更が必要です
            </p>

            <Button
              onClick={handleAccept}
              className="w-full bg-gold text-background hover:bg-gold-dim font-medium"
              disabled={accepting}
            >
              {accepting ? "処理中..." : "招待を受諾してアカウントを作成"}
            </Button>

            <div className="text-center">
              <a
                href="/app/login"
                className="text-sm text-muted-foreground hover:text-gold transition-colors no-underline"
              >
                既にアカウントをお持ちの方はこちら
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
