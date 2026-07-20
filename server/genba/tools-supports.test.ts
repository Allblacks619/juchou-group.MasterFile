import { describe, expect, it } from "vitest";
import {
  SUPPORT_MATERIALS,
  SUPPORT_MATERIAL_ORDER,
  getSupportMaterial,
  listSupportConditions,
  findSupportCondition,
} from "@shared/genba/tools/supports";

describe("支持間隔データ", () => {
  it("8電材・計22条件を収録する", () => {
    expect(SUPPORT_MATERIAL_ORDER).toHaveLength(8);
    const total = SUPPORT_MATERIAL_ORDER.reduce(
      (n, key) => n + listSupportConditions(key).length,
      0,
    );
    expect(total).toBe(22);
  });

  it("全電材が表示名を持ち、全条件が間隔値の表示文字列を持つ", () => {
    for (const key of SUPPORT_MATERIAL_ORDER) {
      const mat = getSupportMaterial(key);
      expect(mat).toBe(SUPPORT_MATERIALS[key]);
      expect(mat.label.length).toBeGreaterThan(0);
      for (const cond of listSupportConditions(key)) {
        expect(cond.label.length).toBeGreaterThan(0);
        expect(cond.interval.length).toBeGreaterThan(0);
        expect(cond.basis.length).toBeGreaterThan(0);
      }
    }
  });

  it("findSupportCondition は範囲内で条件を返し、範囲外は null", () => {
    const key = SUPPORT_MATERIAL_ORDER[0];
    const conds = listSupportConditions(key);
    expect(findSupportCondition(key, 0)).toBe(conds[0]);
    expect(findSupportCondition(key, conds.length)).toBeNull();
    expect(findSupportCondition(key, -1)).toBeNull();
  });
});
