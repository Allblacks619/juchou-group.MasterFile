/**
 * 現場ビジョン: 図面ビューアのズーム/パン/フィット計算 (純関数)。
 * SVG viewBox = {x,y,w,h} を画像座標系で操作する。アスペクト比は常に画像 (fw:fh) と同一に保ち、
 * レイアウト高さが変わらないようにする。
 */

export type Pt = { x: number; y: number };
export type ViewBox = { x: number; y: number; w: number; h: number };

/** 最大ズーム倍率 (viewBox幅 = fw / MAX_ZOOM まで) */
export const MAX_ZOOM = 16;

export function fullViewBox(fw: number, fh: number): ViewBox {
  return { x: 0, y: 0, w: fw, h: fh };
}

/** viewBox を画像範囲内に収める (サイズは fw/MAX_ZOOM 〜 fw にクランプ、位置は画像内) */
export function clampViewBox(vb: ViewBox, fw: number, fh: number): ViewBox {
  const w = Math.min(fw, Math.max(fw / MAX_ZOOM, vb.w));
  const h = w * (fh / fw); // アスペクト固定
  const x = Math.min(Math.max(vb.x, 0), fw - w);
  const y = Math.min(Math.max(vb.y, 0), fh - h);
  return { x, y, w, h };
}

/** 点 (cx,cy) を中心に factor 倍ズーム (factor>1 で拡大)。中心点が画面上で動かないように x/y を補正 */
export function zoomAt(vb: ViewBox, fw: number, fh: number, factor: number, cx: number, cy: number): ViewBox {
  const w = vb.w / factor;
  const x = cx - (cx - vb.x) / factor;
  const y = cy - (cy - vb.y) / factor;
  return clampViewBox({ x, y, w, h: w * (fh / fw) }, fw, fh);
}

/** 画像座標系での平行移動 */
export function panViewBox(vb: ViewBox, fw: number, fh: number, dx: number, dy: number): ViewBox {
  return clampViewBox({ ...vb, x: vb.x + dx, y: vb.y + dy }, fw, fh);
}

export function polyBBox(poly: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * ポリゴンがちょうど収まる viewBox を返す (フォーカス用の自動ズームフィット)。
 * pad はポリゴン外周の余白率。アスペクト比 fw:fh に合わせて広い方へ拡張し、画像内にクランプする。
 */
export function fitViewBox(poly: Pt[], fw: number, fh: number, pad = 0.08): ViewBox {
  if (!poly.length) return fullViewBox(fw, fh);
  const b = polyBBox(poly);
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const padded = Math.max(bw, bh) * pad;
  let w = bw + padded * 2;
  let h = bh + padded * 2;
  const aspect = fw / fh;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return clampViewBox({ x: cx - w / 2, y: cy - h / 2, w, h }, fw, fh);
}
