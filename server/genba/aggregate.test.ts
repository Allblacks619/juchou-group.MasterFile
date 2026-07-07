import { describe, it, expect } from "vitest";
import { leafProgress, computeZoneAggregates, type AggZone, type AggTask } from "./aggregate";

describe("leafProgress", () => {
  it("done=100 / progress=percent??50 / issue=percent??0 / todo=0", () => {
    expect(leafProgress({ status: "done", percent: null })).toBe(100);
    expect(leafProgress({ status: "progress", percent: 40 })).toBe(40);
    expect(leafProgress({ status: "progress", percent: null })).toBe(50);
    expect(leafProgress({ status: "issue", percent: 30 })).toBe(30);
    expect(leafProgress({ status: "issue", percent: null })).toBe(0);
    expect(leafProgress({ status: "todo", percent: null })).toBe(0);
  });
});

describe("computeZoneAggregates (Genba_Beta ツリー)", () => {
  const zones: AggZone[] = [
    { id: "Z1", parentZoneId: null },
    { id: "Z2", parentZoneId: "Z1" }, // Z1 の子エリア
  ];
  const tasks: AggTask[] = [
    // Z1 直属ルート: A(完了=100), B(子B1=途中50 → B=50)
    { id: "A", zoneId: "Z1", parentTaskId: null, status: "done", percent: null },
    { id: "B", zoneId: "Z1", parentTaskId: null, status: "todo", percent: null },
    { id: "B1", zoneId: "Z1", parentTaskId: "B", status: "progress", percent: 50 },
    // Z2 ルート: C(問題=0)
    { id: "C", zoneId: "Z2", parentTaskId: null, status: "issue", percent: null },
  ];

  it("親タスクは自身のstatusでなく子の平均で評価される", () => {
    const agg = computeZoneAggregates(zones, tasks);
    // プロトタイプ準拠: ルートタスクと子ゾーンを個別に配列へ入れ一括平均。
    // A=100, B=avg(B1=50)=50, 子ゾーンZ2=0 → Z1 = (100+50+0)/3 = 50
    expect(agg.get("Z1")!.progress).toBeCloseTo(50, 5);
    expect(agg.get("Z2")!.progress).toBe(0);
  });

  it("問題数は自ゾーン+子ゾーンを合算する", () => {
    const agg = computeZoneAggregates(zones, tasks);
    expect(agg.get("Z2")!.issues).toBe(1);
    expect(agg.get("Z1")!.issues).toBe(1); // 自ゾーン0 + 子Z2の1
  });

  it("タスクが無いゾーンは progress=0 / issues=0", () => {
    const agg = computeZoneAggregates([{ id: "Zx", parentZoneId: null }], []);
    expect(agg.get("Zx")).toEqual({ progress: 0, issues: 0 });
  });
});
