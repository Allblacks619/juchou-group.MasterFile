import { describe, it, expect } from "vitest";
import {
  computeAdvanceBalance,
  computeAppliedOffset,
  computeMaxOffset,
  signedDelta,
} from "./workerAdvance";

describe("computeAdvanceBalance", () => {
  it("符号付きデルタの合計＝残高", () => {
    expect(computeAdvanceBalance([{ amount: 30000 }, { amount: -10000 }])).toBe(20000);
    expect(computeAdvanceBalance([])).toBe(0);
    expect(computeAdvanceBalance([{ amount: 5000 }, { amount: -5000 }])).toBe(0);
  });
});

describe("computeAppliedOffset", () => {
  it("支払に紐づくrepayment(負)の合計を正の相殺額として返す", () => {
    expect(computeAppliedOffset([{ amount: -8000 }])).toBe(8000);
    expect(computeAppliedOffset([{ amount: -3000 }, { amount: -2000 }])).toBe(5000);
    expect(computeAppliedOffset([])).toBe(0);
  });
});

describe("computeMaxOffset", () => {
  it("残高と支払残額の小さい方を返す", () => {
    // 残高20000 / 支払50000 / 既適用0 → 20000
    expect(computeMaxOffset(20000, 50000, 0)).toBe(20000);
    // 残高80000 / 支払50000 / 既適用0 → 50000（支払額まで）
    expect(computeMaxOffset(80000, 50000, 0)).toBe(50000);
    // 既適用10000 → 支払残40000, 残高80000 → 40000
    expect(computeMaxOffset(80000, 50000, 10000)).toBe(40000);
  });

  it("残高0以下や支払超過はクランプして0", () => {
    expect(computeMaxOffset(0, 50000, 0)).toBe(0);
    expect(computeMaxOffset(-5000, 50000, 0)).toBe(0);
    expect(computeMaxOffset(20000, 50000, 50000)).toBe(0);
  });
});

describe("signedDelta", () => {
  it("種別ごとの符号", () => {
    expect(signedDelta("advance", 10000)).toBe(10000);
    expect(signedDelta("repayment", 10000)).toBe(-10000);
    expect(signedDelta("adjustment", 10000, true)).toBe(10000);
    expect(signedDelta("adjustment", 10000, false)).toBe(-10000);
    // 入力が負でも絶対値で処理
    expect(signedDelta("repayment", -10000)).toBe(-10000);
  });
});
