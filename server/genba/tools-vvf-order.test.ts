import { describe, expect, it } from "vitest";
import {
  VVF_SIZES,
  VVF_LINE_TYPES,
  calcVvfOrder,
  vvfCoreColors,
  type VvfRowInput,
} from "@shared/genba/tools/vvfOrder";

const row = (p: Partial<VvfRowInput>): VvfRowInput => ({
  size: "1.6-2C",
  lineType: "ノーマル",
  lengthM: 0,
  circuits: 0,
  ...p,
});

describe("VVF発注計算", () => {
  it("長さ×回路数を集計し、ロス込み切り上げで巻数・ドラム数を出す", () => {
    // 30m×3回路 = 90m、ロス10% → 99m → 100m巻1（余り1m）/ 500mドラム1（余り401m）
    const [g] = calcVvfOrder([row({ lengthM: 30, circuits: 3 })], 10);
    expect(g).toMatchObject({
      size: "1.6-2C",
      lineType: "ノーマル",
      rawTotalM: 90,
      withLossM: 99,
      rolls100: 1,
      remain100: 1,
      drums500: 1,
      remain500: 401,
    });
  });

  it("同一サイズ×種別の行は合算し、異なる組はグループを分ける", () => {
    const results = calcVvfOrder(
      [
        row({ lengthM: 30, circuits: 2 }),
        row({ lengthM: 40, circuits: 1 }),
        row({ size: "2.0-3C", lineType: "200Vライン", lengthM: 50, circuits: 2 }),
      ],
      0,
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ size: "1.6-2C", rawTotalM: 100, withLossM: 100, rolls100: 1, remain100: 0 });
    expect(results[1]).toMatchObject({ size: "2.0-3C", lineType: "200Vライン", rawTotalM: 100 });
  });

  it("結果はサイズ順→種別順でソートされる", () => {
    const results = calcVvfOrder(
      [
        row({ size: "2.0-2C", lengthM: 10, circuits: 1 }),
        row({ size: "1.6-3C", lineType: "Gライン", lengthM: 10, circuits: 1 }),
        row({ size: "1.6-3C", lineType: "ノーマル", lengthM: 10, circuits: 1 }),
      ],
      10,
    );
    expect(results.map((g) => `${g.size}/${g.lineType}`)).toEqual([
      "1.6-3C/ノーマル",
      "1.6-3C/Gライン",
      "2.0-2C/ノーマル",
    ]);
  });

  it("無効行（長さ・回路数が0以下/NaN）は除外され、全行無効なら結果は空", () => {
    expect(calcVvfOrder([row({ lengthM: 0, circuits: 3 }), row({ lengthM: 30, circuits: NaN })], 10)).toEqual([]);
  });

  it("ロス率0でちょうど割り切れる場合は余り0", () => {
    const [g] = calcVvfOrder([row({ lengthM: 100, circuits: 5 })], 0);
    expect(g).toMatchObject({ withLossM: 500, rolls100: 5, remain100: 0, drums500: 1, remain500: 0 });
  });

  it("芯線色: 2Cと3Cで種別ごとの色構成を返す", () => {
    expect(vvfCoreColors("1.6-2C", "ノーマル")).toBe("黒・白");
    expect(vvfCoreColors("1.6-3C", "ノーマル")).toBe("黒・白・赤");
    expect(vvfCoreColors("2.0-3C", "Gライン")).toBe("黒・白・緑");
    expect(vvfCoreColors("2.0-3C", "200Vライン")).toBe("黒・赤・緑");
  });

  it("データ定義: サイズ4種・種別3種", () => {
    expect(VVF_SIZES).toHaveLength(4);
    expect(VVF_LINE_TYPES).toHaveLength(3);
  });
});
