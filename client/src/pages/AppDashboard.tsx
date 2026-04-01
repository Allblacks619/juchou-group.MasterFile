import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  Users,
  UserPlus,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  UserCircle,
  Loader2,
} from "lucide-react";
import { useLocation } from "wouter";

export default function AppDashboard() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole || "worker";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground mt-1">
          ようこそ、{user?.name || "ユーザー"}さん
        </p>
      </div>

      {/* Profile completion alert - shown for all roles */}
      <ProfileCompletionAlert />

      {(appRole === "admin" || appRole === "leader") && <AdminDashboard />}
      {appRole === "worker" && <WorkerDashboard />}
    </div>
  );
}

/** Alert banner for missing required profile fields */
function ProfileCompletionAlert() {
  const [, setLocation] = useLocation();
  const { data: missingInfo, isLoading } = trpc.employee.getMyMissingFields.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) return null;

  // No profile yet
  if (missingInfo && !missingInfo.hasProfile) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">プロフィールが未登録です</p>
                <p className="text-sm text-muted-foreground mt-1">
                  現場への提出書類に必要な情報を入力してください。
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gold text-background hover:bg-gold/90 shrink-0"
              onClick={() => setLocation("/app/my-profile")}
            >
              入力する
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Has profile but missing fields
  if (missingInfo && missingInfo.missingFields.length > 0) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">
                  未記入の必須項目があります（{missingInfo.missingFields.length}件）
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {missingInfo.missingFields.slice(0, 6).map((f) => (
                    <Badge key={f.key} variant="outline" className="text-xs">
                      {f.label}
                    </Badge>
                  ))}
                  {missingInfo.missingFields.length > 6 && (
                    <Badge variant="outline" className="text-xs">
                      +{missingInfo.missingFields.length - 6}件
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gold text-background hover:bg-gold/90 shrink-0"
              onClick={() => setLocation("/app/my-profile")}
            >
              入力する
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // All complete
  if (missingInfo && missingInfo.completionPercent === 100) {
    return (
      <Card className="border-green-500/20 bg-green-500/5">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
            <p className="text-sm text-green-500 font-medium">
              プロフィールの必須項目はすべて入力済みです
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function AdminDashboard() {
  const [, setLocation] = useLocation();
  const employeesQuery = trpc.employee.list.useQuery(undefined, {
    retry: false,
  });
  const invitationsQuery = trpc.invitation.list.useQuery(undefined, {
    retry: false,
  });

  const stats = [
    {
      title: "従業員数",
      value: employeesQuery.data?.length ?? "-",
      icon: Users,
      path: "/app/employees",
    },
    {
      title: "招待数",
      value: invitationsQuery.data?.length ?? "-",
      icon: UserPlus,
      path: "/app/invitations",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className="cursor-pointer hover:border-gold/30 transition-colors"
          onClick={() => setLocation(stat.path)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WorkerDashboard() {
  const [, setLocation] = useLocation();
  const myProfile = trpc.employee.getMyProfile.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="space-y-4">
      <Card
        className="cursor-pointer hover:border-gold/30 transition-colors"
        onClick={() => setLocation("/app/my-profile")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            マイプロフィール
          </CardTitle>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {myProfile.isLoading && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground text-sm">読み込み中...</p>
            </div>
          )}
          {myProfile.data ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">氏名：</span>
                <span className="font-medium">{myProfile.data.nameKanji}</span>
              </div>
              {myProfile.data.phone && (
                <div>
                  <span className="text-muted-foreground">電話番号：</span>
                  <span>{myProfile.data.phone}</span>
                </div>
              )}
              {myProfile.data.email && (
                <div>
                  <span className="text-muted-foreground">メール：</span>
                  <span>{myProfile.data.email}</span>
                </div>
              )}
            </div>
          ) : (
            !myProfile.isLoading && (
              <p className="text-muted-foreground text-sm">
                プロフィール情報を入力してください
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
