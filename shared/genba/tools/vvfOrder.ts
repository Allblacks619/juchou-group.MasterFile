/**
 * 現場ツールボックス: VVF発注計算のデータ・計算純関数。
 * 回路ごとの入力（サイズ×種別×長さ×回路数）をサイズ×種別で集計し、
 * ロス率を上乗せした必要長さから 100m巻 / 500mドラム の必要数と余りを算出する。
 * 梱包単位（100m巻・500mドラム）は市販VVFの一般的な販売単位。
 */

/** ケーブルサイズ（表示・ソート順もこの順） */
export const VVF_SIZES = ["1.6-2C", "1.6-3C", "2.0-2C", "2.0-3C"] as const;
export type VvfSize = (typeof VVF_SIZES)[number];

/** 種別（芯線色ライン）。表示・ソート順もこの順 */
export const VVF_LINE_TYPES = [
  { key: "ノーマル", colors2c: "黒・白", colors3c: "黒・白・赤" },
  { key: "Gライン", colors2c: "黒・白", colors3c: "黒・白・緑" },
  { key: "200Vライン", colors2c: "黒・白", colors3c: "黒・赤・緑" },
] as const;
export type VvfLineType = (typeof VVF_LINE_TYPES)[number]["key"];

/** サイズ識別用のUIカラー（判定色ではなくサイズの見分け用） */
export const VVF_SIZE_COLORS: Record<VvfSize, string> = {
  "1.6-2C": "#3b82f6",
  "1.6-3C": "#8b5cf6",
  "2.0-2C": "#f97316",
  "2.0-3C": "#ef4444",
};

/** 梱包単位 */
export const VVF_ROLL_M = 100;
export const VVF_DRUM_M = 500;

/** ロス率の既定値・入力範囲（%） */
export const VVF_LOSS_DEFAULT = 10;
export const VVF_LOSS_MIN = 0;
export const VVF_LOSS_MAX = 50;

/** サイズ×種別 → 芯線色表示（2Cサイズは colors2c、3Cサイズは colors3c） */
export function vvfCoreColors(size: VvfSize, lineType: VvfLineType): string {
  const t = VVF_LINE_TYPES.find((e) => e.key === lineType);
  if (!t) return "";
  return size.includes("2C") ? t.colors2c : t.colors3c;
}

export type VvfRowInput = {
  size: VvfSize;
  lineType: VvfLineType;
  /** 1回路あたりの長さ [m]（0以下・NaNの行は集計対象外） */
  lengthM: number;
  /** 回路数（0以下・NaNの行は集計対象外） */
  circuits: number;
};

export type VvfGroupResult = {
  size: VvfSize;
  lineType: VvfLineType;
  /** 芯線色表示 */
  colors: string;
  /** 入力合計 [m]（ロス無し） */
  rawTotalM: number;
  /** ロス込み必要長さ [m]（整数m切り上げ） */
  withLossM: number;
  /** 100m巻 必要数と余り [m] */
  rolls100: number;
  remain100: number;
  /** 500mドラム 必要数と余り [m] */
  drums500: number;
  remain500: number;
};

/**
 * 回路入力を集計して梱包単位の必要数を計算する。
 * - 無効行（長さ・回路数が NaN/0以下）は除外
 * - ロス込み長さ = ceil(合計長 × (1 + lossRatePct/100))
 * - 巻数・ドラム数は切り上げ
 * - 結果は VVF_SIZES → VVF_LINE_TYPES の順でソート
 */
export function calcVvfOrder(rows: readonly VvfRowInput[], lossRatePct: number): VvfGroupResult[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.lengthM) || row.lengthM <= 0) continue;
    if (!Number.isFinite(row.circuits) || row.circuits <= 0) continue;
    const key = `${row.size}||${row.lineType}`;
    totals.set(key, (totals.get(key) ?? 0) + row.lengthM * row.circuits);
  }

  const factor = 1 + (Number.isFinite(lossRatePct) ? lossRatePct : 0) / 100;

  const results: VvfGroupResult[] = [];
  for (const size of VVF_SIZES) {
    for (const { key: lineType } of VVF_LINE_TYPES) {
      const rawTotalM = totals.get(`${size}||${lineType}`);
      if (rawTotalM == null) continue;
      // 浮動小数点誤差で 99 が 99.000…01 になり 100 へ繰り上がるのを防ぐため mm 単位で丸めてから切り上げ
      const withLossM = Math.ceil(Math.round(rawTotalM * factor * 1000) / 1000);
      const rolls100 = Math.ceil(withLossM / VVF_ROLL_M);
      const drums500 = Math.ceil(withLossM / VVF_DRUM_M);
      results.push({
        size,
        lineType,
        colors: vvfCoreColors(size, lineType),
        rawTotalM,
        withLossM,
        rolls100,
        remain100: rolls100 * VVF_ROLL_M - withLossM,
        drums500,
        remain500: drums500 * VVF_DRUM_M - withLossM,
      });
    }
  }
  return results;
}
