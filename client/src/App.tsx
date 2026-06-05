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
const AppInvoices = lazy(() => import("./pages/AppInvoices"));
const AppClosings = lazy(() => import("./pages/AppClosings"));
const AppMonthlyCloseV2 = lazy(() => import("./pages/AppMonthlyCloseV2"));
const AppPayments = lazy(() => import("./pages/AppPayments"));
const AppReceivables = lazy(() => import("./pages/AppReceivables"));
const AppAuditLogs = lazy(() => import("./pages/AppAuditLogs"));
const AppConfirmationPdf = lazy(() => import("./pages/AppConfirmationPdf"));
const AppSupport = lazy(() => import("./pages/AppSupport"));
const AppPasswordResets = lazy(() => import("./pages/AppPasswordResets"));
const AppResetPassword = lazy(() => import("./pages/AppResetPassword"));

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

/** Admin/Leader only pages */
const ADMIN_LEADER: ("super_admin" | "admin" | "leader")[] = ["super_admin", "admin", "leader"];
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
          <Route path="/app/support" component={AppSupport} />

          {/* Admin/Leader only */}
          <Route path="/app/invitations">
            <RoleGuard allowed={ADMIN_LEADER}><AppInvitations /></RoleGuard>
          </Route>
          <Route path="/app/company">
            <RoleGuard allowed={ADMIN_LEADER}><AppCompany /></RoleGuard>
          </Route>
          <Route path="/app/employees">
            <RoleGuard allowed={ADMIN_LEADER}><AppEmployees /></RoleGuard>
          </Route>
          <Route path="/app/employees/:id">
            {(params) => (
              <RoleGuard allowed={ADMIN_LEADER}><AppEmployeeDetail /></RoleGuard>
            )}
          </Route>
          <Route path="/app/projects">
            <RoleGuard allowed={ADMIN_LEADER}><AppProjects /></RoleGuard>
          </Route>
          <Route path="/app/rates">
            <RoleGuard allowed={ADMIN_LEADER}><AppRates /></RoleGuard>
          </Route>
          <Route path="/app/attendance">
            <RoleGuard allowed={ADMIN_LEADER}><AppAttendance /></RoleGuard>
          </Route>
          <Route path="/app/invoices">
            <RoleGuard allowed={ADMIN_LEADER}><AppInvoices /></RoleGuard>
          </Route>
          <Route path="/app/monthly-close-v2">
            <RoleGuard allowed={ADMIN_LEADER}><AppMonthlyCloseV2 /></RoleGuard>
          </Route>
          <Route path="/app/closings">
            <RoleGuard allowed={ADMIN_LEADER}><AppClosings /></RoleGuard>
          </Route>
          <Route path="/app/payments">
            <RoleGuard allowed={ADMIN_LEADER}><AppPayments /></RoleGuard>
          </Route>
          <Route path="/app/receivables">
            <RoleGuard allowed={ADMIN_LEADER}><AppReceivables /></RoleGuard>
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
