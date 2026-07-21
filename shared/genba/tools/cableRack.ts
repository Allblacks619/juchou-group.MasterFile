/**
 * 現場ツールボックス: ケーブルラック材料計算（データ + 純関数）。
 * ルート別にラック本体（定尺3m）・各種ジョイント・セパレータ・ふれどめ・
 * 全ネジボルト・ダクターレール（定尺2500mm）を集計する。
 * 出典: 内線規程（支持間隔2m以内 目安）・メーカー標準寸法（定尺）・経験則に基づく目安値。
 * 実際のサイズ選定はラックにかかる荷重・現場条件・設計図書を優先すること。
 */

// ─── 定数（メーカー標準・経験則の目安） ───────────────────────────────

/** ラック定尺 [m]（メーカー標準） */
export const RACK_LENGTH_M = 3;
/** ふれどめ個数 / 支持1か所（目安） */
export const FURE_PER_SUPPORT = 2;
/** 全ネジボルト本数 / 支持1か所 */
export const BOLT_PER_SUPPORT = 2;
/** 直線接続1か所あたりのジョイント枚数 */
export const JOINT_PER_STRAIGHT = 2;
/** コーナー（L形分岐）1か所あたりのジョイント枚数 */
export const JOINT_PER_CORNER = 4;
/** T形分岐1か所あたりのジョイント枚数 */
export const JOINT_PER_TBRANCH = 6;
/** X形分岐1か所あたりのジョイント枚数 */
export const JOINT_PER_XBRANCH = 8;
/** コーナー1か所あたりのふれどめ個数（定義のみ・計算では未使用） */
export const FURE_PER_CORNER = 6;
/** コーナー1か所あたりの全ネジ本数（定義のみ・計算では未使用） */
export const BOLT_PER_CORNER = 6;
/** ダクターレール定尺 [mm]（メーカー標準） */
export const RAIL_STOCK_MM = 2500;
/** 平均支持間隔の推奨上限 [m]（内線規程 目安） */
export const SUPPORT_INTERVAL_LIMIT_M = 2;

/** ラック幅の選択肢 [mm] */
export const RACK_WIDTHS = [200, 300, 400, 500, 600, 800, 1000, 1200] as const;
export type RackWidth = (typeof RACK_WIDTHS)[number];

/** ラック種別（親桁高さはメーカー標準の目安） */
export const RACK_TYPES = {
  QR: { label: "QR", sub: "親桁100mm" },
  SR: { label: "SR", sub: "親桁70mm" },
} as const;
export type RackType = keyof typeof RACK_TYPES;
export const RACK_TYPE_ORDER = ["QR", "SR"] as const satisfies readonly RackType[];

// ─── 幅による区分（幅による目安。実選定は荷重で判断） ─────────────────

/** 幅600mm超（=800以上）なら true（D2レール / 全ネジ W1/2 区分） */
export function isWideRack(width: number): boolean {
  return width > 600;
}

/** ダクターレール区分: 幅600以下=D1 / 幅600超=D2 */
export function railClassOf(width: number): "D1" | "D2" {
  return isWideRack(width) ? "D2" : "D1";
}

/** 全ネジボルト呼び径: 幅600以下=W3/8 / 幅600超=W1/2 */
export function boltSizeOf(width: number): "W3/8" | "W1/2" {
  return isWideRack(width) ? "W1/2" : "W3/8";
}

/** セパレータのコーナー加算枚数/か所: 幅600以上=2枚、幅600未満（W500以下）=1枚 */
export function sepPerCorner(width: number): 1 | 2 {
  return width >= 600 ? 2 : 1;
}

// ─── ダクターレール（定尺2500mm 取り数） ─────────────────────────────

/** 定尺1本からの取り数（切り捨て）。size<=0 は 0 */
export function railPerBar(sizeMm: number): number {
  return sizeMm > 0 ? Math.floor(RAIL_STOCK_MM / sizeMm) : 0;
}

/** 定尺1本あたりの余り [mm] */
export function railRemainder(sizeMm: number): number {
  return RAIL_STOCK_MM - sizeMm * railPerBar(sizeMm);
}

/** 必要定尺本数（切り上げ）。取り数0（定尺超の寸法）は箇所数=本数 */
export function railBarsNeeded(sizeMm: number, count: number): number {
  const perBar = railPerBar(sizeMm);
  return perBar > 0 ? Math.ceil(count / perBar) : count;
}

export type RailRowCalc = {
  size: number;
  count: number;
  perBar: number;
  bars: number;
  remainder: number;
};

/** 寸法1行分のレール計算 */
export function calcRailRow(sizeMm: number, count: number): RailRowCalc {
  return {
    size: sizeMm,
    count,
    perBar: railPerBar(sizeMm),
    bars: railBarsNeeded(sizeMm, count),
    remainder: railRemainder(sizeMm),
  };
}

// ─── ルート計算 ──────────────────────────────────────────────────────

export type CableRackRailRow = {
  /** レール寸法 [mm] */
  size: number;
  /** 箇所数 */
  count: number;
};

export type CableRackRouteInput = {
  type: RackType;
  /** ラック幅 [mm] */
  width: number;
  /** 延長 [m] */
  lengthM: number;
  /** コーナー（L形分岐）[か所] */
  corner: number;
  /** 上下自在 [か所] */
  rise: number;
  /** 左右自在 [か所] */
  lr: number;
  /** 伸縮 [か所] */
  expansion: number;
  /** T形分岐 [か所] */
  tBranch: number;
  /** X形分岐 [か所] */
  xBranch: number;
  /** セパレータ有無 */
  hasSep: boolean;
  /** ダクターレール（寸法×箇所数） */
  rails: readonly CableRackRailRow[];
};

export type CableRackRouteResult = {
  /** 延長・部材のいずれかが入力されているか（false ならレールのみ集計対象） */
  hasBody: boolean;
  railClass: "D1" | "D2";
  boltSize: "W3/8" | "W1/2";
  /** ラック本体（定尺3m・切り上げ）[本] */
  racks: number;
  /** ジョイント（直線用）[枚] = (本数-1)×2 */
  straightJoints: number;
  /** ジョイント（コーナー用）[枚] = コーナー×4 */
  cornerJoints: number;
  /** 上下自在継手 [対] = 上下自在×4 */
  riseJoints: number;
  /** 左右自在継手 [対] = 左右自在×4 */
  lrJoints: number;
  /** 伸縮継手 [枚] = 伸縮×2 */
  expJoints: number;
  /** ジョイント（T形用）[枚] = T形×6 */
  tBranchJoints: number;
  /** ジョイント（X形用）[枚] = X形×8 */
  xBranchJoints: number;
  /** このルートの支持か所数（ダクターレール箇所数の合計） */
  railCount: number;
  /** ふれどめ [個] = 支持か所×2 */
  fure: number;
  /** セパレータ（約1500mm）[枚] = ラック本数×2 */
  sepSheets: number;
  /** セパレータ用ジョイントプレート [枚] = 枚数-1 */
  sepJointPlates: number;
  /** 押さえ金具 [個] = セパレータ枚数×3 */
  sepClamps: number;
  /** コーナー加算のセパレータ枚数/か所（0=加算なし） */
  cSepPerCorner: 0 | 1 | 2;
  /** コーナー用セパレータ [枚]（注記用・手動加算） */
  cSepSheets: number;
  /** コーナー用セパレータのジョイント [枚]（2枚/か所のときのみ） */
  cSepJoints: number;
  /** コーナー用押さえ金具 目安下限 [個] = コーナー×2 */
  cSepClampsMin: number;
  /** コーナー用押さえ金具 目安上限 [個] = コーナー×3 */
  cSepClampsMax: number;
  /** セパレータ用上下自在継手 [対] = 上下自在×2 */
  riseSepJoints: number;
  /** レール寸法別計算（size>0 かつ count>0 の行のみ） */
  rails: readonly RailRowCalc[];
  /** レール定尺本数のルート小計 [本] */
  railBarsSubtotal: number;
};

/** ルート1本分の材料計算（端数は全て切り上げ、レール取り数のみ切り捨て） */
export function calcCableRackRoute(input: CableRackRouteInput): CableRackRouteResult {
  const { width, lengthM, corner, rise, lr, expansion, tBranch, xBranch, hasSep } = input;

  const rails = input.rails
    .filter((r) => r.size > 0 && r.count > 0)
    .map((r) => calcRailRow(r.size, r.count));
  const railCount = rails.reduce((a, r) => a + r.count, 0);
  const railBarsSubtotal = rails.reduce((a, r) => a + r.bars, 0);

  const hasBody =
    lengthM > 0 || corner > 0 || rise > 0 || lr > 0 || expansion > 0 || tBranch > 0 || xBranch > 0;

  const racks = lengthM > 0 ? Math.ceil(lengthM / RACK_LENGTH_M) : 0;
  const sepSheets = hasSep ? racks * 2 : 0;
  const cSepPerCorner: 0 | 1 | 2 = hasSep && corner > 0 ? sepPerCorner(width) : 0;
  const cSepSheets = corner * cSepPerCorner;

  return {
    hasBody,
    railClass: railClassOf(width),
    boltSize: boltSizeOf(width),
    racks,
    straightJoints: Math.max(0, racks - 1) * JOINT_PER_STRAIGHT,
    cornerJoints: corner * JOINT_PER_CORNER,
    riseJoints: rise * 4,
    lrJoints: lr * 4,
    expJoints: expansion * 2,
    tBranchJoints: tBranch * JOINT_PER_TBRANCH,
    xBranchJoints: xBranch * JOINT_PER_XBRANCH,
    railCount,
    fure: railCount > 0 ? railCount * FURE_PER_SUPPORT : 0,
    sepSheets,
    sepJointPlates: sepSheets > 1 ? sepSheets - 1 : 0,
    sepClamps: sepSheets * 3,
    cSepPerCorner,
    cSepSheets,
    cSepJoints: cSepPerCorner > 1 ? corner : 0,
    cSepClampsMin: cSepSheets > 0 ? corner * 2 : 0,
    cSepClampsMax: cSepSheets > 0 ? corner * 3 : 0,
    riseSepJoints: hasSep && rise > 0 ? rise * 2 : 0,
    rails,
    railBarsSubtotal,
  };
}

// ─── 全体合計 ────────────────────────────────────────────────────────

export type PerType = Record<RackType, number>;

export type RackWidthAgg = { type: RackType; width: number; count: number };

export type RailClassAgg = {
  /** 定尺必要本数の合計 [本] */
  totalBars: number;
  /** 寸法別明細（寸法昇順、同一寸法は箇所数マージ後に本数を再計算） */
  items: readonly RailRowCalc[];
};

export type CableRackTotals = {
  /** 延長合計 [m] */
  totalLenM: number;
  /** 支持箇所合計（ダクターレール箇所数）[か所] */
  totalRailCount: number;
  /** 全ネジボルト W3/8 [本]（幅600以下ルートの支持か所×2） */
  boltsSmall: number;
  /** 全ネジボルト W1/2 [本]（幅600超ルートの支持か所×2） */
  boltsLarge: number;
  /** 平均支持間隔 [m]（延長・支持箇所とも>0のときのみ） */
  avgIntervalM: number | null;
  /** 平均支持間隔が2mを超えているか */
  intervalWarning: boolean;
  /** ラック本体（種別×幅ごと）[本] */
  rackBodies: readonly RackWidthAgg[];
  /** L形分岐（種別×幅ごと）[個] */
  corners: readonly RackWidthAgg[];
  /** ジョイント（種別別）= 直線+コーナー+T形+X形 [枚] */
  joints: PerType;
  /** 上下自在 [か所] / 上下自在継手 [対] */
  rise: PerType;
  riseJoints: PerType;
  /** 左右自在 [か所] / 左右自在継手 [対] */
  lr: PerType;
  lrJoints: PerType;
  /** 伸縮 [か所] / 伸縮継手 [枚] */
  expansion: PerType;
  expJoints: PerType;
  /** T形分岐 [個] / X形分岐 [個] */
  tBranch: PerType;
  xBranch: PerType;
  /** ふれどめ [個] */
  fure: PerType;
  /** セパレータ（約1500mm）[枚] / セパレータ用ジョイントプレート [枚] / セパレータ用上下自在継手 [対] */
  sepSheets: PerType;
  sepJointPlates: PerType;
  riseSepJoints: PerType;
  /** 押さえ金具（直線分のみ・QR+SR合算）[個] */
  sepClamps: number;
  /** ダクターレール定尺本数（D1: 幅600以下 / D2: 幅800以上） */
  railsD1: RailClassAgg;
  railsD2: RailClassAgg;
  /** コーナーあり×セパレータONのルートが存在（手動加算の注記表示用） */
  cornerSepNote: boolean;
};

const zeroPerType = (): PerType => ({ QR: 0, SR: 0 });

function buildRailAgg(map: ReadonlyMap<number, number>): RailClassAgg {
  const items = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([size, count]) => calcRailRow(size, count));
  return { totalBars: items.reduce((a, r) => a + r.bars, 0), items };
}

/**
 * 全ルートの合計集計。
 * - レール・支持箇所・全ネジは全ルート対象（延長・部材なしのレールのみルートも含む）。
 * - 本体・ジョイント・ふれどめ等の部材集計は hasBody のルートのみ対象。
 */
export function calcCableRackTotals(routes: readonly CableRackRouteInput[]): CableRackTotals {
  const pairs = routes.map((r) => ({ r, res: calcCableRackRoute(r) }));

  let totalLenM = 0;
  let supportSmall = 0; // 幅600以下ルートの支持か所
  let supportLarge = 0; // 幅600超ルートの支持か所
  const d1 = new Map<number, number>();
  const d2 = new Map<number, number>();
  const bodies = new Map<string, RackWidthAgg>();
  const corners = new Map<string, RackWidthAgg>();
  const joints = zeroPerType();
  const rise = zeroPerType();
  const riseJoints = zeroPerType();
  const lr = zeroPerType();
  const lrJoints = zeroPerType();
  const expansion = zeroPerType();
  const expJoints = zeroPerType();
  const tBranch = zeroPerType();
  const xBranch = zeroPerType();
  const fure = zeroPerType();
  const sepSheets = zeroPerType();
  const sepJointPlates = zeroPerType();
  const riseSepJoints = zeroPerType();
  let sepClamps = 0;
  let cornerSepNote = false;

  const addAgg = (map: Map<string, RackWidthAgg>, type: RackType, width: number, n: number) => {
    if (n <= 0) return;
    const key = `${type}-${width}`;
    const cur = map.get(key);
    if (cur) cur.count += n;
    else map.set(key, { type, width, count: n });
  };

  for (const { r, res } of pairs) {
    // レール・支持箇所（全ルート対象）
    if (r.lengthM > 0) totalLenM += r.lengthM;
    if (isWideRack(r.width)) supportLarge += res.railCount;
    else supportSmall += res.railCount;
    const railMap = isWideRack(r.width) ? d2 : d1;
    for (const row of res.rails) railMap.set(row.size, (railMap.get(row.size) ?? 0) + row.count);

    // 部材集計（hasBody のルートのみ）
    if (!res.hasBody) continue;
    addAgg(bodies, r.type, r.width, res.racks);
    addAgg(corners, r.type, r.width, r.corner);
    joints[r.type] += res.straightJoints + res.cornerJoints + res.tBranchJoints + res.xBranchJoints;
    rise[r.type] += r.rise;
    riseJoints[r.type] += res.riseJoints;
    lr[r.type] += r.lr;
    lrJoints[r.type] += res.lrJoints;
    expansion[r.type] += r.expansion;
    expJoints[r.type] += res.expJoints;
    tBranch[r.type] += r.tBranch;
    xBranch[r.type] += r.xBranch;
    fure[r.type] += res.fure;
    sepSheets[r.type] += res.sepSheets;
    sepJointPlates[r.type] += res.sepJointPlates;
    riseSepJoints[r.type] += res.riseSepJoints;
    sepClamps += res.sepClamps;
    if (r.hasSep && r.corner > 0) cornerSepNote = true;
  }

  const totalRailCount = supportSmall + supportLarge;
  const avgIntervalM = totalLenM > 0 && totalRailCount > 0 ? totalLenM / totalRailCount : null;

  const sortAgg = (map: Map<string, RackWidthAgg>): RackWidthAgg[] =>
    Array.from(map.values()).sort((a, b) =>
      a.type === b.type ? a.width - b.width : a.type === "QR" ? -1 : 1,
    );

  return {
    totalLenM,
    totalRailCount,
    boltsSmall: supportSmall * BOLT_PER_SUPPORT,
    boltsLarge: supportLarge * BOLT_PER_SUPPORT,
    avgIntervalM,
    intervalWarning: avgIntervalM != null && avgIntervalM > SUPPORT_INTERVAL_LIMIT_M,
    rackBodies: sortAgg(bodies),
    corners: sortAgg(corners),
    joints,
    rise,
    riseJoints,
    lr,
    lrJoints,
    expansion,
    expJoints,
    tBranch,
    xBranch,
    fure,
    sepSheets,
    sepJointPlates,
    riseSepJoints,
    sepClamps,
    railsD1: buildRailAgg(d1),
    railsD2: buildRailAgg(d2),
    cornerSepNote,
  };
}
