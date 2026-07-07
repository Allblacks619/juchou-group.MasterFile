import { and, asc, eq, inArray } from "drizzle-orm";
import {
  genbaSites, GenbaSite, InsertGenbaSite,
  genbaFloors, GenbaFloor, InsertGenbaFloor,
  genbaZones, GenbaZone, InsertGenbaZone,
  genbaTasks, GenbaTask, InsertGenbaTask,
  genbaTaskEvents, GenbaTaskEvent, InsertGenbaTaskEvent,
  genbaTaskTemplates, GenbaTaskTemplate, InsertGenbaTaskTemplate,
  genbaTeams, GenbaTeam, InsertGenbaTeam,
  genbaTeamMembers, GenbaTeamMember, InsertGenbaTeamMember,
  genbaTaskAssignees, GenbaTaskAssignee, InsertGenbaTaskAssignee,
  genbaTaskTeams, GenbaTaskTeam, InsertGenbaTaskTeam,
  genbaInstructions, GenbaInstruction, InsertGenbaInstruction,
  genbaInstructionReads, GenbaInstructionRead, InsertGenbaInstructionRead,
  genbaUserSettings, GenbaUserSettings,
} from "../../drizzle/schema.genba";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * 現場ビジョン (genba) 専用のデータアクセス層。
 * 既存 server/db.ts には手を加えず、getDb() のみ再利用する (加算方針)。
 */

// ── genba_sites ──

export async function listGenbaSites(): Promise<GenbaSite[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(genbaSites).where(eq(genbaSites.archived, false)).orderBy(asc(genbaSites.createdAt));
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

export async function createGenbaZone(data: InsertGenbaZone): Promise<GenbaZone | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(genbaZones).values(data);
  return getGenbaZoneById(data.id);
}

export async function updateGenbaZone(
  id: string,
  patch: Partial<Pick<InsertGenbaZone, "name" | "polygon" | "priority" | "workStatus" | "parentZoneId">>,
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
  patch: Partial<Pick<InsertGenbaTask, "name" | "romaji" | "status" | "percent" | "priority" | "issueText" | "startDate" | "dueDate" | "memo" | "memoVisible" | "linkUrl" | "sortOrder">>,
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

// ── 割り当て可能ユーザー (既存 users テーブルを読み取り専用で参照) ──

export type AssignableUser = { id: number; name: string | null; appRole: string };

export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ id: users.id, name: users.name, appRole: users.appRole }).from(users).orderBy(asc(users.name));
  return rows as AssignableUser[];
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

export async function listGenbaTaskTemplates(): Promise<GenbaTaskTemplate[]> {
  const db = await getDb();
  if (!db) return [];
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
