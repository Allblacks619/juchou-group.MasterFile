import { createContext, useContext, type ReactNode } from "react";
import { genbaTr, type GenbaLang } from "@shared/genba/i18n";

/**
 * 現場ビジョンの表示言語 (ja/pt) をツリー全体へ配る Context。
 * GenbaShell で <GenbaLangProvider> を張り、各パネルは useGenbaT() だけで翻訳できる
 * (props バケツリレー不要)。Provider が無い箇所では既定 "ja"。
 */
const GenbaLangContext = createContext<GenbaLang>("ja");

export function GenbaLangProvider({ lang, children }: { lang: GenbaLang; children: ReactNode }) {
  return <GenbaLangContext.Provider value={lang}>{children}</GenbaLangContext.Provider>;
}

/** 現在の表示言語 */
export function useGenbaLang(): GenbaLang {
  return useContext(GenbaLangContext);
}

/**
 * 翻訳関数フック。t("日本語原文") で現在言語の訳を返す。
 * PT 未登録キーは原文をそのまま返す (フォールバック)。材料名/作業名は翻訳せず
 * dispName/romanize 側で「日本語 — Romaji」表示にすること。
 */
export function useGenbaT(): (ja: string) => string {
  const lang = useContext(GenbaLangContext);
  return (ja: string) => genbaTr(ja, lang);
}
