import { describe, it, expect } from "vitest";
import { prorateTransport } from "./workReport";

describe("prorateTransport（交通費の日割り・端数は最終出勤日）", () => {
  it("指示書の例: 24,515円÷14日 → 通常1,751円・最終日1,752円、合計一致", () => {
    const amounts = prorateTransport(24515, 14);
    expect(amounts).toHaveLength(14);
    for (let i = 0; i < 13; i++) expect(amounts[i]).toBe(1751);
    expect(amounts[13]).toBe(1752);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(24515);
  });

  it("割り切れる場合は全日同額", () => {
    const amounts = prorateTransport(28000, 14);
    expect(amounts.every((a) => a === 2000)).toBe(true);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(28000);
  });

  it("1日だけの出勤は全額その日", () => {
    expect(prorateTransport(13000, 1)).toEqual([13000]);
  });

  it("0円・0日は空", () => {
    expect(prorateTransport(0, 14)).toEqual([]);
    expect(prorateTransport(10000, 0)).toEqual([]);
  });

  it("端数調整後も必ず合計が元金額と一致する（総当たり）", () => {
    for (const total of [1, 999, 24515, 100001]) {
      for (const days of [1, 2, 3, 7, 14, 31]) {
        const amounts = prorateTransport(total, days);
        expect(amounts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(amounts).toHaveLength(days);
      }
    }
  });
});
