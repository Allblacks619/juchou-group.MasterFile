/**
 * 班・担当者チップの色。スキーマに色を持たないため、id/index から決定的に導出する。
 * CUD配色(優先度/進捗)とは別用途の識別色。
 */
const PALETTE = ["#005AFF", "#03AF7A", "#8E44AD", "#E67E22", "#16A085", "#C0392B", "#2C3E50", "#D35400"];

export function colorForKey(key: string | number): string {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function colorForIndex(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
