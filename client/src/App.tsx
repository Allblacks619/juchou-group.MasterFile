import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Home from "./pages/Home";
import Recruit from "./pages/Recruit";
import Contact from "./pages/Contact";

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location]);
  return null;
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
