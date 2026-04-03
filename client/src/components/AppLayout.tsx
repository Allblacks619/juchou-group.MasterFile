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
  FolderOpen,
  Globe,
  HelpCircle,
} from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAppLang } from "@/contexts/AppLanguageContext";
import type { TranslationKey } from "@/lib/appTranslations";

const navItems: { path: string; labelKey: TranslationKey; icon: any; adminOnly?: boolean }[] = [
  { path: "/app", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { path: "/app/my-profile", labelKey: "nav_myProfile", icon: UserCircle },
  { path: "/app/invitations", labelKey: "nav_invitations", icon: UserPlus, adminOnly: true },
  { path: "/app/company", labelKey: "nav_company", icon: Building2, adminOnly: true },
  { path: "/app/employees", labelKey: "nav_employees", icon: Users, adminOnly: true },
  { path: "/app/projects", labelKey: "nav_projects", icon: FolderOpen, adminOnly: true },
  { path: "/app/rates", labelKey: "nav_rates", icon: DollarSign, adminOnly: true },
  { path: "/app/attendance", labelKey: "nav_attendance", icon: CalendarDays, adminOnly: true },
  { path: "/app/invoices", labelKey: "nav_invoices", icon: FileText, adminOnly: true },
  { path: "/app/support", labelKey: "nav_support", icon: HelpCircle },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { lang, toggleLang, t } = useAppLang();

  // Check if user must change password
  useEffect(() => {
    if (user && (user as any).mustChangePassword) {
      window.location.href = "/app/change-password";
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/app/login")) {
      window.location.href = "/app/login";
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t("nav_redirectingLogin")}</p>
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
                    {t(item.labelKey)}
                  </Link>
                );
              })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-border">
            {/* Language toggle */}
            <Button
              variant="outline"
              size="sm"
              className="w-full mb-3 text-xs"
              onClick={toggleLang}
            >
              <Globe className="h-3 w-3 mr-1.5" />
              {lang === "ja" ? "Português" : "日本語"}
            </Button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold text-sm font-bold">
                {user?.name?.[0] || "U"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || (user as any)?.loginId || (lang === "pt" ? "Usuário" : "ユーザー")}</p>
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
                {t("nav_password")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs"
                title={t("nav_logout")}
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
            <div className="mt-2">
              <a href="/" className="block no-underline">
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground">
                  {t("nav_corporateSite")}
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
