/**
 * 現場ビジョン: 外部共有ビューのサニタイザ (サーバー/クライアント共有・純粋関数)。
 *
 * ⚠ セキュリティ境界: これは**非認証の外部公開**に渡るデータを組み立てる唯一の場所。
 * 内部情報 — 社内メモ(memo)・Driveリンク(driveUrl)・予算(budget)・作業員名(assignee)・
 * 問題本文(issueText)・写真キー(photoKeys)・指示(instructions) — は**絶対に含めない**。
 * 生オブジェクトを spread せず、許可フィールドだけを明示的に選択する(ホワイトリスト)。
 */

export type ShareScopes = { map?: boolean; tasks?: boolean; board?: boolean; dash?: boolean };

export type ShareViewInput = {
  siteName: string;
  scopes: ShareScopes;
  floors: { id: string; name: string; imageUrl: string | null; w: number | null; h: number | null }[];
  zones: { id: string; floorId: string; parentZoneId: string | null; name: string; polygon: unknown; priority: number | null; progress: number; issues: number }[];
  tasks: { id: string; zoneId: string; parentTaskId: string | null; name: string; status: string; percent: number | null }[];
  /** board スコープ用: 件数のみ (作業員名は出さない) */
  boardZones: { id: string; name: string; floorName: string; taskCount: number; assignedCount: number }[];
  /** dash スコープ用 */
  overall: { progress: number; floors: { id: string; name: string; progress: number }[] };
};

export type ShareView = {
  siteName: string;
  scopes: ShareScopes;
  map?: {
    floors: { id: string; name: string; imageUrl: string | null; w: number | null; h: number | null }[];
    zones: { id: string; floorId: string; parentZoneId: string | null; name: string; polygon: unknown; priority: number | null; progress: number; issues: number }[];
  };
  tasks?: { id: string; zoneId: string; parentTaskId: string | null; name: string; status: string; percent: number | null }[];
  board?: { id: string; name: string; floorName: string; taskCount: number; assignedCount: number }[];
  dash?: { progress: number; floors: { id: string; name: string; progress: number }[] };
};

/**
 * scope に応じて公開ビューを組み立てる。各フィールドは明示的に選択し、
 * 内部情報はソースに存在しても出力へ写さない。
 */
export function buildPublicShareView(input: ShareViewInput): ShareView {
  const scopes: ShareScopes = {
    map: !!input.scopes.map,
    tasks: !!input.scopes.tasks,
    board: !!input.scopes.board,
    dash: !!input.scopes.dash,
  };
  const view: ShareView = { siteName: input.siteName, scopes };

  if (scopes.map) {
    view.map = {
      floors: input.floors.map((f) => ({ id: f.id, name: f.name, imageUrl: f.imageUrl, w: f.w, h: f.h })),
      zones: input.zones.map((z) => ({
        id: z.id, floorId: z.floorId, parentZoneId: z.parentZoneId, name: z.name,
        polygon: z.polygon, priority: z.priority, progress: z.progress, issues: z.issues,
      })),
    };
  }

  if (scopes.tasks) {
    view.tasks = input.tasks.map((t) => ({
      id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, name: t.name, status: t.status, percent: t.percent,
    }));
  }

  if (scopes.board) {
    // 件数のみ。作業員名・担当者IDは外部に出さない。
    view.board = input.boardZones.map((z) => ({
      id: z.id, name: z.name, floorName: z.floorName, taskCount: z.taskCount, assignedCount: z.assignedCount,
    }));
  }

  if (scopes.dash) {
    view.dash = {
      progress: input.overall.progress,
      floors: input.overall.floors.map((f) => ({ id: f.id, name: f.name, progress: f.progress })),
    };
  }

  return view;
}

/** 共有トークンの有効性 (期限切れ判定)。expiresAt=null は無期限。 */
export function isShareExpired(expiresAt: Date | string | null, now: Date): boolean {
  if (!expiresAt) return false;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return exp.getTime() <= now.getTime();
}
