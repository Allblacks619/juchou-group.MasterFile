export type AppUpdateAudience = "all" | "manager" | "worker";

export type AppUpdate = {
  id: string;
  date: string;
  audience: AppUpdateAudience;
  titleJa: string;
  titlePt: string;
  detailJa: string;
  detailPt: string;
  areas: string[];
};

/** 新しい順。main のユーザー向け変更時に自動更新される。 */
export const APP_UPDATES: AppUpdate[] = [
  {
    id: "d08b6947f778",
    date: "2026-08-31",
    audience: "all",
    titleJa: "アプリ機能を更新しました",
    titlePt: "Atualização: Funções do aplicativo",
    detailJa: "HOTFIX: 作業員名簿PDFの Unknown font format を修正",
    detailPt: "Funções, especificações ou fluxo de uso desta área foram atualizados.",
    areas: ["アプリ機能"],
  },

];
