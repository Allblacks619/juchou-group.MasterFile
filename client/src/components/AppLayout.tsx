import { useAuth } from "@/_core/hooks/useAuth";
import {
  Building2,
  Users,
  UserPlus,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  KeyRound,
  UserCircle,
  DollarSign,
  CalendarDays,
  FileText,
} from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/app", label: "ダッシュボード", icon: LayoutDashboard },
  { path: "/app/my-profile", label: "マイプロフィール", icon: UserCircle },
  { path: "/app/invitations", label: "招待管理", icon: UserPlus, adminOnly: true },
  { path: "/app/company", label: "会社設定", icon: Building2, adminOnly: true },
  { path: "/app/employees", label: "従業員管理", icon: Users },
  { path: "/app/rates", label: "単価管理", icon: DollarSign, adminOnly: true },
  { path: "/app/my-attendance", label: "マイ出面表", icon: CalendarDays },
  { path: "/app/attendance", label: "出面表管理", icon: CalendarDays, adminOnly: true },
  { path: "/app/invoices", label: "請求書", icon: FileText, adminOnly: true },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Check if user must change password
  useEffect(() => {
    if (user && (user as any).mustChangePassword) {
      window.location.href = "/app/change-password";
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to custom login page using full page navigation
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/app/login")) {
      window.location.href = "/app/login";
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">ログインページに移動中...</p>
      </div>
    );
  }

  const appRole = (user as any)?.appRole || "worker";

  const handleLogout = async () => {
    await logout();
    window.location.href = "/app/login";
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 lg:transform-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-border">
            <Link href="/app" className="flex items-center gap-2 no-underline">
              <span className="text-lg font-bold text-foreground">充寵グループ</span>
            </Link>
            <button
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems
              .filter((item) => !item.adminOnly || appRole === "admin" || appRole === "leader")
              .map((item) => {
                const isActive = location === item.path || (item.path !== "/app" && location.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors no-underline ${
                      isActive
                        ? "bg-gold/10 text-gold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
                {user?.name?.[0] || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || (user as any)?.loginId || "ユーザー"}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{appRole}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => window.location.href = "/app/change-password"}
              >
                <KeyRound className="h-3 w-3 mr-1" />
                パスワード
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs"
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
            <div className="mt-2">
              <a href="/" className="block no-underline">
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                  コーポレートサイトへ
                </Button>
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center px-4 border-b border-border lg:px-6">
          <button
            className="lg:hidden mr-4 text-muted-foreground hover:text-foreground"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
