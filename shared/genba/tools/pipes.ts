/**
 * 現場ツールボックス: 配管データ（外径早見・抜き径検索の共用データ）。
 * G管・E管は JIS C 8305 規格値。PF/CD/FEP/VE/フレキ/プリカ類はカタログ参照の目安値
 * （メーカーにより差異あり。現場実測で確認すること）。
 */

export type PipeKind =
  | "G" | "E" | "PF" | "CD" | "FEP" | "VE" | "MF" | "BF" | "PR" | "WP";

export type PipeDef = {
  /** ボタン表示名（短） */
  label: string;
  /** 補足（正式名など） */
  sub: string;
  /** 呼び径 → 外径mm */
  sizes: Record<number, number>;
  /** 規格値か目安値か */
  approx: boolean;
};

export const GENBA_PIPES: Record<PipeKind, PipeDef> = {
  G: {
    label: "G管", sub: "厚鋼電線管", approx: false,
    sizes: { 16: 21.4, 22: 26.6, 28: 33.3, 36: 41.9, 42: 47.8, 54: 59.6, 70: 76.0, 82: 88.5, 104: 113.4 },
  },
  E: {
    label: "E管", sub: "薄鋼電線管", approx: false,
    sizes: { 19: 19.1, 25: 25.4, 31: 31.8, 39: 38.1, 51: 50.8, 63: 63.5, 75: 76.3, 101: 101.6 },
  },
  PF: {
    label: "PF管", sub: "PF-S 単層", approx: true,
    sizes: { 14: 21.5, 16: 23.0, 22: 30.5, 28: 36.5, 36: 45.5, 42: 52.0, 54: 64.5 },
  },
  CD: {
    label: "CD管", sub: "可とう電線管", approx: true,
    sizes: { 14: 19.0, 16: 21.0, 22: 27.5, 28: 34.0, 36: 42.0, 42: 48.0, 54: 60.0 },
  },
  FEP: {
    label: "FEP管", sub: "波付硬質管", approx: true,
    sizes: { 30: 40.0, 40: 54.0, 50: 65.0, 65: 85.0, 80: 102.0, 100: 130.0, 125: 160.0, 150: 189.0 },
  },
  VE: {
    label: "VE管", sub: "硬質塩ビ電線管", approx: true,
    sizes: { 14: 18.0, 16: 22.0, 22: 26.0, 28: 34.0, 36: 42.0, 42: 48.0, 54: 60.0, 70: 76.0, 82: 89.0 },
  },
  MF: {
    label: "マシンフレキ", sub: "白", approx: true,
    sizes: { 12: 17.7, 14: 21.5, 16: 23.0, 22: 30.5, 28: 36.5, 36: 45.5, 42: 52.0, 54: 64.5, 70: 81.0 },
  },
  BF: {
    label: "フレキ", sub: "黒", approx: true,
    sizes: { 10: 13.8, 12: 16.2, 16: 20.2, 22: 25.1, 28: 31.2, 36: 39.5, 42: 44.2, 54: 57.5, 70: 69.3, 82: 85.5 },
  },
  PR: {
    label: "プリカ", sub: "プリカチューブ", approx: true,
    sizes: { 10: 13.3, 12: 16.1, 15: 19.0, 17: 21.5, 24: 28.8, 30: 34.9, 38: 42.9, 50: 54.9, 63: 69.1, 76: 82.9, 83: 88.1, 101: 107.3 },
  },
  WP: {
    label: "防水プリカ", sub: "防水プリカチューブ", approx: true,
    sizes: { 10: 14.9, 12: 17.7, 15: 20.6, 17: 23.1, 24: 30.4, 30: 36.5, 38: 44.9, 50: 56.9, 63: 71.5, 76: 85.3, 83: 90.9, 101: 110.1 },
  },
};

export const PIPE_KIND_ORDER: PipeKind[] = ["G", "E", "PF", "CD", "FEP", "VE", "MF", "BF", "PR", "WP"];

/** ホールソー標準サイズ（mm） */
export const HOLE_SAW_SIZES = [
  14, 16, 17, 18, 19, 20, 21, 22, 24, 25, 27, 28, 29, 30, 32, 33, 35, 38, 40, 44, 45,
  50, 52, 56, 60, 64, 65, 68, 70, 75, 76, 80, 83, 85, 89, 100, 105, 110, 114, 127,
] as const;

/** コアドリル標準サイズ（mm） */
export const CORE_DRILL_SIZES = [
  25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 120, 130, 150,
] as const;

/** リストから target 以上の最小標準サイズを返す（無ければ null） */
export function nextStdSize(list: readonly number[], target: number): number | null {
  return list.find((s) => s >= target) ?? null;
}

export type HolePunchPlan = {
  /** 配管外径 mm */
  od: number;
  /** ジャストサイズ（外径+1.5mm 以上の最小ホールソー） */
  just: number;
  /** 余裕サイズ（ジャスト+5mm 以上の最小ホールソー。標準に無ければ切り上げ値） */
  clear: number;
  /** 余裕サイズが標準ホールソーに存在するか */
  clearIsStd: boolean;
  /** コアドリル推奨（ジャスト目標/余裕目標）。標準に無ければ null */
  coreJust: number | null;
  coreClear: number | null;
  /** ギムネ目安（外径+3mm 切り上げ） */
  gimlet: number;
};

/** 抜き径（貫通穴）推奨サイズを計算する */
export function holePunchPlan(kind: PipeKind, size: number): HolePunchPlan | null {
  const od = GENBA_PIPES[kind]?.sizes[size];
  if (od == null) return null;
  const justTarget = od + 1.5;
  const just = nextStdSize(HOLE_SAW_SIZES, justTarget) ?? Math.ceil(justTarget);
  const clearTarget = just + 5;
  const clearStd = nextStdSize(HOLE_SAW_SIZES, clearTarget);
  return {
    od,
    just,
    clear: clearStd ?? Math.ceil(clearTarget),
    clearIsStd: clearStd != null,
    coreJust: nextStdSize(CORE_DRILL_SIZES, justTarget),
    coreClear: nextStdSize(CORE_DRILL_SIZES, clearTarget),
    gimlet: Math.ceil(od + 3),
  };
}
