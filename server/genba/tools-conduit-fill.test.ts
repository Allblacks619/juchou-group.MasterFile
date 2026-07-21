/**
 * 現場ツールボックス「占積率 計算」純関数テスト。
 * 対象: shared/genba/tools/conduitFill.ts
 * データ（内径・仕上外径の目安値）の転記確認と、占積率計算・判定・最大収容本数の
 * 代表ケース+境界値を検証する。
 */
import { describe, expect, it } from "vitest";
import {
  CONDUIT_FILL_PIPES,
  CONDUIT_KIND_ORDER,
  FILL_LIMIT_PERCENT,
  FILL_WARN_RATIO,
  IV_WIRES,
  calcConduitFill,
  circleArea,
  conduitInnerDia,
  conduitSizes,
  fillStatus,
  maxWireCount,
} from "@shared/genba/tools/conduitFill";

describe("conduitFill 定数（仕様書データの転記確認）", () => {
  it("占積率上限は 32%（内線規程の一般則）", () => {
    expect(FILL_LIMIT_PERCENT).toBe(32);
    expect(FILL_WARN_RATIO).toBe(0.9);
  });

  it("管種は G/E/PF/CD/VE の5種", () => {
    expect(CONDUIT_KIND_ORDER).toEqual(["g", "e", "pf", "cd", "ve"]);
  });

  it("G管の内径目安（JIS C 8305 系）が全て転記されている", () => {
    expect(CONDUIT_FILL_PIPES.g.inner).toEqual({
      16: 16.4, 22: 21.9, 28: 28.3, 36: 36.9, 42: 42.8,
      54: 54.9, 70: 69.6, 82: 81.9, 104: 105.8,
    });
  });

  it("E管（C管）の内径目安が全て転記されている", () => {
    expect(CONDUIT_FILL_PIPES.e.inner).toEqual({
      19: 16.4, 25: 22.6, 31: 29.0, 39: 35.3, 51: 47.6, 63: 60.3, 75: 72.9,
    });
  });

  it("PF管・CD管は内径≒呼び径（14,16,22,28,36,42,54）", () => {
    const expected = { 14: 14, 16: 16, 22: 22, 28: 28, 36: 36, 42: 42, 54: 54 };
    expect(CONDUIT_FILL_PIPES.pf.inner).toEqual(expected);
    expect(CONDUIT_FILL_PIPES.cd.inner).toEqual(expected);
  });

  it("VE管の内径目安が全て転記されている", () => {
    expect(CONDUIT_FILL_PIPES.ve.inner).toEqual({
      14: 14, 16: 18, 22: 22, 28: 28, 36: 35, 42: 40, 54: 51, 70: 66, 82: 77,
    });
  });

  it("IV電線の仕上外径目安（10種）が全て転記されている", () => {
    const map = Object.fromEntries(IV_WIRES.map((w) => [w.label, w.odMm]));
    expect(map).toEqual({
      "IV 1.6mm": 3.2,
      "IV 2.0mm": 3.6,
      "IV 2.6mm": 4.2,
      "IV 5.5sq": 4.6,
      "IV 8sq": 5.5,
      "IV 14sq": 6.7,
      "IV 22sq": 7.8,
      "IV 38sq": 9.6,
      "IV 60sq": 11.9,
      "IV 100sq": 15.0,
    });
    expect(IV_WIRES).toHaveLength(10);
  });
});

describe("conduitSizes / conduitInnerDia", () => {
  it("呼び径一覧を昇順で返す", () => {
    expect(conduitSizes("g")).toEqual([16, 22, 28, 36, 42, 54, 70, 82, 104]);
    expect(conduitSizes("e")).toEqual([19, 25, 31, 39, 51, 63, 75]);
    expect(conduitSizes("ve")).toEqual([14, 16, 22, 28, 36, 42, 54, 70, 82]);
  });

  it("管種×呼び径から内径を引ける", () => {
    expect(conduitInnerDia("g", 16)).toBe(16.4);
    expect(conduitInnerDia("g", 104)).toBe(105.8);
    expect(conduitInnerDia("ve", 16)).toBe(18); // VE16 は内径18（呼び径≠内径の代表例）
    expect(conduitInnerDia("pf", 22)).toBe(22);
  });

  it("未定義の呼び径は null", () => {
    expect(conduitInnerDia("g", 19)).toBeNull(); // 19 は E管の呼び径
    expect(conduitInnerDia("pf", 104)).toBeNull();
  });
});

describe("circleArea", () => {
  it("πd²/4 を返す", () => {
    expect(circleArea(2)).toBeCloseTo(Math.PI, 10);
    expect(circleArea(16.4)).toBeCloseTo((Math.PI * 16.4 * 16.4) / 4, 10);
    expect(circleArea(0)).toBe(0);
  });
});

describe("calcConduitFill", () => {
  it("代表ケース: G22 に IV2.0 を3本 → 約8.1%", () => {
    const inner = conduitInnerDia("g", 22)!;
    const r = calcConduitFill(inner, [{ odMm: 3.6, count: 3 }]);
    expect(r.conduitAreaMm2).toBeCloseTo(circleArea(21.9), 8);
    expect(r.wireAreaMm2).toBeCloseTo(circleArea(3.6) * 3, 8);
    expect(r.wireCount).toBe(3);
    // (3.6² × 3) / 21.9² × 100 = 8.1065...%（πは分子分母で約分される）
    expect(r.fillPercent).toBeCloseTo(((3.6 * 3.6 * 3) / (21.9 * 21.9)) * 100, 8);
    expect(r.fillPercent).toBeCloseTo(8.107, 2);
  });

  it("複数種混在の合算ができる", () => {
    const r = calcConduitFill(28.3, [
      { odMm: 3.2, count: 4 },
      { odMm: 4.6, count: 2 },
    ]);
    expect(r.wireCount).toBe(6);
    expect(r.wireAreaMm2).toBeCloseTo(circleArea(3.2) * 4 + circleArea(4.6) * 2, 8);
    expect(r.fillPercent).toBeCloseTo((r.wireAreaMm2 / r.conduitAreaMm2) * 100, 8);
  });

  it("電線なし → 占積率0%", () => {
    const r = calcConduitFill(21.9, []);
    expect(r.wireCount).toBe(0);
    expect(r.wireAreaMm2).toBe(0);
    expect(r.fillPercent).toBe(0);
  });

  it("内径0（管内断面積0）でもゼロ除算せず0%", () => {
    const r = calcConduitFill(0, [{ odMm: 3.2, count: 1 }]);
    expect(r.fillPercent).toBe(0);
  });
});

describe("fillStatus（境界値）", () => {
  it("32% ちょうどは NG ではない（上限32%以内は収容可）", () => {
    expect(fillStatus(32)).toBe("warn"); // 28.8%以上なので注意表示
  });

  it("32% を超えたら NG", () => {
    expect(fillStatus(32.0001)).toBe("ng");
    expect(fillStatus(50)).toBe("ng");
  });

  it("28.8%（上限の90%）以上は注意", () => {
    expect(fillStatus(28.8)).toBe("warn");
  });

  it("28.8% 未満は OK", () => {
    expect(fillStatus(28.799)).toBe("ok");
    expect(fillStatus(0)).toBe("ok");
  });
});

describe("maxWireCount", () => {
  it("代表ケース: G16 に IV1.6 は8本まで", () => {
    // floor(16.4² × 0.32 / 3.2²) = floor(8.405) = 8（πは約分）
    expect(maxWireCount(16.4, 3.2)).toBe(8);
  });

  it("代表ケース: G22 に IV2.0 は11本まで", () => {
    // floor(21.9² × 0.32 / 3.6²) = floor(11.84) = 11
    expect(maxWireCount(21.9, 3.6)).toBe(11);
  });

  it("外径0以下は0本", () => {
    expect(maxWireCount(21.9, 0)).toBe(0);
    expect(maxWireCount(21.9, -1)).toBe(0);
  });

  it("管より太い電線は0本", () => {
    expect(maxWireCount(14, 15.0)).toBe(0);
  });

  it("整合性: 最大本数ちょうどは32%以内、+1本で32%超過", () => {
    for (const [inner, od] of [
      [16.4, 3.2],
      [21.9, 4.6],
      [28.3, 5.5],
      [105.8, 15.0],
    ] as const) {
      const n = maxWireCount(inner, od);
      expect(n).toBeGreaterThan(0);
      const atMax = calcConduitFill(inner, [{ odMm: od, count: n }]);
      expect(atMax.fillPercent).toBeLessThanOrEqual(FILL_LIMIT_PERCENT);
      const overMax = calcConduitFill(inner, [{ odMm: od, count: n + 1 }]);
      expect(overMax.fillPercent).toBeGreaterThan(FILL_LIMIT_PERCENT);
      expect(fillStatus(overMax.fillPercent)).toBe("ng");
    }
  });
});
