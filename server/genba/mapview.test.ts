import { describe, it, expect } from "vitest";
import { fullViewBox, clampViewBox, zoomAt, panViewBox, polyBBox, fitViewBox, MAX_ZOOM } from "../../shared/genba/mapview";

/** 図面ビューアのズーム/フィット計算 (Genba_Beta: 純関数のみ・DB不使用) */
describe("genba mapview", () => {
  const FW = 2000, FH = 1500; // 4:3

  it("clampViewBox はアスペクト比を fw:fh に固定し画像内へ収める", () => {
    const v = clampViewBox({ x: -100, y: -100, w: 1000, h: 999 }, FW, FH);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.h / v.w).toBeCloseTo(FH / FW, 6);
  });

  it("clampViewBox は最大ズーム(1/MAX_ZOOM)と全体(等倍)でクランプ", () => {
    const tooSmall = clampViewBox({ x: 0, y: 0, w: 1, h: 1 }, FW, FH);
    expect(tooSmall.w).toBeCloseTo(FW / MAX_ZOOM, 6);
    const tooBig = clampViewBox({ x: 0, y: 0, w: FW * 3, h: FH * 3 }, FW, FH);
    expect(tooBig).toEqual(fullViewBox(FW, FH));
  });

  it("zoomAt は指定点を画面上で固定したまま拡大する", () => {
    const full = fullViewBox(FW, FH);
    const v = zoomAt(full, FW, FH, 2, 500, 300);
    expect(v.w).toBeCloseTo(FW / 2, 6);
    // 中心点の相対位置が不変: (cx - x)/w が拡大前後で一致
    expect((500 - v.x) / v.w).toBeCloseTo((500 - full.x) / full.w, 6);
    expect((300 - v.y) / v.h).toBeCloseTo((300 - full.y) / full.h, 6);
  });

  it("zoomAt で縮小すると全体表示へ戻る (等倍でクランプ)", () => {
    const zoomed = zoomAt(fullViewBox(FW, FH), FW, FH, 4, 1000, 750);
    const back = zoomAt(zoomed, FW, FH, 1 / 100, 1000, 750);
    expect(back).toEqual(fullViewBox(FW, FH));
  });

  it("panViewBox は画像外へはみ出さない", () => {
    const zoomed = zoomAt(fullViewBox(FW, FH), FW, FH, 2, 1000, 750);
    const panned = panViewBox(zoomed, FW, FH, 99999, 99999);
    expect(panned.x).toBeCloseTo(FW - panned.w, 6);
    expect(panned.y).toBeCloseTo(FH - panned.h, 6);
  });

  it("polyBBox はポリゴンの外接矩形を返す", () => {
    expect(polyBBox([{ x: 10, y: 40 }, { x: 200, y: 20 }, { x: 90, y: 300 }]))
      .toEqual({ minX: 10, minY: 20, maxX: 200, maxY: 300 });
  });

  it("fitViewBox はポリゴンを余白付きで包含し、アスペクト比を保つ", () => {
    const poly = [{ x: 400, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 700 }, { x: 400, y: 700 }];
    const v = fitViewBox(poly, FW, FH);
    expect(v.h / v.w).toBeCloseTo(FH / FW, 6);
    // ポリゴン全点が viewBox 内
    for (const p of poly) {
      expect(p.x).toBeGreaterThanOrEqual(v.x);
      expect(p.x).toBeLessThanOrEqual(v.x + v.w);
      expect(p.y).toBeGreaterThanOrEqual(v.y);
      expect(p.y).toBeLessThanOrEqual(v.y + v.h);
    }
    // ちゃんとズームされている (全体より狭い)
    expect(v.w).toBeLessThan(FW);
  });

  it("fitViewBox は画像端のポリゴンでも画像内にクランプ", () => {
    const poly = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }];
    const v = fitViewBox(poly, FW, FH);
    expect(v.x).toBeGreaterThanOrEqual(0);
    expect(v.y).toBeGreaterThanOrEqual(0);
  });

  it("fitViewBox は空ポリゴンで全体を返す", () => {
    expect(fitViewBox([], FW, FH)).toEqual(fullViewBox(FW, FH));
  });
});
