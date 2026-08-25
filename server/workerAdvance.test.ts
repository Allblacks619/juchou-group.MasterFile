import { describe, it, expect } from "vitest";
import {
  DEFAULT_ADVANCE_FEE_PERCENT,
  computeAdvanceBalance,
  computeAdvanceCharge,
  computeAppliedOffset,
  computeMaxOffset,
  signedDelta,
} from "./workerAdvance";

describe("computeAdvanceCharge", () => {
  it("前借り手数料は既定10%で、元金＋手数料を返済対象総額にする", () => {
    expect(DEFAULT_ADVANCE_FEE_PERCENT).toBe(10);
    expect(computeAdvanceCharge(100000)).toEqual({
      principal: 100000,
      feePercent: 10,
      feeAmount: 10000,
      total: 110000,
    });
  });

  it("手数料率を1%単位で変更でき、円未満は四捨五入する", () => {
    expect(computeAdvanceCharge(12345, 1)).toEqual({
      principal: 12345,
      feePercent: 1,
      feeAmount: 123,
      total: 12468,
    });
    expect(computeAdvanceCharge(10000, 11).total).toBe(11100);
  });
});

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
    expect(computeMaxOffset(20000, 50000, 0)).toBe(20000);
    expect(computeMaxOffset(80000, 50000, 0)).toBe(50000);
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
    expect(signedDelta("repayment", -10000)).toBe(-10000);
  });
});
