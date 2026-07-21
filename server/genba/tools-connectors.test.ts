import { describe, expect, it } from "vitest";
import {
  CE_SLEEVES,
  CE_WIRES,
  P_SLEEVES,
  P_WIRES,
  R_WIRES,
  T_SLEEVES,
  T_WIRE_SIZES,
  findCESleeves,
  findPSleeve,
  findSleeveByTotal,
  findTSleeve,
  judgeRingSleeve,
  nextTapCount,
  ringComboText,
  sumWireArea,
} from "@shared/genba/tools/connectors";

describe("データ件数（仕様書からの完全転記）", () => {
  it("各テーブルの件数が仕様どおり", () => {
    expect(T_WIRE_SIZES.length).toBe(11);
    expect(T_SLEEVES.length).toBe(18);
    expect(P_WIRES.length).toBe(10);
    expect(P_SLEEVES.length).toBe(16);
    expect(R_WIRES.length).toBe(3);
    expect(CE_WIRES.length).toBe(7);
    expect(CE_SLEEVES.length).toBe(4);
  });
});

describe("findTSleeve / findSleeveByTotal (T形コネクタ)", () => {
  it("代表ケース: 幹線+分岐の合計で号数を選定", () => {
    expect(findTSleeve(3.5, 3.5)?.name).toBe("T 7"); // 合計7
    expect(findTSleeve(5.5, 5.5)?.name).toBe("T 11"); // 合計11
    expect(findTSleeve(8, 14)?.name).toBe("T 26"); // 合計22
    expect(findTSleeve(100, 150)?.name).toBe("T 288"); // 合計250
    expect(findTSleeve(250, 250)?.name).toBe("T 560"); // 合計500
  });

  it("境界値: min/max ちょうどで適合", () => {
    expect(findSleeveByTotal(T_SLEEVES, 3.5)?.name).toBe("T 7");
    expect(findSleeveByTotal(T_SLEEVES, 7)?.name).toBe("T 7");
    expect(findSleeveByTotal(T_SLEEVES, 7.5)?.name).toBe("T 11");
    expect(findSleeveByTotal(T_SLEEVES, 700)?.name).toBe("T 700");
  });

  it("重複範囲 (14〜16) は配列順で先の T 16 を返す", () => {
    expect(findSleeveByTotal(T_SLEEVES, 14)?.name).toBe("T 16");
    expect(findSleeveByTotal(T_SLEEVES, 15)?.name).toBe("T 16");
    expect(findSleeveByTotal(T_SLEEVES, 16)?.name).toBe("T 16");
    expect(findSleeveByTotal(T_SLEEVES, 16.5)?.name).toBe("T 20");
  });

  it("範囲外・不連続の隙間は null", () => {
    expect(findSleeveByTotal(T_SLEEVES, 3.4)).toBeNull();
    expect(findSleeveByTotal(T_SLEEVES, 7.2)).toBeNull(); // 7〜7.5 の隙間
    expect(findSleeveByTotal(T_SLEEVES, 20.5)).toBeNull(); // 20〜21 の隙間
    expect(findSleeveByTotal(T_SLEEVES, 700.1)).toBeNull();
  });
});

describe("findPSleeve (P形スリーブ)", () => {
  it("代表ケース", () => {
    expect(findPSleeve(0.25)?.name).toBe("P 0.5");
    expect(findPSleeve(2.0)?.name).toBe("P 2"); // 1.6φ×1本
    expect(findPSleeve(9.0)?.name).toBe("P 8"); // 2.0φ+2.6φ = 3.5+5.5
    expect(findPSleeve(325.0)?.name).toBe("P 325");
  });

  it("境界値の重複は配列順で小さい方が選ばれる", () => {
    expect(findPSleeve(2.63)?.name).toBe("P 2"); // P 2 max = P 5.5 min
    expect(findPSleeve(6.64)?.name).toBe("P 5.5"); // P 5.5 max = P 8 min
    expect(findPSleeve(117.2)?.name).toBe("P 100");
  });

  it("範囲外は null", () => {
    expect(findPSleeve(0.2)).toBeNull();
    expect(findPSleeve(325.1)).toBeNull();
  });
});

describe("findCESleeves (CE形・複数候補)", () => {
  it("重複範囲は全候補を返す", () => {
    expect(findCESleeves(1.5).map((c) => c.name)).toEqual(["CE 1", "CE 2"]);
    expect(findCESleeves(2.5).map((c) => c.name)).toEqual(["CE 2", "CE 5"]);
    expect(findCESleeves(4.5).map((c) => c.name)).toEqual(["CE 5", "CE 8"]);
  });

  it("単独候補・境界値", () => {
    expect(findCESleeves(0.5).map((c) => c.name)).toEqual(["CE 1"]);
    expect(findCESleeves(0.99).map((c) => c.name)).toEqual(["CE 1"]);
    expect(findCESleeves(9.0).map((c) => c.name)).toEqual(["CE 8"]);
  });

  it("範囲外は空配列", () => {
    expect(findCESleeves(0.4)).toEqual([]);
    expect(findCESleeves(9.1)).toEqual([]);
  });
});

describe("judgeRingSleeve (リングスリーブ判定表)", () => {
  const ok = (size: string, mark: string) => ({ kind: "ok", size, mark });
  const out = { kind: "out" };

  it("合計2本未満は null", () => {
    expect(judgeRingSleeve(0, 0, 0)).toBeNull();
    expect(judgeRingSleeve(1, 0, 0)).toBeNull();
    expect(judgeRingSleeve(0, 0, 1)).toBeNull();
  });

  it("1.6mmのみ", () => {
    expect(judgeRingSleeve(2, 0, 0)).toEqual(ok("小", "○")); // 1.6×2 だけ ○
    expect(judgeRingSleeve(3, 0, 0)).toEqual(ok("小", "小"));
    expect(judgeRingSleeve(4, 0, 0)).toEqual(ok("小", "小"));
    expect(judgeRingSleeve(5, 0, 0)).toEqual(ok("中", "中"));
    expect(judgeRingSleeve(6, 0, 0)).toEqual(ok("中", "中"));
    expect(judgeRingSleeve(7, 0, 0)).toEqual(ok("大", "大"));
    expect(judgeRingSleeve(8, 0, 0)).toEqual(out);
  });

  it("2.0mmのみ", () => {
    expect(judgeRingSleeve(0, 2, 0)).toEqual(ok("小", "小"));
    expect(judgeRingSleeve(0, 3, 0)).toEqual(ok("中", "中"));
    expect(judgeRingSleeve(0, 4, 0)).toEqual(ok("中", "中"));
    expect(judgeRingSleeve(0, 5, 0)).toEqual(ok("大", "大"));
    expect(judgeRingSleeve(0, 6, 0)).toEqual(out);
  });

  it("2.6mmのみ", () => {
    expect(judgeRingSleeve(0, 0, 2)).toEqual(ok("中", "中"));
    expect(judgeRingSleeve(0, 0, 3)).toEqual(ok("大", "大"));
    expect(judgeRingSleeve(0, 0, 4)).toEqual(out);
  });

  it("1.6mm + 2.0mm 混合", () => {
    expect(judgeRingSleeve(1, 1, 0)).toEqual(ok("小", "小")); // 2.0×1+1.6×1
    expect(judgeRingSleeve(2, 1, 0)).toEqual(ok("小", "小")); // 2.0×1+1.6×2
    expect(judgeRingSleeve(3, 1, 0)).toEqual(ok("中", "中")); // 2.0×1+1.6×3
    expect(judgeRingSleeve(5, 1, 0)).toEqual(ok("中", "中")); // 2.0×1+1.6×5
    expect(judgeRingSleeve(3, 2, 0)).toEqual(ok("中", "中")); // 2.0×2+1.6×3
    expect(judgeRingSleeve(1, 3, 0)).toEqual(ok("中", "中")); // 2.0×3+1.6×1
    expect(judgeRingSleeve(6, 1, 0)).toEqual(ok("大", "大")); // 2.0×1+1.6×6
    expect(judgeRingSleeve(4, 2, 0)).toEqual(ok("大", "大")); // 2.0×2+1.6×4
    expect(judgeRingSleeve(2, 3, 0)).toEqual(ok("大", "大")); // 2.0×3+1.6×2
    expect(judgeRingSleeve(1, 4, 0)).toEqual(ok("大", "大")); // 2.0×4+1.6×1
    expect(judgeRingSleeve(7, 1, 0)).toEqual(out); // 2.0×1+1.6×7
    expect(judgeRingSleeve(2, 4, 0)).toEqual(out); // 2.0×4+1.6×2
  });

  it("1.6mm + 2.6mm 混合", () => {
    expect(judgeRingSleeve(1, 0, 1)).toEqual(ok("中", "中")); // 2.6×1+1.6×1
    expect(judgeRingSleeve(3, 0, 1)).toEqual(ok("中", "中")); // 2.6×1+1.6×3
    expect(judgeRingSleeve(1, 0, 2)).toEqual(ok("中", "中")); // 2.6×2+1.6×1
    expect(judgeRingSleeve(2, 0, 2)).toEqual(ok("大", "大")); // 2.6×2+1.6×2
    expect(judgeRingSleeve(4, 0, 1)).toEqual(out); // 2.6×1+1.6×4
    expect(judgeRingSleeve(3, 0, 2)).toEqual(out); // 2.6×2+1.6×3
  });

  it("2.0mm + 2.6mm 混合", () => {
    expect(judgeRingSleeve(0, 1, 1)).toEqual(ok("中", "中")); // 2.6×1+2.0×1
    expect(judgeRingSleeve(0, 2, 1)).toEqual(ok("中", "中")); // 2.6×1+2.0×2
    expect(judgeRingSleeve(0, 3, 1)).toEqual(ok("大", "大")); // 2.6×1+2.0×3
    expect(judgeRingSleeve(0, 1, 2)).toEqual(ok("大", "大")); // 2.6×2+2.0×1
    expect(judgeRingSleeve(0, 4, 1)).toEqual(out); // 2.6×1+2.0×4
    expect(judgeRingSleeve(0, 2, 2)).toEqual(out); // 2.6×2+2.0×2
  });

  it("三種混合", () => {
    expect(judgeRingSleeve(1, 1, 1)).toEqual(ok("中", "中")); // 2.6×1+2.0×1+1.6×1
    expect(judgeRingSleeve(2, 1, 1)).toEqual(ok("中", "中")); // 2.6×1+2.0×1+1.6×2
    expect(judgeRingSleeve(1, 2, 1)).toEqual(ok("大", "大")); // 2.6×1+2.0×2+1.6×1
    expect(judgeRingSleeve(3, 1, 1)).toEqual(out);
    expect(judgeRingSleeve(1, 1, 2)).toEqual(out);
  });
});

describe("ringComboText", () => {
  it("本数のある電線のみを ' + ' で連結", () => {
    expect(ringComboText(2, 1, 0)).toBe("1.6mm×2本 + 2.0mm×1本");
    expect(ringComboText(0, 0, 3)).toBe("2.6mm×3本");
    expect(ringComboText(1, 2, 1)).toBe("1.6mm×1本 + 2.0mm×2本 + 2.6mm×1本");
    expect(ringComboText(0, 0, 0)).toBe("");
  });
});

describe("sumWireArea", () => {
  it("本数×断面積の合計を小数第2位で返す", () => {
    // P形: 1.6φ×2 + 2.0φ×1 = 2.0×2 + 3.5 = 7.5
    expect(sumWireArea(P_WIRES, [2, 1, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(7.5);
    // CE形: 0.3×3 = 0.9（浮動小数点誤差を丸める）
    expect(sumWireArea(CE_WIRES, [3, 0, 0, 0, 0, 0, 0])).toBe(0.9);
    expect(sumWireArea(CE_WIRES, [0, 0, 1, 1, 0, 0, 0])).toBe(2.0); // 0.75+1.25
  });

  it("counts が短い場合は不足分を0本として扱う", () => {
    expect(sumWireArea(P_WIRES, [1])).toBe(2.0);
    expect(sumWireArea(P_WIRES, [])).toBe(0);
  });
});

describe("nextTapCount", () => {
  it("1〜9で循環し0には戻らない", () => {
    expect(nextTapCount(0)).toBe(1);
    expect(nextTapCount(1)).toBe(2);
    expect(nextTapCount(8)).toBe(9);
    expect(nextTapCount(9)).toBe(1); // 10回目のタップで1に戻る
  });
});
