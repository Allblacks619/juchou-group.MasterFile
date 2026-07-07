import { describe, it, expect } from "vitest";
import { genbaTr, GENBA_PT } from "../../shared/genba/i18n";
import { GENBA_THEMES, GENBA_THEME_KEYS, resolveGenbaTheme, DEFAULT_GENBA_THEME } from "../../shared/genba/themes";
import { GUIDE_SECTIONS } from "../../shared/genba/guide";

describe("genba i18n / themes / guide (M4-E)", () => {
  it("genbaTr: ja は原文、pt は辞書、未登録は原文フォールバック", () => {
    expect(genbaTr("図面", "ja")).toBe("図面");
    expect(genbaTr("図面", "pt")).toBe("Planta");
    expect(genbaTr("存在しないキー", "pt")).toBe("存在しないキー");
  });

  it("PT辞書は主要タブ語を網羅", () => {
    for (const k of ["図面", "作業", "指示", "配置", "全体", "設定"]) {
      expect(GENBA_PT[k]).toBeTruthy();
    }
  });

  it("テーマは16種、必須フィールドを持ち、resolve はフォールバック", () => {
    expect(GENBA_THEME_KEYS.length).toBe(16);
    for (const k of GENBA_THEME_KEYS) {
      const t = GENBA_THEMES[k];
      expect(t.accent).toMatch(/^#/);
      expect(t.header).toMatch(/^#/);
      expect(t.appBg).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
    expect(resolveGenbaTheme("nope").key).toBe(DEFAULT_GENBA_THEME);
    expect(resolveGenbaTheme("cyber").key).toBe("cyber");
  });

  it("ガイドは日/PT両方を持ち、admin限定セクションがある", () => {
    expect(GUIDE_SECTIONS.length).toBeGreaterThanOrEqual(8);
    for (const s of GUIDE_SECTIONS) {
      expect(s.jp.t).toBeTruthy();
      expect(s.jp.b).toBeTruthy();
      expect(s.pt.t).toBeTruthy();
      expect(s.pt.b).toBeTruthy();
    }
    expect(GUIDE_SECTIONS.some((s) => s.who === "admin")).toBe(true);
  });
});
