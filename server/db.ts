import { eq, and, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, User,
  InsertInvitation, invitations,
  InsertCompanyProfile, companyProfile,
  InsertEmployee, employees,
  InsertQualification, qualifications,
  InsertDocument, documents,
} from "../drizzle/schema";
import { ENV } from './_core/env';

export type UserRecord = User;

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ── Users ──

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (user.appRole !== undefined) {
      values.appRole = user.appRole;
      updateSet.appRole = user.appRole;
    } else if (user.openId === ENV.ownerOpenId) {
      values.appRole = 'admin';
      updateSet.appRole = 'admin';
    }

    if (user.loginId !== undefined) {
      values.loginId = user.loginId;
      updateSet.loginId = user.loginId;
    }

    if (user.passwordHash !== undefined) {
      values.passwordHash = user.passwordHash;
      updateSet.passwordHash = user.passwordHash;
    }

    if (user.mustChangePassword !== undefined) {
      values.mustChangePassword = user.mustChangePassword;
      updateSet.mustChangePassword = user.mustChangePassword;
    }

    if (user.employeeId !== undefined) {
      values.employeeId = user.employeeId;
      updateSet.employeeId = user.employeeId;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByLoginId(loginId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.loginId, loginId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({
    passwordHash,
    mustChangePassword: false,
  }).where(eq(users.id, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users);
}

// ── Invitations ──

export async function createInvitation(data: InsertInvitation) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(invitations).values(data);
  return data;
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function markInvitationUsed(token: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(invitations)
    .set({ status: "used", usedAt: new Date(), usedBy: userId })
    .where(eq(invitations.token, token));
}

export async function getInvitationsByCreator(createdBy: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invitations).where(eq(invitations.createdBy, createdBy));
}

export async function getAllInvitations() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invitations);
}

// ── Company Profile ──

export async function getCompanyProfile() {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companyProfile).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertCompanyProfile(data: InsertCompanyProfile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getCompanyProfile();
  if (existing) {
    await db.update(companyProfile).set({
      ...data,
      updatedAt: new Date(),
    }).where(eq(companyProfile.id, existing.id));
    return { ...existing, ...data };
  } else {
    await db.insert(companyProfile).values(data);
    return data;
  }
}

// ── Employees ──

export async function createEmployee(data: InsertEmployee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employees).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getEmployeeByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employees).where(eq(employees.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllEmployees() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employees);
}

export async function updateEmployee(id: number, data: Partial<InsertEmployee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ ...data, updatedAt: new Date() }).where(eq(employees.id, id));
  return getEmployeeById(id);
}

export async function deleteEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(employees).where(eq(employees.id, id));
}

// ── Qualifications ──

export async function getQualificationsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(qualifications).where(eq(qualifications.employeeId, employeeId));
}

export async function createQualification(data: InsertQualification) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(qualifications).values(data);
  return { id: result[0].insertId, ...data };
}

export async function updateQualification(id: number, data: Partial<InsertQualification>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(qualifications).set({ ...data, updatedAt: new Date() }).where(eq(qualifications.id, id));
}

export async function deleteQualification(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(qualifications).where(eq(qualifications.id, id));
}

// ── Documents ──

export async function getDocumentsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.employeeId, employeeId));
}

export async function createDocument(data: InsertDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(documents).values(data);
  return { id: result[0].insertId, ...data };
}

export async function updateDocument(id: number, data: Partial<InsertDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(documents).set({ ...data, updatedAt: new Date() }).where(eq(documents.id, id));
}

export async function deleteDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(documents).where(eq(documents.id, id));
}

export async function getExpiringDocuments(daysAhead: number) {
  const db = await getDb();
  if (!db) return [];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);
  return db.select().from(documents)
    .where(
      and(
        lt(documents.expiryDate, futureDate),
        eq(documents.docStatus, "valid")
      )
    );
}
