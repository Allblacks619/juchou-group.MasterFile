import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { AppLanguageProvider } from "./contexts/AppLanguageContext";
import RoleGuard from "./components/RoleGuard";
import Home from "./pages/Home";
import Recruit from "./pages/Recruit";
import Contact from "./pages/Contact";
import AppLayout from "./components/AppLayout";
import AppLogin from "./pages/AppLogin";
import AppChangePassword from "./pages/AppChangePassword";
import AppInviteAccept from "./pages/AppInviteAccept";

// Lazy load app pages
const AppDashboard = lazy(() => import("./pages/AppDashboard"));
const AppInvitations = lazy(() => import("./pages/AppInvitations"));
const AppCompany = lazy(() => import("./pages/AppCompany"));
const AppEmployees = lazy(() => import("./pages/AppEmployees"));
const AppEmployeeDetail = lazy(() => import("./pages/AppEmployeeDetail"));
const AppMyProfile = lazy(() => import("./pages/AppMyProfile"));
const AppProjects = lazy(() => import("./pages/AppProjects"));
const AppRates = lazy(() => import("./pages/AppRates"));
const AppAttendance = lazy(() => import("./pages/AppAttendance"));
const AppMyClosing = lazy(() => import("./pages/AppMyClosing"));
const AppWorkReports = lazy(() => import("./pages/AppWorkReports"));
const AppInvoices = lazy(() => import("./pages/AppInvoices"));
const AppClosings = lazy(() => import("./pages/AppClosings"));
const AppMonthlyCloseV2 = lazy(() => import("./pages/AppMonthlyCloseV2"));
const AppWorkerInvoiceV2 = lazy(() => import("./pages/AppWorkerInvoiceV2"));
const AppPayments = lazy(() => import("./pages/AppPayments"));
const AppReceivables = lazy(() => import("./pages/AppReceivables"));
const AppAuditLogs = lazy(() => import("./pages/AppAuditLogs"));
const AppConfirmationPdf = lazy(() => import("./pages/AppConfirmationPdf"));
const AppSupport = lazy(() => import("./pages/AppSupport"));
const AppPasswordResets = lazy(() => import("./pages/AppPasswordResets"));
const AppResetPassword = lazy(() => import("./pages/AppResetPassword"));
const AppGenba = lazy(() => import("./pages/AppGenba"));
const AppGenbaShare = lazy(() => import("./pages/AppGenbaShare"));
const AppGenbaWorker = lazy(() => import("./pages/AppGenbaWorker"));

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
  return null;
}

function AppFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-muted-foreground">読み込み中...</p>
    </div>
  );
}

/** 管理者系（manager以上）のみのページ。サーバー側 isManagerLike と同じ集合にすること */
const ADMIN_LEADER: ("super_admin" | "admin" | "manager")[] = ["super_admin", "admin", "manager"];
const SUPER_ADMIN: ("super_admin")[] = ["super_admin"];

/** Protected app routes wrapped in AppLayout with role guards */
function AppRoutes() {
  return (
    <AppLayout>
      <Suspense fallback={<AppFallback />}>
        <Switch>
          {/* All roles can access */}
          <Route path="/app" component={AppDashboard} />
          <Route path="/app/my-profile" component={AppMyProfile} />
          <Route path="/app/my-closing" component={AppMyClosing} />
          <Route path="/app/work-reports" component={AppWorkReports} />
          <Route path="/app/support" component={AppSupport} />
          <Route path="/app/genba" component={AppGenba} />

          {/* エリア別 表示/ブロック設定で判定（個人オーバーライド対応）。監査ログのみ従来ロール判定 */}
          <Route path="/app/invitations">
            <RoleGuard area="company"><AppInvitations /></RoleGuard>
          </Route>
          <Route path="/app/company">
            <RoleGuard area="company"><AppCompany /></RoleGuard>
          </Route>
          <Route path="/app/employees">
            <RoleGuard area="employees"><AppEmployees /></RoleGuard>
          </Route>
          <Route path="/app/employees/:id">
            {(params) => (
              <RoleGuard area="employees"><AppEmployeeDetail /></RoleGuard>
            )}
          </Route>
          <Route path="/app/projects">
            <RoleGuard area="projects"><AppProjects /></RoleGuard>
          </Route>
          <Route path="/app/rates">
            <RoleGuard area="rates"><AppRates /></RoleGuard>
          </Route>
          <Route path="/app/attendance">
            <RoleGuard area="attendance"><AppAttendance /></RoleGuard>
          </Route>
          <Route path="/app/invoices">
            <RoleGuard area="billing"><AppInvoices /></RoleGuard>
          </Route>
          <Route path="/app/monthly-close-v2">
            <RoleGuard area="closing"><AppMonthlyCloseV2 /></RoleGuard>
          </Route>
          <Route path="/app/worker-invoice-v2">
            <RoleGuard area="closing"><AppWorkerInvoiceV2 /></RoleGuard>
          </Route>
          <Route path="/app/closings">
            <RoleGuard area="closing"><AppClosings /></RoleGuard>
          </Route>
          <Route path="/app/payments">
            <RoleGuard area="payments"><AppPayments /></RoleGuard>
          </Route>
          <Route path="/app/receivables">
            <RoleGuard area="billing"><AppReceivables /></RoleGuard>
          </Route>
          <Route path="/app/audit">
            <RoleGuard allowed={ADMIN_LEADER}><AppAuditLogs /></RoleGuard>
          </Route>
          <Route path="/app/confirmation-pdf">
            <AppConfirmationPdf />
          </Route>
          <Route path="/app/password-resets">
            <RoleGuard allowed={SUPER_ADMIN}><AppPasswordResets /></RoleGuard>
          </Route>

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        {/* Japanese (default) */}
        <Route path="/" component={Home} />
        <Route path="/recruit" component={Recruit} />
        <Route path="/contact" component={Contact} />

        {/* Portuguese */}
        <Route path="/pt" component={Home} />
        <Route path="/pt/recruit" component={Recruit} />
        <Route path="/pt/contact" component={Contact} />

        {/* English */}
        <Route path="/en" component={Home} />
        <Route path="/en/recruit" component={Recruit} />
        <Route path="/en/contact" component={Contact} />

        {/* 外部共有ビュー (非認証・AppLayout外・閲覧専用) */}
        <Route path="/app/share/:token">
          <Suspense fallback={<AppFallback />}><AppGenbaShare /></Suspense>
        </Route>

        {/* 作業員専用リンク (非認証・AppLayout外・自分の担当の確認と更新) */}
        <Route path="/app/w/:token">
          <Suspense fallback={<AppFallback />}><AppGenbaWorker /></Suspense>
        </Route>

        {/* Custom Auth Pages (no AppLayout wrapper, no auth required) */}
        <Route path="/app/login" component={AppLogin} />
        <Route path="/app/change-password" component={AppChangePassword} />
        <Route path="/app/invite/:token" component={AppInviteAccept} />
        <Route path="/app/reset-password/:token" component={AppResetPassword} />

        {/* Business App Routes (auth required via AppLayout) */}
        <Route path="/app" component={AppRoutes} />
        <Route path="/app/*" component={AppRoutes} />

        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <LanguageProvider>
            <AppLanguageProvider>
              <Toaster />
              <Router />
            </AppLanguageProvider>
          </LanguageProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
