import { describe, expect, test } from "vitest";
import { normalizeInvoiceItems, calculateInvoiceTotals } from "./AppMyClosing";

/**
 * 作業員の「請求書プレビュー」金額が、実際に発行される請求額（server/workerInvoiceV2Core.ts）と
 * 一致することを守るテスト。サーバは明細ごとに Math.round(amount * taxRate / 100) を積む。
 */
describe("作業員請求書プレビューの消費税", () => {
  test("インボイス登録済み（労務費 税率10%）は労務費に10%を計上する", () => {
    const totals = calculateInvoiceTotals(
      normalizeInvoiceItems([
        { label: "作業費 A現場（日勤）", quantity: 10, unitPrice: 20000, unit: "日", category: "labor", taxRate: 10 },
        { label: "交通費（A現場）", quantity: 1, unitPrice: 12000, unit: "式", category: "transport", taxRate: 0 },
      ])
    );

    expect(totals.subtotal).toBe(212000);
    expect(totals.tax).toBe(20000);
    expect(totals.total).toBe(232000);
  });

  test("インボイス未登録（労務費 税率0%）は消費税を計上しない", () => {
    const totals = calculateInvoiceTotals(
      normalizeInvoiceItems([
        { label: "作業費 A現場（日勤）", quantity: 10, unitPrice: 20000, unit: "日", category: "labor", taxRate: 0 },
        { label: "交通費（A現場）", quantity: 1, unitPrice: 12000, unit: "式", category: "transport", taxRate: 0 },
      ])
    );

    expect(totals.subtotal).toBe(212000);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(212000);
  });

  test("端数はサーバと同じく明細ごとに四捨五入する（合計への一括計算ではない）", () => {
    // 1005円 × 10% = 100.5 → 明細ごとに四捨五入で 101。2行で 202（合計2010円への一括計算なら201）。
    const totals = calculateInvoiceTotals(
      normalizeInvoiceItems([
        { label: "残業代（時間外） A現場", quantity: 1, unitPrice: 1005, unit: "時間", category: "labor", taxRate: 10 },
        { label: "残業代（深夜） A現場", quantity: 1, unitPrice: 1005, unit: "時間", category: "labor", taxRate: 10 },
      ])
    );

    expect(totals.subtotal).toBe(2010);
    expect(totals.tax).toBe(202);
    expect(totals.total).toBe(2212);
  });

  test("テキスト行（現場見出し）は税額に影響しない", () => {
    const totals = calculateInvoiceTotals(
      normalizeInvoiceItems([
        { label: "【A現場】", quantity: 0, unitPrice: 0, unit: "", category: "labor", itemType: "text", taxRate: 10 },
        { label: "作業費 A現場（日勤）", quantity: 1, unitPrice: 20000, unit: "日", category: "labor", taxRate: 10 },
      ])
    );

    expect(totals.subtotal).toBe(20000);
    expect(totals.tax).toBe(2000);
    expect(totals.total).toBe(22000);
  });
});
