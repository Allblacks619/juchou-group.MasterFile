/**
 * 現場ツールボックス: 下穴径データ（タップ下穴・配管コネクタ用ノックアウト径）。
 * - タップ下穴: メートル並目ねじ（M4〜M12）の標準ドリル下穴径。JIS B 1004 の標準下穴径に一致する目安値。
 * - ノックアウト径: 電線管コネクタをボックス等へ取り付ける際の打ち抜き穴径。
 *   コネクタカタログ参照の目安値（メーカー・コネクタ種類により差異あり。施工前にメーカー資料で確認）。
 */

/** タップ下穴径（メートル並目ねじ）。値は JIS B 1004 標準下穴径と一致（目安）。全6件。 */
export const TAP_PILOT_HOLES = [
  { size: "M4", drillMm: 3.3 },
  { size: "M5", drillMm: 4.2 },
  { size: "M6", drillMm: 5 },
  { size: "M8", drillMm: 6.8 },
  { size: "M10", drillMm: 8.5 },
  { size: "M12", drillMm: 10.2 },
] as const;

export type TapSize = (typeof TAP_PILOT_HOLES)[number]["size"];

/** ネジサイズ → タップ下穴径mm（未定義サイズは null） */
export function findTapPilotHole(size: string): number | null {
  return TAP_PILOT_HOLES.find((e) => e.size === size)?.drillMm ?? null;
}

/** コネクタ下穴の対応配管種別 */
export type KnockoutPipeKind = "PF" | "E" | "G" | "PR" | "WP";

export const KNOCKOUT_PIPE_KINDS: Record<KnockoutPipeKind, { label: string; sub: string }> = {
  PF: { label: "PF管", sub: "合成樹脂可とう管" },
  E: { label: "E管", sub: "ねじなし電線管" },
  G: { label: "G管", sub: "厚鋼電線管" },
  PR: { label: "プリカ", sub: "プリカチューブ" },
  WP: { label: "防水プリカ", sub: "防水プリカチューブ" },
};

export const KNOCKOUT_PIPE_ORDER: KnockoutPipeKind[] = ["PF", "E", "G", "PR", "WP"];

export type KnockoutEntry = {
  pipe: KnockoutPipeKind;
  /** 呼び径 */
  size: number;
  /** ノックアウト径mm（複数値 = コネクタ種類により異なる） */
  knockMm: readonly number[];
  /** 複数値の場合の補足 */
  note?: string;
};

/**
 * 配管コネクタ用ノックアウト径（コネクタカタログ参照の目安値）。全38件。
 * ※ G管・プリカ・防水プリカの3系列は径の数値列が同一（呼び径の呼称のみ異なる）。
 */
export const KNOCKOUT_HOLES: readonly KnockoutEntry[] = [
  // PF管（4件）。呼び16はコネクタ種類により2種の径がある
  { pipe: "PF", size: 16, knockMm: [22, 27], note: "コネクタの種類により φ22 と φ27 の2通りあり。使用するコネクタのメーカー資料で確認。" },
  { pipe: "PF", size: 22, knockMm: [27] },
  { pipe: "PF", size: 28, knockMm: [34] },
  { pipe: "PF", size: 36, knockMm: [42] },
  // E管（ねじなし電線管）（7件）
  { pipe: "E", size: 19, knockMm: [21.5] },
  { pipe: "E", size: 25, knockMm: [27.1] },
  { pipe: "E", size: 31, knockMm: [34] },
  { pipe: "E", size: 39, knockMm: [39] },
  { pipe: "E", size: 51, knockMm: [52] },
  { pipe: "E", size: 63, knockMm: [65] },
  { pipe: "E", size: 75, knockMm: [77] },
  // G管（厚鋼電線管）（9件）
  { pipe: "G", size: 16, knockMm: [21.5] },
  { pipe: "G", size: 22, knockMm: [27.1] },
  { pipe: "G", size: 28, knockMm: [34] },
  { pipe: "G", size: 36, knockMm: [43] },
  { pipe: "G", size: 42, knockMm: [49] },
  { pipe: "G", size: 54, knockMm: [61] },
  { pipe: "G", size: 70, knockMm: [76] },
  { pipe: "G", size: 82, knockMm: [89] },
  { pipe: "G", size: 104, knockMm: [115] },
  // プリカ（9件）
  { pipe: "PR", size: 17, knockMm: [21.5] },
  { pipe: "PR", size: 24, knockMm: [27.1] },
  { pipe: "PR", size: 30, knockMm: [34] },
  { pipe: "PR", size: 38, knockMm: [43] },
  { pipe: "PR", size: 50, knockMm: [49] },
  { pipe: "PR", size: 63, knockMm: [61] },
  { pipe: "PR", size: 76, knockMm: [76] },
  { pipe: "PR", size: 83, knockMm: [89] },
  { pipe: "PR", size: 101, knockMm: [115] },
  // 防水プリカ（9件・プリカと同値）
  { pipe: "WP", size: 17, knockMm: [21.5] },
  { pipe: "WP", size: 24, knockMm: [27.1] },
  { pipe: "WP", size: 30, knockMm: [34] },
  { pipe: "WP", size: 38, knockMm: [43] },
  { pipe: "WP", size: 50, knockMm: [49] },
  { pipe: "WP", size: 63, knockMm: [61] },
  { pipe: "WP", size: 76, knockMm: [76] },
  { pipe: "WP", size: 83, knockMm: [89] },
  { pipe: "WP", size: 101, knockMm: [115] },
] as const;

/** 配管種別 → 呼び径一覧（昇順、データテーブルから生成） */
export function knockoutSizes(pipe: KnockoutPipeKind): number[] {
  return KNOCKOUT_HOLES.filter((e) => e.pipe === pipe)
    .map((e) => e.size)
    .sort((a, b) => a - b);
}

/** 配管種別 + 呼び径 → ノックアウト径エントリ（未定義の組合せは null） */
export function findKnockout(pipe: KnockoutPipeKind, size: number): KnockoutEntry | null {
  return KNOCKOUT_HOLES.find((e) => e.pipe === pipe && e.size === size) ?? null;
}

/** 下穴径の表示用整形（整数はそのまま、小数は1桁表示） */
export function formatHoleMm(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
