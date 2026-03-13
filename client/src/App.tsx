import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
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

        {/* Custom Auth Pages (no AppLayout wrapper) */}
        <Route path="/app/login" component={AppLogin} />
        <Route path="/app/change-password" component={AppChangePassword} />
        <Route path="/app/invite/:token" component={AppInviteAccept} />

        {/* Business App Routes (auth required) */}
        <Route path="/app" nest>
          <AppLayout>
            <Suspense fallback={<AppFallback />}>
              <Switch>
                <Route path="/" component={AppDashboard} />
                <Route path="/invitations" component={AppInvitations} />
                <Route path="/company" component={AppCompany} />
                <Route path="/employees" component={AppEmployees} />
                <Route path="/employees/:id" component={AppEmployeeDetail} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </AppLayout>
        </Route>

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
            <Toaster />
            <Router />
          </LanguageProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
