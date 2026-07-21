/**
 * 現場ツールボックス: 配線 計算。
 * 電圧降下 / 許容電流 / 接地線太さ / ボンド線目安 の静的データと純関数。
 * 完全クライアント完結（DB・サーバー通信なし）。
 *
 * 出典・根拠:
 * - 電圧降下の簡易式 e = K·L·I/(1000·A) と係数 K（単相2線式 35.6 /
 *   単相3線式・三相4線式(対中性線) 17.8 / 三相3線式 30.8）は内線規程の周知式。
 * - 電圧降下率の判定目安（こう長60m以下: 2%以内 等）は内線規程 1310-1 系の一般目安。
 * - IV の許容電流（がいし引き基準）は内線規程の周知目安値。電線管収容
 *   （同一管内3本以下）は低減率 0.70 を乗じる（内線規程の一般則）。
 * - 接地線太さは内線規程 1350-3 の一般表（過電流遮断器容量 → 太さ）。
 * - C種/D種接地の抵抗値は電技解釈（第17条）の一般周知値。
 * - ボンド線太さは金属管ボンディングの一般目安値（100A以下: 5.5sq 等）。
 * いずれも目安であり、最終判断は設計図書・電力会社基準・所轄基準を優先する。
 */

/* ------------------------------------------------------------------ */
/* 1. 電圧降下                                                         */
/* ------------------------------------------------------------------ */

export type WiringMethodKey = "single2" | "single3" | "three3";

export type WiringMethod = {
  key: WiringMethodKey;
  /** 表示名 */
  label: string;
  /** 補足 */
  sub: string;
  /** 電圧降下係数 K（内線規程の周知式） */
  k: number;
};

/**
 * 配電方式と電圧降下係数 K（内線規程の周知式 e = K·L·I/(1000·A)）。
 * 単相2線=35.6 / 単相3線・三相4線(対中性線)=17.8 / 三相3線=30.8。
 */
export const WIRING_METHODS = [
  { key: "single2", label: "単相2線式", sub: "K = 35.6", k: 35.6 },
  { key: "single3", label: "単相3線式・三相4線式", sub: "対中性線・K = 17.8", k: 17.8 },
  { key: "three3", label: "三相3線式", sub: "K = 30.8", k: 30.8 },
] as const satisfies readonly WiringMethod[];

/**
 * 断面積 A[sq] の入力プリセット（一般的な IV/CV の断面積系列）。
 * 1.6mm ≒ 2sq / 2.0mm ≒ 3.5sq は単線→より線の一般換算目安。
 */
export const WIRE_SECTION_PRESETS_SQ = [2, 3.5, 5.5, 8, 14, 22, 38, 60, 100] as const;

/** 回路電圧 V の入力プリセット（一般的な低圧配電電圧） */
export const VOLTAGE_PRESETS = [100, 200, 400] as const;

/**
 * 電圧降下 e[V] = K·L·I/(1000·A)。
 * K: 係数 / L: こう長[m] / I: 電流[A] / A: 電線断面積[sq(mm²)]。
 * 断面積 0 以下は 0 を返す（未入力ガード）。丸めは表示側で行う。
 */
export function calcVoltDrop(k: number, lengthM: number, currentA: number, sectionSq: number): number {
  if (sectionSq <= 0) return 0;
  return (k * lengthM * currentA) / (1000 * sectionSq);
}

/** 電圧降下率[%] = e ÷ 回路電圧 × 100。電圧 0 以下は 0。 */
export function voltDropPercent(dropV: number, voltage: number): number {
  if (voltage <= 0) return 0;
  return (dropV / voltage) * 100;
}

/**
 * こう長別の電圧降下率 上限目安[%]（内線規程 1310-1 系の一般目安）。
 * こう長 60m以下: 2% / 120m以下: 4% / 200m以下: 5% / 200m超: 6%。
 */
export function voltDropLimitPercent(lengthM: number): number {
  if (lengthM <= 60) return 2;
  if (lengthM <= 120) return 4;
  if (lengthM <= 200) return 5;
  return 6;
}

export type WiringJudge = "ok" | "warn" | "ng";

/** 「注意」表示の開始比率（上限の90%。UI 判定の目安） */
export const VOLT_DROP_WARN_RATIO = 0.9;

/**
 * 電圧降下率の判定。
 * - 上限超過 → "ng"
 * - 上限の90%以上 → "warn"（上限間近の注意。UI 目安）
 * - それ未満 → "ok"
 */
export function voltDropStatus(percent: number, limitPercent: number): WiringJudge {
  if (percent > limitPercent) return "ng";
  if (percent >= limitPercent * VOLT_DROP_WARN_RATIO) return "warn";
  return "ok";
}

/* ------------------------------------------------------------------ */
/* 2. 幹線・許容電流（IV）                                              */
/* ------------------------------------------------------------------ */

export type IvAmpacityEntry = {
  key: string;
  /** 表示名 */
  label: string;
  /** 許容電流 [A]（がいし引き基準・周知目安値） */
  baseA: number;
};

/**
 * IV電線の許容電流 [A]（がいし引き基準・内線規程の周知目安値）。
 * 電線管収容時は低減係数（INSTALL_CONDITIONS）を乗じる。
 * ※ CV等のケーブルは布設条件により許容電流が大きく変わるため本テーブルには収録しない。
 *   メーカーカタログの許容電流表を確認して使用すること。
 */
export const IV_AMPACITY = [
  { key: "iv16", label: "IV 1.6mm", baseA: 27 },
  { key: "iv20", label: "IV 2.0mm", baseA: 35 },
  { key: "iv55sq", label: "IV 5.5sq", baseA: 49 },
  { key: "iv8sq", label: "IV 8sq", baseA: 61 },
  { key: "iv14sq", label: "IV 14sq", baseA: 88 },
  { key: "iv22sq", label: "IV 22sq", baseA: 115 },
  { key: "iv38sq", label: "IV 38sq", baseA: 162 },
  { key: "iv60sq", label: "IV 60sq", baseA: 217 },
  { key: "iv100sq", label: "IV 100sq", baseA: 298 },
] as const satisfies readonly IvAmpacityEntry[];

export type InstallCondition = {
  key: string;
  label: string;
  sub: string;
  /** 許容電流の低減係数（内線規程の一般則） */
  factor: number;
};

/**
 * 敷設条件別の低減係数。
 * がいし引き = 1.00（基準）/ 電線管収容・同一管内3本以下 = 0.70（内線規程の一般則）。
 * 同一管内4本以上はさらに低減されるため内線規程の低減係数表を参照すること。
 */
export const INSTALL_CONDITIONS = [
  { key: "air", label: "がいし引き", sub: "基準 ×1.00", factor: 1.0 },
  { key: "conduit3", label: "電線管収容", sub: "同一管内3本以下 ×0.70", factor: 0.7 },
] as const satisfies readonly InstallCondition[];

/**
 * 許容電流 [A] = 基準値（がいし引き）× 低減係数。
 * 丸めは行わない（表示側で丸める）。
 */
export function allowableCurrent(baseA: number, factor: number): number {
  return baseA * factor;
}

/* ------------------------------------------------------------------ */
/* 3. アース線（接地線）太さ                                            */
/* ------------------------------------------------------------------ */

export type GroundWireEntry = {
  /** 過電流遮断器の定格容量 上限 [A]（この値以下に適用） */
  maxA: number;
  /** 接地線の太さ 表示名 */
  label: string;
  /** 断面積相当 [sq]（表示補助） */
  sq: number;
};

/**
 * 接地線（アース線）太さの一般表（内線規程 1350-3 系）。
 * 過電流遮断器の定格容量 → 接地線太さ。
 * 20A以下→1.6mm(2.0sq) / 30A→1.6mm / 60A→5.5sq / 100A→8sq /
 * 150A→14sq / 200A→22sq / 400A→38sq / 600A→60sq。
 */
export const GROUND_WIRE_TABLE = [
  { maxA: 20, label: "1.6mm（2.0sq）", sq: 2.0 },
  { maxA: 30, label: "1.6mm（2.0sq）", sq: 2.0 },
  { maxA: 60, label: "5.5sq", sq: 5.5 },
  { maxA: 100, label: "8sq", sq: 8 },
  { maxA: 150, label: "14sq", sq: 14 },
  { maxA: 200, label: "22sq", sq: 22 },
  { maxA: 400, label: "38sq", sq: 38 },
  { maxA: 600, label: "60sq", sq: 60 },
] as const satisfies readonly GroundWireEntry[];

/**
 * 過電流遮断器容量[A] → 接地線太さ（内線規程 1350-3 系の一般表）。
 * 0以下・600A超は null（600A超は個別設計）。
 */
export function groundWireSize(breakerA: number): GroundWireEntry | null {
  if (breakerA <= 0) return null;
  for (const e of GROUND_WIRE_TABLE) {
    if (breakerA <= e.maxA) return e;
  }
  return null;
}

/**
 * C種/D種接地の説明（電技解釈 第17条 系の一般周知値）。
 */
export const GROUND_CLASS_NOTES = [
  {
    key: "c",
    label: "C種接地工事",
    text: "300Vを超える低圧用の機器の金属製外箱等。接地抵抗 10Ω以下（地絡時0.5秒以内に遮断する装置を施設する場合は 500Ω以下）。",
  },
  {
    key: "d",
    label: "D種接地工事",
    text: "300V以下の低圧用の機器の金属製外箱等。接地抵抗 100Ω以下（地絡時0.5秒以内に遮断する装置を施設する場合は 500Ω以下）。",
  },
] as const;

/* ------------------------------------------------------------------ */
/* 4. ボンド線 目安                                                     */
/* ------------------------------------------------------------------ */

/** ボンド線の一般目安の適用上限 [A]（100A以下 → 5.5sq） */
export const BOND_WIRE_SIMPLE_MAX_A = 100;

/** 100A以下の回路のボンド線太さ（一般目安値） */
export const BOND_WIRE_SIMPLE_LABEL = "5.5sq";

export type BondWireResult = {
  /** 太さ表示名 */
  label: string;
  /** 根拠注記 */
  note: string;
};

/**
 * 金属管ボンディング用ボンド線太さの目安。
 * - 過電流遮断器 100A以下: 5.5sq（一般目安値）。
 * - 100A超: 接地線太さの一般表（内線規程 1350-3 系）に準ずる目安。
 * 0以下・600A超は null（個別設計）。
 */
export function bondWireSize(breakerA: number): BondWireResult | null {
  if (breakerA <= 0) return null;
  if (breakerA <= BOND_WIRE_SIMPLE_MAX_A) {
    return { label: BOND_WIRE_SIMPLE_LABEL, note: "100A以下の回路の一般目安値" };
  }
  const g = groundWireSize(breakerA);
  if (!g) return null;
  return { label: g.label, note: `接地線太さの一般表（遮断器 ${g.maxA}A以下の欄）に準ずる目安` };
}
