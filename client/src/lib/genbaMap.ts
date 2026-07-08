/**
 * 現場ビジョン 地図(図面)描画の共有定数・ヘルパ。
 * CUD配色 (色覚多様性対応) はテーマ不変。プロトタイプ GenbaAppV18.jsx と同一値を厳守する。
 */

export type Pt = { x: number; y: number };

export const PRIORITY: Record<number, { label: string; color: string; soft: string; text: string }> = {
  1: { label: "最優先", color: "#FF4B00", soft: "rgba(255,75,0,0.28)", text: "#fff" },
  2: { label: "高", color: "#F6AA00", soft: "rgba(246,170,0,0.30)", text: "#3a2a00" },
  3: { label: "中", color: "#4DC4FF", soft: "rgba(77,196,255,0.30)", text: "#00304a" },
  4: { label: "低", color: "#84919E", soft: "rgba(132,145,158,0.28)", text: "#fff" },
};

export const STATUS = {
  todo: { label: "未着手", color: "#9aa5af", icon: "○" },
  progress: { label: "途中", color: "#4DC4FF", icon: "▶" },
  done: { label: "完了", color: "#03AF7A", icon: "✓" },
  issue: { label: "問題あり", color: "#FF4B00", icon: "⚠" },
} as const;

/** エリア塗りつぶし色の候補パレット (優先度色と併用できる識別しやすい10色) */
export const ZONE_COLORS = [
  "#FF4B00", "#F6AA00", "#03AF7A", "#4DC4FF", "#005AFF",
  "#9C27B0", "#E91E63", "#795548", "#64748B", "#111827",
] as const;

/** エリアの塗り色と不透明度を決める (color 指定 > 優先度色 > 既定グレー) */
export function zoneFillStyle(z: { color?: string | null; fillOpacity?: number | null; priority?: number | null }): { color: string; opacity: number } {
  const pr = z.priority ? PRIORITY[z.priority] : null;
  const color = z.color || pr?.color || "#64748b";
  const def = z.color ? 0.25 : pr ? 0.29 : 0.15;
  const opacity = z.fillOpacity != null ? z.fillOpacity / 100 : def;
  return { color, opacity };
}

export function polyPath(poly: Pt[]): string {
  return poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
}

export function centroid(poly: Pt[]): Pt {
  let x = 0, y = 0;
  poly.forEach((p) => { x += p.x; y += p.y; });
  return { x: x / poly.length, y: y / poly.length };
}
