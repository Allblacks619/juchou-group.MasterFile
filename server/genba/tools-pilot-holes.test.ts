import { describe, expect, it } from "vitest";
import {
  TAP_PILOT_HOLES,
  findTapPilotHole,
  KNOCKOUT_HOLES,
  KNOCKOUT_PIPE_ORDER,
  knockoutSizes,
  findKnockout,
  formatHoleMm,
} from "@shared/genba/tools/pilotHoles";

describe("下穴径: タップ下穴", () => {
  it("メートル並目6サイズを収録し、JIS B 1004 の標準下穴径と一致する", () => {
    expect(TAP_PILOT_HOLES).toHaveLength(6);
    expect(findTapPilotHole("M4")).toBe(3.3);
    expect(findTapPilotHole("M5")).toBe(4.2);
    expect(findTapPilotHole("M6")).toBe(5);
    expect(findTapPilotHole("M8")).toBe(6.8);
    expect(findTapPilotHole("M10")).toBe(8.5);
    expect(findTapPilotHole("M12")).toBe(10.2);
  });

  it("未収録サイズは null", () => {
    expect(findTapPilotHole("M3")).toBeNull();
    expect(findTapPilotHole("M16")).toBeNull();
    expect(findTapPilotHole("")).toBeNull();
  });
});

describe("下穴径: 配管コネクタ用ノックアウト径", () => {
  it("全38件（PF4 / E7 / G9 / プリカ9 / 防水プリカ9）を収録する", () => {
    expect(KNOCKOUT_HOLES).toHaveLength(38);
    expect(knockoutSizes("PF")).toEqual([16, 22, 28, 36]);
    expect(knockoutSizes("E")).toEqual([19, 25, 31, 39, 51, 63, 75]);
    expect(knockoutSizes("G")).toHaveLength(9);
    expect(knockoutSizes("PR")).toHaveLength(9);
    expect(knockoutSizes("WP")).toHaveLength(9);
  });

  it("PF管 呼び16 はコネクタ種類による2値（φ22/φ27）と注記を持つ", () => {
    const e = findKnockout("PF", 16);
    expect(e?.knockMm).toEqual([22, 27]);
    expect(e?.note).toBeTruthy();
  });

  it("G管・プリカ・防水プリカは径の数値列が同一", () => {
    const seq = (pipe: "G" | "PR" | "WP") =>
      knockoutSizes(pipe).map((s) => findKnockout(pipe, s)!.knockMm);
    expect(seq("PR")).toEqual(seq("G"));
    expect(seq("WP")).toEqual(seq("G"));
  });

  it("未定義の組合せは null / 各種別に最低1件のデータがある", () => {
    expect(findKnockout("PF", 54)).toBeNull();
    for (const pipe of KNOCKOUT_PIPE_ORDER) {
      expect(knockoutSizes(pipe).length).toBeGreaterThan(0);
    }
  });

  it("表示整形: 整数はそのまま・小数は1桁", () => {
    expect(formatHoleMm(34)).toBe("34");
    expect(formatHoleMm(27.1)).toBe("27.1");
    expect(formatHoleMm(21.5)).toBe("21.5");
  });
});
