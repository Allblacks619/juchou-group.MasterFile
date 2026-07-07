import { describe, it, expect } from "vitest";
import { computeBoard } from "./board";

/** 配置ボード集計 (Genba_Beta ツリー): 割当から人別/エリア別を自動生成 */
describe("computeBoard", () => {
  const base = {
    floors: [{ id: "f1", name: "1F" }],
    zones: [
      { id: "z1", floorId: "f1", name: "1工区", priority: 1, workStatus: null },
      { id: "z2", floorId: "f1", name: "2工区", priority: null, workStatus: "paused" },
    ],
    tasks: [
      { id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: null, status: "todo" },
      { id: "t2", zoneId: "z1", parentTaskId: null, name: "配線", romaji: null, status: "done" }, // done → 除外
      { id: "t3", zoneId: "z1", parentTaskId: null, name: "親", romaji: null, status: "todo" },
      { id: "t3a", zoneId: "z1", parentTaskId: "t3", name: "子", romaji: null, status: "progress" }, // 葉
      { id: "t4", zoneId: "z2", parentTaskId: null, name: "貫通", romaji: null, status: "todo" },
    ],
    assignees: [{ taskId: "t1", userId: 10 }], // 個人割当
    taskTeams: [{ taskId: "t3a", teamId: "g1" }], // 班割当 (子タスク)
    members: [{ teamId: "g1", userId: 20 }],
    users: [
      { id: 10, name: "山田", appRole: "worker" },
      { id: 20, name: "佐藤", appRole: "worker" },
      { id: 30, name: "未配置さん", appRole: "worker" },
    ],
  };

  it("人別: 個人割当 + 班割当で自分の作業に入る (done・親は除外)", () => {
    const b = computeBoard(base);
    const yamada = b.people.find((p) => p.userId === 10)!;
    expect(yamada.tasks.map((t) => t.id)).toEqual(["t1"]);
    const sato = b.people.find((p) => p.userId === 20)!;
    expect(sato.tasks.map((t) => t.id)).toEqual(["t3a"]); // 班g1経由
    expect(sato.teamIds).toEqual(["g1"]);
    const mihaichi = b.people.find((p) => p.userId === 30)!;
    expect(mihaichi.tasks).toEqual([]); // 未配置
  });

  it("エリア別: アクティブ葉を持つゾーンのみ・担当者を割当から集約", () => {
    const b = computeBoard(base);
    const z1 = b.zones.find((z) => z.id === "z1")!;
    // z1 のアクティブ葉: t1, t3a (t2=done除外, t3=親除外)
    expect(z1.taskCount).toBe(2);
    expect(z1.assignedUserIds.sort()).toEqual([10, 20]);
    const z2 = b.zones.find((z) => z.id === "z2")!;
    expect(z2.taskCount).toBe(1);
    expect(z2.assignedUserIds).toEqual([]); // 担当者未割当
    expect(z2.workStatus).toBe("paused");
  });

  it("タスクの無いゾーンは zones に含めない", () => {
    const b = computeBoard({ ...base, tasks: [] });
    expect(b.zones).toEqual([]);
    // people は全ユーザー分（タスク0）を返す
    expect(b.people).toHaveLength(3);
  });
});
