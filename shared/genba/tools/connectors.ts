/**
 * 現場ツールボックス: 接続材選定データ（接続材 選定）。
 * 出典: ニチフ カタログ（T形コネクタ / P形裸圧着スリーブ / CE形裸圧着スリーブ 抱合範囲）・
 * 内線規程・JIS C 2806（リングスリーブの組み合わせと圧着マーク）。
 * いずれも規格・カタログに基づく目安値。実施工では現場実測・設計図書・メーカーカタログを優先すること。
 */

/** 電線の選択肢1件（label=ボタン表示 / sub=補足 / area=断面積 mm²） */
export type ConnectorWire = {
  label: string;
  sub: string;
  area: number;
};

/** スリーブ・コネクタの適用（抱合）範囲1件（min〜max mm²） */
export type SleeveRange = {
  name: string;
  min: number;
  max: number;
};

// ─────────────────────────────────────────────
// T形コネクタ（分岐接続用）
// ─────────────────────────────────────────────

/** T形タブの幹線・分岐共通の選択肢（11件） */
export const T_WIRE_SIZES = [
  { label: "3.5", sub: "mm²", area: 3.5 },
  { label: "5.5", sub: "mm²", area: 5.5 },
  { label: "8", sub: "mm²", area: 8.0 },
  { label: "14", sub: "mm²", area: 14.0 },
  { label: "22", sub: "mm²", area: 22.0 },
  { label: "38", sub: "mm²", area: 38.0 },
  { label: "60", sub: "mm²", area: 60.0 },
  { label: "100", sub: "mm²", area: 100.0 },
  { label: "150", sub: "mm²", area: 150.0 },
  { label: "200", sub: "mm²", area: 200.0 },
  { label: "250", sub: "mm²", area: 250.0 },
] as const satisfies readonly ConnectorWire[];

/**
 * T形コネクタ 適用範囲（合計断面積 mm²、18件）。ニチフ カタログ準拠。
 * 範囲が連続でない箇所（例: 7〜7.5）や重複箇所（T 16 と T 20 の 14〜16）があり、
 * 判定は配列順の先頭一致（重複時は先の T 16 が選ばれる）。
 */
export const T_SLEEVES = [
  { name: "T 7", min: 3.5, max: 7 },
  { name: "T 11", min: 7.5, max: 11 },
  { name: "T 16", min: 11.5, max: 16 },
  { name: "T 20", min: 14, max: 20 },
  { name: "T 26", min: 21, max: 26 },
  { name: "T 44", min: 27, max: 44 },
  { name: "T 60", min: 45, max: 60 },
  { name: "T 76", min: 61, max: 76 },
  { name: "T 98", min: 77, max: 98 },
  { name: "T 122", min: 99, max: 122 },
  { name: "T 154", min: 123, max: 154 },
  { name: "T 190", min: 155, max: 190 },
  { name: "T 240", min: 191, max: 240 },
  { name: "T 288", min: 241, max: 288 },
  { name: "T 365", min: 289, max: 365 },
  { name: "T 450", min: 366, max: 450 },
  { name: "T 560", min: 451, max: 560 },
  { name: "T 700", min: 561, max: 700 },
] as const satisfies readonly SleeveRange[];

// ─────────────────────────────────────────────
// P形裸圧着スリーブ
// ─────────────────────────────────────────────

/** P形タブの電線選択肢（10件） */
export const P_WIRES = [
  { label: "1.6φ", sub: "2mm²", area: 2.0 },
  { label: "2.0φ", sub: "3.5mm²", area: 3.5 },
  { label: "2.6φ", sub: "5.5mm²", area: 5.5 },
  { label: "5.5", sub: "mm²", area: 5.5 },
  { label: "8", sub: "mm²", area: 8.0 },
  { label: "14", sub: "mm²", area: 14.0 },
  { label: "22", sub: "mm²", area: 22.0 },
  { label: "38", sub: "mm²", area: 38.0 },
  { label: "60", sub: "mm²", area: 60.0 },
  { label: "100", sub: "mm²", area: 100.0 },
] as const satisfies readonly ConnectorWire[];

/**
 * P形裸圧着スリーブ 抱合範囲（合計断面積 mm²、16件）。ニチフ カタログ準拠。
 * 隣接スリーブの境界値は重複（例: 2.63 は P 2 と P 5.5 の両方に該当）。
 * 判定は配列順の先頭一致（境界値は小さい方のスリーブが選ばれる）。
 */
export const P_SLEEVES = [
  { name: "P 0.5", min: 0.25, max: 0.75 },
  { name: "P 1.25", min: 0.25, max: 1.65 },
  { name: "P 2", min: 1.04, max: 2.63 },
  { name: "P 5.5", min: 2.63, max: 6.64 },
  { name: "P 8", min: 6.64, max: 10.52 },
  { name: "P 14", min: 10.52, max: 16.78 },
  { name: "P 22", min: 16.78, max: 26.66 },
  { name: "P 38", min: 26.66, max: 42.42 },
  { name: "P 60", min: 42.42, max: 60.57 },
  { name: "P 70", min: 60.57, max: 76.28 },
  { name: "P 80", min: 76.28, max: 96.3 },
  { name: "P 100", min: 96.3, max: 117.2 },
  { name: "P 150", min: 117.2, max: 152.05 },
  { name: "P 180", min: 152.05, max: 192.6 },
  { name: "P 200", min: 192.6, max: 242.27 },
  { name: "P 325", min: 242.27, max: 325.0 },
] as const satisfies readonly SleeveRange[];

// ─────────────────────────────────────────────
// リングスリーブ（内線規程・JIS C 2806）
// ─────────────────────────────────────────────

/** リングスリーブタブの電線選択肢（単線3種）。dia=導体径 mm */
export const R_WIRES = [
  { label: "1.6mm", sub: "単線", area: 2.0, dia: 1.6 },
  { label: "2.0mm", sub: "単線", area: 3.5, dia: 2.0 },
  { label: "2.6mm", sub: "単線", area: 5.5, dia: 2.6 },
] as const satisfies readonly (ConnectorWire & { dia: number })[];

export type RingSize = "小" | "中" | "大";
export type RingMark = "○" | "小" | "中" | "大";

/** リングスリーブ判定結果: ok=適合 / out=組み合わせ範囲外 */
export type RingJudge =
  | { kind: "ok"; size: RingSize; mark: RingMark }
  | { kind: "out" };

/**
 * リングスリーブのサイズ・圧着マーク判定（内線規程・JIS C 2806 準拠の組み合わせ表）。
 * n16 / n20 / n26 = 1.6mm / 2.0mm / 2.6mm 単線の本数。
 * 合計2本未満は判定対象外として null を返す。表にない組み合わせは { kind: "out" }。
 */
export function judgeRingSleeve(n16: number, n20: number, n26: number): RingJudge | null {
  if (n16 + n20 + n26 < 2) return null;

  const ok = (size: RingSize, mark: RingMark): RingJudge => ({ kind: "ok", size, mark });
  const out: RingJudge = { kind: "out" };

  // 1.6mmのみ
  if (n20 === 0 && n26 === 0) {
    if (n16 === 2) return ok("小", "○");
    if (n16 >= 3 && n16 <= 4) return ok("小", "小");
    if (n16 >= 5 && n16 <= 6) return ok("中", "中");
    if (n16 === 7) return ok("大", "大");
    return out;
  }
  // 2.0mmのみ
  if (n16 === 0 && n26 === 0) {
    if (n20 === 2) return ok("小", "小");
    if (n20 >= 3 && n20 <= 4) return ok("中", "中");
    if (n20 === 5) return ok("大", "大");
    return out;
  }
  // 2.6mmのみ
  if (n16 === 0 && n20 === 0) {
    if (n26 === 2) return ok("中", "中");
    if (n26 === 3) return ok("大", "大");
    return out;
  }
  // 1.6mm + 2.0mm 混合
  if (n26 === 0) {
    if (n20 === 1 && n16 >= 1 && n16 <= 2) return ok("小", "小");
    if (n20 === 1 && n16 >= 3 && n16 <= 5) return ok("中", "中");
    if (n20 === 2 && n16 >= 1 && n16 <= 3) return ok("中", "中");
    if (n20 === 3 && n16 === 1) return ok("中", "中");
    if (n20 === 1 && n16 === 6) return ok("大", "大");
    if (n20 === 2 && n16 === 4) return ok("大", "大");
    if (n20 === 3 && n16 === 2) return ok("大", "大");
    if (n20 === 4 && n16 === 1) return ok("大", "大");
    return out;
  }
  // 1.6mm + 2.6mm 混合
  if (n20 === 0) {
    if (n26 === 1 && n16 >= 1 && n16 <= 3) return ok("中", "中");
    if (n26 === 2 && n16 === 1) return ok("中", "中");
    if (n26 === 2 && n16 === 2) return ok("大", "大");
    return out;
  }
  // 2.0mm + 2.6mm 混合
  if (n16 === 0) {
    if (n26 === 1 && n20 >= 1 && n20 <= 2) return ok("中", "中");
    if (n26 === 1 && n20 === 3) return ok("大", "大");
    if (n26 === 2 && n20 === 1) return ok("大", "大");
    return out;
  }
  // 三種混合（1.6 + 2.0 + 2.6）
  if (n26 === 1 && n20 === 1 && n16 >= 1 && n16 <= 2) return ok("中", "中");
  if (n26 === 1 && n20 === 2 && n16 === 1) return ok("大", "大");
  return out;
}

/** リングスリーブの内訳文（例: "1.6mm×2本 + 2.0mm×1本"）。全て0本なら空文字。 */
export function ringComboText(n16: number, n20: number, n26: number): string {
  const parts: string[] = [];
  if (n16 > 0) parts.push(`1.6mm×${n16}本`);
  if (n20 > 0) parts.push(`2.0mm×${n20}本`);
  if (n26 > 0) parts.push(`2.6mm×${n26}本`);
  return parts.join(" + ");
}

// ─────────────────────────────────────────────
// CE形裸圧着スリーブ
// ─────────────────────────────────────────────

/** CE形タブの電線選択肢（細線7種） */
export const CE_WIRES = [
  { label: "0.3mm", sub: "(22AWG)", area: 0.3 },
  { label: "0.5mm", sub: "(20AWG)", area: 0.5 },
  { label: "0.75mm", sub: "(18AWG)", area: 0.75 },
  { label: "1.25mm", sub: "(16AWG)", area: 1.25 },
  { label: "2.0mm", sub: "(14AWG)", area: 2.0 },
  { label: "3.5mm", sub: "(12AWG)", area: 3.5 },
  { label: "5.5mm", sub: "(10AWG)", area: 5.5 },
] as const satisfies readonly ConnectorWire[];

/**
 * CE形裸圧着スリーブ 抱合範囲（合計断面積 mm²、4件）。ニチフ カタログ準拠。
 * 範囲が重なるため、判定は該当する全候補を返す（例: 1.5mm² → CE 1 と CE 2）。
 */
export const CE_SLEEVES = [
  { name: "CE 1", min: 0.5, max: 1.75 },
  { name: "CE 2", min: 1.0, max: 3.0 },
  { name: "CE 5", min: 2.5, max: 6.0 },
  { name: "CE 8", min: 4.0, max: 9.0 },
] as const satisfies readonly SleeveRange[];

// ─────────────────────────────────────────────
// 検索・計算純関数
// ─────────────────────────────────────────────

/**
 * 合計断面積 total に適合する範囲を配列順の先頭一致で1件返す（T形・P形共通）。
 * 該当なしは null。
 */
export function findSleeveByTotal(
  sleeves: readonly SleeveRange[],
  total: number,
): SleeveRange | null {
  return sleeves.find((s) => total >= s.min && total <= s.max) ?? null;
}

/** T形コネクタ判定: 幹線+分岐の合計断面積から号数を先頭一致で選定。該当なしは null。 */
export function findTSleeve(mainArea: number, branchArea: number): SleeveRange | null {
  return findSleeveByTotal(T_SLEEVES, mainArea + branchArea);
}

/** P形スリーブ判定: 合計断面積から先頭一致で選定。該当なしは null。 */
export function findPSleeve(total: number): SleeveRange | null {
  return findSleeveByTotal(P_SLEEVES, total);
}

/** CE形判定: 範囲が重なるため該当する全候補を返す（該当なしは空配列）。 */
export function findCESleeves(total: number): SleeveRange[] {
  return CE_SLEEVES.filter((c) => total >= c.min && total <= c.max);
}

/**
 * 電線ごとの本数から合計断面積を求める（mm²、小数第2位で丸め）。
 * 丸めは 0.3mm² 等の加算で生じる浮動小数点誤差が範囲判定に影響しないようにするため。
 */
export function sumWireArea(
  wires: readonly ConnectorWire[],
  counts: readonly number[],
): number {
  const raw = wires.reduce((acc, w, i) => acc + w.area * (counts[i] ?? 0), 0);
  return Math.round(raw * 100) / 100;
}

/** カウンター共通: タップで本数 +1。9 の次は 1 に戻る（1〜9循環、0には戻らない）。 */
export function nextTapCount(count: number): number {
  return count + 1 > 9 ? 1 : count + 1;
}
