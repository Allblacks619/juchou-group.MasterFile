import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLocation } from "wouter";
import { type Lang, translations } from "@/lib/translations";

interface LanguageContextValue {
  lang: Lang;
  t: typeof translations;
  prefix: string;
  switchLang: (newLang: Lang) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectLang(pathname: string): Lang {
  if (pathname.startsWith("/pt")) return "pt";
  if (pathname.startsWith("/en")) return "en";
  return "ja";
}

function langPrefix(lang: Lang): string {
  if (lang === "ja") return "";
  return `/${lang}`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const lang = detectLang(location);
  const prefix = langPrefix(lang);

  const switchLang = useMemo(
    () => (newLang: Lang) => {
      const stripped = location
        .replace(/^\/(pt|en)/, "")
        .replace(/^$/, "/");
      return `${langPrefix(newLang)}${stripped === "/" ? "" : stripped}` || "/";
    },
    [location],
  );

  const value = useMemo(
    () => ({ lang, t: translations, prefix, switchLang }),
    [lang, prefix, switchLang],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
