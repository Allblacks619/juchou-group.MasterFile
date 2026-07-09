import { describe, it, expect } from "vitest";
import { romanize, dispName, normalizeLang } from "./genbaRomaji";

describe("genbaRomaji", () => {
  describe("normalizeLang", () => {
    it("pt / pt-BR / PT を pt に正規化", () => {
      expect(normalizeLang("pt")).toBe("pt");
      expect(normalizeLang("pt-BR")).toBe("pt");
      expect(normalizeLang("PT")).toBe("pt");
    });
    it("ja / jp / null / 未知は ja", () => {
      expect(normalizeLang("ja")).toBe("ja");
      expect(normalizeLang("jp")).toBe("ja");
      expect(normalizeLang(null)).toBe("ja");
      expect(normalizeLang(undefined)).toBe("ja");
      expect(normalizeLang("en")).toBe("ja");
    });
  });

  describe("dispName", () => {
    it("ja では日本語名をそのまま返す", () => {
      expect(dispName("配管", null, "ja")).toBe("配管");
      expect(dispName("配管", "Haikan", "ja")).toBe("配管");
    });
    it("pt では『名前 — Romaji』を併記 (明示romaji優先)", () => {
      expect(dispName("配管", "Haikan", "pt")).toBe("配管 — Haikan");
    });
    it("pt で romaji 未指定なら自動ローマ字化して併記", () => {
      const r = dispName("配管", null, "pt");
      expect(r.startsWith("配管 — ")).toBe(true);
      expect(r.length).toBeGreaterThan("配管 — ".length);
    });
    it("ローマ字が名前と同一/空なら併記しない", () => {
      expect(dispName("VVF", "VVF", "pt")).toBe("VVF");
      expect(dispName("ABC", "", "pt")).toBe(dispName("ABC", null, "pt"));
    });
  });

  describe("romanize", () => {
    it("辞書語を優先変換する", () => {
      expect(romanize("配管")).toBe("Haikan");
      expect(romanize("建て込み")).toBe("Tatekomi");
    });
    it("ASCII/型番はそのまま保つ", () => {
      expect(romanize("VVF1.6")).toContain("VVF1.6");
    });
  });
});
