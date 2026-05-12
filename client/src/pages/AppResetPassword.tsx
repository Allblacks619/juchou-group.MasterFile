import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";

export default function AppResetPassword() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  const resetMutation = trpc.passwordRecovery.resetWithToken.useMutation({
    onSuccess: () => {
      setCompleted(true);
      setError("");
    },
    onError: (e) => setError(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("パスワードは6文字以上にしてください");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("確認用パスワードが一致しません");
      return;
    }
    resetMutation.mutate({ token, newPassword, confirmPassword });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">充寵グループ</h1>
          <p className="text-sm text-muted-foreground mt-2">パスワード再設定</p>
          <div className="w-16 h-0.5 bg-gold mx-auto mt-4" />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>新しいパスワードを設定</CardTitle>
            <CardDescription>再設定リンクは一度だけ使用できます。</CardDescription>
          </CardHeader>
          <CardContent>
            {completed ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  パスワードを再設定しました。新しいパスワードでログインしてください。
                </div>
                <Button className="w-full bg-gold text-background hover:bg-gold-dim" onClick={() => window.location.href = "/app/login"}>
                  ログインへ
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="newPassword">新しいパスワード</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pl-10"
                      minLength={6}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full bg-gold text-background hover:bg-gold-dim" disabled={resetMutation.isPending}>
                  {resetMutation.isPending ? "再設定中..." : "パスワードを再設定"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
