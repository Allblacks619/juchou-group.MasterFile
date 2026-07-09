/**
 * 現場ビジョン: テーマ 16種 (プロトタイプ THEMES 移植・静的定数)。
 * ★CUD の優先度色・進捗色は全テーマで不変★ (genbaMap.ts の PRIORITY/STATUS)。
 * テーマが変えるのは背景(appBg)・ヘッダー(header)・アクセント(accent)等の装飾のみ。
 */

export type GenbaTheme = {
  key: string;
  label: string;
  accent: string;
  header: string;
  header2: string;
  headerText: string;
  appBg: string;
  card: string;
  mapBg: string;
  logo: string;
  tabOn: string;
  tabOff: string;
  glow: string;
  emblem: string;
};

export const GENBA_THEMES: Record<string, GenbaTheme> = {
  standard: { key: "standard", label: "ライト", accent: "#005AFF", header: "#1B2A41", header2: "#2b4162", headerText: "#fff", appBg: "radial-gradient(110% 55% at 50% 0%, rgba(0,90,255,0.055), transparent 62%), linear-gradient(180deg, #f6f8fb 0%, #edf0f5 100%)", card: "#fff", mapBg: "#dbe3ea", logo: "#F6AA00", tabOn: "#F6AA00", tabOff: "#94a3b8", glow: "none", emblem: "⚡" },
  dark: { key: "dark", label: "ダーク", accent: "#3b82f6", header: "#0f172a", header2: "#1e293b", headerText: "#e2e8f0", appBg: "radial-gradient(110% 55% at 50% 0%, rgba(59,130,246,0.13), transparent 58%), linear-gradient(180deg, #0e1627, #090e1a)", card: "#f1f5f9", mapBg: "#1e293b", logo: "#F6AA00", tabOn: "#F6AA00", tabOff: "#64748b", glow: "none", emblem: "⚡" },
  wafu: { key: "wafu", label: "和風", accent: "#8a2b2b", header: "#7a1f1f", header2: "#4a1010", headerText: "#f8ecd7", appBg: "radial-gradient(95% 48% at 85% 0%, rgba(201,162,39,0.10), transparent 58%), linear-gradient(180deg, #f8f3e9, #f0e8d8)", card: "#fffaf0", mapBg: "#e9e0cd", logo: "#c9a227", tabOn: "#f2d17c", tabOff: "#c9a58f", glow: "none", emblem: "和" },
  brasil: { key: "brasil", label: "ブラジル", accent: "#0b6b3a", header: "#0b6b3a", header2: "#064a27", headerText: "#fff7d6", appBg: "radial-gradient(95% 48% at 12% 0%, rgba(255,223,0,0.13), transparent 55%), linear-gradient(180deg, #f4f9f3, #e9f1e8)", card: "#ffffff", mapBg: "#e3efe4", logo: "#ffdf00", tabOn: "#ffdf00", tabOff: "#a7d4b8", glow: "none", emblem: "🇧🇷" },
  brasilwa: { key: "brasilwa", label: "ブラジル×日本", accent: "#bc002d", header: "#0b6b3a", header2: "#bc002d", headerText: "#fffbe8", appBg: "radial-gradient(85% 42% at 88% 0%, rgba(188,0,45,0.075), transparent 55%), linear-gradient(180deg, #f9f6ec, #f1ebdc)", card: "#fffdf5", mapBg: "#eee7d4", logo: "#ffdf00", tabOn: "#ffdf00", tabOff: "#d9c9a8", glow: "none", emblem: "絆" },
  ryu: { key: "ryu", label: "龍", accent: "#0f766e", header: "#0b3d3d", header2: "#062525", headerText: "#d6f5e8", appBg: "radial-gradient(95% 48% at 82% 0%, rgba(16,185,129,0.11), transparent 58%), linear-gradient(180deg, #f0f5f2, #e5ede8)", card: "#f7fbf9", mapBg: "#dce8e2", logo: "#10b981", tabOn: "#34d399", tabOff: "#6ea99a", glow: "0 0 10px rgba(16,185,129,0.55)", emblem: "龍" },
  tora: { key: "tora", label: "虎", accent: "#d97706", header: "#1a1206", header2: "#000000", headerText: "#fbbf24", appBg: "radial-gradient(95% 48% at 50% 0%, rgba(245,158,11,0.10), transparent 58%), linear-gradient(180deg, #faf7f0, #f1ebdd)", card: "#fffdf7", mapBg: "#efe8d8", logo: "#f59e0b", tabOn: "#fbbf24", tabOff: "#8a7a58", glow: "0 0 10px rgba(251,191,36,0.5)", emblem: "虎" },
  byakko: { key: "byakko", label: "白狐", accent: "#b91c1c", header: "#fdfdfd", header2: "#e5e7eb", headerText: "#b91c1c", appBg: "radial-gradient(85% 42% at 18% 0%, rgba(185,28,28,0.06), transparent 52%), linear-gradient(180deg, #fdfdfe, #eff2f6)", card: "#ffffff", mapBg: "#eef1f5", logo: "#b91c1c", tabOn: "#b91c1c", tabOff: "#9ca3af", glow: "none", emblem: "狐" },
  karasu: { key: "karasu", label: "烏天狗", accent: "#dc2626", header: "#111827", header2: "#000000", headerText: "#e5e7eb", appBg: "radial-gradient(95% 48% at 50% 0%, rgba(220,38,38,0.06), transparent 55%), linear-gradient(180deg, #f7f7f8, #ebebee)", card: "#fafafa", mapBg: "#e4e4e7", logo: "#374151", tabOn: "#dc2626", tabOff: "#6b7280", glow: "none", emblem: "天" },
  hyottoko: { key: "hyottoko", label: "ひょっとこ", accent: "#ea580c", header: "#d97706", header2: "#b45309", headerText: "#fff7ed", appBg: "radial-gradient(95% 50% at 50% 0%, rgba(234,88,12,0.13), transparent 58%), linear-gradient(180deg, #fff7ed, #f9ecd9)", card: "#fffdf8", mapBg: "#f6e9d5", logo: "#fde68a", tabOn: "#fff1c4", tabOff: "#f3cf9e", glow: "none", emblem: "火" },
  otafuku: { key: "otafuku", label: "おたふく", accent: "#db2777", header: "#f9a8d4", header2: "#ec4899", headerText: "#500724", appBg: "radial-gradient(85% 45% at 18% 0%, rgba(219,39,119,0.09), transparent 52%), linear-gradient(180deg, #fdf2f8, #f9e6f0)", card: "#ffffff", mapBg: "#fce7f3", logo: "#ffffff", tabOn: "#831843", tabOff: "#f5c1dd", glow: "none", emblem: "福" },
  okina: { key: "okina", label: "翁", accent: "#78716c", header: "#57534e", header2: "#292524", headerText: "#f5f5f4", appBg: "radial-gradient(95% 45% at 50% 0%, rgba(120,113,108,0.07), transparent 55%), linear-gradient(180deg, #fbfaf8, #efedea)", card: "#ffffff", mapBg: "#e7e5e4", logo: "#a8a29e", tabOn: "#e7e5e4", tabOff: "#a8a29e", glow: "none", emblem: "翁" },
  kabuki: { key: "kabuki", label: "歌舞伎(隈取)", accent: "#b91c1c", header: "#b91c1c", header2: "#111111", headerText: "#ffffff", appBg: "radial-gradient(90% 45% at 100% 0%, rgba(185,28,28,0.085), transparent 55%), linear-gradient(180deg, #faf8f6, #f1eeea)", card: "#ffffff", mapBg: "#e9e4e0", logo: "#ffffff", tabOn: "#fecaca", tabOff: "#a78b8b", glow: "0 0 8px rgba(185,28,28,0.5)", emblem: "隈" },
  cyber: { key: "cyber", label: "サイバーネオン", accent: "#d946ef", header: "#0f0f23", header2: "#1a0533", headerText: "#22d3ee", appBg: "radial-gradient(110% 60% at 50% 0%, #1c0b38, #0a0a14 70%)", card: "#f5f3ff", mapBg: "#17123a", logo: "#f0abfc", tabOn: "#22d3ee", tabOff: "#7c5bd1", glow: "0 0 16px rgba(217,70,239,0.85)", emblem: "◢" },
  denki: { key: "denki", label: "電気屋スタイル", accent: "#f59e0b", header: "#141414", header2: "#2b2b2b", headerText: "#facc15", appBg: "radial-gradient(95% 48% at 50% 0%, rgba(250,204,21,0.14), transparent 58%), linear-gradient(180deg, #f8f8f6, #edece7)", card: "#ffffff", mapBg: "#e7e5e4", logo: "#facc15", tabOn: "#facc15", tabOff: "#8a8a8a", glow: "none", emblem: "電" },
  shokunin: { key: "shokunin", label: "THE 職人", accent: "#b45309", header: "#232a33", header2: "#3a2b1c", headerText: "#e8d8b0", appBg: "radial-gradient(95% 48% at 80% 0%, rgba(180,83,9,0.09), transparent 58%), linear-gradient(180deg, #f4efe4, #e9e1d0)", card: "#fbf7ef", mapBg: "#ddd5c7", logo: "#b45309", tabOn: "#e8a33d", tabOff: "#8d99a8", glow: "none", emblem: "匠" },
};

export const GENBA_THEME_KEYS = Object.keys(GENBA_THEMES);
export const DEFAULT_GENBA_THEME = "dark";

export function resolveGenbaTheme(key: string | null | undefined): GenbaTheme {
  return (key && GENBA_THEMES[key]) || GENBA_THEMES[DEFAULT_GENBA_THEME];
}

/**
 * 背景(appBg)が暗いテーマ。これ以外は明るい背景のため、コンテンツの文字色は暗色にする。
 * (以前は全テーマでアプリのダークトークン=明色文字が使われ、明るい背景のテーマで
 *  文字が背景とほぼ同色になり読めなかった。)
 */
export const GENBA_DARK_THEME_KEYS = new Set(["dark", "cyber"]);

export function isGenbaThemeDark(key: string | null | undefined): boolean {
  return GENBA_DARK_THEME_KEYS.has(resolveGenbaTheme(key).key);
}

/** 明るい背景テーマ用のデザイントークン (暗い文字・明るい面) */
const GENBA_LIGHT_TOKENS: Record<string, string> = {
  "--background": "#ffffff",
  "--foreground": "#0f172a",
  "--card": "#ffffff",
  "--card-foreground": "#0f172a",
  "--popover": "#ffffff",
  "--popover-foreground": "#0f172a",
  "--muted": "#eef2f6",
  "--muted-foreground": "#52627a",
  "--border": "#dbe1ea",
  "--input": "#dbe1ea",
  "--secondary": "#eef2f6",
  "--secondary-foreground": "#0f172a",
  "--accent": "#eef2f6",
  "--accent-foreground": "#0f172a",
};

/** 暗い背景テーマ用のデザイントークン (明るい文字・暗い面) */
const GENBA_DARK_TOKENS: Record<string, string> = {
  "--background": "#0e1627",
  "--foreground": "#e6ebf2",
  "--card": "#141c2e",
  "--card-foreground": "#e6ebf2",
  "--popover": "#141c2e",
  "--popover-foreground": "#e6ebf2",
  "--muted": "#1e293b",
  "--muted-foreground": "#93a1b5",
  "--border": "#2a3446",
  "--input": "#2a3446",
  "--secondary": "#1e293b",
  "--secondary-foreground": "#e6ebf2",
  "--accent": "#1e293b",
  "--accent-foreground": "#e6ebf2",
};

/**
 * テーマに応じた CSS 変数 (デザイントークン) を返す。genba のルート要素に適用すると、
 * text-foreground / bg-card / border-border などが背景に対して読める色になる。
 */
export function genbaThemeTokens(key: string | null | undefined): Record<string, string> {
  return isGenbaThemeDark(key) ? GENBA_DARK_TOKENS : GENBA_LIGHT_TOKENS;
}
