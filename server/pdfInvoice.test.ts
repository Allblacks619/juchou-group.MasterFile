import { describe, expect, it } from "vitest";
import { groupTaxByRate } from "./pdfInvoice";

describe("groupTaxByRate", () => {
  it("keeps 0% items in their own bucket instead of folding them into 10%", () => {
    const taxByRate = groupTaxByRate([
      { itemType: "normal", itemTaxRate: 10, amount: 400000 }, // 労務費
      { itemType: "normal", itemTaxRate: 0, amount: 20000 }, // 交通費（不課税）
    ]);

    expect(Object.fromEntries(taxByRate)).toEqual({ 10: 400000, 0: 20000 });

    let totalTax = 0;
    for (const [rate, base] of Array.from(taxByRate.entries())) {
      totalTax += Math.round((base * rate) / 100);
    }
    expect(totalTax).toBe(40000);
  });

  it("charges no tax at all when every item is 0% (免税事業者)", () => {
    const taxByRate = groupTaxByRate([
      { itemType: "normal", itemTaxRate: 0, amount: 400000 },
      { itemType: "normal", itemTaxRate: 0, amount: 20000 },
    ]);

    expect(Object.fromEntries(taxByRate)).toEqual({ 0: 420000 });
  });

  it("excludes text rows from the tax buckets", () => {
    const taxByRate = groupTaxByRate([
      { itemType: "normal", itemTaxRate: 10, amount: 100000 },
      { itemType: "text", itemTaxRate: 10, amount: 999999 },
    ]);

    expect(Object.fromEntries(taxByRate)).toEqual({ 10: 100000 });
  });
});
