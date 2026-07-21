/**
 * 現場ツールボックス: 電材支持間隔データ（支持間隔 早見）。
 * 出典: 電気設備技術基準の解釈（電技解釈 第158/159/163/164条）・内線規程・
 * 公共建築工事標準仕様書（電気設備工事編）・建築電気設備の耐震設計・施工マニュアル（指針表6.2-1）。
 * いずれも規格・規程に基づく目安値。現場条件・設計図書を優先すること。
 */

export type SupportMaterialKey =
  | "CABLE" | "RACK" | "RACEWAY" | "DUCT" | "STEEL" | "FLEX" | "PF" | "VE";

/** 備考の種別: text=通常 / sub=小さい補足(定義等) / highlight=大型強調 / warn=警告 / recommend=推奨枠 */
export type SupportNoteKind = "text" | "sub" | "highlight" | "warn" | "recommend";

export type SupportNote = {
  kind: SupportNoteKind;
  text: string;
};

export type SupportCondition = {
  /** 条件ボタンの表示名 */
  label: string;
  /** 条件ボタンの補足（空文字なら非表示） */
  note: string;
  /** 支持間隔（耐震条件では耐震クラスA・Bの値） */
  interval: string;
  /** 根拠条文 */
  basis: string;
  /** ラック上ケーブルの固定間隔（該当電材のみ） */
  cableInterval?: string;
  /** ラック上ケーブル固定間隔の根拠 */
  cableBasis?: string;
  /** 耐震クラスSの支持間隔（耐震条件のみ） */
  seismicInterval?: string;
  /** 備考（結果エリアに表示） */
  notes: readonly SupportNote[];
};

export type SupportMaterial = {
  /** 電材ボタンの表示名 */
  label: string;
  /** 電材ボタンの補足（空文字なら非表示） */
  sub: string;
  /** 正式名称（結果表示用） */
  name: string;
  conditions: readonly SupportCondition[];
};

/** 耐震クラスSカードの根拠（固定文言） */
export const SEISMIC_S_BASIS =
  "根拠：建築電気設備の耐震設計・施工マニュアル 指針表6.2-1" as const;

/** ケーブルラック耐震支持3条件で共通の備考（末端部ルール・除外条件・支持方法） */
const RACK_SEISMIC_COMMON_NOTES = [
  { kind: "warn", text: "末端部の基本ルール（クラス共通）：末端から2m以内に必ず耐震支持（振れ止め）を設ける。※現場・仕様によっては1m以内とする基準もあり。" },
  { kind: "text", text: "除外条件（耐震支持不要）：幅400mm未満のもの／吊り長さが平均20cm以下のもの" },
  { kind: "text", text: "支持方法：S種・A種はアングル材で支持ブラケットを作成し、スラブ・梁にアンカーボルトで固定する。B種は全ネジボルトを用いて振れ止めを施す。" },
] as const;

/** 電材別・支持間隔データ（全8電材・22条件） */
export const SUPPORT_MATERIALS = {
  // ── ケーブル（電技解釈 第164条）
  CABLE: {
    label: "ケーブル", sub: "VVF・CV・CVT等", name: "ケーブル",
    conditions: [
      {
        label: "横支持（造営材の側面・下面）", note: "VVF・CV・CVT等 一般ケーブル",
        interval: "2m以内", basis: "根拠：電技解釈 第164条",
        notes: [
          { kind: "text", text: "VVF・CV・CVT等の一般ケーブル。造営材の下面または側面に沿って取り付ける場合。" },
        ],
      },
      {
        label: "縦支持（垂直配線）", note: "VVF・CV・CVT等 一般ケーブル",
        interval: "6m以内", basis: "根拠：電技解釈 第164条",
        notes: [
          { kind: "text", text: "接触防護措置を施した場所では15m以内。" },
        ],
      },
      {
        label: "キャブタイヤケーブル（横・縦共通）", note: "水平・垂直いずれも同じ",
        interval: "1m以内", basis: "根拠：電技解釈 第164条",
        notes: [
          { kind: "text", text: "水平・垂直いずれの場合も1m以内。" },
        ],
      },
    ],
  },
  // ── ケーブルラック（公共建築工事標準仕様書・内線規程・耐震設計施工マニュアル）
  RACK: {
    label: "ケーブルラック", sub: "", name: "ケーブルラック",
    conditions: [
      {
        label: "横支持（水平）鋼製", note: "",
        interval: "2m以内", basis: "根拠：公共建築工事標準仕様書・内線規程",
        cableInterval: "3m以内", cableBasis: "根拠：内線規程（トレー形は省略可）",
        notes: [
          { kind: "text", text: "鋼製ケーブルラックの水平支持間隔。終端・曲がり部の近くにも支持が必要。" },
        ],
      },
      {
        label: "横支持（水平）その他", note: "アルミ・ステンレス等",
        interval: "1.5m以内", basis: "根拠：公共建築工事標準仕様書・内線規程",
        cableInterval: "3m以内", cableBasis: "根拠：内線規程（トレー形は省略可）",
        notes: [
          { kind: "text", text: "アルミ・ステンレス等の鋼製以外のケーブルラックの水平支持間隔。終端・曲がり部の近くにも支持が必要。" },
        ],
      },
      {
        label: "縦支持（垂直）", note: "電気室・EPSは6m間隔でOK",
        interval: "3m以内", basis: "根拠：公共建築工事標準仕様書・内線規程",
        cableInterval: "1.5m以内", cableBasis: "根拠：内線規程",
        notes: [
          { kind: "highlight", text: "電気室・EPS（配線室）内では【6m間隔】での支持も認められる。" },
          { kind: "text", text: "終端・曲がり部近くにも支持が必要。" },
        ],
      },
      {
        label: "耐震支持 ／ 上層階・屋上・塔屋", note: "耐震クラスA・B：8m以内　クラスS：6m以内",
        interval: "【A・B】8m以内", basis: SEISMIC_S_BASIS,
        seismicInterval: "【クラスS】6m以内",
        notes: [
          { kind: "sub", text: "【上層階の定義】2〜6階建て：最上階／7〜9階建て：上の2層／10〜12階建て：上の3層／13階建て以上：上の4層" },
          { kind: "text", text: "耐震クラスA・B：8m以内に1箇所、A種またはB種の耐震支持を設ける。" },
          { kind: "text", text: "耐震クラスS：6m以内に1箇所、Ss種の耐震支持を設ける。" },
          ...RACK_SEISMIC_COMMON_NOTES,
        ],
      },
      {
        label: "耐震支持 ／ 中間階", note: "耐震クラスA・B：12m以内　クラスS：8m以内",
        interval: "【A・B】12m以内", basis: SEISMIC_S_BASIS,
        seismicInterval: "【クラスS】8m以内",
        notes: [
          { kind: "sub", text: "【中間階の定義】地階・1階を除く各階のうち、上層階に該当しない階。" },
          { kind: "text", text: "耐震クラスA・B：12m以内に1箇所、A種またはB種の耐震支持を設ける。" },
          { kind: "text", text: "耐震クラスS：8m以内に1箇所、A種の耐震支持を設ける。" },
          ...RACK_SEISMIC_COMMON_NOTES,
        ],
      },
      {
        label: "耐震支持 ／ 地階・1階", note: "耐震クラスA・B：12m以内　クラスS：8m以内（A種）",
        interval: "【A・B】12m以内", basis: SEISMIC_S_BASIS,
        seismicInterval: "【クラスS】8m以内",
        notes: [
          { kind: "sub", text: "【地階・1階の定義】地下の階および地上1階。" },
          { kind: "text", text: "耐震クラスA・B：12m以内に1箇所、A種またはB種の耐震支持を設ける。" },
          { kind: "text", text: "耐震クラスS：8m以内に1箇所、A種の耐震支持を設ける。" },
          ...RACK_SEISMIC_COMMON_NOTES,
        ],
      },
    ],
  },
  // ── レースウェイ（内線規程・公共建築工事標準仕様書）
  RACEWAY: {
    label: "レースウェイ", sub: "", name: "レースウェイ",
    conditions: [
      {
        label: "一般", note: "",
        interval: "1.5m以内", basis: "根拠：内線規程・公共建築工事標準仕様書",
        notes: [
          { kind: "text", text: "終端・接続部・曲がり部の近くにも支持が必要。" },
          { kind: "recommend", text: "振れ止めを施す場合は耐震支持間隔または現場施工要領書を確認すること。" },
        ],
      },
    ],
  },
  // ── ケーブルダクト（内線規程）
  DUCT: {
    label: "ケーブルダクト", sub: "", name: "ケーブルダクト",
    conditions: [
      {
        label: "横支持（水平）", note: "",
        interval: "3m以内", basis: "根拠：内線規程",
        notes: [
          { kind: "text", text: "取付方法・ダクトの種類により異なる場合あり。終端部近くにも支持が必要。" },
          { kind: "recommend", text: "振れ止めを施す場合は耐震支持間隔または現場施工要領書を確認すること。" },
        ],
      },
      {
        label: "縦支持（垂直）", note: "各階支持が必要",
        interval: "6m以内", basis: "根拠：内線規程",
        notes: [
          { kind: "text", text: "垂直敷設の場合は6m以下ごとに支持点を設ける。各階での支持が必要。終端部近くにも支持が必要。" },
          { kind: "recommend", text: "振れ止めを施す場合は耐震支持間隔または現場施工要領書を確認すること。" },
        ],
      },
    ],
  },
  // ── 鋼製電線管（電技解釈 第159条・公共建築工事標準仕様書）
  STEEL: {
    label: "鋼製電線管", sub: "G管・E管", name: "鋼製電線管",
    conditions: [
      {
        label: "一般（G管・E管）", note: "",
        interval: "2m以内", basis: "根拠：電技解釈 第159条",
        notes: [
          { kind: "text", text: "ボックスから1か所目の支持は500mm以内。" },
          { kind: "recommend", text: "曲がり箇所は300〜500mm以内の支持を推奨" },
          { kind: "text", text: "管端・管相互の接続部分・ボックス等への接続部分の近くにも支持が必要。" },
        ],
      },
      {
        label: "耐震支持（上層階・屋上・塔屋）", note: "A種（SA種）耐震支持",
        interval: "12m以内に1箇所", basis: "根拠：公共建築工事標準仕様書（電気設備工事編）",
        notes: [
          { kind: "text", text: "上層階・屋上・塔屋に敷設する電気配管の耐震支持間隔。A種（SA種）耐震支持金物を12m以内に1箇所設置すること。" },
          { kind: "recommend", text: "除外：φ82以下の単独管で吊り長さの平均が200mm以下かつ周長800mm以下の場合は耐震支持不要。" },
        ],
      },
      {
        label: "耐震支持（中間階・地階・1階）", note: "A種またはB種耐震支持",
        interval: "12m以内に1箇所", basis: "根拠：公共建築工事標準仕様書（電気設備工事編）",
        notes: [
          { kind: "text", text: "中間階・地階・1階に敷設する電気配管の耐震支持間隔。A種またはB種耐震支持金物を12m以内に1箇所設置すること。" },
          { kind: "recommend", text: "除外：φ82以下の単独管で吊り長さの平均が200mm以下かつ周長800mm以下の場合は耐震支持不要。" },
        ],
      },
    ],
  },
  // ── 可とう電線管（電技解釈 第163条）
  FLEX: {
    label: "可とう電線管", sub: "プリカ・マシンフレキ等", name: "可とう電線管",
    conditions: [
      {
        label: "横支持（造営材の側面・下面）", note: "プリカ・マシンフレキ等（2種）",
        interval: "1m以内", basis: "根拠：電技解釈 第163条",
        notes: [
          { kind: "text", text: "2種金属製可とう電線管（プリカ・マシンフレキ等）を造営材の側面または下面に沿って水平に施設する場合。" },
        ],
      },
      {
        label: "接続箇所の近傍", note: "管相互・ボックス・器具との接続部",
        interval: "0.3m以内", basis: "根拠：電技解釈 第163条",
        notes: [
          { kind: "text", text: "管相互の接続箇所、およびボックス・器具との接続箇所から0.3m以内に支持が必要。" },
        ],
      },
      {
        label: "その他（縦支持・接触防護あり等）", note: "",
        interval: "2m以内", basis: "根拠：電技解釈 第163条",
        notes: [
          { kind: "text", text: "上記以外の場合（垂直配線・接触防護措置を施した場所等）の支持間隔。" },
        ],
      },
      {
        label: "電動機等への接続部分", note: "可とう性を必要とする部分",
        interval: "規定なし", basis: "根拠：電技解釈 第163条",
        notes: [
          { kind: "text", text: "可とう性を確保し、必要最小限の長さとすること。造営材に固定しない自由な状態で使用。" },
        ],
      },
    ],
  },
  // ── PF管（電技解釈 第158条）
  PF: {
    label: "PF管", sub: "合成樹脂製可とう電線管", name: "PF管（合成樹脂製可とう電線管）",
    conditions: [
      {
        label: "露出配線（造営材に沿って施設）", note: "PF-S・PF-D",
        interval: "1m以内", basis: "根拠：電技解釈 第158条",
        notes: [
          { kind: "recommend", text: "ボックス近傍300mm以内の支持を推奨（大型現場の一般的な施工基準）" },
          { kind: "text", text: "管端・接続部近くにも支持が必要。" },
        ],
      },
      {
        label: "隠ぺい場所（天井裏・壁内等）", note: "",
        interval: "1.5m以内", basis: "根拠：電技解釈 第158条",
        notes: [
          { kind: "recommend", text: "ボックス近傍300mm以内の支持を推奨（大型現場の一般的な施工基準）" },
          { kind: "text", text: "天井裏・壁内など隠ぺい場所でのPF管の支持間隔。" },
        ],
      },
    ],
  },
  // ── VE管（電技解釈 第158条）
  VE: {
    label: "VE管", sub: "硬質ビニル電線管", name: "VE管（硬質ビニル電線管）",
    conditions: [
      {
        label: "一般（露出・隠ぺい）", note: "VE管・HIVE管",
        interval: "1.5m以内", basis: "根拠：電技解釈 第158条",
        notes: [
          { kind: "text", text: "ボックスから1か所目の支持は500mm以内。管端・接続部・ボックス等への接続部分の近くにも支持が必要。" },
        ],
      },
    ],
  },
} as const satisfies Record<SupportMaterialKey, SupportMaterial>;

/** 電材ボタンの表示順 */
export const SUPPORT_MATERIAL_ORDER: readonly SupportMaterialKey[] = [
  "CABLE", "RACK", "RACEWAY", "DUCT", "STEEL", "FLEX", "PF", "VE",
] as const;

/** 電材データを取得（型を SupportMaterial に広げて返す） */
export function getSupportMaterial(key: SupportMaterialKey): SupportMaterial {
  return SUPPORT_MATERIALS[key];
}

/** 電材の条件一覧を取得 */
export function listSupportConditions(key: SupportMaterialKey): readonly SupportCondition[] {
  return getSupportMaterial(key).conditions;
}

/** 電材キー + 条件indexから条件を検索（範囲外は null） */
export function findSupportCondition(key: SupportMaterialKey, index: number): SupportCondition | null {
  return getSupportMaterial(key).conditions[index] ?? null;
}

/** 耐震クラスS表示を持つ条件か（第1カードのラベルが「耐震支持間隔（クラスA・B）」になる） */
export function isSeismicCondition(cond: SupportCondition): boolean {
  return cond.seismicInterval != null;
}
