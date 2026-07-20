import { describe, expect, it } from "vitest";
import {
  CORE_DRILL_SIZES,
  GENBA_PIPES,
  HOLE_SAW_SIZES,
  holePunchPlan,
  nextStdSize,
} from "@shared/genba/tools/pipes";

describe("nextStdSize", () => {
  it("target 以上の最小標準サイズを返す", () => {
    expect(nextStdSize(HOLE_SAW_SIZES, 28.1)).toBe(29);
    expect(nextStdSize(HOLE_SAW_SIZES, 34)).toBe(35);
    expect(nextStdSize(CORE_DRILL_SIZES, 28.1)).toBe(30);
  });

  it("境界値: ちょうど一致ならその値を返す", () => {
    expect(nextStdSize(HOLE_SAW_SIZES, 28)).toBe(28);
    expect(nextStdSize(HOLE_SAW_SIZES, 14)).toBe(14);
    expect(nextStdSize(HOLE_SAW_SIZES, 127)).toBe(127);
    expect(nextStdSize(CORE_DRILL_SIZES, 150)).toBe(150);
  });

  it("最大サイズ超過は null", () => {
    expect(nextStdSize(HOLE_SAW_SIZES, 127.1)).toBeNull();
    expect(nextStdSize(CORE_DRILL_SIZES, 151)).toBeNull();
  });
});

describe("holePunchPlan", () => {
  it("代表ケース: G管22 (仕様書計算例)", () => {
    // od=26.6, justTarget=28.1 → just=29, clearTarget=34 → clear=35
    const p = holePunchPlan("G", 22);
    expect(p).not.toBeNull();
    expect(p!.od).toBe(26.6);
    expect(p!.just).toBe(29);
    expect(p!.clear).toBe(35);
    expect(p!.clearIsStd).toBe(true);
    expect(p!.coreJust).toBe(30); // CORE で 28.1 以上の最小
    expect(p!.coreClear).toBe(35); // CORE で 34 以上の最小
    expect(p!.gimlet).toBe(30); // ceil(26.6 + 3)
  });

  it("E管19: 小径の代表ケース", () => {
    // od=19.1, justTarget=20.6 → just=21, clearTarget=26 → clear=27
    const p = holePunchPlan("E", 19)!;
    expect(p.od).toBe(19.1);
    expect(p.just).toBe(21);
    expect(p.clear).toBe(27);
    expect(p.clearIsStd).toBe(true);
    expect(p.coreJust).toBe(25);
    expect(p.coreClear).toBe(30);
    expect(p.gimlet).toBe(23); // ceil(22.1)
  });

  it("境界値: G管104 は余裕サイズが標準ホールソーに無い", () => {
    // od=113.4, justTarget=114.9 → just=127(114<114.9), clearTarget=132 → 標準外
    const p = holePunchPlan("G", 104)!;
    expect(p.od).toBe(113.4);
    expect(p.just).toBe(127);
    expect(p.clear).toBe(132); // ceil(132) フォールバック
    expect(p.clearIsStd).toBe(false);
    expect(p.coreJust).toBe(120);
    expect(p.coreClear).toBe(150);
    expect(p.gimlet).toBe(117); // ceil(116.4)
  });

  it("境界値: FEP150 はホールソー/コアドリルとも標準サイズ超過", () => {
    // od=189, justTarget=190.5 → 標準外 → ceil=191, clearTarget=196
    const p = holePunchPlan("FEP", 150)!;
    expect(p.od).toBe(189.0);
    expect(p.just).toBe(191);
    expect(p.clear).toBe(196);
    expect(p.clearIsStd).toBe(false);
    expect(p.coreJust).toBeNull();
    expect(p.coreClear).toBeNull();
    expect(p.gimlet).toBe(192);
  });

  it("存在しない呼び径は null", () => {
    expect(holePunchPlan("G", 999)).toBeNull();
    expect(holePunchPlan("PF", 19)).toBeNull(); // PF に 19 は無い
  });
});

describe("配管データ (JIS C 8305 / カタログ目安の転記確認)", () => {
  it("G管・E管は JIS 規格値 (approx=false)", () => {
    expect(GENBA_PIPES.G.approx).toBe(false);
    expect(GENBA_PIPES.E.approx).toBe(false);
    expect(GENBA_PIPES.G.sizes[16]).toBe(21.4);
    expect(GENBA_PIPES.E.sizes[101]).toBe(101.6);
  });

  it("目安値系のスポットチェック", () => {
    expect(GENBA_PIPES.PF.sizes[54]).toBe(64.5);
    expect(GENBA_PIPES.CD.sizes[14]).toBe(19.0);
    expect(GENBA_PIPES.VE.sizes[82]).toBe(89.0);
    expect(GENBA_PIPES.MF.sizes[70]).toBe(81.0);
    expect(GENBA_PIPES.BF.sizes[10]).toBe(13.8);
    expect(GENBA_PIPES.PR.sizes[101]).toBe(107.3);
    expect(GENBA_PIPES.WP.sizes[101]).toBe(110.1);
  });
});
