import { describe, it, expect } from "vitest";
import { buildPublicShareView, isShareExpired, type ShareViewInput } from "../../shared/genba/shareView";

/** 外部共有サニタイザ: scope 選択 + 内部情報の非漏洩 (純粋関数) */
describe("buildPublicShareView", () => {
  const input: ShareViewInput = {
    siteName: "現場A",
    scopes: { map: true, tasks: true, board: true, dash: true },
    floors: [{ id: "f1", name: "1F", imageUrl: "https://signed/x", w: 100, h: 80 }],
    zones: [{ id: "z1", floorId: "f1", parentZoneId: null, name: "1工区", polygon: [{ x: 0, y: 0 }], priority: 1, progress: 50, issues: 1 }],
    tasks: [{ id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", status: "progress", percent: 50 }],
    boardZones: [{ id: "z1", name: "1工区", floorName: "1F", taskCount: 3, assignedCount: 2 }],
    overall: { progress: 50, floors: [{ id: "f1", name: "1F", progress: 50 }] },
  };

  it("全 scope でそれぞれのセクションを返す", () => {
    const v = buildPublicShareView(input);
    expect(v.map?.floors[0].name).toBe("1F");
    expect(v.map?.zones[0].progress).toBe(50);
    expect(v.tasks?.[0]).toEqual({ id: "t1", zoneId: "z1", parentTaskId: null, name: "配管", status: "progress", percent: 50 });
    expect(v.board?.[0]).toEqual({ id: "z1", name: "1工区", floorName: "1F", taskCount: 3, assignedCount: 2 });
    expect(v.dash?.progress).toBe(50);
  });

  it("無効 scope のセクションは含めない", () => {
    const v = buildPublicShareView({ ...input, scopes: { map: true } });
    expect(v.map).toBeDefined();
    expect(v.tasks).toBeUndefined();
    expect(v.board).toBeUndefined();
    expect(v.dash).toBeUndefined();
  });

  it("board は件数のみ (assignedCount) で個人IDや名前を持たない", () => {
    const v = buildPublicShareView(input);
    const s = JSON.stringify(v.board);
    expect(v.board?.[0].assignedCount).toBe(2);
    expect(s).not.toContain("userId");
    expect(s).not.toContain("assignedUserIds");
  });

  it("出力は許可フィールドのみ (memo/driveUrl/assignee 等のキーが混入しない)", () => {
    // 生データに内部情報が付いていても型上入らないが、ホワイトリストの回帰防止として確認
    const v = buildPublicShareView(input);
    const s = JSON.stringify(v);
    for (const forbidden of ["memo", "driveUrl", "issueText", "photoKeys", "assigneeIds", "teamIds", "linkUrl", "budget"]) {
      expect(s).not.toContain(forbidden);
    }
  });
});

describe("isShareExpired", () => {
  const now = new Date("2026-07-09T00:00:00");
  it("null は無期限", () => expect(isShareExpired(null, now)).toBe(false));
  it("未来は有効", () => expect(isShareExpired(new Date("2026-08-01"), now)).toBe(false));
  it("過去は失効", () => expect(isShareExpired(new Date("2026-06-01"), now)).toBe(true));
});
