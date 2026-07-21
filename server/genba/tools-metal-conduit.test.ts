import { describe, expect, it } from "vitest";
import {
  CONDUIT_LOCATIONS,
  END_TYPES,
  END_TYPE_ORDER,
  PIPE_LENGTH_M,
  SADDLE_INTERVAL_M,
  WALL_DATA,
  WALL_ORDER,
  calcMetalConduit,
  needsWaterproofNote,
  parseRouteLength,
  validateMetalConduit,
  type ConduitRoute,
  type EndType,
} from "@shared/genba/tools/metalConduit";

const route = (lengthM: number, startType: EndType = "pullbox", endType: EndType = "pullbox"): ConduitRoute => ({
  lengthM,
  startType,
  endType,
});

describe("定数（仕様書からの転記）", () => {
  it("定尺3.66m・サドル間隔1.5m", () => {
    expect(PIPE_LENGTH_M).toBe(3.66);
    expect(SADDLE_INTERVAL_M).toBe(1.5);
  });

  it("設置場所ラベル（屋内E管/屋外G管の表示切替）", () => {
    expect(CONDUIT_LOCATIONS.indoor.pipeLabel).toBe("金属管（E管 / ねじなし電線管）");
    expect(CONDUIT_LOCATIONS.indoor.couplingLabel).toBe("カップリング");
    expect(CONDUIT_LOCATIONS.outdoor.pipeLabel).toBe("金属管（G管 / 厚鋼電線管）");
    expect(CONDUIT_LOCATIONS.outdoor.couplingLabel).toBe("防水カップリング");
  });
});

describe("WALL_DATA（壁材質6種の固定方法）", () => {
  it("6種すべて定義されている", () => {
    expect(WALL_ORDER.length).toBe(6);
    expect(WALL_ORDER).toEqual(["concrete", "alc", "wood", "steel", "board", "block"]);
  });

  it("候補数が仕様どおり（concrete=3、他=2）", () => {
    expect(WALL_DATA.concrete.methods.length).toBe(3);
    expect(WALL_DATA.alc.methods.length).toBe(2);
    expect(WALL_DATA.wood.methods.length).toBe(2);
    expect(WALL_DATA.steel.methods.length).toBe(2);
    expect(WALL_DATA.board.methods.length).toBe(2);
    expect(WALL_DATA.block.methods.length).toBe(2);
  });

  it("タグ規則: 主・下地あり=main / 重荷重・別途資格・下地なし=alt", () => {
    for (const k of WALL_ORDER) {
      for (const m of WALL_DATA[k].methods) {
        const expected = m.tag === "主" || m.tag === "下地あり" ? "main" : "alt";
        expect(m.tagKind).toBe(expected);
      }
    }
    expect(WALL_DATA.concrete.methods[2].tag).toBe("重荷重");
    expect(WALL_DATA.steel.methods[1].tag).toBe("別途資格");
    expect(WALL_DATA.board.methods[1].tag).toBe("下地なし");
  });

  it("代表データ: ALCは専用品、石膏ボードは下地固定の警告", () => {
    expect(WALL_DATA.alc.fullLabel).toBe("ALC（軽量気泡コンクリート）");
    expect(WALL_DATA.alc.methods[0].name).toBe("ALCビス（専用品）");
    expect(WALL_DATA.alc.warning).toContain("必ずALC専用品");
    expect(WALL_DATA.board.warning).toContain("必ず下地に固定");
    expect(WALL_DATA.steel.warning).toContain("板厚2.3mm超");
    expect(WALL_DATA.block.warning).toContain("目地を避ける");
  });
});

describe("END_TYPES（末端1か所あたりの材料カウント表）", () => {
  it("pullbox: コネクタ1・ロックナット1・絶縁ブッシング1・エンドキャップ0", () => {
    expect(END_TYPES.pullbox).toMatchObject({ connectors: 1, locknuts: 1, bushings: 1, endcaps: 0 });
  });
  it("box: 材料計上なし（すべて0）", () => {
    expect(END_TYPES.box).toMatchObject({ connectors: 0, locknuts: 0, bushings: 0, endcaps: 0 });
  });
  it("cap: エンドキャップ1のみ", () => {
    expect(END_TYPES.cap).toMatchObject({ connectors: 0, locknuts: 0, bushings: 0, endcaps: 1 });
  });
  it("connector: コネクタ1のみ", () => {
    expect(END_TYPES.connector).toMatchObject({ connectors: 1, locknuts: 0, bushings: 0, endcaps: 0 });
  });
  it("4タイプの表示順", () => {
    expect(END_TYPE_ORDER).toEqual(["pullbox", "box", "cap", "connector"]);
  });
});

describe("calcMetalConduit（代表ケース）", () => {
  it("10m 1ルート（両端プールボックス）: 管3本・カップリング2・サドル7", () => {
    const r = calcMetalConduit([route(10)]);
    expect(r.totalLengthM).toBe(10);
    expect(r.pipes).toBe(3); // ceil(10/3.66)=3
    expect(r.couplings).toBe(2); // 3-1
    expect(r.saddles).toBe(7); // ceil(10/1.5)=7
    expect(r.endCounts.pullbox).toBe(2);
    expect(r.materials).toEqual({ connectors: 2, locknuts: 2, bushings: 2, endcaps: 0 });
  });

  it("複数ルート: 2m×2ルート（計4m）: 管2本・カップリング0・サドル3", () => {
    const r = calcMetalConduit([route(2), route(2)]);
    expect(r.pipes).toBe(2); // ceil(4/3.66)=2
    expect(r.couplings).toBe(0); // max(0, 2-2)
    expect(r.saddles).toBe(3); // ceil(4/1.5)=3
  });

  it("末端タイプ混在: cap/connector + box/box", () => {
    const r = calcMetalConduit([route(5, "cap", "connector"), route(5, "box", "box")]);
    expect(r.endCounts).toEqual({ pullbox: 0, box: 2, cap: 1, connector: 1 });
    expect(r.materials).toEqual({ connectors: 1, locknuts: 0, bushings: 0, endcaps: 1 });
  });
});

describe("calcMetalConduit（境界値）", () => {
  it("定尺ちょうど3.66m: 管1本・カップリング0", () => {
    const r = calcMetalConduit([route(3.66)]);
    expect(r.pipes).toBe(1);
    expect(r.couplings).toBe(0);
  });

  it("定尺2本ぶんちょうど7.32m: 管2本・カップリング1", () => {
    const r = calcMetalConduit([route(7.32)]);
    expect(r.pipes).toBe(2);
    expect(r.couplings).toBe(1);
  });

  it("定尺をわずかに超える3.67m: 管2本に切り上げ", () => {
    expect(calcMetalConduit([route(3.67)]).pipes).toBe(2);
  });

  it("サドル: 1.5mちょうどで1個、1.51mで2個、3mで2個", () => {
    expect(calcMetalConduit([route(1.5)]).saddles).toBe(1);
    expect(calcMetalConduit([route(1.51)]).saddles).toBe(2);
    expect(calcMetalConduit([route(3)]).saddles).toBe(2);
  });

  it("極小延長0.1m: 管1本・サドル1個", () => {
    const r = calcMetalConduit([route(0.1)]);
    expect(r.pipes).toBe(1);
    expect(r.saddles).toBe(1);
  });

  it("カップリングの負値クランプ: 1m×3ルート（管1本 < ルート3本）→ 0", () => {
    const r = calcMetalConduit([route(1), route(1), route(1)]);
    expect(r.pipes).toBe(1); // ceil(3/3.66)=1
    expect(r.couplings).toBe(0); // max(0, 1-3)
  });

  it("延長0（未入力扱い）: 配管材料はすべて0、末端は計上される", () => {
    const r = calcMetalConduit([route(0)]);
    expect(r.pipes).toBe(0);
    expect(r.couplings).toBe(0);
    expect(r.saddles).toBe(0);
    expect(r.endCounts.pullbox).toBe(2);
  });
});

describe("validateMetalConduit", () => {
  it("ルート0件はエラー", () => {
    expect(validateMetalConduit([])).toBe("ルートを1本以上追加してください");
  });
  it("合計延長0以下はエラー", () => {
    expect(validateMetalConduit([route(0), route(0)])).toBe("延長を1か所以上入力してください");
  });
  it("延長が1か所でもあれば有効", () => {
    expect(validateMetalConduit([route(0), route(2)])).toBeNull();
  });
});

describe("needsWaterproofNote（屋外×プールボックス防水注記）", () => {
  it("屋外＋プールボックス1か所以上 → true", () => {
    expect(needsWaterproofNote("outdoor", calcMetalConduit([route(5, "pullbox", "box")]))).toBe(true);
  });
  it("屋内はプールボックスがあっても false", () => {
    expect(needsWaterproofNote("indoor", calcMetalConduit([route(5)]))).toBe(false);
  });
  it("屋外でもプールボックス0か所なら false", () => {
    expect(needsWaterproofNote("outdoor", calcMetalConduit([route(5, "box", "cap")]))).toBe(false);
  });
});

describe("parseRouteLength", () => {
  it("数値文字列はそのまま、単位付きは先頭数値", () => {
    expect(parseRouteLength("10")).toBe(10);
    expect(parseRouteLength("3.5")).toBe(3.5);
  });
  it("空文字・非数値・負値は0扱い", () => {
    expect(parseRouteLength("")).toBe(0);
    expect(parseRouteLength("abc")).toBe(0);
    expect(parseRouteLength("-5")).toBe(0);
  });
});
