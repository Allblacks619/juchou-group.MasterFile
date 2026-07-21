import { describe, expect, it } from "vitest";
import {
  BOLT_PER_SUPPORT,
  FURE_PER_SUPPORT,
  JOINT_PER_CORNER,
  JOINT_PER_STRAIGHT,
  JOINT_PER_TBRANCH,
  JOINT_PER_XBRANCH,
  RACK_LENGTH_M,
  RAIL_STOCK_MM,
  boltSizeOf,
  calcCableRackRoute,
  calcCableRackTotals,
  calcRailRow,
  railBarsNeeded,
  railClassOf,
  railPerBar,
  railRemainder,
  sepPerCorner,
  type CableRackRouteInput,
} from "@shared/genba/tools/cableRack";

/** 入力の雛形（全部材0・レールなし） */
const base = (over: Partial<CableRackRouteInput> = {}): CableRackRouteInput => ({
  type: "QR",
  width: 300,
  lengthM: 0,
  corner: 0,
  rise: 0,
  lr: 0,
  expansion: 0,
  tBranch: 0,
  xBranch: 0,
  hasSep: false,
  rails: [],
  ...over,
});

describe("定数", () => {
  it("仕様書の値と一致する", () => {
    expect(RACK_LENGTH_M).toBe(3);
    expect(RAIL_STOCK_MM).toBe(2500);
    expect(FURE_PER_SUPPORT).toBe(2);
    expect(BOLT_PER_SUPPORT).toBe(2);
    expect(JOINT_PER_STRAIGHT).toBe(2);
    expect(JOINT_PER_CORNER).toBe(4);
    expect(JOINT_PER_TBRANCH).toBe(6);
    expect(JOINT_PER_XBRANCH).toBe(8);
  });
});

describe("幅による区分（境界600mm）", () => {
  it("600以下は D1 / W3/8", () => {
    expect(railClassOf(600)).toBe("D1");
    expect(boltSizeOf(600)).toBe("W3/8");
    expect(railClassOf(200)).toBe("D1");
  });
  it("600超（800以上）は D2 / W1/2", () => {
    expect(railClassOf(800)).toBe("D2");
    expect(boltSizeOf(800)).toBe("W1/2");
    expect(railClassOf(1200)).toBe("D2");
  });
  it("セパレータのコーナー加算: 600以上=2枚 / 600未満=1枚", () => {
    expect(sepPerCorner(600)).toBe(2);
    expect(sepPerCorner(800)).toBe(2);
    expect(sepPerCorner(500)).toBe(1);
  });
});

describe("ダクターレール取り数（定尺2500mm）", () => {
  it("代表: 900mm は 2本取り・余り700mm", () => {
    expect(railPerBar(900)).toBe(2);
    expect(railRemainder(900)).toBe(700);
    expect(railBarsNeeded(900, 7)).toBe(4); // ceil(7/2)
  });
  it("境界: 2500mm ちょうどは1本取り・余り0", () => {
    expect(railPerBar(2500)).toBe(1);
    expect(railRemainder(2500)).toBe(0);
    expect(railBarsNeeded(2500, 3)).toBe(3);
  });
  it("定尺超の寸法は取り数0 → 箇所数=本数", () => {
    expect(railPerBar(3000)).toBe(0);
    expect(railBarsNeeded(3000, 4)).toBe(4);
  });
  it("calcRailRow が一式を返す", () => {
    expect(calcRailRow(300, 10)).toEqual({ size: 300, count: 10, perBar: 8, bars: 2, remainder: 100 });
  });
});

describe("calcCableRackRoute", () => {
  it("代表ケース: QR W300 延長15m + 各部材", () => {
    const r = calcCableRackRoute(
      base({
        lengthM: 15,
        corner: 2,
        rise: 1,
        lr: 1,
        expansion: 1,
        tBranch: 1,
        xBranch: 1,
        rails: [{ size: 900, count: 7 }],
      }),
    );
    expect(r.hasBody).toBe(true);
    expect(r.racks).toBe(5); // ceil(15/3)
    expect(r.straightJoints).toBe(8); // (5-1)*2
    expect(r.cornerJoints).toBe(8); // 2*4
    expect(r.riseJoints).toBe(4); // 1*4
    expect(r.lrJoints).toBe(4); // 1*4
    expect(r.expJoints).toBe(2); // 1*2
    expect(r.tBranchJoints).toBe(6); // 1*6
    expect(r.xBranchJoints).toBe(8); // 1*8
    expect(r.railCount).toBe(7);
    expect(r.fure).toBe(14); // 7*2
    expect(r.railBarsSubtotal).toBe(4);
    expect(r.railClass).toBe("D1");
    expect(r.boltSize).toBe("W3/8");
  });

  it("境界: 延長は定尺3mで切り上げ", () => {
    expect(calcCableRackRoute(base({ lengthM: 15 })).racks).toBe(5);
    expect(calcCableRackRoute(base({ lengthM: 15.1 })).racks).toBe(6);
    expect(calcCableRackRoute(base({ lengthM: 0.1 })).racks).toBe(1);
    expect(calcCableRackRoute(base({ lengthM: 0 })).racks).toBe(0);
  });

  it("境界: 本体1本なら直線ジョイント0", () => {
    const r = calcCableRackRoute(base({ lengthM: 3 }));
    expect(r.racks).toBe(1);
    expect(r.straightJoints).toBe(0);
  });

  it("セパレータON: 枚数=本数×2・ジョイントプレート=枚数-1・押さえ金具=枚数×3", () => {
    const r = calcCableRackRoute(base({ lengthM: 15, hasSep: true, rise: 2 }));
    expect(r.sepSheets).toBe(10);
    expect(r.sepJointPlates).toBe(9);
    expect(r.sepClamps).toBe(30);
    expect(r.riseSepJoints).toBe(4); // rise*2
  });

  it("セパレータOFF: セパレータ類は全て0", () => {
    const r = calcCableRackRoute(base({ lengthM: 15, corner: 3, rise: 2 }));
    expect(r.sepSheets).toBe(0);
    expect(r.sepJointPlates).toBe(0);
    expect(r.sepClamps).toBe(0);
    expect(r.cSepPerCorner).toBe(0);
    expect(r.cSepSheets).toBe(0);
    expect(r.riseSepJoints).toBe(0);
  });

  it("コーナー用セパレータ加算: 幅600以上=2枚/か所（ジョイントあり）", () => {
    const r = calcCableRackRoute(base({ width: 600, lengthM: 6, corner: 3, hasSep: true }));
    expect(r.cSepPerCorner).toBe(2);
    expect(r.cSepSheets).toBe(6); // 3*2
    expect(r.cSepJoints).toBe(3); // 2枚/か所 → corner
    expect(r.cSepClampsMin).toBe(6); // 3*2
    expect(r.cSepClampsMax).toBe(9); // 3*3
  });

  it("コーナー用セパレータ加算: 幅500以下=1枚/か所（ジョイントなし）", () => {
    const r = calcCableRackRoute(base({ width: 500, lengthM: 6, corner: 3, hasSep: true }));
    expect(r.cSepPerCorner).toBe(1);
    expect(r.cSepSheets).toBe(3);
    expect(r.cSepJoints).toBe(0);
    expect(r.cSepClampsMin).toBe(6);
    expect(r.cSepClampsMax).toBe(9);
  });

  it("レールのみ（延長・部材なし）は hasBody=false でもレールは計算される", () => {
    const r = calcCableRackRoute(base({ rails: [{ size: 500, count: 4 }] }));
    expect(r.hasBody).toBe(false);
    expect(r.railCount).toBe(4);
    expect(r.railBarsSubtotal).toBe(1); // floor(2500/500)=5本取り → ceil(4/5)=1
  });

  it("size または count が0のレール行は無視する", () => {
    const r = calcCableRackRoute(base({ rails: [{ size: 0, count: 5 }, { size: 500, count: 0 }] }));
    expect(r.rails).toHaveLength(0);
    expect(r.railCount).toBe(0);
    expect(r.fure).toBe(0);
  });
});

describe("calcCableRackTotals", () => {
  it("全ネジは幅600境界で W3/8 / W1/2 に振り分け（支持か所×2）", () => {
    const t = calcCableRackTotals([
      base({ width: 600, lengthM: 6, rails: [{ size: 900, count: 3 }] }),
      base({ width: 800, lengthM: 6, rails: [{ size: 1000, count: 4 }] }),
    ]);
    expect(t.totalRailCount).toBe(7);
    expect(t.boltsSmall).toBe(6); // 3*2
    expect(t.boltsLarge).toBe(8); // 4*2
  });

  it("平均支持間隔: 2m超で警告・2mちょうどは警告なし", () => {
    const warn = calcCableRackTotals([base({ lengthM: 30, rails: [{ size: 900, count: 12 }] })]);
    expect(warn.avgIntervalM).toBeCloseTo(2.5);
    expect(warn.intervalWarning).toBe(true);

    const ok = calcCableRackTotals([base({ lengthM: 24, rails: [{ size: 900, count: 12 }] })]);
    expect(ok.avgIntervalM).toBeCloseTo(2.0);
    expect(ok.intervalWarning).toBe(false);
  });

  it("支持箇所0または延長0なら平均支持間隔は null", () => {
    expect(calcCableRackTotals([base({ lengthM: 10 })]).avgIntervalM).toBeNull();
    expect(calcCableRackTotals([base({ rails: [{ size: 900, count: 3 }] })]).avgIntervalM).toBeNull();
  });

  it("同一寸法レールはマージ後に定尺本数を再計算する", () => {
    // 1200mm: 2本取り。3か所+3か所 → 個別だと2+2=4本、マージ後は ceil(6/2)=3本
    const t = calcCableRackTotals([
      base({ rails: [{ size: 1200, count: 3 }] }),
      base({ rails: [{ size: 1200, count: 3 }] }),
    ]);
    expect(t.railsD1.items).toEqual([{ size: 1200, count: 6, perBar: 2, bars: 3, remainder: 100 }]);
    expect(t.railsD1.totalBars).toBe(3);
    expect(t.railsD2.totalBars).toBe(0);
  });

  it("本体・L形分岐は種別×幅ごと、ジョイントは種別別に合算", () => {
    const t = calcCableRackTotals([
      base({ type: "QR", width: 300, lengthM: 15, corner: 2 }), // racks5 直線8 コーナー8
      base({ type: "QR", width: 300, lengthM: 3 }), // racks1 直線0
      base({ type: "SR", width: 800, lengthM: 6, tBranch: 1 }), // racks2 直線2 T6
    ]);
    expect(t.rackBodies).toEqual([
      { type: "QR", width: 300, count: 6 },
      { type: "SR", width: 800, count: 2 },
    ]);
    expect(t.corners).toEqual([{ type: "QR", width: 300, count: 2 }]);
    expect(t.joints.QR).toBe(16); // 8+8+0
    expect(t.joints.SR).toBe(8); // 2+6
    expect(t.tBranch.SR).toBe(1);
  });

  it("レールのみのルートはレール・全ネジのみ集計（ふれどめ等は加算しない）", () => {
    const t = calcCableRackTotals([base({ rails: [{ size: 900, count: 4 }] })]);
    expect(t.totalRailCount).toBe(4);
    expect(t.boltsSmall).toBe(8);
    expect(t.fure.QR).toBe(0);
    expect(t.rackBodies).toHaveLength(0);
  });

  it("押さえ金具（直線分）は QR+SR 合算・コーナー×セパレータで注記フラグ", () => {
    const t = calcCableRackTotals([
      base({ type: "QR", lengthM: 6, hasSep: true, corner: 1 }), // sepSheets4 → clamps12
      base({ type: "SR", lengthM: 3, hasSep: true }), // sepSheets2 → clamps6
    ]);
    expect(t.sepClamps).toBe(18);
    expect(t.cornerSepNote).toBe(true);
    expect(t.sepSheets.QR).toBe(4);
    expect(t.sepSheets.SR).toBe(2);
    expect(t.sepJointPlates.QR).toBe(3);
  });

  it("ルート0件でも安全に空集計を返す", () => {
    const t = calcCableRackTotals([]);
    expect(t.totalRailCount).toBe(0);
    expect(t.avgIntervalM).toBeNull();
    expect(t.rackBodies).toHaveLength(0);
    expect(t.railsD1.totalBars).toBe(0);
  });
});
