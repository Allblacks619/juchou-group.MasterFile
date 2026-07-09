/**
 * 現場ビジョン: 外部共有ビューの非認証ハンドラ (トークン閲覧専用)。
 * セキュリティ最重要: 内部情報を一切返さない。行を丸ごと(...row)展開せず、
 * 許可したフィールドだけを field-by-field に組み立てる。スコープで画面を出し分ける。
 *
 * 除外(スコープに関係なく常に非公開): メモ(memo/memoVisible)・図面リンク(linkUrl)・
 * 問題文(issueText)・Driveリンク・projectId・予算・指示・材料・作業イベント/写真・
 * userId/appRole/メール・byUserId。作業員の実名は share.scopes.showWorkerNames のときのみ。
 */
import * as genbaDb from "./db";
import { computeZoneAggregates } from "./aggregate";
import { computeBoard } from "./board";
import { storageGet } from "../storage";

function genbaEnabled(): boolean {
  return (process.env.GENBA_ENABLED ?? "true") !== "false";
}

async function signFloorUrl(imageKey: string | null): Promise<string | null> {
  if (!imageKey) return null;
  try {
    return (await storageGet(imageKey)).url;
  } catch (error) {
    console.warn("[genba.share] signed URL failed:", error);
    return null;
  }
}

export type ShareViewResult = { status: number; body: any };

/**
 * トークンから公開ペイロードを構築する。
 * 200: サニタイズ済みデータ / 403: 期限切れ / 404: 不明・失効・無効化。
 */
export async function handleGenbaShareView(token: string | undefined | null): Promise<ShareViewResult> {
  if (!genbaEnabled()) return { status: 404, body: { error: "リンクが見つかりません" } };
  if (!token || typeof token !== "string") return { status: 404, body: { error: "リンクが見つかりません" } };

  const share = await genbaDb.getGenbaShareByToken(token);
  if (!share) return { status: 404, body: { error: "リンクが見つかりません" } };
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) {
    return { status: 403, body: { error: "リンクの有効期限が切れています" } };
  }

  const scopes = share.scopes;
  const site = await genbaDb.getGenbaSiteById(share.siteId);
  if (!site) return { status: 404, body: { error: "リンクが見つかりません" } };

  // データは常に share.siteId 起点でのみ取得 (別現場に構造的に到達しない)
  const floors = await genbaDb.listGenbaFloorsBySite(share.siteId);
  const zones = await genbaDb.listGenbaZonesByFloorIds(floors.map((f) => f.id));
  const tasks = await genbaDb.listGenbaTasksByZoneIds(zones.map((z) => z.id));

  // 進捗集計 (map/dash 用)。氏名や内部情報は含まない
  const agg = computeZoneAggregates(
    zones.map((z) => ({ id: z.id, parentZoneId: z.parentZoneId })),
    tasks.map((t) => ({ id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, status: t.status, percent: t.percent })),
  );

  // share.name は運用者が付ける内部ラベル (作業員名を入れる運用があるため) 。
  // 外部には出さず scopes のみ公開する。ビューアの見出しは現場名を使う。
  const body: any = {
    share: { scopes },
    site: { id: site.id, name: site.name }, // driveUrl / projectId / archived は出さない
  };

  if (scopes.map) {
    const floorsOut = await Promise.all(floors.map(async (f) => ({
      id: f.id, name: f.name, imageUrl: await signFloorUrl(f.imageKey), w: f.w, h: f.h, sortOrder: f.sortOrder,
    })));
    body.floors = floorsOut;
    body.zones = zones.map((z) => {
      const a = agg.get(z.id) ?? { progress: 0, issues: 0 };
      return {
        id: z.id, floorId: z.floorId, parentZoneId: z.parentZoneId, name: z.name,
        polygon: z.polygon, priority: z.priority, workStatus: z.workStatus,
        progress: a.progress, issues: a.issues,
      };
    });
  }

  if (scopes.tasks) {
    // memo / memoVisible / linkUrl / issueText は含めない
    body.tasks = tasks.map((t) => ({
      id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, name: t.name, romaji: t.romaji,
      status: t.status, percent: t.percent, priority: t.priority, startDate: t.startDate, dueDate: t.dueDate,
    }));
  }

  if (scopes.board) {
    const teams = await genbaDb.listGenbaTeamsBySite(share.siteId);
    const [assignees, taskTeams, members, users] = await Promise.all([
      genbaDb.listTaskAssigneesByTaskIds(tasks.map((t) => t.id)),
      genbaDb.listTaskTeamsByTaskIds(tasks.map((t) => t.id)),
      genbaDb.listGenbaTeamMembers(teams.map((t) => t.id)),
      genbaDb.listAssignableUsers(),
    ]);
    const board = computeBoard({
      floors: floors.map((f) => ({ id: f.id, name: f.name })),
      zones: zones.map((z) => ({ id: z.id, floorId: z.floorId, name: z.name, priority: z.priority, workStatus: z.workStatus })),
      tasks: tasks.map((t) => ({ id: t.id, zoneId: t.zoneId, parentTaskId: t.parentTaskId, name: t.name, romaji: t.romaji, status: t.status })),
      assignees: assignees.map((a) => ({ taskId: a.taskId, userId: a.userId })),
      taskTeams: taskTeams.map((tt) => ({ taskId: tt.taskId, teamId: tt.teamId })),
      members: members.map((m) => ({ teamId: m.teamId, userId: m.userId })),
      users: users.map((u) => ({ id: u.id, name: u.name, appRole: u.appRole })),
    });

    // userId は絶対に出さない。氏名は showWorkerNames のときのみ、それ以外は「作業員A/B…」
    const realName = new Map(users.map((u) => [u.id, u.name]));
    const alias = new Map<number, string>();
    const aliasFor = (uid: number) => {
      if (share.scopes.showWorkerNames) return realName.get(uid) || "作業員";
      if (!alias.has(uid)) alias.set(uid, `作業員${String.fromCharCode(65 + (alias.size % 26))}`);
      return alias.get(uid)!;
    };
    body.board = {
      people: board.people
        .filter((p) => p.tasks.length > 0)
        .map((p) => ({
          label: aliasFor(p.userId),
          teamIds: p.teamIds,
          tasks: p.tasks.map((t) => ({ id: t.id, name: t.name, romaji: t.romaji, status: t.status, zoneId: t.zoneId, zoneName: t.zoneName })),
        })),
      zones: board.zones.map((z) => ({
        id: z.id, name: z.name, floorName: z.floorName, priority: z.priority,
        workStatus: z.workStatus, taskCount: z.taskCount,
        assignedLabels: z.assignedUserIds.map(aliasFor), // userId は出さずラベル化
      })),
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
    };
  }

  if (scopes.dash) {
    const rootZones = zones.filter((z) => !z.parentZoneId);
    const zoneRows = rootZones.map((z) => {
      const a = agg.get(z.id) ?? { progress: 0, issues: 0 };
      return { id: z.id, name: z.name, progress: a.progress, issues: a.issues };
    });
    const overall = zoneRows.length ? Math.round(zoneRows.reduce((s, z) => s + z.progress, 0) / zoneRows.length) : 0;
    const statusCounts = { todo: 0, progress: 0, done: 0, issue: 0 } as Record<string, number>;
    for (const t of tasks) statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
    // 予算・原価は一切含めない
    body.dash = { overallProgress: overall, zones: zoneRows, statusCounts };
  }

  return { status: 200, body };
}
