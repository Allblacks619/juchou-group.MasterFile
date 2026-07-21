import { describe, expect, it } from "vitest";
import {
  FIRESTOP_STRUCTURE_ORDER,
  FIRESTOP_PENETRANT_ORDER,
  FIRESTOP_METHODS,
  FIRESTOP_COMMON_CHECKLIST,
  getFirestopStructure,
  getFirestopPenetrant,
  getFirestopLevel,
  findFirestopEntry,
} from "@shared/genba/tools/firestop";

describe("耐火区画貫通ガイド", () => {
  it("壁床4種×貫通物5種の全20組合せにエントリがある", () => {
    expect(FIRESTOP_STRUCTURE_ORDER).toHaveLength(4);
    expect(FIRESTOP_PENETRANT_ORDER).toHaveLength(5);
    for (const s of FIRESTOP_STRUCTURE_ORDER) {
      for (const p of FIRESTOP_PENETRANT_ORDER) {
        const entry = findFirestopEntry(s, p);
        expect(entry, `${s} × ${p}`).not.toBeNull();
        expect(entry!.methods.length).toBeGreaterThan(0);
      }
    }
  });

  it("エントリが参照する工法キーは全て定義済み", () => {
    for (const s of FIRESTOP_STRUCTURE_ORDER) {
      for (const p of FIRESTOP_PENETRANT_ORDER) {
        for (const ref of findFirestopEntry(s, p)!.methods) {
          expect(FIRESTOP_METHODS[ref.method], `${s} × ${p} → ${ref.method}`).toBeDefined();
        }
      }
    }
  });

  it("種別・レベルの参照ヘルパーが表示情報を返す", () => {
    for (const s of FIRESTOP_STRUCTURE_ORDER) {
      expect(getFirestopStructure(s).label.length).toBeGreaterThan(0);
    }
    for (const p of FIRESTOP_PENETRANT_ORDER) {
      expect(getFirestopPenetrant(p).label.length).toBeGreaterThan(0);
    }
    for (const level of ["basic", "certified", "consult"] as const) {
      const info = getFirestopLevel(level);
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.color).toMatch(/^#/);
    }
  });

  it("共通チェックリスト（認定条件の確認を促す注意）が存在する", () => {
    expect(FIRESTOP_COMMON_CHECKLIST.length).toBeGreaterThan(0);
    expect(FIRESTOP_COMMON_CHECKLIST.join("")).toContain("認定");
  });
});
