import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  genbaSites, GenbaSite, InsertGenbaSite,
  genbaFloors, GenbaFloor, InsertGenbaFloor,
  genbaZones, GenbaZone, InsertGenbaZone,
  genbaTasks, GenbaTask, InsertGenbaTask,
  genbaTaskEvents, GenbaTaskEvent, InsertGenbaTaskEvent,
  genbaTaskFiles, GenbaTaskFile, InsertGenbaTaskFile,
  genbaZoneFiles, GenbaZoneFile, InsertGenbaZoneFile,
  genbaFloorFiles, GenbaFloorFile, InsertGenbaFloorFile,
  genbaFloorPins, GenbaFloorPin, InsertGenbaFloorPin,
  genbaTaskTemplates, GenbaTaskTemplate, InsertGenbaTaskTemplate,
  genbaTeams, GenbaTeam, InsertGenbaTeam,
  genbaTeamMembers, GenbaTeamMember, InsertGenbaTeamMember,
  genbaTaskAssignees, GenbaTaskAssignee, InsertGenbaTaskAssignee,
  genbaTaskTeams, GenbaTaskTeam, InsertGenbaTaskTeam,
  genbaInstructions, GenbaInstruction, InsertGenbaInstruction,
  genbaInstructionReads, GenbaInstructionRead, InsertGenbaInstructionRead,
  genbaMaterialPresets, GenbaMaterialPreset, InsertGenbaMaterialPreset,
  genbaMaterialRequests, GenbaMaterialRequest, InsertGenbaMaterialRequest,
  genbaMaterialRequestItems, GenbaMaterialRequestItem, InsertGenbaMaterialRequestItem,
  genbaBudgets, GenbaBudget, InsertGenbaBudget,
  genbaBudgetAttendance, GenbaBudgetAttendance, InsertGenbaBudgetAttendance,
  genbaShares, GenbaShare, InsertGenbaShare,
  genbaActivityLogs, GenbaActivityLog, InsertGenbaActivityLog,
  genbaDispatches, GenbaDispatch, InsertGenbaDispatch,
  genbaDispatchAssignees, GenbaDispatchAssignee, InsertGenbaDispatchAssignee,
  genbaSiteWorkers, GenbaSiteWorker, InsertGenbaSiteWorker,
  genbaGuestAssignees, GenbaGuestAssignee, InsertGenbaGuestAssignee,
  genbaWorkerLinks, GenbaWorkerLink, InsertGenbaWorkerLink,
  genbaUserRoles, GenbaUserRole, InsertGenbaUserRole,
  genbaUserSettings, GenbaUserSettings,
} from "../../drizzle/schema.genba";
import { users, attendance, projects, employees } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * 現場ビジョン (genba) 専用のデータアクセス層。
 * 既存 server/db.ts には手を加えず、getDb() のみ再利用する (加算方針)。
 */

// ── genba_sites ──

export async function listGenbaSites(companyId?: number): Promise<GenbaSite[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(genbaSites.archived, false)];
  if (companyId != null) conds.push(eq(genbaSites.companyId, companyId));
  return db.select().from(genbaSites).where(and(...conds)).orderBy(asc(genbaSites.createdAt));
}

/** アーカイブ済み(削除された)現場の一覧。復元UI用。データは消えていない (archived=true) */
export async function listGenbaSitesArchived(companyId?: number): Promise<GenbaSite[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(genbaSites.archived, true)];
  if (companyId != null) conds.push(eq(genbaSites.companyId, companyId));
  return db.select().from(genbaSites).where(and(...conds)).orderBy(desc(genbaSites.updatedAt));
}

export async function getGenbaSiteById(id: string): Promise<GenbaSite | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaSites).where(eq(genbaSites.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createGenbaSite(data: InsertGenbaSite): Promise<GenbaSite | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaSites).values(data);
  return getGenbaSiteById(data.id);
}

export async function updateGenbaSite(id: string, patch: Partial<Pick<InsertGenbaSite, "name" | "projectId" | "driveUrl" | "archived">>): Promise<GenbaSite | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaSites).set(patch).where(eq(genbaSites.id, id));
  return getGenbaSiteById(id);
}

// ── genba_floors ──

export async function listGenbaFloorsBySite(siteId: string): Promise<GenbaFloor[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaFloors).where(eq(genbaFloors.siteId, siteId))
    .orderBy(asc(genbaFloors.sortOrder), asc(genbaFloors.createdAt));
}

export async function getGenbaFloorById(id: string): Promise<GenbaFloor | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaFloors).where(eq(genbaFloors.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createGenbaFloor(data: InsertGenbaFloor): Promise<GenbaFloor | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaFloors).values(data);
  return getGenbaFloorById(data.id);
}

export async function updateGenbaFloor(id: string, patch: Partial<Pick<InsertGenbaFloor, "name" | "sortOrder">>): Promise<GenbaFloor | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaFloors).set(patch).where(eq(genbaFloors.id, id));
  return getGenbaFloorById(id);
}

export async function deleteGenbaFloor(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaFloors).where(eq(genbaFloors.id, id));
}

// ── genba_zones ──

/**
 * MariaDB は JSON カラムを文字列で返し、drizzle mysql も自動パースしないため、
 * polygon を配列に正規化してから返す (クライアントが Pt[] として扱えるように)。
 */
export function normalizeZone(z: GenbaZone): GenbaZone {
  if (z && typeof z.polygon === "string") {
    try {
      return { ...z, polygon: JSON.parse(z.polygon) };
    } catch {
      return z;
    }
  }
  return z;
}

export async function listGenbaZonesByFloor(floorId: string): Promise<GenbaZone[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(genbaZones).where(eq(genbaZones.floorId, floorId)).orderBy(asc(genbaZones.createdAt));
  return rows.map(normalizeZone);
}

export async function getGenbaZoneById(id: string): Promise<GenbaZone | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaZones).where(eq(genbaZones.id, id)).limit(1);
  return rows[0] ? normalizeZone(rows[0]) : null;
}

/** 複数フロア配下のゾーンをまとめて取得 (配置ボード用) */
export async function listGenbaZonesByFloorIds(floorIds: string[]): Promise<GenbaZone[]> {
  const db = await getDb();
  if (!db || floorIds.length === 0) return [];
  const rows = await db.select().from(genbaZones).where(inArray(genbaZones.floorId, floorIds)).orderBy(asc(genbaZones.createdAt));
  return rows.map(normalizeZone);
}

export async function createGenbaZone(data: InsertGenbaZone): Promise<GenbaZone | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaZones).values(data);
  return getGenbaZoneById(data.id);
}

export async function updateGenbaZone(
  id: string,
  patch: Partial<Pick<InsertGenbaZone, "name" | "polygon" | "priority" | "workStatus" | "parentZoneId" | "color" | "fillOpacity">>,
): Promise<GenbaZone | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaZones).set(patch).where(eq(genbaZones.id, id));
  return getGenbaZoneById(id);
}

/**
 * ゾーンを子孫ゾーン・配下タスクごと削除 (プロトタイプの deleteZone と同挙動)。
 * 同フロアのゾーンを1回取得し、親子関係から部分木を辿って一括削除する。
 */
export async function deleteGenbaZoneCascade(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const target = await getGenbaZoneById(id);
  if (!target) return;
  const floorZones = await listGenbaZonesByFloor(target.floorId);
  const childrenOf = new Map<string, string[]>();
  for (const z of floorZones) {
    if (z.parentZoneId) {
      const arr = childrenOf.get(z.parentZoneId) || [];
      arr.push(z.id);
      childrenOf.set(z.parentZoneId, arr);
    }
  }
  const subtree: string[] = [];
  const stack = [id];
  while (stack.length) {
    const zid = stack.pop()!;
    subtree.push(zid);
    for (const c of childrenOf.get(zid) || []) stack.push(c);
  }
  await db.delete(genbaTasks).where(inArray(genbaTasks.zoneId, subtree));
  await db.delete(genbaZones).where(inArray(genbaZones.id, subtree));
}

/** フロア配下ゾーン群のタスクをまとめて取得 (進捗集計用) */
export async function listGenbaTasksByZoneIds(zoneIds: string[]): Promise<GenbaTask[]> {
  const db = await getDb();
  if (!db || zoneIds.length === 0) return [];
  return db.select().from(genbaTasks).where(inArray(genbaTasks.zoneId, zoneIds));
}

// ── genba_tasks (M2-C) ──

export async function listGenbaTasksByZone(zoneId: string): Promise<GenbaTask[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaTasks).where(eq(genbaTasks.zoneId, zoneId))
    .orderBy(asc(genbaTasks.sortOrder), asc(genbaTasks.createdAt));
}

export async function getGenbaTaskById(id: string): Promise<GenbaTask | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaTasks).where(eq(genbaTasks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createGenbaTask(data: InsertGenbaTask): Promise<GenbaTask | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaTasks).values(data);
  return getGenbaTaskById(data.id);
}

/** テンプレート展開などで複数タスクを一括作成 */
export async function createGenbaTasksBulk(rows: InsertGenbaTask[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (rows.length === 0) return;
  await db.insert(genbaTasks).values(rows);
}

export async function updateGenbaTask(
  id: string,
  patch: Partial<Pick<InsertGenbaTask, "name" | "romaji" | "status" | "percent" | "priority" | "issueText" | "startDate" | "dueDate" | "memo" | "memoVisible" | "linkUrl" | "sortOrder" | "parentTaskId">>,
): Promise<GenbaTask | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaTasks).set(patch).where(eq(genbaTasks.id, id));
  return getGenbaTaskById(id);
}

/** タスクを子孫タスク・イベントごと削除 */
export async function deleteGenbaTaskCascade(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const target = await getGenbaTaskById(id);
  if (!target) return;
  const zoneTasks = await listGenbaTasksByZone(target.zoneId);
  const childrenOf = new Map<string, string[]>();
  for (const t of zoneTasks) {
    if (t.parentTaskId) {
      const arr = childrenOf.get(t.parentTaskId) || [];
      arr.push(t.id);
      childrenOf.set(t.parentTaskId, arr);
    }
  }
  const subtree: string[] = [];
  const stack = [id];
  while (stack.length) {
    const tid = stack.pop()!;
    subtree.push(tid);
    for (const c of childrenOf.get(tid) || []) stack.push(c);
  }
  await db.delete(genbaTaskEvents).where(inArray(genbaTaskEvents.taskId, subtree));
  await db.delete(genbaTasks).where(inArray(genbaTasks.id, subtree));
}

// ── genba_task_events ──

/** MariaDBはJSON(photoKeys)を文字列で返すため配列へ正規化 */
function normalizeTaskEvent(e: GenbaTaskEvent): GenbaTaskEvent {
  if (e && typeof e.photoKeys === "string") {
    try {
      return { ...e, photoKeys: JSON.parse(e.photoKeys) };
    } catch {
      return e;
    }
  }
  return e;
}

export async function createGenbaTaskEvent(data: InsertGenbaTaskEvent): Promise<GenbaTaskEvent | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // id は varchar(24) のクライアント生成 (autoincrementではない)
  await db.insert(genbaTaskEvents).values(data);
  const rows = await db.select().from(genbaTaskEvents).where(eq(genbaTaskEvents.id, data.id)).limit(1);
  return rows[0] ? normalizeTaskEvent(rows[0]) : null;
}

export async function listGenbaTaskEvents(taskId: string): Promise<GenbaTaskEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(genbaTaskEvents).where(eq(genbaTaskEvents.taskId, taskId)).orderBy(asc(genbaTaskEvents.createdAt));
  return rows.map(normalizeTaskEvent);
}

// ── 作業ファイル (図面・資料。リンク/アップロード) ──
export async function listGenbaTaskFiles(taskId: string): Promise<GenbaTaskFile[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaTaskFiles).where(eq(genbaTaskFiles.taskId, taskId)).orderBy(asc(genbaTaskFiles.sortOrder), asc(genbaTaskFiles.createdAt));
}

export async function countGenbaTaskFilesByTaskIds(taskIds: string[]): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db || taskIds.length === 0) return new Map();
  const rows = await db.select({ taskId: genbaTaskFiles.taskId, n: sql<number>`count(*)` }).from(genbaTaskFiles)
    .where(inArray(genbaTaskFiles.taskId, taskIds)).groupBy(genbaTaskFiles.taskId);
  return new Map(rows.map((r) => [r.taskId, Number(r.n)]));
}

export async function createGenbaTaskFile(data: InsertGenbaTaskFile): Promise<GenbaTaskFile | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaTaskFiles).values(data);
  const rows = await db.select().from(genbaTaskFiles).where(eq(genbaTaskFiles.id, data.id)).limit(1);
  return rows[0] ?? null;
}

export async function getGenbaTaskFileById(id: string): Promise<GenbaTaskFile | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaTaskFiles).where(eq(genbaTaskFiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteGenbaTaskFile(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaTaskFiles).where(eq(genbaTaskFiles.id, id));
}

// ── エリア(工区)ごとの図面・資料 (genba_zone_files) ──
export async function listGenbaZoneFiles(zoneId: string): Promise<GenbaZoneFile[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaZoneFiles).where(eq(genbaZoneFiles.zoneId, zoneId)).orderBy(asc(genbaZoneFiles.sortOrder), asc(genbaZoneFiles.createdAt));
}

export async function countGenbaZoneFilesByZoneIds(zoneIds: string[]): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db || zoneIds.length === 0) return new Map();
  const rows = await db.select({ zoneId: genbaZoneFiles.zoneId, n: sql<number>`count(*)` }).from(genbaZoneFiles)
    .where(inArray(genbaZoneFiles.zoneId, zoneIds)).groupBy(genbaZoneFiles.zoneId);
  return new Map(rows.map((r) => [r.zoneId, Number(r.n)]));
}

export async function createGenbaZoneFile(data: InsertGenbaZoneFile): Promise<GenbaZoneFile | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaZoneFiles).values(data);
  const rows = await db.select().from(genbaZoneFiles).where(eq(genbaZoneFiles.id, data.id)).limit(1);
  return rows[0] ?? null;
}

export async function getGenbaZoneFileById(id: string): Promise<GenbaZoneFile | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaZoneFiles).where(eq(genbaZoneFiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteGenbaZoneFile(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaZoneFiles).where(eq(genbaZoneFiles.id, id));
}

// ── フロア(図面)ごとの共通ファイル (genba_floor_files) = 全エリア共通 ──
export async function listGenbaFloorFiles(floorId: string): Promise<GenbaFloorFile[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaFloorFiles).where(eq(genbaFloorFiles.floorId, floorId)).orderBy(asc(genbaFloorFiles.sortOrder), asc(genbaFloorFiles.createdAt));
}

export async function createGenbaFloorFile(data: InsertGenbaFloorFile): Promise<GenbaFloorFile | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaFloorFiles).values(data);
  const rows = await db.select().from(genbaFloorFiles).where(eq(genbaFloorFiles.id, data.id)).limit(1);
  return rows[0] ?? null;
}

export async function getGenbaFloorFileById(id: string): Promise<GenbaFloorFile | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaFloorFiles).where(eq(genbaFloorFiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteGenbaFloorFile(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaFloorFiles).where(eq(genbaFloorFiles.id, id));
}

// ── genba_floor_pins (図面上の位置ピン問題報告・M5段階3) ──
export async function listGenbaFloorPinsByFloor(floorId: string): Promise<GenbaFloorPin[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaFloorPins).where(eq(genbaFloorPins.floorId, floorId)).orderBy(desc(genbaFloorPins.createdAt));
}

export async function createGenbaFloorPin(data: InsertGenbaFloorPin): Promise<GenbaFloorPin | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaFloorPins).values(data);
  const rows = await db.select().from(genbaFloorPins).where(eq(genbaFloorPins.id, data.id)).limit(1);
  return rows[0] ?? null;
}

export async function getGenbaFloorPinById(id: string): Promise<GenbaFloorPin | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaFloorPins).where(eq(genbaFloorPins.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateGenbaFloorPin(
  id: string,
  patch: Partial<Pick<InsertGenbaFloorPin, "text" | "status" | "resolvedByUserId">>,
): Promise<GenbaFloorPin | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaFloorPins).set(patch).where(eq(genbaFloorPins.id, id));
  return getGenbaFloorPinById(id);
}

export async function deleteGenbaFloorPin(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaFloorPins).where(eq(genbaFloorPins.id, id));
}

/** ゲスト(現場名簿)の表示名を修正する。登録アカウントの氏名は変更しない (これは名簿の表示名のみ) */
export async function updateGenbaSiteWorkerName(id: string, displayName: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaSiteWorkers).set({ displayName, guestName: displayName }).where(eq(genbaSiteWorkers.id, id));
}

// ── 割り当て可能ユーザー (既存 users テーブルを読み取り専用で参照) ──

export type AssignableUser = { id: number; name: string | null; appRole: string };

/**
 * 割当可能な作業員一覧。
 * siteId 指定かつ現場が案件(projectId)にリンクされている場合は、
 * その案件の出面(attendance)に登録された作業員(users.employeeId 一致)のみを返す。
 * 未リンク/未指定なら全ユーザーを返す (従来動作)。
 */
export async function listAssignableUsers(siteId?: string, companyId?: number): Promise<AssignableUser[]> {
  const db = await getDb();
  if (!db) return [];
  if (siteId) {
    const site = await getGenbaSiteById(siteId);
    if (site?.projectId) {
      const conds = [eq(attendance.projectId, site.projectId)];
      if (companyId != null) conds.push(eq(users.companyId, companyId));
      const rows = await db
        .select({ id: users.id, name: users.name, appRole: users.appRole })
        .from(users)
        .innerJoin(attendance, eq(attendance.employeeId, users.employeeId))
        .where(and(...conds))
        .groupBy(users.id, users.name, users.appRole)
        .orderBy(asc(users.name));
      return rows as AssignableUser[];
    }
  }
  const base = db.select({ id: users.id, name: users.name, appRole: users.appRole }).from(users);
  const rows = companyId != null
    ? await base.where(eq(users.companyId, companyId)).orderBy(asc(users.name))
    : await base.orderBy(asc(users.name));
  return rows as AssignableUser[];
}

/** 指定IDのユーザー表示名 (担当者チップの名前解決用。出面フィルタに関係なく全ユーザーから引く) */
export async function listUserNamesByIds(ids: number[]): Promise<Map<number, string | null>> {
  const db = await getDb();
  if (!db || ids.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** 現場に連携できる工事案件(projects)の一覧 (案件ピッカー用)。active を先頭に新しい順 */
export async function listLinkableProjects(companyId?: number): Promise<{ id: number; name: string; status: string; startDate: Date | null; endDate: Date | null }[]> {
  const db = await getDb();
  if (!db) return [];
  const base = db
    .select({ id: projects.id, name: projects.name, status: projects.status, startDate: projects.startDate, endDate: projects.endDate })
    .from(projects);
  const rows = companyId != null
    ? await base.where(eq(projects.companyId, companyId)).orderBy(desc(projects.createdAt))
    : await base.orderBy(desc(projects.createdAt));
  return rows;
}

// ── genba_teams / genba_team_members ──

export async function listGenbaTeamsBySite(siteId: string): Promise<GenbaTeam[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaTeams).where(eq(genbaTeams.siteId, siteId)).orderBy(asc(genbaTeams.createdAt));
}

export async function getGenbaTeamById(id: string): Promise<GenbaTeam | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaTeams).where(eq(genbaTeams.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createGenbaTeam(data: InsertGenbaTeam): Promise<GenbaTeam | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaTeams).values(data);
  return getGenbaTeamById(data.id);
}

export async function updateGenbaTeam(id: string, patch: Partial<Pick<InsertGenbaTeam, "name">>): Promise<GenbaTeam | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaTeams).set(patch).where(eq(genbaTeams.id, id));
  return getGenbaTeamById(id);
}

/** 班を削除 (メンバー・タスク班割当も一緒に削除) */
export async function deleteGenbaTeamCascade(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaTeamMembers).where(eq(genbaTeamMembers.teamId, id));
  await db.delete(genbaTaskTeams).where(eq(genbaTaskTeams.teamId, id));
  await db.delete(genbaTeams).where(eq(genbaTeams.id, id));
}

export async function listGenbaTeamMembers(teamIds: string[]): Promise<GenbaTeamMember[]> {
  const db = await getDb();
  if (!db || teamIds.length === 0) return [];
  return db.select().from(genbaTeamMembers).where(inArray(genbaTeamMembers.teamId, teamIds));
}

export async function addGenbaTeamMember(data: InsertGenbaTeamMember): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(genbaTeamMembers)
    .where(and(eq(genbaTeamMembers.teamId, data.teamId), eq(genbaTeamMembers.userId, data.userId))).limit(1);
  if (existing[0]) return;
  await db.insert(genbaTeamMembers).values(data);
}

export async function removeGenbaTeamMember(teamId: string, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaTeamMembers).where(and(eq(genbaTeamMembers.teamId, teamId), eq(genbaTeamMembers.userId, userId)));
}

// ── genba_task_assignees / genba_task_teams ──

export async function listTaskAssigneesByTaskIds(taskIds: string[]): Promise<GenbaTaskAssignee[]> {
  const db = await getDb();
  if (!db || taskIds.length === 0) return [];
  return db.select().from(genbaTaskAssignees).where(inArray(genbaTaskAssignees.taskId, taskIds));
}

export async function listTaskTeamsByTaskIds(taskIds: string[]): Promise<GenbaTaskTeam[]> {
  const db = await getDb();
  if (!db || taskIds.length === 0) return [];
  return db.select().from(genbaTaskTeams).where(inArray(genbaTaskTeams.taskId, taskIds));
}

export async function addTaskAssignee(data: InsertGenbaTaskAssignee): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(genbaTaskAssignees)
    .where(and(eq(genbaTaskAssignees.taskId, data.taskId), eq(genbaTaskAssignees.userId, data.userId))).limit(1);
  if (existing[0]) return;
  await db.insert(genbaTaskAssignees).values(data);
}

export async function removeTaskAssignee(taskId: string, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaTaskAssignees).where(and(eq(genbaTaskAssignees.taskId, taskId), eq(genbaTaskAssignees.userId, userId)));
}

export async function addTaskTeam(data: InsertGenbaTaskTeam): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(genbaTaskTeams)
    .where(and(eq(genbaTaskTeams.taskId, data.taskId), eq(genbaTaskTeams.teamId, data.teamId))).limit(1);
  if (existing[0]) return;
  await db.insert(genbaTaskTeams).values(data);
}

export async function removeTaskTeam(taskId: string, teamId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaTaskTeams).where(and(eq(genbaTaskTeams.taskId, taskId), eq(genbaTaskTeams.teamId, teamId)));
}

// ── genba_instructions / genba_instruction_reads ──

export async function listGenbaInstructionsBySite(siteId: string): Promise<GenbaInstruction[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaInstructions).where(eq(genbaInstructions.siteId, siteId)).orderBy(asc(genbaInstructions.createdAt));
}

export async function getGenbaInstructionById(id: string): Promise<GenbaInstruction | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaInstructions).where(eq(genbaInstructions.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createGenbaInstruction(data: InsertGenbaInstruction): Promise<GenbaInstruction | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaInstructions).values(data);
  return getGenbaInstructionById(data.id);
}

export async function listGenbaInstructionReads(instructionIds: string[]): Promise<GenbaInstructionRead[]> {
  const db = await getDb();
  if (!db || instructionIds.length === 0) return [];
  return db.select().from(genbaInstructionReads).where(inArray(genbaInstructionReads.instructionId, instructionIds));
}

export async function addGenbaInstructionRead(data: InsertGenbaInstructionRead): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(genbaInstructionReads)
    .where(and(eq(genbaInstructionReads.instructionId, data.instructionId), eq(genbaInstructionReads.userId, data.userId))).limit(1);
  if (existing[0]) return;
  await db.insert(genbaInstructionReads).values(data);
}

// ── genba_task_templates ──

export async function listGenbaTaskTemplates(companyId?: number): Promise<GenbaTaskTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) {
    return db.select().from(genbaTaskTemplates).where(eq(genbaTaskTemplates.companyId, companyId)).orderBy(asc(genbaTaskTemplates.sortOrder));
  }
  return db.select().from(genbaTaskTemplates).orderBy(asc(genbaTaskTemplates.sortOrder));
}

/** テンプレートツリーを丸ごと置き換える (全削除 → 一括挿入) */
export async function replaceGenbaTaskTemplates(rows: InsertGenbaTaskTemplate[]): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaTaskTemplates);
  if (rows.length) await db.insert(genbaTaskTemplates).values(rows);
}

// ── genba_user_settings ──

export const GENBA_DEFAULT_USER_SETTINGS = {
  color: null as string | null,
  theme: "dark",
  lang: "ja",
  guideSeen: false,
};

export async function getGenbaUserSettings(userId: number): Promise<GenbaUserSettings | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaUserSettings).where(eq(genbaUserSettings.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertGenbaUserSettings(userId: number, patch: Partial<Pick<GenbaUserSettings, "color" | "theme" | "lang" | "guideSeen">>): Promise<GenbaUserSettings | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaUserSettings).values({
    userId,
    color: patch.color ?? GENBA_DEFAULT_USER_SETTINGS.color,
    theme: patch.theme ?? GENBA_DEFAULT_USER_SETTINGS.theme,
    lang: patch.lang ?? GENBA_DEFAULT_USER_SETTINGS.lang,
    guideSeen: patch.guideSeen ?? GENBA_DEFAULT_USER_SETTINGS.guideSeen,
  }).onDuplicateKeyUpdate({ set: Object.keys(patch).length ? patch : { userId } });
  return getGenbaUserSettings(userId);
}

// ── genba_material_presets ──

/** MariaDB は json 列を文字列で返すため parts を配列へ正規化する (normalizeZone と同方針) */
export function normalizeMaterialPreset(row: GenbaMaterialPreset): GenbaMaterialPreset & { parts: string[] } {
  let parts: string[] = [];
  const raw = row.parts as unknown;
  if (Array.isArray(raw)) parts = raw as string[];
  else if (typeof raw === "string" && raw.trim()) {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) parts = p; } catch { /* noop */ }
  }
  return { ...row, parts };
}

/** プリセット一覧。siteId 指定時は「全現場共通(null) + その現場」を返す */
export async function listGenbaMaterialPresets(siteId?: string | null, companyId?: number): Promise<(GenbaMaterialPreset & { parts: string[] })[]> {
  const db = await getDb();
  if (!db) return [];
  const siteCond = siteId
    ? or(isNull(genbaMaterialPresets.siteId), eq(genbaMaterialPresets.siteId, siteId))
    : undefined;
  const companyCond = companyId != null ? eq(genbaMaterialPresets.companyId, companyId) : undefined;
  const where = and(...[siteCond, companyCond].filter(Boolean) as any[]);
  const q = db.select().from(genbaMaterialPresets);
  const rows = where
    ? await q.where(where).orderBy(asc(genbaMaterialPresets.createdAt))
    : await q.orderBy(asc(genbaMaterialPresets.createdAt));
  return rows.map(normalizeMaterialPreset);
}

export async function getGenbaMaterialPresetById(id: string): Promise<GenbaMaterialPreset | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaMaterialPresets).where(eq(genbaMaterialPresets.id, id)).limit(1);
  return rows[0] ? normalizeMaterialPreset(rows[0]) : null;
}

export async function createGenbaMaterialPreset(data: InsertGenbaMaterialPreset): Promise<GenbaMaterialPreset | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaMaterialPresets).values(data);
  return getGenbaMaterialPresetById(data.id);
}

export async function updateGenbaMaterialPreset(id: string, patch: Partial<Pick<InsertGenbaMaterialPreset, "workName" | "parts" | "siteId">>): Promise<GenbaMaterialPreset | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaMaterialPresets).set(patch).where(eq(genbaMaterialPresets.id, id));
  return getGenbaMaterialPresetById(id);
}

export async function deleteGenbaMaterialPreset(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaMaterialPresets).where(eq(genbaMaterialPresets.id, id));
}

// ── genba_material_requests / genba_material_request_items ──

export async function listGenbaMaterialRequestsBySite(siteId: string): Promise<GenbaMaterialRequest[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaMaterialRequests)
    .where(eq(genbaMaterialRequests.siteId, siteId))
    .orderBy(desc(genbaMaterialRequests.createdAt));
}

export async function getGenbaMaterialRequestById(id: string): Promise<GenbaMaterialRequest | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaMaterialRequests).where(eq(genbaMaterialRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listGenbaMaterialRequestItems(requestIds: string[]): Promise<GenbaMaterialRequestItem[]> {
  const db = await getDb();
  if (!db || requestIds.length === 0) return [];
  return db.select().from(genbaMaterialRequestItems)
    .where(inArray(genbaMaterialRequestItems.requestId, requestIds))
    .orderBy(asc(genbaMaterialRequestItems.createdAt));
}

/** 依頼 + 明細を一括作成 */
export async function createGenbaMaterialRequest(
  request: InsertGenbaMaterialRequest,
  items: InsertGenbaMaterialRequestItem[],
): Promise<GenbaMaterialRequest | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaMaterialRequests).values(request);
  if (items.length) await db.insert(genbaMaterialRequestItems).values(items);
  return getGenbaMaterialRequestById(request.id);
}

export async function updateGenbaMaterialRequest(
  id: string,
  patch: Partial<Pick<InsertGenbaMaterialRequest, "status" | "orderedAt" | "deliveredAt" | "note">>,
): Promise<GenbaMaterialRequest | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaMaterialRequests).set(patch).where(eq(genbaMaterialRequests.id, id));
  return getGenbaMaterialRequestById(id);
}

/** 依頼を明細ごと削除 (取り消し) */
export async function deleteGenbaMaterialRequestCascade(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaMaterialRequestItems).where(eq(genbaMaterialRequestItems.requestId, id));
  await db.delete(genbaMaterialRequests).where(eq(genbaMaterialRequests.id, id));
}

export type MaterialAggregateRow = { name: string; unit: string; qty: number; count: number };

/**
 * Σ 集計 (発注用): 明細を name×unit で GROUP BY し、数量合計と依頼件数を返す。
 * 全タスク/明細をフロントに流さず DB 側で集計する (ROADMAP: Σ集計=DB側GROUP BY)。
 * boundary=null で全期間、指定時は request.createdAt >= boundary。pendingOnly で依頼中のみ。
 */
export async function aggregateGenbaMaterials(
  siteId: string,
  boundary: Date | null,
  pendingOnly: boolean,
): Promise<MaterialAggregateRow[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(genbaMaterialRequests.siteId, siteId)];
  if (boundary) conds.push(gte(genbaMaterialRequests.createdAt, boundary));
  if (pendingOnly) conds.push(eq(genbaMaterialRequests.status, "pending"));
  const rows = await db
    .select({
      name: genbaMaterialRequestItems.name,
      unit: genbaMaterialRequestItems.unit,
      qty: sql<number>`SUM(${genbaMaterialRequestItems.qty})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(genbaMaterialRequestItems)
    .innerJoin(genbaMaterialRequests, eq(genbaMaterialRequestItems.requestId, genbaMaterialRequests.id))
    .where(and(...conds))
    .groupBy(genbaMaterialRequestItems.name, genbaMaterialRequestItems.unit)
    .orderBy(desc(sql`SUM(${genbaMaterialRequestItems.qty})`));
  return rows.map((r) => ({
    name: r.name,
    unit: r.unit ?? "個",
    qty: Number(r.qty) || 0,
    count: Number(r.count) || 0,
  }));
}

// ── genba_budgets / genba_budget_attendance ──

export type BudgetRow = Omit<GenbaBudget, "preManDays"> & { preManDays: number };

/** decimal 列 (preManDays) は文字列で返るため数値へ正規化 */
export function normalizeBudget(row: GenbaBudget): BudgetRow {
  return { ...row, preManDays: Number(row.preManDays) || 0 };
}

export async function getGenbaBudget(siteId: string): Promise<BudgetRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaBudgets).where(eq(genbaBudgets.siteId, siteId)).limit(1);
  return rows[0] ? normalizeBudget(rows[0]) : null;
}

/** 予算行 (siteId が主キー) を upsert。存在しなければ既定値で作成 */
export async function upsertGenbaBudget(
  siteId: string,
  patch: Partial<Omit<InsertGenbaBudget, "siteId">>,
): Promise<BudgetRow | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const setPatch: Record<string, unknown> = { ...patch };
  await db.insert(genbaBudgets).values({ siteId, ...patch })
    .onDuplicateKeyUpdate({ set: Object.keys(setPatch).length ? setPatch : { siteId } });
  return getGenbaBudget(siteId);
}

export type BudgetAttendanceRow = Omit<GenbaBudgetAttendance, "manDays"> & { manDays: number };

export async function listGenbaBudgetAttendance(siteId: string): Promise<BudgetAttendanceRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(genbaBudgetAttendance)
    .where(eq(genbaBudgetAttendance.siteId, siteId))
    .orderBy(asc(genbaBudgetAttendance.date));
  return rows.map((r) => ({ ...r, manDays: Number(r.manDays) || 0 }));
}

export async function getGenbaBudgetAttendanceById(id: string): Promise<GenbaBudgetAttendance | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaBudgetAttendance).where(eq(genbaBudgetAttendance.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function addGenbaBudgetAttendance(data: InsertGenbaBudgetAttendance): Promise<GenbaBudgetAttendance | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaBudgetAttendance).values(data);
  return getGenbaBudgetAttendanceById(data.id);
}

export async function deleteGenbaBudgetAttendance(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaBudgetAttendance).where(eq(genbaBudgetAttendance.id, id));
}

/** 手入力出面の合計人工 (manual モード) */
export async function sumManualBudgetManDays(siteId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ total: sql<number>`SUM(${genbaBudgetAttendance.manDays})` })
    .from(genbaBudgetAttendance)
    .where(eq(genbaBudgetAttendance.siteId, siteId));
  return Number(rows[0]?.total) || 0;
}

/**
 * project モード: 既存 attendance を projectId × 期間で集計し人工数に換算。
 * hoursWorked は int×10 (80 = 8.0h = 1人工) のため SUM(hoursWorked)/80.0 が人工数。
 * period は YYYY-MM-DD。null の端は範囲条件から外す。
 */
export async function sumProjectAttendanceManDays(
  projectId: number,
  periodStart: string | null,
  periodEnd: string | null,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const conds = [eq(attendance.projectId, projectId)];
  if (periodStart) conds.push(gte(attendance.workDate, new Date(periodStart + "T00:00:00")));
  if (periodEnd) conds.push(lte(attendance.workDate, new Date(periodEnd + "T23:59:59")));
  const rows = await db
    .select({ hours: sql<number>`SUM(${attendance.hoursWorked})` })
    .from(attendance)
    .where(and(...conds));
  const hours = Number(rows[0]?.hours) || 0;
  return hours / 80.0;
}

/** projects の工期初期値提案用 (startDate/endDate) */
export async function getProjectPeriod(projectId: number): Promise<{ id: number; name: string; startDate: Date | null; endDate: Date | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: projects.id, name: projects.name, startDate: projects.startDate, endDate: projects.endDate })
    .from(projects).where(eq(projects.id, projectId)).limit(1);
  return rows[0] ?? null;
}

// ── genba_shares ──

/** json 列 (scopes) を文字列配列へ正規化 */
export function normalizeShare(row: GenbaShare): GenbaShare & { scopes: string[] } {
  let scopes: string[] = [];
  const raw = row.scopes as unknown;
  if (Array.isArray(raw)) scopes = raw as string[];
  else if (typeof raw === "string" && raw.trim()) {
    try { const p = JSON.parse(raw); if (Array.isArray(p)) scopes = p; } catch { /* noop */ }
  }
  return { ...row, scopes };
}

export async function listGenbaSharesBySite(siteId: string): Promise<(GenbaShare & { scopes: string[] })[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(genbaShares).where(eq(genbaShares.siteId, siteId)).orderBy(desc(genbaShares.createdAt));
  return rows.map(normalizeShare);
}

export async function getGenbaShareById(id: string): Promise<(GenbaShare & { scopes: string[] }) | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaShares).where(eq(genbaShares.id, id)).limit(1);
  return rows[0] ? normalizeShare(rows[0]) : null;
}

export async function getGenbaShareByToken(token: string): Promise<(GenbaShare & { scopes: string[] }) | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaShares).where(eq(genbaShares.token, token)).limit(1);
  return rows[0] ? normalizeShare(rows[0]) : null;
}

export async function createGenbaShare(data: InsertGenbaShare): Promise<(GenbaShare & { scopes: string[] }) | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaShares).values(data);
  return getGenbaShareById(data.id);
}

export async function deleteGenbaShare(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaShares).where(eq(genbaShares.id, id));
}

/** 共有ビュー用に現場のフロア/ゾーン/タスクをまとめて取得 (画像URL付与は呼び出し側) */
export async function collectSiteGraph(siteId: string): Promise<{ floors: GenbaFloor[]; zones: GenbaZone[]; tasks: GenbaTask[] }> {
  const floors = await listGenbaFloorsBySite(siteId);
  const zones = await listGenbaZonesByFloorIds(floors.map((f) => f.id));
  const tasks = await listGenbaTasksByZoneIds(zones.map((z) => z.id));
  return { floors, zones, tasks };
}

// ── genba_activity_logs (学習・改善提案の元データ) ──

/** payload を JSON 文字列で保存 (高頻度追記・autoincrement PK) */
export async function addGenbaActivityLog(type: string, byUserId: number | null, payload: unknown): Promise<void> {
  const db = await getDb();
  if (!db) return; // ログは失敗しても本処理を止めない (呼び出し側で握り潰す)
  // json 列には生の値を渡す (drizzle が直列化)。二重 stringify しないこと (polygon 等と同方針)
  await db.insert(genbaActivityLogs).values({ type, byUserId, payload } as InsertGenbaActivityLog);
}

/** payload を parse した利用ログを新しい順に取得 (直近 limit 件) */
export async function listGenbaActivityLogs(type: string | undefined, limit: number, companyId?: number): Promise<{ id: number; type: string; byUserId: number | null; payload: any; createdAt: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    type ? eq(genbaActivityLogs.type, type) : undefined,
    companyId != null ? eq(genbaActivityLogs.companyId, companyId) : undefined,
  ].filter(Boolean) as any[];
  const base = db.select().from(genbaActivityLogs);
  const rows = conds.length
    ? await base.where(and(...conds)).orderBy(desc(genbaActivityLogs.createdAt)).limit(limit)
    : await base.orderBy(desc(genbaActivityLogs.createdAt)).limit(limit);
  return rows.map((r) => {
    let payload: any = r.payload;
    if (typeof payload === "string") { try { payload = JSON.parse(payload); } catch { /* keep raw */ } }
    return { id: r.id, type: r.type, byUserId: r.byUserId, payload, createdAt: r.createdAt };
  });
}

// ── genba_dispatches (今日の急ぎ手配) ──

export async function getGenbaDispatchById(id: string): Promise<GenbaDispatch | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaDispatches).where(eq(genbaDispatches.id, id)).limit(1);
  return rows[0] ?? null;
}

/** 手配 + 担当作業員を一括作成 */
export async function createGenbaDispatch(
  dispatch: InsertGenbaDispatch,
  assignees: InsertGenbaDispatchAssignee[],
): Promise<GenbaDispatch | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaDispatches).values(dispatch);
  if (assignees.length) await db.insert(genbaDispatchAssignees).values(assignees);
  return getGenbaDispatchById(dispatch.id);
}

/** 現場の手配一覧 (date 指定でその日のみ)。新しい順 */
export async function listGenbaDispatchesBySite(siteId: string, date?: string): Promise<GenbaDispatch[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(genbaDispatches.siteId, siteId)];
  if (date) conds.push(eq(genbaDispatches.date, date));
  return db.select().from(genbaDispatches).where(and(...conds)).orderBy(desc(genbaDispatches.createdAt));
}

export async function listGenbaDispatchAssignees(dispatchIds: string[]): Promise<GenbaDispatchAssignee[]> {
  const db = await getDb();
  if (!db || dispatchIds.length === 0) return [];
  return db.select().from(genbaDispatchAssignees).where(inArray(genbaDispatchAssignees.dispatchId, dispatchIds));
}

export async function updateGenbaDispatch(id: string, patch: Partial<Pick<InsertGenbaDispatch, "done" | "memo">>): Promise<GenbaDispatch | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaDispatches).set(patch).where(eq(genbaDispatches.id, id));
  return getGenbaDispatchById(id);
}

/** 手配を担当ごと削除 */
export async function deleteGenbaDispatchCascade(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaDispatchAssignees).where(eq(genbaDispatchAssignees.dispatchId, id));
  await db.delete(genbaDispatches).where(eq(genbaDispatches.id, id));
}

// ── genba_site_workers / genba_guest_assignees (G1 現場名簿) ──

/** 出面ゲスト削除トンボストーンの接頭辞 (server/routers.ts と同値。名簿から除外する) */
const REMOVED_GUEST_PREFIX = "__attendance_removed_guest__:";

export type SiteRosterEntry = {
  /** genba_site_workers.id。案件未連携のフォールバック時は null */
  siteWorkerId: string | null;
  kind: "registered" | "guest";
  /** users.id (登録作業員のみ。アカウント無し従業員/ゲストは null) */
  userId: number | null;
  employeeId: number | null;
  displayName: string;
  /** users.appRole (種別ラベル用。ゲストは null) */
  appRole: string | null;
  /** この現場での役割 (genba_site_workers.role)。リンク発行時の既定権限 */
  workerRole: string;
};

/**
 * 現場の出面(attendance)から「この現場に入っている人」を導出する。
 * - 登録作業員: attendance.employeeId → employees (→ users LEFT JOIN)
 * - ゲスト: attendance.guestName (employeeId null)。削除トンボストーンは除外
 * 導出した人を genba_site_workers へ upsert して安定IDを与え、名簿として返す。
 * 現場が案件未連携 (projectId null) の場合は null を返す (呼び出し側で全ユーザーへフォールバック)。
 */
export async function syncSiteRosterFromAttendance(siteId: string, genId: () => string): Promise<SiteRosterEntry[] | null> {
  const db = await getDb();
  if (!db) return [];
  const site = await getGenbaSiteById(siteId);
  if (!site?.projectId) return null;

  // 出面上の登録作業員 (employees 起点。users アカウントが無い従業員も含める)
  const regRows = await db
    .select({
      employeeId: attendance.employeeId,
      empName: employees.nameKanji,
      userId: users.id,
      userName: users.name,
      appRole: users.appRole,
    })
    .from(attendance)
    .innerJoin(employees, eq(employees.id, attendance.employeeId))
    .leftJoin(users, eq(users.employeeId, attendance.employeeId))
    .where(eq(attendance.projectId, site.projectId))
    .groupBy(attendance.employeeId, employees.nameKanji, users.id, users.name, users.appRole);

  // 出面上のゲスト (トンボストーン除外)
  const guestRows = await db
    .select({ guestName: attendance.guestName })
    .from(attendance)
    .where(and(
      eq(attendance.projectId, site.projectId),
      isNull(attendance.employeeId),
      sql`${attendance.guestName} IS NOT NULL`,
      sql`${attendance.guestName} NOT LIKE ${REMOVED_GUEST_PREFIX + "%"}`,
    ))
    .groupBy(attendance.guestName);

  // 既存名簿を1回読み、JS側で突き合わせて upsert (unique が NULL を重複扱いしないため)
  const existing = await db.select().from(genbaSiteWorkers).where(eq(genbaSiteWorkers.siteId, siteId));
  const byUser = new Map(existing.filter((w) => w.userId != null).map((w) => [w.userId as number, w]));
  const byEmployee = new Map(existing.filter((w) => w.userId == null && w.employeeId != null).map((w) => [w.employeeId as number, w]));
  const byGuest = new Map(existing.filter((w) => w.guestName != null).map((w) => [w.guestName as string, w]));

  const inserts: InsertGenbaSiteWorker[] = [];
  const roster: SiteRosterEntry[] = [];

  for (const r of regRows) {
    if (r.employeeId == null) continue;
    const displayName = (r.userName || r.empName || `employee#${r.employeeId}`).trim();
    let row = r.userId != null ? byUser.get(r.userId) : byEmployee.get(r.employeeId);
    if (!row) {
      const id = genId();
      inserts.push({ id, siteId, userId: r.userId ?? null, employeeId: r.employeeId, guestName: null, kind: "registered", displayName, active: true });
      row = { id, role: "worker" } as GenbaSiteWorker;
      if (r.userId != null) byUser.set(r.userId, row); else byEmployee.set(r.employeeId, row);
    }
    roster.push({ siteWorkerId: row.id, kind: "registered", userId: r.userId ?? null, employeeId: r.employeeId, displayName, appRole: r.appRole ?? null, workerRole: (row as any).role ?? "worker" });
  }

  for (const g of guestRows) {
    const name = (g.guestName || "").trim();
    if (!name) continue;
    let row = byGuest.get(name);
    if (!row) {
      const id = genId();
      inserts.push({ id, siteId, userId: null, employeeId: null, guestName: name, kind: "guest", displayName: name, active: true });
      row = { id, role: "worker" } as GenbaSiteWorker;
      byGuest.set(name, row);
    }
    roster.push({ siteWorkerId: row.id, kind: "guest", userId: null, employeeId: null, displayName: name, appRole: null, workerRole: (row as any).role ?? "worker" });
  }

  if (inserts.length) await db.insert(genbaSiteWorkers).values(inserts);
  roster.sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
  return roster;
}

export async function getGenbaSiteWorkerById(id: string): Promise<GenbaSiteWorker | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaSiteWorkers).where(eq(genbaSiteWorkers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listGenbaSiteWorkersByIds(ids: string[]): Promise<GenbaSiteWorker[]> {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(genbaSiteWorkers).where(inArray(genbaSiteWorkers.id, ids));
}

export async function listGenbaSiteWorkersBySite(siteId: string): Promise<GenbaSiteWorker[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaSiteWorkers).where(eq(genbaSiteWorkers.siteId, siteId)).orderBy(asc(genbaSiteWorkers.displayName));
}

export async function listGuestAssigneesByTaskIds(taskIds: string[]): Promise<GenbaGuestAssignee[]> {
  const db = await getDb();
  if (!db || taskIds.length === 0) return [];
  return db.select().from(genbaGuestAssignees).where(inArray(genbaGuestAssignees.taskId, taskIds));
}

export async function addGuestAssignee(data: InsertGenbaGuestAssignee): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(genbaGuestAssignees)
    .where(and(eq(genbaGuestAssignees.taskId, data.taskId), eq(genbaGuestAssignees.siteWorkerId, data.siteWorkerId))).limit(1);
  if (existing[0]) return;
  await db.insert(genbaGuestAssignees).values(data);
}

export async function removeGuestAssignee(taskId: string, siteWorkerId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaGuestAssignees).where(and(eq(genbaGuestAssignees.taskId, taskId), eq(genbaGuestAssignees.siteWorkerId, siteWorkerId)));
}

/** 名簿削除に伴い、その作業員(ゲスト)の全作業への割当をまとめて解除する */
export async function deleteGuestAssigneesBySiteWorker(siteWorkerId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaGuestAssignees).where(eq(genbaGuestAssignees.siteWorkerId, siteWorkerId));
}

/** 名簿(現場作業員)の行を削除する。呼び出し側で割当・リンクの後始末を済ませておくこと */
export async function deleteGenbaSiteWorker(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaSiteWorkers).where(eq(genbaSiteWorkers.id, id));
}

// ── genba_worker_links (G2 作業員専用リンク) ──

export async function getGenbaWorkerLinkById(id: string): Promise<GenbaWorkerLink | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaWorkerLinks).where(eq(genbaWorkerLinks.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getGenbaWorkerLinkByToken(token: string): Promise<GenbaWorkerLink | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaWorkerLinks).where(eq(genbaWorkerLinks.token, token)).limit(1);
  return rows[0] ?? null;
}

export async function getGenbaWorkerLinkBySiteWorker(siteWorkerId: string): Promise<GenbaWorkerLink | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaWorkerLinks).where(eq(genbaWorkerLinks.siteWorkerId, siteWorkerId)).limit(1);
  return rows[0] ?? null;
}

export async function listGenbaWorkerLinksBySite(siteId: string): Promise<GenbaWorkerLink[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaWorkerLinks).where(eq(genbaWorkerLinks.siteId, siteId)).orderBy(asc(genbaWorkerLinks.createdAt));
}

export async function createGenbaWorkerLink(data: InsertGenbaWorkerLink): Promise<GenbaWorkerLink | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaWorkerLinks).values(data);
  return getGenbaWorkerLinkById(data.id);
}

export async function updateGenbaWorkerLink(
  id: string,
  patch: Partial<Pick<InsertGenbaWorkerLink, "token" | "role" | "active" | "expiresAt" | "lastAccessAt">>,
): Promise<GenbaWorkerLink | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaWorkerLinks).set(patch).where(eq(genbaWorkerLinks.id, id));
  return getGenbaWorkerLinkById(id);
}

export async function deleteGenbaWorkerLink(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaWorkerLinks).where(eq(genbaWorkerLinks.id, id));
}

/** 最終アクセスの打刻 (公開viewごと。失敗は無視できるよう分離) */
export async function touchGenbaWorkerLinkAccess(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(genbaWorkerLinks).set({ lastAccessAt: new Date() }).where(eq(genbaWorkerLinks.id, id));
}

/** 指定ユーザーのタスク割当 (直接) をタスクID集合で返す (作業員リンクのスコープ判定用) */
export async function listTaskIdsAssignedToUser(taskIds: string[], userId: number): Promise<Set<string>> {
  const db = await getDb();
  if (!db || taskIds.length === 0) return new Set();
  const rows = await db.select({ taskId: genbaTaskAssignees.taskId }).from(genbaTaskAssignees)
    .where(and(inArray(genbaTaskAssignees.taskId, taskIds), eq(genbaTaskAssignees.userId, userId)));
  return new Set(rows.map((r) => r.taskId));
}

/** 指定名簿行(ゲスト)のタスク割当をタスクID集合で返す */
export async function listTaskIdsAssignedToGuest(taskIds: string[], siteWorkerId: string): Promise<Set<string>> {
  const db = await getDb();
  if (!db || taskIds.length === 0) return new Set();
  const rows = await db.select({ taskId: genbaGuestAssignees.taskId }).from(genbaGuestAssignees)
    .where(and(inArray(genbaGuestAssignees.taskId, taskIds), eq(genbaGuestAssignees.siteWorkerId, siteWorkerId)));
  return new Set(rows.map((r) => r.taskId));
}

// ── genba_user_roles (G3 genba内役割上書き) ──

export async function getGenbaUserRole(userId: number): Promise<GenbaUserRole | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(genbaUserRoles).where(eq(genbaUserRoles.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function listGenbaUserRoles(companyId?: number): Promise<GenbaUserRole[]> {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) {
    // genba_user_roles は companyId を持たないため users との join で会社スコープを導出
    const rows = await db
      .select({
        userId: genbaUserRoles.userId,
        role: genbaUserRoles.role,
        updatedByUserId: genbaUserRoles.updatedByUserId,
        createdAt: genbaUserRoles.createdAt,
        updatedAt: genbaUserRoles.updatedAt,
      })
      .from(genbaUserRoles)
      .innerJoin(users, eq(users.id, genbaUserRoles.userId))
      .where(eq(users.companyId, companyId));
    return rows as GenbaUserRole[];
  }
  return db.select().from(genbaUserRoles);
}

export async function setGenbaUserRole(userId: number, role: string, updatedByUserId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaUserRoles).values({ userId, role, updatedByUserId })
    .onDuplicateKeyUpdate({ set: { role, updatedByUserId } });
}

export async function deleteGenbaUserRole(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(genbaUserRoles).where(eq(genbaUserRoles.userId, userId));
}

/** appRole が admin 級のユーザーID一覧 (最後の管理者ガード用) */
export async function listAppAdminUserIds(companyId?: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const roleCond = or(eq(users.appRole, "super_admin" as any), eq(users.appRole, "admin" as any));
  const rows = await db.select({ id: users.id }).from(users)
    .where(companyId != null ? and(roleCond, eq(users.companyId, companyId)) : roleCond);
  return rows.map((r) => r.id);
}

/** 名簿行の現場内役割 (worker/leader) を更新。専用リンク発行時の既定権限になる */
export async function updateGenbaSiteWorkerRole(id: string, role: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaSiteWorkers).set({ role }).where(eq(genbaSiteWorkers.id, id));
}

/**
 * 会社間連携の名寄せ結果を反映 (Phase 2, PLAN_v1.md §2.6)。
 * ゲスト行を「他社所属の作業員」へ格上げする（guestName 文字列一致依存からの脱却）。
 */
export async function updateGenbaSiteWorkerExternalRef(
  id: string,
  data: { externalCompanyId: number | null; externalEmployeeRef: number | null; ccusNumber: string | null },
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(genbaSiteWorkers).set(data).where(eq(genbaSiteWorkers.id, id));
}

/** users.appRole の取得 (オーナー=super_admin の保護判定用) */
export async function getUserAppRoleById(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ appRole: users.appRole }).from(users).where(eq(users.id, userId)).limit(1);
  return (rows[0]?.appRole as string) ?? null;
}
