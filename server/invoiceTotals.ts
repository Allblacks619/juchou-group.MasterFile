import * as db from "./db";

/**
 * 税率ごとに税抜金額を集計する。合計欄・PDF内訳欄の共通の正。
 * 0% は 0% のまま扱う（交通費・インボイス未登録の免税事業者）。テキスト行は金額を持たない。
 */
export function groupTaxByRate(
  items: { itemType: string; itemTaxRate: number; amount: number }[],
): Map<number, number> {
  const taxByRate = new Map<number, number>();
  for (const item of items) {
    if (item.itemType === "text") continue;
    taxByRate.set(item.itemTaxRate, (taxByRate.get(item.itemTaxRate) || 0) + item.amount);
  }
  return taxByRate;
}

/**
 * 請求書の合計を明細から再計算する（明細を変更した全経路の単一の正）。
 * 税は税率ごとに集計してから四捨五入する（行ごとに丸めると1円ズレる）。
 * routers.ts と connect/router.ts の双方から使うため、循環importを避けて独立モジュールに置く。
 */
export async function recalcInvoiceTotals(invoiceId: number) {
  const items = await db.getInvoiceItemsByInvoice(invoiceId);
  const subtotal = items.reduce((sum, i) => (i.itemType === "text" ? sum : sum + i.amount), 0);
  const taxByRate = groupTaxByRate(items);
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
