import { describe, expect, it } from "vitest";
import {
  GROUND_WIRE_TABLE,
  IV_AMPACITY,
  WIRING_METHODS,
  allowableCurrent,
  bondWireSize,
  calcVoltDrop,
  groundWireSize,
  voltDropLimitPercent,
  voltDropPercent,
  voltDropStatus,
} from "@shared/genba/tools/wiring";

describe("calcVoltDrop (e = K·L·I/(1000·A))", () => {
  it("代表ケース: 単相2線式 L=30m I=20A A=5.5sq", () => {
    // 35.6 × 30 × 20 ÷ (1000 × 5.5) = 21360 ÷ 5500 ≒ 3.884V
    expect(calcVoltDrop(35.6, 30, 20, 5.5)).toBeCloseTo(3.8836, 3);
  });

  it("単相3線式(K=17.8)は単相2線式(K=35.6)のちょうど半分", () => {
    expect(calcVoltDrop(17.8, 30, 20, 5.5)).toBeCloseTo(calcVoltDrop(35.6, 30, 20, 5.5) / 2, 10);
  });

  it("三相3線式 K=30.8: L=30m I=20A A=5.5sq → 3.36V", () => {
    expect(calcVoltDrop(30.8, 30, 20, 5.5)).toBeCloseTo(3.36, 10);
  });

  it("K 係数の定数値が仕様どおり", () => {
    expect(WIRING_METHODS.find((m) => m.key === "single2")!.k).toBe(35.6);
    expect(WIRING_METHODS.find((m) => m.key === "single3")!.k).toBe(17.8);
    expect(WIRING_METHODS.find((m) => m.key === "three3")!.k).toBe(30.8);
  });

  it("境界値: 断面積 0 以下は 0 を返す（未入力ガード）", () => {
    expect(calcVoltDrop(35.6, 30, 20, 0)).toBe(0);
    expect(calcVoltDrop(35.6, 30, 20, -1)).toBe(0);
  });
});

describe("voltDropPercent", () => {
  it("100V 回路で 3.8836V 降下 → 約3.88%", () => {
    expect(voltDropPercent(3.8836, 100)).toBeCloseTo(3.8836, 4);
  });

  it("200V 回路では半分の降下率", () => {
    expect(voltDropPercent(4, 200)).toBe(2);
  });

  it("境界値: 電圧 0 以下は 0", () => {
    expect(voltDropPercent(4, 0)).toBe(0);
  });
});

describe("voltDropLimitPercent (こう長別の上限目安)", () => {
  it("こう長60m以下は 2%", () => {
    expect(voltDropLimitPercent(10)).toBe(2);
    expect(voltDropLimitPercent(60)).toBe(2);
  });

  it("境界値: 60m超〜120m以下は 4%", () => {
    expect(voltDropLimitPercent(60.1)).toBe(4);
    expect(voltDropLimitPercent(120)).toBe(4);
  });

  it("境界値: 120m超〜200m以下は 5% / 200m超は 6%", () => {
    expect(voltDropLimitPercent(121)).toBe(5);
    expect(voltDropLimitPercent(200)).toBe(5);
    expect(voltDropLimitPercent(201)).toBe(6);
  });
});

describe("voltDropStatus", () => {
  it("上限超過は ng", () => {
    expect(voltDropStatus(2.01, 2)).toBe("ng");
  });

  it("境界値: 上限ちょうどは warn（90%以上）", () => {
    expect(voltDropStatus(2, 2)).toBe("warn");
    expect(voltDropStatus(1.8, 2)).toBe("warn");
  });

  it("上限の90%未満は ok", () => {
    expect(voltDropStatus(1.79, 2)).toBe("ok");
    expect(voltDropStatus(0, 2)).toBe("ok");
  });
});

describe("allowableCurrent (IV 許容電流 × 低減係数)", () => {
  it("がいし引き(×1.0)は基準値のまま", () => {
    expect(allowableCurrent(27, 1.0)).toBe(27);
  });

  it("電線管収容(×0.7): IV 1.6mm 27A → 18.9A", () => {
    expect(allowableCurrent(27, 0.7)).toBeCloseTo(18.9, 10);
  });

  it("IV 許容電流テーブルが仕様どおり", () => {
    const base = Object.fromEntries(IV_AMPACITY.map((w) => [w.label, w.baseA]));
    expect(base).toEqual({
      "IV 1.6mm": 27,
      "IV 2.0mm": 35,
      "IV 5.5sq": 49,
      "IV 8sq": 61,
      "IV 14sq": 88,
      "IV 22sq": 115,
      "IV 38sq": 162,
      "IV 60sq": 217,
      "IV 100sq": 298,
    });
  });
});

describe("groundWireSize (内線規程1350-3 系の一般表)", () => {
  it("代表ケース: 20A→1.6mm / 60A→5.5sq / 100A→8sq", () => {
    expect(groundWireSize(20)!.label).toBe("1.6mm（2.0sq）");
    expect(groundWireSize(60)!.label).toBe("5.5sq");
    expect(groundWireSize(100)!.label).toBe("8sq");
  });

  it("中間の容量は直近上位の欄を適用（75A → 100A欄 8sq）", () => {
    expect(groundWireSize(75)!.maxA).toBe(100);
    expect(groundWireSize(75)!.label).toBe("8sq");
  });

  it("境界値: 600A→60sq / 601Aは null（個別設計）/ 0以下は null", () => {
    expect(groundWireSize(600)!.label).toBe("60sq");
    expect(groundWireSize(601)).toBeNull();
    expect(groundWireSize(0)).toBeNull();
  });

  it("テーブルの容量区分が仕様どおり (20/30/60/100/150/200/400/600)", () => {
    expect(GROUND_WIRE_TABLE.map((e) => e.maxA)).toEqual([20, 30, 60, 100, 150, 200, 400, 600]);
  });
});

describe("bondWireSize (ボンド線 目安)", () => {
  it("100A以下は 5.5sq", () => {
    expect(bondWireSize(60)!.label).toBe("5.5sq");
    expect(bondWireSize(100)!.label).toBe("5.5sq");
  });

  it("境界値: 100A超は接地線太さの一般表に準ずる (150A→14sq)", () => {
    expect(bondWireSize(101)!.label).toBe("14sq");
    expect(bondWireSize(150)!.label).toBe("14sq");
    expect(bondWireSize(400)!.label).toBe("38sq");
  });

  it("境界値: 0以下・600A超は null", () => {
    expect(bondWireSize(0)).toBeNull();
    expect(bondWireSize(601)).toBeNull();
  });
});
