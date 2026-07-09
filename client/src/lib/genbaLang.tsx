import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { dispName, normalizeLang, type GenbaLang } from "@/lib/genbaRomaji";

/**
 * 現場ビジョン: 表示言語 (日本語 / ポルトガル語) のコンテキスト。
 * プロトタイプ GenbaAppV18.jsx の LANG グローバル + dispName を React コンテキスト化。
 * pt のときだけ作業・材料・エリア名を「日本語 — Romaji」で併記する (CUD色などは不変)。
 * 純粋関数 dispName / normalizeLang は genbaRomaji.ts に置いてテスト可能にしている。
 */

export type { GenbaLang };

type LangCtx = {
  lang: GenbaLang;
  setLang: (l: GenbaLang) => void;
  toggle: () => void;
  /** 現在の言語で表示名を組み立てる。romaji 省略時は自動ローマ字化 */
  disp: (name: string, romaji?: string | null) => string;
};

const GenbaLangContext = createContext<LangCtx | null>(null);

export function GenbaLangProvider({ initialLang, children }: { initialLang?: string | null; children: ReactNode }) {
  const [lang, setLangState] = useState<GenbaLang>(() => normalizeLang(initialLang));
  const update = trpc.genba.settings.update.useMutation();

  const setLang = useCallback((l: GenbaLang) => {
    setLangState(l);
    // 端末をまたいで保持 (失敗しても表示は切り替わる)
    update.mutate({ lang: l });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LangCtx>(() => ({
    lang,
    setLang,
    toggle: () => setLang(lang === "ja" ? "pt" : "ja"),
    disp: (name: string, romaji?: string | null) => dispName(name, romaji, lang),
  }), [lang, setLang]);

  return <GenbaLangContext.Provider value={value}>{children}</GenbaLangContext.Provider>;
}

/** 言語トグルボタン (🇯🇵/🇧🇷)。現在の言語の旗を表示し、押すと切り替え */
export function LangToggle({ className }: { className?: string }) {
  const { lang, toggle } = useGenbaLang();
  return (
    <button
      type="button"
      onClick={toggle}
      title="日本語 / Português"
      aria-label="言語を切り替え"
      className={className ?? "inline-flex items-center justify-center h-9 w-9 rounded-md border border-border text-lg leading-none hover:bg-muted"}
    >
      {lang === "ja" ? "🇯🇵" : "🇧🇷"}
    </button>
  );
}

/** コンテキスト外 (Provider未装着) でも日本語で安全に動くフォールバック付きフック */
export function useGenbaLang(): LangCtx {
  const ctx = useContext(GenbaLangContext);
  if (ctx) return ctx;
  return {
    lang: "ja",
    setLang: () => {},
    toggle: () => {},
    disp: (name: string) => name,
  };
}
