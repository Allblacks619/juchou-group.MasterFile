import { describe, it, expect } from "vitest";
import { normalizeZone } from "./db";

/**
 * MariaDB は JSON カラム(polygon)を文字列で返すため、配列へ正規化する必要がある。
 * この正規化が無いとクライアントの Array.isArray(polygon) が false になり図面上に
 * エリアが描画されない (M2-B実装中に発見したバグの回帰防止)。
 */
describe("normalizeZone: polygon の文字列→配列 正規化", () => {
  const base = { id: "Genba_Beta_Zone_01", floorId: "f", parentZoneId: null, name: "1工区", priority: 1, workStatus: null, createdAt: new Date(), updatedAt: new Date() };

  it("polygon が JSON 文字列ならパースして配列にする", () => {
    const z = normalizeZone({ ...base, polygon: '[{"x":10,"y":20},{"x":30,"y":40},{"x":50,"y":60}]' } as any);
    expect(Array.isArray(z.polygon)).toBe(true);
    expect(z.polygon).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }]);
  });

  it("既に配列ならそのまま返す", () => {
    const poly = [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }];
    const z = normalizeZone({ ...base, polygon: poly } as any);
    expect(z.polygon).toEqual(poly);
  });

  it("壊れた文字列は例外にせず元の値を返す", () => {
    const z = normalizeZone({ ...base, polygon: "not-json" } as any);
    expect(z.polygon).toBe("not-json");
  });
});
