import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { type AppLang, type TranslationKey, getTranslation, formatMonth, getWeekdayName } from "@/lib/appTranslations";

interface AppLanguageContextType {
  lang: AppLang;
  setLang: (lang: AppLang) => void;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
  formatMonthStr: (year: number, month: number) => string;
  weekday: (dayIndex: number) => string;
}

const AppLanguageContext = createContext<AppLanguageContextType | null>(null);

const STORAGE_KEY = "app-lang";

function getInitialLang(): AppLang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "ja") return stored;
  } catch {}
  return "ja";
}

export function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLang>(getInitialLang);

  const setLang = useCallback((newLang: AppLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {}
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "ja" ? "pt" : "ja");
  }, [lang, setLang]);

  const t = useCallback(
    (key: TranslationKey) => getTranslation(key, lang),
    [lang]
  );

  const formatMonthStr = useCallback(
    (year: number, month: number) => formatMonth(year, month, lang),
    [lang]
  );

  const weekday = useCallback(
    (dayIndex: number) => getWeekdayName(dayIndex, lang),
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, formatMonthStr, weekday }),
    [lang, setLang, toggleLang, t, formatMonthStr, weekday]
  );

  return (
    <AppLanguageContext.Provider value={value}>
      {children}
    </AppLanguageContext.Provider>
  );
}

export function useAppLang() {
  const ctx = useContext(AppLanguageContext);
  if (!ctx) throw new Error("useAppLang must be used within AppLanguageProvider");
  return ctx;
}
