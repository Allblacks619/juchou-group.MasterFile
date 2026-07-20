/**
 * 現場ツールボックス: 占積率 計算。
 * 電線管（G/E/PF/CD/VE）に電線が何本入るか・占積率(%)を計算するための
 * 静的データと純関数。完全クライアント完結（DB・サーバー通信なし）。
 *
 * 出典・根拠:
 * - 占積率の上限 32%（約1/3）は内線規程の一般則。
 *   占積率 = 電線（被覆含む）断面積の合計 ÷ 管内断面積。
 *   同一太さ・10本以下でも、太さ混在・10本超でも上限は 32% を適用する（一般目安）。
 * - 管の内径は規格（JIS C 8305 等）・カタログを参照した目安値。
 *   メーカー・製品により差異があるため「目安」明記。
 * - IV電線の仕上外径は一般周知の目安値。CV（単心）・CVV 等はメーカーの
 *   カタログ値（目安）を確認して使用すること。
 * 最終判断は設計図書・所轄基準・現場実測を優先する。
 */

/** 占積率の上限 [%]（内線規程の一般則: 約1/3） */
export const FILL_LIMIT_PERCENT = 32;

/** 「注意」表示の開始比率（上限32%の90% = 28.8%。UI 判定の目安） */
export const FILL_WARN_RATIO = 0.9;

/* ------------------------------------------------------------------ */
/* 電線管データ（呼び径 → 内径mm の目安値）                              */
/* ------------------------------------------------------------------ */

export type ConduitKind = "g" | "e" | "pf" | "cd" | "ve";

export const CONDUIT_KIND_ORDER = ["g", "e", "pf", "cd", "ve"] as const;

export type ConduitSpec = {
  /** ボタン表示名（短） */
  label: string;
  /** 補足（正式名など） */
  sub: string;
  /** 呼び径 → 内径 [mm]（目安値） */
  inner: Readonly<Record<number, number>>;
  /** 内径の根拠注記（UI表示用） */
  note: string;
};

/**
 * 電線管 呼び径→内径[mm] 目安テーブル。
 * G管・E管: JIS C 8305（鋼製電線管）系の内径目安値。
 * PF管・CD管: 内径 ≒ 呼び径（合成樹脂可とう電線管の一般目安）。
 * VE管: JIS C 8430（硬質ビニル電線管）系の内径目安値。
 */
export const CONDUIT_FILL_PIPES = {
  g: {
    label: "G管",
    sub: "厚鋼電線管",
    // JIS C 8305 系 内径目安値
    inner: { 16: 16.4, 22: 21.9, 28: 28.3, 36: 36.9, 42: 42.8, 54: 54.9, 70: 69.6, 82: 81.9, 104: 105.8 },
    note: "JIS C 8305 系の内径目安値",
  },
  e: {
    label: "E管（C管）",
    sub: "ねじなし電線管",
    // JIS C 8305 系 内径目安値
    inner: { 19: 16.4, 25: 22.6, 31: 29.0, 39: 35.3, 51: 47.6, 63: 60.3, 75: 72.9 },
    note: "JIS C 8305 系の内径目安値",
  },
  pf: {
    label: "PF管",
    sub: "合成樹脂可とう管",
    // 内径 ≒ 呼び径（目安）
    inner: { 14: 14, 16: 16, 22: 22, 28: 28, 36: 36, 42: 42, 54: 54 },
    note: "内径 ≒ 呼び径（目安）",
  },
  cd: {
    label: "CD管",
    sub: "可とう電線管",
    // 内径 ≒ 呼び径（目安）。呼び径構成は PF 管と共通
    inner: { 14: 14, 16: 16, 22: 22, 28: 28, 36: 36, 42: 42, 54: 54 },
    note: "内径 ≒ 呼び径（目安）",
  },
  ve: {
    label: "VE管",
    sub: "硬質ビニル電線管",
    // JIS C 8430 系 内径目安値
    inner: { 14: 14, 16: 18, 22: 22, 28: 28, 36: 35, 42: 40, 54: 51, 70: 66, 82: 77 },
    note: "内径目安値（メーカーカタログ参照）",
  },
} as const satisfies Record<ConduitKind, ConduitSpec>;

/** 管種の呼び径一覧（昇順） */
export function conduitSizes(kind: ConduitKind): number[] {
  return Object.keys(CONDUIT_FILL_PIPES[kind].inner)
    .map(Number)
    .sort((a, b) => a - b);
}

/** 管種×呼び径 → 内径[mm]（目安）。未定義の呼び径は null */
export function conduitInnerDia(kind: ConduitKind, size: number): number | null {
  const d = (CONDUIT_FILL_PIPES[kind].inner as Record<number, number>)[size];
  return typeof d === "number" ? d : null;
}

/* ------------------------------------------------------------------ */
/* 電線データ（仕上外径mm の目安値）                                     */
/* ------------------------------------------------------------------ */

export type WireSpec = {
  /** 選択状態管理用キー */
  key: string;
  /** 表示名 */
  label: string;
  /** 仕上外径 [mm]（被覆含む・目安値） */
  odMm: number;
};

/**
 * IV電線（600Vビニル絶縁電線）の仕上外径[mm] 目安値。
 * CV（単心）・CVV 等はメーカーカタログの目安値を確認して使用すること
 * （本テーブルには数値根拠のある IV のみ収録）。
 */
export const IV_WIRES = [
  { key: "iv16", label: "IV 1.6mm", odMm: 3.2 },
  { key: "iv20", label: "IV 2.0mm", odMm: 3.6 },
  { key: "iv26", label: "IV 2.6mm", odMm: 4.2 },
  { key: "iv55sq", label: "IV 5.5sq", odMm: 4.6 },
  { key: "iv8sq", label: "IV 8sq", odMm: 5.5 },
  { key: "iv14sq", label: "IV 14sq", odMm: 6.7 },
  { key: "iv22sq", label: "IV 22sq", odMm: 7.8 },
  { key: "iv38sq", label: "IV 38sq", odMm: 9.6 },
  { key: "iv60sq", label: "IV 60sq", odMm: 11.9 },
  { key: "iv100sq", label: "IV 100sq", odMm: 15.0 },
] as const satisfies readonly WireSpec[];

/* ------------------------------------------------------------------ */
/* 計算純関数                                                          */
/* ------------------------------------------------------------------ */

/** 円断面積 [mm²] = πd²/4 */
export function circleArea(diaMm: number): number {
  return (Math.PI * diaMm * diaMm) / 4;
}

/** 電線の投入本数（外径[mm]×本数） */
export type WireEntry = {
  odMm: number;
  count: number;
};

export type ConduitFillResult = {
  /** 管内断面積 [mm²] */
  conduitAreaMm2: number;
  /** 電線（被覆含む）断面積の合計 [mm²] */
  wireAreaMm2: number;
  /** 電線の合計本数 */
  wireCount: number;
  /** 占積率 [%]（丸めなしの生値） */
  fillPercent: number;
};

/**
 * 占積率計算。
 * 占積率[%] = Σ(電線仕上外径の円断面積 × 本数) ÷ 管内断面積 × 100。
 * 丸めは行わない（表示側で toFixed 等を使う）。
 */
export function calcConduitFill(innerDiaMm: number, entries: readonly WireEntry[]): ConduitFillResult {
  const conduitAreaMm2 = circleArea(innerDiaMm);
  const wireAreaMm2 = entries.reduce((a, e) => a + circleArea(e.odMm) * e.count, 0);
  const wireCount = entries.reduce((a, e) => a + e.count, 0);
  const fillPercent = conduitAreaMm2 > 0 ? (wireAreaMm2 / conduitAreaMm2) * 100 : 0;
  return { conduitAreaMm2, wireAreaMm2, wireCount, fillPercent };
}

export type FillStatus = "ok" | "warn" | "ng";

/**
 * 占積率の判定。
 * - 32% 超 → "ng"（収容不可）
 * - 32% の 90%（28.8%）以上 → "warn"（上限間近の注意。UI 目安）
 * - それ未満 → "ok"
 */
export function fillStatus(fillPercent: number): FillStatus {
  if (fillPercent > FILL_LIMIT_PERCENT) return "ng";
  if (fillPercent >= FILL_LIMIT_PERCENT * FILL_WARN_RATIO) return "warn";
  return "ok";
}

/**
 * その管に単独で収容できる最大本数。
 * floor(管内断面積 × 32% ÷ 電線1本の断面積)。外径0以下は0。
 */
export function maxWireCount(innerDiaMm: number, wireOdMm: number): number {
  if (wireOdMm <= 0) return 0;
  return Math.floor((circleArea(innerDiaMm) * (FILL_LIMIT_PERCENT / 100)) / circleArea(wireOdMm));
}
