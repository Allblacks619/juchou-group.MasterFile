/**
 * 現場ビジョン: 外部共有ビューの組み立て (サーバー側・純粋関数)。
 *
 * ★セキュリティの要★ 非認証の閲覧者へ返すデータをここで **ホワイトリスト方式** で整形する。
 * 社内メモ(memo)・Driveリンク(driveUrl)・作業リンク(linkUrl)・問題文(issueText)・
 * 担当者/班・予算・材料・指示は **絶対に含めない**。フィールドを足すのではなく、
 * 明示的に選んだフィールドだけを新オブジェクトに詰め替える (スプレッドで丸ごと渡さない)。
 */

import { computeZoneAggregates } from "./aggregate";

export const SHARE_SCOPES = ["map", "tasks", "board", "dash"] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

export type ShareViewInput = {
  scopes: string[];
  site: { name: string };
  floors: { id: string; name: string; w: number | null; h: number | null; imageUrl: string | null }[];
  zones: { id: string; floorId: string; parentZoneId: string | null; name: string; polygon: unknown; priority: number | null; workStatus: string | null }[];
  tasks: { id: string; zoneId: string; parentTaskId: string | null; name: string; romaji: string | null; status: string; percent: number | null; dueDate: string | null }[];
};

export type ShareView = {
  site: { name: string };
  scopes: ShareScope[];
  map?: {
    floors: { id: string; name: string; w: number | null; h: number | null; imageUrl: string | null }[];
    zones: { id: string; floorId: string; parentZoneId: string | null; name: string; polygon: unknown; priority: number | null; progress: number; issues: number }[];
  };
  tasks?: {
    zones: { id: string; floorId: string; name: string; priority: number | null }[];
    tasks: { id: string; zoneId: string; parentTaskId: string | null; name: string; romaji: string | null; status: string; percent: number | null; dueDate: string | null }[];
  };
  board?: {
    zones: { id: string; name: string; floorName: string; priority: number | null; taskCount: number }[];
  };
  dash?: {
    overallProgress: number;
    floors: { id: string; name: string; progress: number }[];
    statusCounts: { todo: number; progress: number; done: number; issue: number };
    zoneCount: number;
    taskCount: number;
  };
};

/** 有効なスコープだけを許可集合に正規化 */
export function normalizeScopes(scopes: unknown): ShareScope[] {
  if (!Array.isArray(scopes)) return [];
  return SHARE_SCOPES.filter((s) => scopes.includes(s));
}

export function buildShareView(input: ShareViewInput): ShareView {
  const scopes = normalizeScopes(input.scopes);
  const agg = computeZoneAggregates(
    input.zones.map((z) => ({ id: z.id, parentZoneId: z.parentZoneId })),
    input.tasks.map((t) => ({ id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, status: t.status, percent: t.percent })),
  );
  const progressOf = (zoneId: string) => agg.get(zoneId)?.progress ?? 0;

  const floorName = new Map(input.floors.map((f) => [f.id, f.name]));
  const zoneById = new Map(input.zones.map((z) => [z.id, z]));
  const parentIds = new Set(input.tasks.map((t) => t.parentTaskId).filter((p): p is string => !!p));
  const activeLeaf = input.tasks.filter((t) => !parentIds.has(t.id) && t.status !== "done");

  const view: ShareView = { site: { name: input.site.name }, scopes };

  if (scopes.includes("map")) {
    view.map = {
      floors: input.floors.map((f) => ({ id: f.id, name: f.name, w: f.w, h: f.h, imageUrl: f.imageUrl })),
      zones: input.zones.map((z) => ({
        id: z.id, floorId: z.floorId, parentZoneId: z.parentZoneId, name: z.name,
        polygon: z.polygon, priority: z.priority,
        progress: progressOf(z.id), issues: agg.get(z.id)?.issues ?? 0,
      })),
    };
  }

  if (scopes.includes("tasks")) {
    view.tasks = {
      zones: input.zones.map((z) => ({ id: z.id, floorId: z.floorId, name: z.name, priority: z.priority })),
      // 明示ホワイトリスト: memo/linkUrl/issueText/担当者は含めない
      tasks: input.tasks.map((t) => ({
        id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, name: t.name,
        romaji: t.romaji, status: t.status, percent: t.percent, dueDate: t.dueDate,
      })),
    };
  }

  if (scopes.includes("board")) {
    // エリア単位のアクティブ作業数のみ (担当者名は外部に出さない)
    const rows: { id: string; name: string; floorName: string; priority: number | null; taskCount: number }[] = [];
    for (const z of input.zones) {
      const count = activeLeaf.filter((t) => t.zoneId === z.id).length;
      if (count === 0) continue;
      rows.push({ id: z.id, name: z.name, floorName: floorName.get(z.floorId) || "", priority: z.priority, taskCount: count });
    }
    view.board = { zones: rows };
  }

  if (scopes.includes("dash")) {
    const rootZones = input.zones.filter((z) => !z.parentZoneId);
    const floors = input.floors.map((f) => {
      const fz = rootZones.filter((z) => z.floorId === f.id);
      const p = fz.length ? fz.reduce((a, z) => a + progressOf(z.id), 0) / fz.length : 0;
      return { id: f.id, name: f.name, progress: Math.round(p) };
    });
    const overall = rootZones.length ? Math.round(rootZones.reduce((a, z) => a + progressOf(z.id), 0) / rootZones.length) : 0;
    const statusCounts = { todo: 0, progress: 0, done: 0, issue: 0 };
    for (const t of input.tasks) {
      if (parentIds.has(t.id)) continue; // 葉のみ集計
      if (t.status in statusCounts) (statusCounts as any)[t.status]++;
    }
    view.dash = { overallProgress: overall, floors, statusCounts, zoneCount: input.zones.length, taskCount: input.tasks.filter((t) => !parentIds.has(t.id)).length };
  }

  return view;
}
