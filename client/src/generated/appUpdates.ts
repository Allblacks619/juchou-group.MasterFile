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
    id: "onboarding-guide-v1",
    date: "2026-08-26",
    audience: "all",
    titleJa: "初回ガイドと変更通知を追加しました",
    titlePt: "Novo guia inicial e avisos de atualização",
    detailJa: "管理者・作業員それぞれに合わせた使い方ガイドと、新機能・仕様変更を知らせるアプリ内通知を追加しました。",
    detailPt: "Adicionamos um guia de uso específico para administradores e trabalhadores, além de avisos internos sobre novas funções e mudanças de fluxo.",
    areas: ["使い方ガイド", "お知らせ"],
  },
];
