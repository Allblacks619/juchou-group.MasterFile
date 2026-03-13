import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Users, FileText, Building2, UserPlus } from "lucide-react";
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

      {(appRole === "admin" || appRole === "leader") && <AdminDashboard />}
      {appRole === "worker" && <WorkerDashboard />}
    </div>
  );
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
  const myProfile = trpc.employee.getMyProfile.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">マイプロフィール</CardTitle>
        </CardHeader>
        <CardContent>
          {myProfile.isLoading && (
            <p className="text-muted-foreground">読み込み中...</p>
          )}
          {myProfile.data ? (
            <div className="space-y-2">
              <p>
                <span className="text-muted-foreground">氏名：</span>
                {myProfile.data.nameKanji}
              </p>
              {myProfile.data.nameKana && (
                <p>
                  <span className="text-muted-foreground">フリガナ：</span>
                  {myProfile.data.nameKana}
                </p>
              )}
              {myProfile.data.phone && (
                <p>
                  <span className="text-muted-foreground">電話番号：</span>
                  {myProfile.data.phone}
                </p>
              )}
            </div>
          ) : (
            !myProfile.isLoading && (
              <p className="text-muted-foreground">
                プロフィールがまだ登録されていません。管理者にお問い合わせください。
              </p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
