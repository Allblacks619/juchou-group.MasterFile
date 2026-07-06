import { asc, eq } from "drizzle-orm";
import {
  genbaSites, GenbaSite, InsertGenbaSite,
  genbaUserSettings, GenbaUserSettings,
} from "../../drizzle/schema.genba";
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
