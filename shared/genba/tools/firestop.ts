/**
 * 現場ツールボックス: 耐火区画貫通処理 工法ガイドデータ（耐火区画貫通 ガイド）。
 * 出典: 建築基準法施行令 第112条（防火区画）・第129条の2の4 第1項第7号（貫通部の処理）、
 * 消防法施行令、および業界で一般周知の施工目安。
 * ★重要★ 防火区画貫通は国土交通大臣認定工法の適用条件（壁・床の構造/厚さ・開口径・充填深さ・
 * 貫通物の種類/本数）に従うこと。本データは一般ガイドであり、実施工前に必ず認定書・設計図書で確認する。
 * 特定メーカーの認定番号は記載しない（一般名称のみ）。
 */

/** 壁・床の種別 */
export type FirestopStructureKey = "RC" | "ALC" | "LGS" | "SLAB";

/** 貫通物の種別 */
export type FirestopPenetrantKey = "METAL_CONDUIT" | "PF_CD" | "CABLE" | "RACK" | "BUS_DUCT";

/** 代表工法の種別 */
export type FirestopMethodKey = "MORTAR" | "ROCKWOOL_SLEEVE" | "FIRE_PUTTY" | "INTUMESCENT" | "FIRE_BOARD";

/**
 * 対応レベル:
 * basic     = 不燃材による一般的な充填処理で対応できる場合が多い（条件確認は必要）
 * certified = 大臣認定工法（認定材）の使用が前提。適用条件の確認が必須
 * consult   = 適用できる認定が限られる等、メーカー・設計者との個別検討が必要
 */
export type FirestopLevel = "basic" | "certified" | "consult";

export type FirestopStructure = {
  /** ボタンの表示名 */
  label: string;
  /** ボタンの補足（空文字なら非表示） */
  sub: string;
  /** 正式名称（結果表示用） */
  name: string;
};

export type FirestopPenetrant = {
  label: string;
  sub: string;
  name: string;
};

export type FirestopMethod = {
  /** 工法の一般名称 */
  name: string;
  /** 工法の概要説明 */
  summary: string;
};

/** 組み合わせ結果内の工法参照（役割ラベル付き） */
export type FirestopMethodRef = {
  method: FirestopMethodKey;
  /** この組み合わせでの位置づけ（例: 第一候補 / 併用材） */
  role: string;
};

export type FirestopEntry = {
  level: FirestopLevel;
  /** 結果の要約（1〜2文） */
  summary: string;
  /** 代表的工法（表示順） */
  methods: readonly FirestopMethodRef[];
  /** 施工ポイント */
  points: readonly string[];
  /** この組み合わせ固有のチェックリスト（共通チェックリストに先行して表示） */
  checklist: readonly string[];
};

/** 壁・床の種別データ */
export const FIRESTOP_STRUCTURES = {
  RC: { label: "RC壁", sub: "鉄筋コンクリート", name: "RC壁（鉄筋コンクリート）" },
  ALC: { label: "ALC壁", sub: "軽量気泡コンクリートパネル", name: "ALCパネル壁" },
  LGS: { label: "中空壁（LGS）", sub: "強化石膏ボード", name: "中空壁（LGS＋強化石膏ボード）" },
  SLAB: { label: "床スラブ", sub: "RC床", name: "床スラブ（RC）" },
} as const satisfies Record<FirestopStructureKey, FirestopStructure>;

/** 貫通物の種別データ */
export const FIRESTOP_PENETRANTS = {
  METAL_CONDUIT: { label: "金属管", sub: "G管・E管等", name: "金属管（G管・E管等）" },
  PF_CD: { label: "PF管・CD管", sub: "合成樹脂可とう管", name: "PF管・CD管（合成樹脂可とう電線管）" },
  CABLE: { label: "ケーブル（転がし）", sub: "VVF・CV・CVT等", name: "ケーブル（転がし配線）" },
  RACK: { label: "ケーブルラック", sub: "", name: "ケーブルラック" },
  BUS_DUCT: { label: "バスダクト", sub: "", name: "バスダクト" },
} as const satisfies Record<FirestopPenetrantKey, FirestopPenetrant>;

/** 代表工法データ（一般名称・概要） */
export const FIRESTOP_METHODS = {
  MORTAR: {
    name: "モルタル充填",
    summary: "貫通部の隙間を不燃材のモルタルで開口全厚にわたり充填する、最も基本的な処理。金属管など不燃の貫通物に用いる。",
  },
  ROCKWOOL_SLEEVE: {
    name: "ロックウール充填＋鋼製スリーブ",
    summary: "鋼製スリーブ（貫通枠）内に所定の充填率でロックウールを詰め、端部を耐火パテ等で押さえる工法。ケーブル貫通で広く使われる。",
  },
  FIRE_PUTTY: {
    name: "耐火パテ",
    summary: "少数のケーブルや小さな隙間のシールに用いる不燃パテ。単独使用・併用材のいずれも認定条件の範囲内で使用する。",
  },
  INTUMESCENT: {
    name: "認定工法材（熱膨張材）",
    summary: "火災時の加熱で膨張して開口を閉塞するシート・ブロック・パテ状の認定材。樹脂管やケーブルなど可燃の貫通物に必須級の工法。",
  },
  FIRE_BOARD: {
    name: "耐火仕切板",
    summary: "ラック等の大開口を耐火性の仕切板でふさぎ、貫通物まわりの隙間をロックウール・耐火パテ等で処理する工法。",
  },
} as const satisfies Record<FirestopMethodKey, FirestopMethod>;

/** 対応レベルの表示情報（色は CUD 固定色） */
export const FIRESTOP_LEVELS = {
  basic: {
    label: "一般工法で対応可",
    color: "#03AF7A", // CUD OK
    note: "不燃材による充填処理で対応できる場合が多い組み合わせ。区画の種別・図面指定は要確認。",
  },
  certified: {
    label: "大臣認定工法を使用",
    color: "#F6AA00", // CUD 注意
    note: "国土交通大臣認定の工法材が前提。認定書の適用条件（壁厚・開口径・充填深さ・本数）の確認が必須。",
  },
  consult: {
    label: "個別検討が必要",
    color: "#FF4B00", // CUD NG
    note: "適用できる認定工法が限られる組み合わせ。メーカー・設計者と協議し、ルート変更も含めて検討する。",
  },
} as const satisfies Record<FirestopLevel, { label: string; color: string; note: string }>;

/** 全組み合わせ共通のチェックリスト（各結果のチェックリスト末尾に表示） */
export const FIRESTOP_COMMON_CHECKLIST = [
  "認定書・施工要領書の適用条件（構造・壁/床厚・開口径・貫通物の種類/本数・充填深さ）を確認した",
  "設計図書・防火区画図で区画の種別と処理仕様を確認した",
  "施工後に表示ラベルを貼付し、施工写真を記録した",
] as const;

/** 認定工法系の組み合わせで共通の施工ポイント */
const CERTIFIED_COMMON_POINT =
  "認定工法は指定の材料・充填量・施工手順から外れると認定外施工になる。代替材の流用は不可。" as const;

/** 貫通配管（金属管以外の可燃管・ケーブル）で共通の1m不燃ルール（施行令129条の2の4 目安） */
const ONE_METER_RULE =
  "貫通部の両側1m以内の部分は不燃材料で造ること（配管系は金属管等の不燃管とするのが原則）。" as const;

/**
 * 壁・床種別 × 貫通物の組み合わせ結果（4×5=20通り）。
 * 内容は一般周知の代表工法・施工上の注意の目安。最終判断は認定書・設計図書による。
 */
export const FIRESTOP_MATRIX = {
  RC: {
    METAL_CONDUIT: {
      level: "basic",
      summary: "金属管は不燃材のため、貫通部の隙間をモルタルで完全充填する処理が基本。",
      methods: [
        { method: "MORTAR", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "小さな隙間のシールに併用" },
      ],
      points: [
        ONE_METER_RULE,
        "モルタルは開口の全厚にわたって充填し、脱落しないよう施工する。",
        "管とスリーブの隙間が大きい場合はロックウールを併用して充填する。",
      ],
      checklist: [
        "貫通部およびその両側1m以内が金属管（不燃管）になっている",
        "モルタルが開口全厚に充填され、ひび・脱落がない",
      ],
    },
    PF_CD: {
      level: "certified",
      summary: "合成樹脂管は火災時に溶融・焼失するため、熱膨張材で開口を閉塞する大臣認定工法を使用する。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "認定条件内の併用材" },
      ],
      points: [
        "樹脂管は溶融して穴が残るため、モルタル充填のみでは不可。熱膨張材で閉塞する認定工法を使う。",
        CERTIFIED_COMMON_POINT,
        "施工後に配管を追加すると認定条件から外れる。増設時は再処理・条件再確認が必要。",
      ],
      checklist: [
        "管の種類（PF/CD）・呼び径・本数が認定条件の範囲内である",
        "熱膨張材の巻き付け位置・充填深さが施工要領書どおりである",
      ],
    },
    CABLE: {
      level: "certified",
      summary: "ケーブルはシース（被覆）が可燃のため、熱膨張材またはロックウール充填の大臣認定工法で処理する。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "ROCKWOOL_SLEEVE", role: "スリーブ貫通の場合" },
        { method: "FIRE_PUTTY", role: "少数ケーブル・端部押さえ" },
      ],
      points: [
        "ケーブルの種類・本数・占積率が認定条件の範囲内であることを確認する。",
        CERTIFIED_COMMON_POINT,
        "空きスリーブ・予備スリーブも開放のまま残さず閉塞処理する。",
      ],
      checklist: [
        "ケーブル本数・占積率が認定条件の範囲内である",
        "空き・予備のスリーブも閉塞処理した",
      ],
    },
    RACK: {
      level: "certified",
      summary: "ラック貫通は大開口になるため、耐火仕切板＋ロックウール充填等の大臣認定工法で処理する。",
      methods: [
        { method: "FIRE_BOARD", role: "大開口の閉塞" },
        { method: "ROCKWOOL_SLEEVE", role: "ケーブルまわりの充填" },
        { method: "INTUMESCENT", role: "ケーブル束の閉塞" },
      ],
      points: [
        "ラック本体（子桁）と充填材の取合いに隙間が残りやすい。仕切板の割付けを事前に検討する。",
        CERTIFIED_COMMON_POINT,
        "将来増設を見込む場合も、増設後の本数・占積率が認定条件内に収まるよう計画する。",
      ],
      checklist: [
        "開口寸法・ラック幅が認定条件の範囲内である",
        "ラック桁まわり・仕切板取合いの隙間まで充填されている",
      ],
    },
    BUS_DUCT: {
      level: "consult",
      summary: "バスダクト貫通部は原則としてダクトメーカーの耐火処理仕様（認定工法）による。事前協議が必須。",
      methods: [
        { method: "ROCKWOOL_SLEEVE", role: "メーカー仕様による充填" },
        { method: "FIRE_BOARD", role: "開口の閉塞（仕様による）" },
      ],
      points: [
        "バスダクトは製品ごとに貫通部の耐火処理仕様が定められている。必ずメーカーの施工要領で確認する。",
        "換気形（換気孔付き）バスダクトは区画貫通に使用できない製品があるため機種選定時に確認する。",
        "ダクト本体が熱を伝えるため、貫通部両側の温度上昇対策（仕様指定の処理範囲）を守る。",
      ],
      checklist: [
        "メーカーの貫通部耐火処理仕様（認定内容）を入手・確認した",
        "貫通部に使用する機種が区画貫通対応品である",
      ],
    },
  },
  ALC: {
    METAL_CONDUIT: {
      level: "basic",
      summary: "金属管はモルタル充填が基本。ただしALCは開口まわりが欠けやすく、開口径・位置の制限に注意する。",
      methods: [
        { method: "MORTAR", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "小さな隙間のシールに併用" },
      ],
      points: [
        ONE_METER_RULE,
        "ALCパネルは開口まわりが割れやすい。パネル端部・目地際の開口を避け、開口径の制限を確認する。",
        "大きな開口はパネルの構造上の検討（開口補強）が必要になる場合がある。",
      ],
      checklist: [
        "開口位置がパネル端部・目地際を避けている",
        "貫通部およびその両側1m以内が金属管（不燃管）になっている",
      ],
    },
    PF_CD: {
      level: "certified",
      summary: "熱膨張材の大臣認定工法を使用する。ALC（パネル厚）が認定の適用構造に含まれるか要確認。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "認定条件内の併用材" },
      ],
      points: [
        "認定工法はRC・ALC・中空壁など構造ごとに適用範囲が異なる。ALC（使用パネル厚）が含まれる認定を選ぶ。",
        CERTIFIED_COMMON_POINT,
        "樹脂管は溶融するためモルタル充填のみでは不可。",
      ],
      checklist: [
        "認定の適用構造にALC（該当パネル厚）が含まれている",
        "管の呼び径・本数が認定条件の範囲内である",
      ],
    },
    CABLE: {
      level: "certified",
      summary: "ALC対応の大臣認定工法（熱膨張材・ロックウール充填等）で処理する。パネル厚の適用条件に注意。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "ROCKWOOL_SLEEVE", role: "スリーブ貫通の場合" },
        { method: "FIRE_PUTTY", role: "少数ケーブル・端部押さえ" },
      ],
      points: [
        "認定の適用構造にALC（使用パネル厚）が含まれることを確認する。",
        "ALCは開口まわりが欠けやすい。スリーブ固定・充填時の割れに注意する。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "認定の適用構造にALC（該当パネル厚）が含まれている",
        "ケーブル本数・占積率が認定条件の範囲内である",
      ],
    },
    RACK: {
      level: "consult",
      summary: "ALCの大開口はパネルの構造検討（開口補強）が必要。認定条件と併せて設計者と個別検討する。",
      methods: [
        { method: "FIRE_BOARD", role: "大開口の閉塞" },
        { method: "ROCKWOOL_SLEEVE", role: "ケーブルまわりの充填" },
      ],
      points: [
        "ラック貫通の大開口はALCパネルの強度に影響する。開口補強の要否を設計者に確認する。",
        "ALCを適用構造に含む認定工法かを確認する。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "開口補強の要否を設計者に確認した",
        "認定の適用構造・開口寸法の条件を確認した",
      ],
    },
    BUS_DUCT: {
      level: "consult",
      summary: "ALC×バスダクトは開口補強とメーカー耐火処理仕様の両面から個別検討が必要。",
      methods: [
        { method: "ROCKWOOL_SLEEVE", role: "メーカー仕様による充填" },
        { method: "FIRE_BOARD", role: "開口の閉塞（仕様による）" },
      ],
      points: [
        "バスダクト貫通部はメーカーの耐火処理仕様による。ALC壁への適用可否を必ず確認する。",
        "大開口となるためALCパネルの開口補強の要否を設計者に確認する。",
        "換気形バスダクトは区画貫通に使用できない製品があるため機種選定時に確認する。",
      ],
      checklist: [
        "メーカー仕様がALC壁への貫通に対応している",
        "開口補強の要否を設計者に確認した",
      ],
    },
  },
  LGS: {
    METAL_CONDUIT: {
      level: "certified",
      summary: "中空壁は壁内空洞へ火煙が回るため、金属管でも中空壁用の認定工法（両面ボード処理）で施工する。",
      methods: [
        { method: "ROCKWOOL_SLEEVE", role: "壁内充填＋両面処理" },
        { method: "FIRE_PUTTY", role: "ボード面の隙間シール" },
        { method: "INTUMESCENT", role: "認定工法材による閉塞" },
      ],
      points: [
        "中空壁は両面の強化石膏ボードそれぞれで開口処理し、壁内の空洞部にはロックウール等を充填する。",
        "認定の適用構造（ボード種別・枚数・壁厚）に合致しているか確認する。",
        ONE_METER_RULE,
      ],
      checklist: [
        "両面のボードで開口処理し、壁内空洞部を充填した",
        "認定の適用構造（ボード種別・枚数・壁厚）に合致している",
      ],
    },
    PF_CD: {
      level: "certified",
      summary: "中空壁対応の熱膨張材認定工法を使用する。両面のボードそれぞれでの処理が前提。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "認定条件内の併用材" },
      ],
      points: [
        "認定は中空壁（ボード種別・枚数・壁厚）を適用構造に含むものを選ぶ。RC用の認定は流用できない。",
        "両面のボードそれぞれで認定どおりの処理を行う。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "認定の適用構造に中空壁（該当ボード構成）が含まれている",
        "両面のボードで施工要領どおり処理した",
      ],
    },
    CABLE: {
      level: "certified",
      summary: "中空壁対応の認定工法（熱膨張材・耐火パテ・貫通枠等）で両面処理する。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "少数ケーブル・端部押さえ" },
        { method: "ROCKWOOL_SLEEVE", role: "貫通枠を用いる場合" },
      ],
      points: [
        "認定の適用構造に中空壁（ボード種別・枚数・壁厚）が含まれることを確認する。",
        "両面のボードそれぞれで開口処理し、壁内空洞への火煙の回り込みを防ぐ。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "認定の適用構造に中空壁（該当ボード構成）が含まれている",
        "ケーブル本数・占積率が認定条件の範囲内である",
      ],
    },
    RACK: {
      level: "consult",
      summary: "中空壁の大開口に適用できる認定は限られる。認定条件を確認のうえ、開口枠の補強も含め個別検討する。",
      methods: [
        { method: "FIRE_BOARD", role: "大開口の閉塞" },
        { method: "ROCKWOOL_SLEEVE", role: "貫通枠＋充填" },
      ],
      points: [
        "中空壁×ラックに適用できる認定工法は限られる。開口寸法・ラック幅の条件を必ず確認する。",
        "開口部はLGSで補強枠を組み、ボード小口の処理も認定どおりに行う。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "中空壁×ラックに適用できる認定を確認した",
        "開口補強枠・ボード小口の処理を施工要領どおり行った",
      ],
    },
    BUS_DUCT: {
      level: "consult",
      summary: "中空壁×バスダクトは適用できる認定が非常に限られる。ルート変更（RC部での貫通）も含め協議する。",
      methods: [
        { method: "FIRE_BOARD", role: "仕様が確認できた場合のみ" },
      ],
      points: [
        "中空壁へのバスダクト貫通は適用可能な認定・メーカー仕様がまず限られる。安易に施工しない。",
        "設計者・メーカーと協議し、RC壁・床での貫通へのルート変更を第一に検討する。",
        "施工する場合も開口補強とメーカー耐火処理仕様の両方の確認が必須。",
      ],
      checklist: [
        "設計者・メーカーと貫通位置・仕様を協議した",
        "ルート変更（RC部での貫通）の可否を検討した",
      ],
    },
  },
  SLAB: {
    METAL_CONDUIT: {
      level: "basic",
      summary: "金属管はモルタル充填が基本。床貫通は充填材の脱落防止（受け）と穴埋め忘れに注意する。",
      methods: [
        { method: "MORTAR", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "小さな隙間のシールに併用" },
      ],
      points: [
        ONE_METER_RULE,
        "下面からの充填材脱落を防ぐため、受け板・型枠を設けてから充填する。",
        "床の空き貫通孔（スリーブ）は火災時の煙突になる。使わない開口は必ず閉塞する。",
      ],
      checklist: [
        "受け板・型枠を設けて充填し、下面に脱落・隙間がない",
        "空きスリーブ・予備孔を閉塞した",
      ],
    },
    PF_CD: {
      level: "certified",
      summary: "樹脂管は熱膨張材の大臣認定工法（床用の適用条件）で処理する。",
      methods: [
        { method: "INTUMESCENT", role: "第一候補" },
        { method: "FIRE_PUTTY", role: "認定条件内の併用材" },
      ],
      points: [
        "認定の適用部位に床（スラブ厚）が含まれることを確認する。壁用と床用で条件が異なる。",
        CERTIFIED_COMMON_POINT,
        "上階からの水・ゴミの落下侵入を防ぐため、スリーブ上端の立ち上げ・養生を行う。",
      ],
      checklist: [
        "認定の適用部位に床（該当スラブ厚）が含まれている",
        "管の呼び径・本数が認定条件の範囲内である",
      ],
    },
    CABLE: {
      level: "certified",
      summary: "ロックウール充填＋鋼製スリーブ、または熱膨張材の床用認定工法で処理する。",
      methods: [
        { method: "ROCKWOOL_SLEEVE", role: "第一候補（スリーブ貫通）" },
        { method: "INTUMESCENT", role: "床用認定材による閉塞" },
        { method: "FIRE_PUTTY", role: "端部押さえ" },
      ],
      points: [
        "充填材の脱落防止（受け）と、認定どおりの充填率・充填深さを確保する。",
        "スリーブ上端は床面より立ち上げ、水の侵入・ケーブル損傷を防ぐ。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "充填率・充填深さが認定条件どおりである",
        "空きスリーブを閉塞し、上端の立ち上げ養生を行った",
      ],
    },
    RACK: {
      level: "certified",
      summary: "床の大開口は耐火仕切板＋ロックウール充填等の床用認定工法で処理する。落下防止措置が必須。",
      methods: [
        { method: "FIRE_BOARD", role: "大開口の閉塞" },
        { method: "ROCKWOOL_SLEEVE", role: "ケーブルまわりの充填" },
        { method: "INTUMESCENT", role: "ケーブル束の閉塞" },
      ],
      points: [
        "床開口は充填材・仕切板の自重落下対策（受け金物）を必ず設ける。",
        "施工中の開口は墜落・落下災害の危険箇所。仮閉塞・区画養生を行う。",
        CERTIFIED_COMMON_POINT,
      ],
      checklist: [
        "受け金物等の落下防止措置を設けた",
        "開口寸法・ラック幅が認定条件の範囲内である",
      ],
    },
    BUS_DUCT: {
      level: "consult",
      summary: "床貫通のバスダクトはメーカーの耐火処理仕様（床用）による。事前協議と落下防止措置が必須。",
      methods: [
        { method: "ROCKWOOL_SLEEVE", role: "メーカー仕様による充填" },
        { method: "FIRE_BOARD", role: "開口の閉塞（仕様による）" },
      ],
      points: [
        "バスダクトの床貫通はメーカーの耐火処理仕様（床用の適用条件）を必ず確認する。",
        "垂直バスダクトは自重支持（各階支持）と貫通部処理を一体で計画する。",
        "換気形バスダクトは区画貫通に使用できない製品があるため機種選定時に確認する。",
      ],
      checklist: [
        "メーカーの床貫通用耐火処理仕様を入手・確認した",
        "自重支持（各階支持）の計画と整合している",
      ],
    },
  },
} as const satisfies Record<FirestopStructureKey, Record<FirestopPenetrantKey, FirestopEntry>>;

/** 壁・床種別ボタンの表示順 */
export const FIRESTOP_STRUCTURE_ORDER: readonly FirestopStructureKey[] = [
  "RC", "ALC", "LGS", "SLAB",
] as const;

/** 貫通物ボタンの表示順 */
export const FIRESTOP_PENETRANT_ORDER: readonly FirestopPenetrantKey[] = [
  "METAL_CONDUIT", "PF_CD", "CABLE", "RACK", "BUS_DUCT",
] as const;

/** 壁・床種別データを取得 */
export function getFirestopStructure(key: FirestopStructureKey): FirestopStructure {
  return FIRESTOP_STRUCTURES[key];
}

/** 貫通物データを取得 */
export function getFirestopPenetrant(key: FirestopPenetrantKey): FirestopPenetrant {
  return FIRESTOP_PENETRANTS[key];
}

/** 工法データを取得 */
export function getFirestopMethod(key: FirestopMethodKey): FirestopMethod {
  return FIRESTOP_METHODS[key];
}

/** 対応レベルの表示情報を取得 */
export function getFirestopLevel(level: FirestopLevel): { label: string; color: string; note: string } {
  return FIRESTOP_LEVELS[level];
}

/** 壁・床種別 × 貫通物 の組み合わせ結果を検索 */
export function findFirestopEntry(
  structure: FirestopStructureKey,
  penetrant: FirestopPenetrantKey,
): FirestopEntry {
  return FIRESTOP_MATRIX[structure][penetrant];
}
