/**
 * 現場ビジョン: ゾーン進捗・問題数の集計 (サーバー側)。
 * プロトタイプ GenbaAppV18.jsx の leafProgress / computeTaskProgress / zoneProgress /
 * zoneIssues を純粋関数として移植。フロア単位の有界データを1回取得して計算する
 * (再帰CTEは前例が無いため、まずシンプルなJS集計で開始する — 設計書v1.1準拠)。
 */

export type AggZone = { id: string; parentZoneId: string | null };
export type AggTask = { id: string; zoneId: string; parentTaskId: string | null; status: string; percent: number | null };
export type ZoneAggregate = { progress: number; issues: number };

/** 葉タスクの進捗%: done=100 / progress=percent??50 / issue=percent??0 / todo=0 */
export function leafProgress(task: Pick<AggTask, "status" | "percent">): number {
  if (task.status === "done") return 100;
  if (task.status === "progress") return task.percent != null ? task.percent : 50;
  if (task.status === "issue") return task.percent != null ? task.percent : 0;
  return 0;
}

function computeTaskProgress(taskId: string, tasksByParent: Map<string, AggTask[]>, taskById: Map<string, AggTask>): number {
  const children = tasksByParent.get(taskId) || [];
  const self = taskById.get(taskId)!;
  if (children.length === 0) return leafProgress(self);
  const sum = children.reduce((a, c) => a + computeTaskProgress(c.id, tasksByParent, taskById), 0);
  return sum / children.length;
}

/**
 * フロア配下の全ゾーン・全タスクから、各ゾーンの progress(0-100) と issues(件数) を算出。
 * ゾーン進捗 = 自ゾーン直属ルートタスクの進捗 と 子ゾーンの進捗 の平均 (再帰・メモ化)。
 * 問題数 = 自ゾーン + 子ゾーン配下の status==="issue" タスク数の合計。
 */
export function computeZoneAggregates(zones: AggZone[], tasks: AggTask[]): Map<string, ZoneAggregate> {
  const taskById = new Map<string, AggTask>();
  const tasksByParent = new Map<string, AggTask[]>();
  const tasksByZone = new Map<string, AggTask[]>();
  for (const t of tasks) {
    taskById.set(t.id, t);
    if (t.parentTaskId) {
      const arr = tasksByParent.get(t.parentTaskId) || [];
      arr.push(t);
      tasksByParent.set(t.parentTaskId, arr);
    }
    const zarr = tasksByZone.get(t.zoneId) || [];
    zarr.push(t);
    tasksByZone.set(t.zoneId, zarr);
  }

  const childZones = new Map<string, AggZone[]>();
  for (const z of zones) {
    if (z.parentZoneId) {
      const arr = childZones.get(z.parentZoneId) || [];
      arr.push(z);
      childZones.set(z.parentZoneId, arr);
    }
  }

  const progressCache = new Map<string, number>();
  const issueCache = new Map<string, number>();

  function zoneProgress(zoneId: string): number {
    const cached = progressCache.get(zoneId);
    if (cached !== undefined) return cached;
    const ownRoots = (tasksByZone.get(zoneId) || []).filter((t) => !t.parentTaskId);
    const kids = childZones.get(zoneId) || [];
    const parts: number[] = [];
    for (const t of ownRoots) parts.push(computeTaskProgress(t.id, tasksByParent, taskById));
    for (const k of kids) parts.push(zoneProgress(k.id));
    const val = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    progressCache.set(zoneId, val);
    return val;
  }

  function zoneIssues(zoneId: string): number {
    const cached = issueCache.get(zoneId);
    if (cached !== undefined) return cached;
    let n = (tasksByZone.get(zoneId) || []).filter((t) => t.status === "issue").length;
    for (const k of childZones.get(zoneId) || []) n += zoneIssues(k.id);
    issueCache.set(zoneId, n);
    return n;
  }

  const result = new Map<string, ZoneAggregate>();
  for (const z of zones) {
    result.set(z.id, { progress: zoneProgress(z.id), issues: zoneIssues(z.id) });
  }
  return result;
}
