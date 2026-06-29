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
  FileCheck2,
  Wallet,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAppLang } from "@/contexts/AppLanguageContext";
import { isManagerLikeAppRole } from "@/lib/appRoles";
import type { TranslationKey } from "@/lib/appTranslations";

type NavAudience = "super_admin" | "manager" | "worker";
type NavItem = { path: string; labelKey: TranslationKey; icon: any; roles: NavAudience[] };

interface NavGroup {
  groupKey: string;
  items: NavItem[];
  icon: any;
}

const navItems: NavItem[] = [
  { path: "/app", labelKey: "nav_dashboard", icon: LayoutDashboard, roles: ["manager", "worker"] },
  { path: "/app/my-profile", labelKey: "nav_myProfile", icon: UserCircle, roles: ["manager", "worker"] },
  { path: "/app/my-closing", labelKey: "nav_myClosing", icon: FileCheck2, roles: ["worker"] },
  { path: "/app/invitations", labelKey: "nav_invitations", icon: UserPlus, roles: ["manager"] },
  { path: "/app/company", labelKey: "nav_company", icon: Building2, roles: ["manager"] },
  { path: "/app/employees", labelKey: "nav_employees", icon: Users, roles: ["manager"] },
  { path: "/app/projects", labelKey: "nav_projects", icon: FolderOpen, roles: ["manager"] },
  { path: "/app/rates", labelKey: "nav_rates", icon: DollarSign, roles: ["manager"] },
  { path: "/app/attendance", labelKey: "nav_attendance", icon: CalendarDays, roles: ["manager"] },
  { path: "/app/invoices", labelKey: "nav_invoices", icon: FileText, roles: ["manager"] },
  { path: "/app/monthly-close-v2", labelKey: "nav_monthlyCloseV2", icon: FileCheck2, roles: ["manager"] },
  { path: "/app/worker-invoice-v2", labelKey: "nav_workerInvoiceV2", icon: FileText, roles: ["manager"] },
  { path: "/app/closings", labelKey: "nav_closings", icon: FileCheck2, roles: ["manager"] },
  { path: "/app/confirmation-pdf", labelKey: "nav_confirmationPdf", icon: FileText, roles: ["manager", "worker"] },
  { path: "/app/payments", labelKey: "nav_payments", icon: Wallet, roles: ["manager"] },
  { path: "/app/receivables", labelKey: "nav_receivables", icon: FileText, roles: ["manager"] },
  { path: "/app/audit", labelKey: "nav_audit", icon: ClipboardList, roles: ["manager"] },
  { path: "/app/password-resets", labelKey: "nav_passwordResets", icon: KeyRound, roles: ["super_admin"] },
  { path: "/app/support", labelKey: "nav_support", icon: HelpCircle, roles: ["manager", "worker"] },
];

// Group menu items by category
function getNavGroups(): NavGroup[] {
  return [
    {
      groupKey: "nav_basicInfo",
      icon: Building2,
      items: navItems.filter(item => 
        ["nav_invitations", "nav_company", "nav_employees"].includes(item.labelKey)
      ),
    },
    {
      groupKey: "nav_siteManagement",
      icon: FolderOpen,
      items: navItems.filter(item => 
        ["nav_projects", "nav_rates", "nav_attendance"].includes(item.labelKey)
      ),
    },
    {
      groupKey: "nav_finance",
      icon: DollarSign,
      items: navItems.filter(item => 
        ["nav_invoices", "nav_monthlyCloseV2", "nav_workerInvoiceV2", "nav_closings", "nav_confirmationPdf", "nav_payments", "nav_receivables"].includes(item.labelKey)
      ),
    },
  ];
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["nav_basicInfo", "nav_siteManagement", "nav_finance"]));
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

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  const navGroups = getNavGroups();

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
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {/* Dashboard and Profile - Always visible at top */}
            {navItems
              .filter((item) => ["nav_dashboard", "nav_myProfile", "nav_myClosing"].includes(item.labelKey) && isNavItemVisible(item, appRole))
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

            {/* Separator */}
            {isManagerLikeAppRole(appRole) && (
              <div className="my-2 border-t border-border" />
            )}

            {/* Grouped menu items */}
            {isManagerLikeAppRole(appRole) && navGroups.map((group) => {
              const visibleItems = group.items.filter((item) => isNavItemVisible(item, appRole));
              if (visibleItems.length === 0) return null;

              const isExpanded = expandedGroups.has(group.groupKey);

              return (
                <div key={group.groupKey}>
                  <button
                    onClick={() => toggleGroup(group.groupKey)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <group.icon className="h-4 w-4" />
                      <span>{t(group.groupKey as TranslationKey)}</span>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="ml-4 space-y-1 mt-1">
                      {visibleItems.map((item) => {
                        const isActive = location === item.path || (item.path !== "/app" && location.startsWith(item.path));
                        return (
                          <Link
                            key={item.path}
                            href={item.path}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors no-underline ${
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
                    </div>
                  )}
                </div>
              );
            })}

            {/* Support - Always at bottom of menu */}
            {navItems
              .filter((item) => item.labelKey === "nav_support" && isNavItemVisible(item, appRole))
              .map((item) => {
                const isActive = location === item.path;
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

function isNavItemVisible(item: NavItem, appRole: string) {
  if (item.roles.includes("worker") && appRole === "worker") {
    return true;
  }

  if (item.roles.includes("super_admin") && appRole === "super_admin") {
    return true;
  }

  return item.roles.includes("manager") && isManagerLikeAppRole(appRole);
}
