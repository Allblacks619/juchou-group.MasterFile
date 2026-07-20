import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  partnerLinks, PartnerLink, InsertPartnerLink,
  partnerLinkClientMaps, InsertPartnerLinkClientMap, PartnerLinkClientMap,
  partnerRosterSubmissions, PartnerRosterSubmission, InsertPartnerRosterSubmission,
  partnerRosterWorkers, PartnerRosterWorker, InsertPartnerRosterWorker,
} from "../../drizzle/schema.connect";

/**
 * コネクト層 (会社間連携) 専用のデータアクセス層 — Phase 2 (PLAN_v1.md §2.3-§2.6)。
 * 既存 server/db.ts には手を加えず、getDb() のみ再利用する (genba と同じ加算方針)。
 */

// ── partner_links ──

export async function createPartnerLink(data: InsertPartnerLink): Promise<PartnerLink | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(partnerLinks).values(data);
  const id = Number(result[0].insertId);
  return getPartnerLinkById(id);
}

export async function getPartnerLinkById(id: number): Promise<PartnerLink | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(partnerLinks).where(eq(partnerLinks.id, id)).limit(1);
  return rows[0];
}

export async function getPartnerLinkByToken(token: string): Promise<PartnerLink | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(partnerLinks).where(eq(partnerLinks.token, token)).limit(1);
  return rows[0];
}

/** 会社ペアの accepted/invited リンクを引く（無順序） */
export async function findPartnerLinkBetween(companyA: number, companyB: number): Promise<PartnerLink | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const lo = Math.min(companyA, companyB);
  const hi = Math.max(companyA, companyB);
  const rows = await db.select().from(partnerLinks).where(and(
    eq(partnerLinks.pairMinCompanyId, lo),
    eq(partnerLinks.pairMaxCompanyId, hi),
  )).limit(1);
  return rows[0];
}

/** 自社が関係する全リンク */
export async function listPartnerLinksByCompany(companyId: number): Promise<PartnerLink[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerLinks).where(or(
    eq(partnerLinks.requesterCompanyId, companyId),
    eq(partnerLinks.addresseeCompanyId, companyId),
  )).orderBy(desc(partnerLinks.createdAt));
}

export async function updatePartnerLink(id: number, data: Partial<InsertPartnerLink>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partnerLinks).set(data).where(eq(partnerLinks.id, id));
}

// ── partner_link_client_maps ──

export async function addPartnerLinkClientMap(data: InsertPartnerLinkClientMap): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(partnerLinkClientMaps).values(data);
}

export async function listPartnerLinkClientMaps(partnerLinkId: number): Promise<PartnerLinkClientMap[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerLinkClientMaps).where(eq(partnerLinkClientMaps.partnerLinkId, partnerLinkId));
}

// ── partner_roster_submissions ──

export async function createRosterSubmission(data: InsertPartnerRosterSubmission): Promise<PartnerRosterSubmission | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(partnerRosterSubmissions).values(data);
  const id = Number(result[0].insertId);
  return getRosterSubmissionById(id);
}

export async function getRosterSubmissionById(id: number): Promise<PartnerRosterSubmission | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(partnerRosterSubmissions).where(eq(partnerRosterSubmissions.id, id)).limit(1);
  return rows[0];
}

export async function updateRosterSubmission(id: number, data: Partial<InsertPartnerRosterSubmission>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partnerRosterSubmissions).set(data).where(eq(partnerRosterSubmissions.id, id));
}

/** 受領箱（自社宛て） */
export async function listRosterInbox(toCompanyId: number): Promise<PartnerRosterSubmission[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerRosterSubmissions)
    .where(eq(partnerRosterSubmissions.toCompanyId, toCompanyId))
    .orderBy(desc(partnerRosterSubmissions.createdAt));
}

/** 提出箱（自社発） */
export async function listRosterOutbox(fromCompanyId: number): Promise<PartnerRosterSubmission[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerRosterSubmissions)
    .where(eq(partnerRosterSubmissions.fromCompanyId, fromCompanyId))
    .orderBy(desc(partnerRosterSubmissions.createdAt));
}

// ── partner_roster_workers ──

export async function addRosterWorker(data: InsertPartnerRosterWorker): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(partnerRosterWorkers).values(data);
}

export async function listRosterWorkers(submissionId: number): Promise<PartnerRosterWorker[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(partnerRosterWorkers).where(eq(partnerRosterWorkers.submissionId, submissionId));
}

export async function getRosterWorkerById(id: number): Promise<PartnerRosterWorker | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(partnerRosterWorkers).where(eq(partnerRosterWorkers.id, id)).limit(1);
  return rows[0];
}

export async function updateRosterWorker(id: number, data: Partial<InsertPartnerRosterWorker>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(partnerRosterWorkers).set(data).where(eq(partnerRosterWorkers.id, id));
}
