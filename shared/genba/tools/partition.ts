/**
 * 現場ツールボックス: 間仕切り 仕込み材 拾い出し（材料計算）。
 * 間仕切り壁（LGS等）への電気仕込み工事で、器具カード（設置箇所の種類・箇所数・PF管立ち上げ本数）から
 * 必要材料（PF管・4×4ボックス・塗代カバー・PF管コネクタ・ボックス取付金物・ボックス探知マグネット）を集計する。
 * 出典: PF管 1巻=50m は市販の巻売り標準長（目安）。平均使用長 5m/カ所は現場目安の初期値。
 * いずれも目安値であり、現場実測・設計図書を優先すること。
 */

/* ------------------------------------------------------------------ */
/* 器具種類（表示・整理用。計算には使用しない）                            */
/* ------------------------------------------------------------------ */

export const INSTRUMENT_TYPES = ["コンセント", "スイッチ", "LAN", "TV", "マルチ", "その他"] as const;
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* 塗代（ぬりしろ）カバー 連数                                            */
/* ------------------------------------------------------------------ */

export const REN_TYPES = ["1連", "2連", "3連"] as const;
export type RenType = (typeof REN_TYPES)[number];

/* ------------------------------------------------------------------ */
/* PF管 設定値                                                          */
/* ------------------------------------------------------------------ */

/** PF管 平均使用長の初期値 [m/カ所]（現場目安） */
export const PF_AVG_DEFAULT_M = 5;
/** PF管 平均使用長の入力下限 [m] */
export const PF_AVG_MIN_M = 1;
/** PF管 平均使用長の入力上限 [m] */
export const PF_AVG_MAX_M = 99;
/** PF管 1巻の長さ [m]（PF16/PF22 共通・巻数換算の除数。市販巻売りの標準長 目安） */
export const PF_ROLL_LENGTH_M = 50;

/* ------------------------------------------------------------------ */
/* 計算純関数                                                          */
/* ------------------------------------------------------------------ */

/** 数値入力文字列を非負数値化（数値化不能・負値は 0 扱い） */
export function parseNonNegative(input: string): number {
  const n = parseFloat(input);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** 器具カード1枚の入力（種類は表示・整理用で計算に影響しない） */
export type PartitionCard = {
  /** 器具種類（計算には一切使用されない） */
  type: InstrumentType;
  /** 塗代カバーの連数 */
  ren: RenType;
  /** 箇所数 */
  count: number;
  /** PF16 立ち上げ本数（1カ所あたり） */
  pf16: number;
  /** PF22 立ち上げ本数（1カ所あたり） */
  pf22: number;
};

export type PartitionOptions = {
  /** PF計算 ON/OFF。OFF のとき平均使用長を 0 として扱う（コネクタ集計は継続） */
  pfEnabled: boolean;
  /** PF16 平均使用長 [m/カ所] */
  pf16AvgM: number;
  /** PF22 平均使用長 [m/カ所] */
  pf22AvgM: number;
  /** ボックス探知マグネットを使う（ON のとき BOX と同数を計上） */
  useMagnet: boolean;
};

export type PartitionResult = {
  /** 4×4 BOX [個] = 全カードの箇所数合計 */
  boxes: number;
  /** 塗代カバー [枚]（連数ごとの箇所数集計） */
  covers: Record<RenType, number>;
  /** PF16 総使用長 [m] = Σ(箇所数 × 立ち上げ本数 × 平均使用長) */
  pf16TotalM: number;
  /** PF22 総使用長 [m] */
  pf22TotalM: number;
  /** PF16 巻数 [巻] = ceil(総使用長 / 50) */
  pf16Rolls: number;
  /** PF22 巻数 [巻] */
  pf22Rolls: number;
  /** PF16 コネクタ [個] = Σ(箇所数 × 立ち上げ本数)（立ち上げ1本につき1個） */
  pf16Connectors: number;
  /** PF22 コネクタ [個] */
  pf22Connectors: number;
  /** ボックス取付金物 [個] = BOX と同数 */
  brackets: number;
  /** ボックス探知マグネット [個] = マグネットON時 BOX と同数、OFF時 0 */
  magnets: number;
};

/**
 * 間仕切り仕込み材の集計。
 * - 4×4 BOX 個数 ＝ ボックス取付金物 個数 ＝ 全カードの箇所数合計。
 * - 塗代カバーは連数ごとに箇所数を集計（1カ所につき1枚）。
 * - PF管総長 ＝ 箇所数 × 立ち上げ本数 × 平均使用長。巻数は 50m/巻 で切り上げ。
 * - PF管コネクタ ＝ 箇所数 × 立ち上げ本数。
 * - PF計算OFF時は平均使用長を 0 として扱う（総長・巻数は 0、コネクタ集計は継続）。
 * - 負値・NaN の入力は parseNonNegative で 0 に丸めてから渡すこと（本関数は入力値をそのまま使う）。
 */
export function calcPartition(cards: readonly PartitionCard[], opts: PartitionOptions): PartitionResult {
  const pf16Avg = opts.pfEnabled ? opts.pf16AvgM : 0;
  const pf22Avg = opts.pfEnabled ? opts.pf22AvgM : 0;

  let boxes = 0;
  const covers: Record<RenType, number> = { "1連": 0, "2連": 0, "3連": 0 };
  let pf16TotalM = 0;
  let pf22TotalM = 0;
  let pf16Connectors = 0;
  let pf22Connectors = 0;

  for (const c of cards) {
    boxes += c.count;
    covers[c.ren] += c.count;
    pf16TotalM += c.count * c.pf16 * pf16Avg;
    pf22TotalM += c.count * c.pf22 * pf22Avg;
    pf16Connectors += c.count * c.pf16;
    pf22Connectors += c.count * c.pf22;
  }

  const pf16Rolls = Math.ceil(pf16TotalM / PF_ROLL_LENGTH_M);
  const pf22Rolls = Math.ceil(pf22TotalM / PF_ROLL_LENGTH_M);

  return {
    boxes,
    covers,
    pf16TotalM,
    pf22TotalM,
    pf16Rolls,
    pf22Rolls,
    pf16Connectors,
    pf22Connectors,
    brackets: boxes,
    magnets: opts.useMagnet ? boxes : 0,
  };
}
