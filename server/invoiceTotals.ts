import * as db from "./db";

/**
 * 請求書の合計を明細から再計算する（明細を変更した全経路の単一の正）。
 * 税は税率ごとに集計してから四捨五入する（行ごとに丸めると1円ズレる）。
 * routers.ts と connect/router.ts の双方から使うため、循環importを避けて独立モジュールに置く。
 */
export async function recalcInvoiceTotals(invoiceId: number) {
  const items = await db.getInvoiceItemsByInvoice(invoiceId);
  let subtotal = 0;
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    subtotal += item.amount;
    const rate = item.itemTaxRate;
    const existing = taxByRate.get(rate) || 0;
    taxByRate.set(rate, existing + item.amount);
  }
  let totalTax = 0;
  for (const [rate, base] of Array.from(taxByRate.entries())) {
    totalTax += Math.round(base * rate / 100);
  }
  await db.updateInvoice(invoiceId, {
    subtotal,
    taxAmount: totalTax,
    totalAmount: subtotal + totalTax,
  });
}
