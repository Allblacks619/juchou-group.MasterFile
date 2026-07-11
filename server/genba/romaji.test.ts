import { describe, it, expect, beforeEach } from "vitest";
import { romanize, dispName, setRomajiLang } from "../../client/src/lib/genbaRomaji";

/**
 * PT表示のフリガナ (ローマ字) — dispName は PT時のみ「日本語 — Romaji」、
 * romaji 未設定は辞書+かな変換 (romanize) で自動フォールバックする。
 */
describe("genba romaji (PT表示のフリガナ)", () => {
  beforeEach(() => setRomajiLang("ja"));

  it("romanize: 工事用語辞書 + かな変換", () => {
    expect(romanize("壁の墨出し")).toBe("Kabe No Sumidashi");
    expect(romanize("ボックス取り付け")).toBe("Box Toritsuke");
    expect(romanize("配管")).toBe("Haikan");
    expect(romanize("レースウェイ取り付け")).toBe("Raceway Toritsuke");
  });

  it("dispName: ja では日本語のまま", () => {
    expect(dispName("壁の墨出し", null)).toBe("壁の墨出し");
  });

  it("dispName: pt では「日本語 — Romaji」(自動フォールバック)", () => {
    setRomajiLang("pt");
    expect(dispName("壁の墨出し", null)).toBe("壁の墨出し — Kabe No Sumidashi");
  });

  it("dispName: 手動 romaji があれば優先", () => {
    setRomajiLang("pt");
    expect(dispName("壁の墨出し", "Marcação da parede")).toBe("壁の墨出し — Marcação da parede");
  });

  it("dispName: 変換結果が同じ (英数のみ) なら付けない", () => {
    setRomajiLang("pt");
    expect(dispName("Area-1", null)).toBe("Area-1");
  });
});
