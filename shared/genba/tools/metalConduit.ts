/**
 * 現場ツールボックス: 金属管 拾い出し（材料計算）。
 * 金属管（電線管）工事で、配管ルートごとの延長と両端の施工方法から
 * 必要材料（金属管本数・カップリング・サドル等支持材・末端処理材料）を切り上げ計算する。
 * 出典: 定尺 3.66m は JIS C 8305（鋼製電線管）の標準定尺。
 * サドル支持間隔 1.5m は内線規程・電技解釈の支持間隔（2m 以下）を踏まえた現場目安値。
 * 壁材質別の固定方法・注意点は施工上の一般的な目安。現場条件・設計図書を優先すること。
 */

/** 金属管の定尺長 [m]（JIS C 8305 標準定尺 3.66m） */
export const PIPE_LENGTH_M = 3.66;

/** サドル支持間隔 [m]（内線規程・電技解釈の支持間隔 2m 以下を踏まえた現場目安） */
export const SADDLE_INTERVAL_M = 1.5;

/* ------------------------------------------------------------------ */
/* 設置場所（屋内 E管 / 屋外 G管）                                        */
/* ------------------------------------------------------------------ */

export type ConduitLocation = "indoor" | "outdoor";

export const CONDUIT_LOCATION_ORDER = ["indoor", "outdoor"] as const;

/** 設置場所別の表示ラベル（管種・カップリング名称の切替） */
export const CONDUIT_LOCATIONS = {
  indoor: {
    label: "屋内（E管）",
    pipeLabel: "金属管（E管 / ねじなし電線管）",
    couplingLabel: "カップリング",
  },
  outdoor: {
    label: "屋外（G管）",
    pipeLabel: "金属管（G管 / 厚鋼電線管）",
    couplingLabel: "防水カップリング",
  },
} as const satisfies Record<ConduitLocation, { label: string; pipeLabel: string; couplingLabel: string }>;

/* ------------------------------------------------------------------ */
/* 壁材質別 固定方法データ（情報表示のみ・計算結果には影響しない）           */
/* ------------------------------------------------------------------ */

export type WallKey = "concrete" | "alc" | "wood" | "steel" | "board" | "block";

export const WALL_ORDER = ["concrete", "alc", "wood", "steel", "board", "block"] as const;

/** 固定方法1候補。tagKind: main=主・下地あり（濃色バッジ）/ alt=それ以外（グレー系バッジ） */
export type WallFixMethod = {
  tag: string;
  tagKind: "main" | "alt";
  name: string;
};

export type WallInfo = {
  /** 選択グリッドの表示名 */
  label: string;
  /** 結果カードの正式表示名 */
  fullLabel: string;
  /** 固定方法の候補 */
  methods: readonly WallFixMethod[];
  /** 施工上の注意（警告） */
  warning: string;
};

/** 壁材質6種の固定方法候補と注意点（施工目安） */
export const WALL_DATA = {
  concrete: {
    label: "コンクリート",
    fullLabel: "コンクリート",
    methods: [
      { tag: "主", tagKind: "main", name: "コンクリートビス（サンコンクリートビス等）" },
      { tag: "主", tagKind: "main", name: "プラグ＋木ビス（樹脂プラグ使用）" },
      { tag: "重荷重", tagKind: "alt", name: "アンカーボルト（M6以上）" },
    ],
    warning: "振動ドリルで下穴が必要。ビスサイズはサドルの穴径に合わせること。",
  },
  alc: {
    label: "ALC",
    fullLabel: "ALC（軽量気泡コンクリート）",
    methods: [
      { tag: "主", tagKind: "main", name: "ALCビス（専用品）" },
      { tag: "主", tagKind: "main", name: "ALCアンカー（専用品）" },
    ],
    warning: "普通のコンクリートビス・プラグは効かない。必ずALC専用品を使うこと。",
  },
  wood: {
    label: "木造（木下地）",
    fullLabel: "木造（木下地）",
    methods: [
      { tag: "主", tagKind: "main", name: "木ビス（コーススレッド）" },
      { tag: "主", tagKind: "main", name: "タッピングビス" },
    ],
    warning: "下地（柱・間柱）の位置を確認してからビス打ちすること。ボードのみへの固定は避ける。",
  },
  steel: {
    label: "鉄骨（スチール）",
    fullLabel: "鉄骨（スチール下地）",
    methods: [
      { tag: "主", tagKind: "main", name: "ドリルビス（テックスビス）" },
      { tag: "別途資格", tagKind: "alt", name: "溶接（点付け）" },
    ],
    warning: "ドリルビスの長さは鉄骨の板厚＋サドル厚を考慮して選定。板厚2.3mm超はサイズ注意。",
  },
  board: {
    label: "石膏ボード",
    fullLabel: "石膏ボード",
    methods: [
      { tag: "下地あり", tagKind: "main", name: "木ビス（下地の柱に打つ）" },
      { tag: "下地なし", tagKind: "alt", name: "ボードアンカー / 中空アンカー" },
    ],
    warning: "ボードのみへの固定は荷重限界が低い。重量のある配管は必ず下地に固定すること。",
  },
  block: {
    label: "ブロック・レンガ",
    fullLabel: "ブロック・レンガ",
    methods: [
      { tag: "主", tagKind: "main", name: "プラグ＋ビス（樹脂プラグ）" },
      { tag: "重荷重", tagKind: "alt", name: "アンカーボルト（M6以上）" },
    ],
    warning: "縦目地・欠けた部分へのビス打ちは避ける。下穴はブロックの中央部（目地を避ける）に。",
  },
} as const satisfies Record<WallKey, WallInfo>;

/* ------------------------------------------------------------------ */
/* 末端処理タイプ別 材料カウント（末端1か所あたり）                        */
/* ------------------------------------------------------------------ */

export type EndType = "pullbox" | "box" | "cap" | "connector";

export const END_TYPE_ORDER = ["pullbox", "box", "cap", "connector"] as const;

export type EndTypeInfo = {
  /** セレクトの表示名 */
  label: string;
  /** 内訳表示名（「◯◯ ◯か所」） */
  countLabel: string;
  /** 末端1か所あたりの材料数 */
  connectors: number;
  locknuts: number;
  bushings: number;
  endcaps: number;
};

/** 末端処理タイプ別 材料カウント表（末端1か所あたり・施工目安） */
export const END_TYPES = {
  pullbox: {
    label: "プールボックス接続",
    countLabel: "プールボックス接続",
    connectors: 1,
    locknuts: 1,
    bushings: 1,
    endcaps: 0,
  },
  box: {
    // 丸・角ボックス接続は材料計上なし（か所数の内訳表示のみ）
    label: "丸ボックス・角ボックス",
    countLabel: "丸ボックス・角ボックス接続",
    connectors: 0,
    locknuts: 0,
    bushings: 0,
    endcaps: 0,
  },
  cap: {
    label: "サンピーキャップ",
    countLabel: "サンピーキャップ",
    connectors: 0,
    locknuts: 0,
    bushings: 0,
    endcaps: 1,
  },
  connector: {
    label: "コネクタのみ",
    countLabel: "コネクタのみ施工",
    connectors: 1,
    locknuts: 0,
    bushings: 0,
    endcaps: 0,
  },
} as const satisfies Record<EndType, EndTypeInfo>;

/* ------------------------------------------------------------------ */
/* 計算純関数                                                          */
/* ------------------------------------------------------------------ */

/** 配管ルート1本の入力（延長[m]と両端の末端処理タイプ） */
export type ConduitRoute = {
  lengthM: number;
  startType: EndType;
  endType: EndType;
};

export type MetalConduitResult = {
  /** 合計延長 [m] */
  totalLengthM: number;
  /** 金属管 [本] = ceil(合計延長 / 3.66) */
  pipes: number;
  /** カップリング [個] = max(0, 管本数 − ルート数)。合計延長ベースの近似 */
  couplings: number;
  /** サドル等支持材 [個] = ceil(合計延長 / 1.5) */
  saddles: number;
  /** 末端処理タイプ別のか所数 */
  endCounts: Record<EndType, number>;
  /** 末端処理材料の合計 [個] */
  materials: {
    connectors: number;
    locknuts: number;
    bushings: number;
    endcaps: number;
  };
};

/** 延長入力文字列を数値化（数値化不能・負値は 0 扱い） */
export function parseRouteLength(input: string): number {
  const n = parseFloat(input);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 入力バリデーション。エラーがあればメッセージ文字列、なければ null。
 * - ルート0件 → 「ルートを1本以上追加してください」
 * - 合計延長0以下 → 「延長を1か所以上入力してください」
 */
export function validateMetalConduit(routes: readonly ConduitRoute[]): string | null {
  if (routes.length === 0) return "ルートを1本以上追加してください";
  const total = routes.reduce((a, r) => a + r.lengthM, 0);
  if (total <= 0) return "延長を1か所以上入力してください";
  return null;
}

/**
 * 金属管 材料計算。
 * 端数は全て切り上げ（Math.ceil）。ロス率・予備率の自動加算はない
 * （+10%程度の余裕を注意書きで案内するのみ）。
 */
export function calcMetalConduit(routes: readonly ConduitRoute[]): MetalConduitResult {
  const totalLengthM = routes.reduce((a, r) => a + r.lengthM, 0);

  const endCounts: Record<EndType, number> = { pullbox: 0, box: 0, cap: 0, connector: 0 };
  const materials = { connectors: 0, locknuts: 0, bushings: 0, endcaps: 0 };
  for (const r of routes) {
    for (const t of [r.startType, r.endType]) {
      endCounts[t] += 1;
      const m = END_TYPES[t];
      materials.connectors += m.connectors;
      materials.locknuts += m.locknuts;
      materials.bushings += m.bushings;
      materials.endcaps += m.endcaps;
    }
  }

  const pipes = totalLengthM > 0 ? Math.ceil(totalLengthM / PIPE_LENGTH_M) : 0;
  const couplings = Math.max(0, pipes - routes.length);
  const saddles = totalLengthM > 0 ? Math.ceil(totalLengthM / SADDLE_INTERVAL_M) : 0;

  return { totalLengthM, pipes, couplings, saddles, endCounts, materials };
}

/** 屋外 かつ プールボックス接続が1か所以上 → 防水処理注記を表示する */
export function needsWaterproofNote(location: ConduitLocation, result: MetalConduitResult): boolean {
  return location === "outdoor" && result.endCounts.pullbox > 0;
}

/* ------------------------------------------------------------------ */
/* 注意書き文言（施工目安）                                              */
/* ------------------------------------------------------------------ */

/** 屋内時の結果注記 */
export const NOTE_INDOOR =
  "計算値は最低限の数量です。損失・予備を考慮して+10%程度の余裕を持たせることを推奨します。" as const;

/** 屋外時の結果注記（材質推奨） */
export const NOTE_OUTDOOR = [
  "材質推奨：どぶ漬け（溶融亜鉛メッキ）またはステンレス製を使用してください。",
  "屋外は腐食リスクがあるため、一般品（黒管）の使用は避けること。",
  "計算値は最低限の数量です。+10%程度の余裕を推奨します。",
] as const;

/** 屋外×プールボックス時のみ表示する防水処理注記 */
export const WATERPROOF_NOTE = {
  title: "【屋外×プールボックス 防水処理について】",
  sections: [
    {
      heading: "① 管との接続部",
      body: "プールボックスと金属管の接続部・ノックアウト周囲にコーキング処理を施すこと。",
    },
    {
      heading: "② 設置面のコーキング",
      body: "壁への取付面は上辺・左辺・右辺の3辺をコーキングすること。※ 下辺はコーキングしない（水抜きのため）",
    },
    {
      heading: "③ 水抜き穴の施工",
      body: "ボックス下部に水抜き穴（φ5〜8mm程度）の施工を推奨。内部結露・浸水時の排水を確保すること。",
    },
  ],
  material: "使用材料：変成シリコン系シーリング材（耐候性タイプ）",
} as const;
