import { describe, it, expect } from "vitest";
import { toStoredQuantity, fromStoredQuantity } from "./invoiceQuantity";

describe("invoiceQuantity", () => {
  it("30分刻み(0.5)と半日(0.5日)を int 列で往復できる", () => {
    for (const human of [0, 0.5, 1, 1.5, 2, 7.5, 14, 21.5, 22]) {
      expect(fromStoredQuantity(toStoredQuantity(human))).toBe(human);
    }
  });

  it("×10 の int になる（DB列が int なので小数のままだと丸められる）", () => {
    expect(toStoredQuantity(1.5)).toBe(15);
    expect(toStoredQuantity(22)).toBe(220);
    expect(Number.isInteger(toStoredQuantity(1.5))).toBe(true);
  });

  it("null/NaN は 0 として扱う", () => {
    expect(toStoredQuantity(NaN)).toBe(0);
    expect(fromStoredQuantity(undefined as unknown as number)).toBe(0);
  });
});
