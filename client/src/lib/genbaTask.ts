/** 現場ビジョン: 作業(タスク)のツリー化と進捗計算 (プロトタイプ移植・クライアント表示用) */

export type GenbaTaskDto = {
  id: string;
  zoneId: string;
  parentTaskId: string | null;
  name: string;
  romaji: string | null;
  status: "todo" | "progress" | "done" | "issue";
  percent: number | null;
  priority: number | null;
  issueText: string | null;
  startDate: string | null;
  dueDate: string | null;
  memo: string | null;
  memoVisible: boolean;
  linkUrl: string | null;
  sortOrder: number;
  assigneeIds?: number[];
  teamIds?: string[];
  /** ゲスト(現場名簿 genba_site_workers.id)の担当 (G1) */
  guestAssigneeIds?: string[];
  /** 担当者の表示名 (サーバ解決)。名簿を持たないゲスト閲覧でも user#ID にならないように */
  assigneeNames?: Record<string, string | null>;
  /** ゲスト担当の表示名 (siteWorkerId → 名前) */
  guestNames?: Record<string, string | null>;
  /** 添付ファイル数 (📎バッジ用) */
  fileCount?: number;
};

export function leafProgress(t: Pick<GenbaTaskDto, "status" | "percent">): number {
  if (t.status === "done") return 100;
  if (t.status === "progress") return t.percent != null ? t.percent : 50;
  if (t.status === "issue") return t.percent != null ? t.percent : 0;
  return 0;
}

export function childrenMap(tasks: GenbaTaskDto[]): Map<string, GenbaTaskDto[]> {
  const m = new Map<string, GenbaTaskDto[]>();
  for (const t of tasks) {
    if (t.parentTaskId) {
      const arr = m.get(t.parentTaskId) || [];
      arr.push(t);
      m.set(t.parentTaskId, arr);
    }
  }
  m.forEach((arr) => arr.sort((a, b) => a.sortOrder - b.sortOrder || 0));
  return m;
}

export function computeTaskProgress(task: GenbaTaskDto, byParent: Map<string, GenbaTaskDto[]>): number {
  const kids = byParent.get(task.id) || [];
  if (kids.length === 0) return leafProgress(task);
  return kids.reduce((a, c) => a + computeTaskProgress(c, byParent), 0) / kids.length;
}

export function rootTasks(tasks: GenbaTaskDto[]): GenbaTaskDto[] {
  return tasks.filter((t) => !t.parentTaskId).sort((a, b) => a.sortOrder - b.sortOrder || 0);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}
