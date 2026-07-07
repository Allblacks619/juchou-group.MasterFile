import { describe, it, expect } from "vitest";
import { buildShareView, normalizeScopes } from "./share";

/** 外部共有ビューのサニタイズ (漏洩防止が主眼) */
describe("buildShareView", () => {
  const SECRET_MEMO = "SECRET_INTERNAL_MEMO_社内メモ";
  const SECRET_LINK = "https://drive.google.com/SECRET_DRIVE";
  const SECRET_ISSUE = "SECRET_ISSUE_TEXT_問題詳細";

  // buildShareView が受け取る型より多くのフィールドを敢えて混ぜ、素通りしないことを検証
  const input = {
    scopes: ["map", "tasks", "board", "dash"],
    site: { name: "◯◯ビル", driveUrl: SECRET_LINK } as any,
    floors: [{ id: "f1", name: "1F", w: 1000, h: 800, imageUrl: "signed://x" }],
    zones: [
      { id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, workStatus: null },
      { id: "z2", floorId: "f1", parentZoneId: null, name: "2工区", polygon: null, priority: null, workStatus: "paused" },
    ] as any,
    tasks: [
      { id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", romaji: null, status: "progress", percent: 50, dueDate: "2026-07-10", memo: SECRET_MEMO, memoVisible: true, linkUrl: SECRET_LINK, issueText: SECRET_ISSUE, assigneeIds: [10, 20], teamIds: ["g1"] },
      { id: "t2", zoneId: "z1", parentTaskId: null, name: "配線", romaji: null, status: "done", percent: 100, dueDate: null, memo: SECRET_MEMO },
      { id: "t3", zoneId: "z2", parentTaskId: null, name: "貫通", romaji: null, status: "todo", percent: null, dueDate: null },
    ] as any,
  };

  it("★秘匿情報を一切出力しない (memo/drive/linkUrl/issueText/担当者)", () => {
    const view = buildShareView(input);
    const json = JSON.stringify(view);
    expect(json).not.toContain(SECRET_MEMO);
    expect(json).not.toContain(SECRET_LINK);
    expect(json).not.toContain(SECRET_ISSUE);
    expect(json).not.toContain("assigneeIds");
    expect(json).not.toContain("teamIds");
    expect(json).not.toContain("memo");
    expect(json).not.toContain("driveUrl");
  });

  it("map: フロア画像とゾーン進捗を返す", () => {
    const view = buildShareView({ ...input, scopes: ["map"] });
    expect(view.map?.floors[0].imageUrl).toBe("signed://x");
    const z1 = view.map?.zones.find((z) => z.id === "z1")!;
    expect(z1.polygon).toEqual([{ x: 0, y: 0 }]);
    expect(typeof z1.progress).toBe("number");
    // 他スコープは含まれない
    expect(view.tasks).toBeUndefined();
    expect(view.board).toBeUndefined();
    expect(view.dash).toBeUndefined();
  });

  it("tasks: 作業は name/status/percent/romaji/dueDate のみ (whitelist)", () => {
    const view = buildShareView({ ...input, scopes: ["tasks"] });
    const t1 = view.tasks?.tasks.find((t) => t.id === "t1")! as any;
    expect(t1).toMatchObject({ name: "配管", status: "progress", percent: 50, dueDate: "2026-07-10" });
    expect(t1.memo).toBeUndefined();
    expect(t1.linkUrl).toBeUndefined();
    expect(t1.issueText).toBeUndefined();
    expect(t1.assigneeIds).toBeUndefined();
  });

  it("board: アクティブ葉のあるエリアのみ・担当者名は出さない", () => {
    const view = buildShareView({ ...input, scopes: ["board"] });
    // z1: t1(progress葉) 有 → 含む / z2: t3(todo葉) 有 → 含む。done(t2)は除外
    const z1 = view.board?.zones.find((z) => z.id === "z1")!;
    expect(z1.taskCount).toBe(1); // t1 のみ (t2=done)
    expect(JSON.stringify(view.board)).not.toContain("10"); // 担当userId 10 が出ない
  });

  it("dash: 全体進捗・ステータス件数を返す", () => {
    const view = buildShareView({ ...input, scopes: ["dash"] });
    expect(view.dash?.statusCounts).toMatchObject({ done: 1, progress: 1, todo: 1, issue: 0 });
    expect(typeof view.dash?.overallProgress).toBe("number");
  });

  it("normalizeScopes は未知スコープを除外", () => {
    expect(normalizeScopes(["map", "evil", "dash"])).toEqual(["map", "dash"]);
    expect(normalizeScopes("nope")).toEqual([]);
  });

  it("スコープ空なら各ビューは undefined", () => {
    const view = buildShareView({ ...input, scopes: [] });
    expect(view.map).toBeUndefined();
    expect(view.tasks).toBeUndefined();
    expect(view.board).toBeUndefined();
    expect(view.dash).toBeUndefined();
    expect(view.site.name).toBe("◯◯ビル");
  });
});
