import { eq, and, lt, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, User,
  InsertInvitation, invitations,
  InsertCompanyProfile, companyProfile,
  InsertEmployee, employees,
  InsertQualification, qualifications,
  InsertDocument, documents,
  InsertClient, clients,
  InsertProject, projects,
  InsertEmployeeRate, employeeRates,
  InsertAttendance, attendance,
  InsertInvoice, invoices,
  InsertInvoiceItem, invoiceItems,
  projectMembers, InsertProjectMember,
  InsertProjectClosing, projectClosings,
  InsertClosingSubmission, closingSubmissions,
  InsertEmployeePayment, employeePayments,
  InsertAuditLog, auditLogs,
  workerInvoices, InsertWorkerInvoice,
  workerInvoiceItems, InsertWorkerInvoiceItem,
  workerInvoiceSnapshots, InsertWorkerInvoiceSnapshot,
  invoiceSupportingDocuments, InsertInvoiceSupportingDocument,
  workerBaseRates,
  InsertWorkerBaseRate,
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

// ── Worker Base Rates ──

export async function createWorkerBaseRate(data: InsertWorkerBaseRate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workerBaseRates).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getWorkerBaseRateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workerBaseRates).where(eq(workerBaseRates.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getWorkerBaseRatesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerBaseRates).where(eq(workerBaseRates.employeeId, employeeId));
}

export async function getAllWorkerBaseRates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerBaseRates);
}

export async function updateWorkerBaseRate(id: number, data: Partial<InsertWorkerBaseRate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workerBaseRates).set({ ...data, updatedAt: new Date() }).where(eq(workerBaseRates.id, id));
  return getWorkerBaseRateById(id);
}

export async function deleteWorkerBaseRate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(workerBaseRates).where(eq(workerBaseRates.id, id));
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
  if (!db) {
    console.warn("[Database] Cannot create invitation: database not available");
    return data;
  }
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
  const results = await db.select().from(invitations).where(eq(invitations.createdBy, createdBy));
  // Strip tempPassword from list results for security
  return results.map(({ tempPassword, ...rest }) => rest);
}

export async function getAllInvitations() {
  const db = await getDb();
  if (!db) return [];
  const results = await db.select().from(invitations);
  // Strip tempPassword from list results for security
  return results.map(({ tempPassword, ...rest }) => rest);
}

export async function deleteExpiredInvitations() {
  const db = await getDb();
  if (!db) return 0;
  const now = new Date();
  const result = await db.delete(invitations).where(
    and(
      sql`${invitations.expiresAt} < ${now}`,
      eq(invitations.status, "pending")
    )
  );
  return result[0].affectedRows ?? 0;
}

export async function deleteInvitation(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invitations).where(eq(invitations.id, id));
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

// ── Clients ──

export async function createClient(data: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllClients() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clients);
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set({ ...data, updatedAt: new Date() }).where(eq(clients.id, id));
  return getClientById(id);
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(clients).where(eq(clients.id, id));
}

// ── Projects ──

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllProjects() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects);
}

export async function updateProject(id: number, data: Partial<InsertProject>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id));
  return getProjectById(id);
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projects).where(eq(projects.id, id));
}

// ── Employee Rates ──

export async function createEmployeeRate(data: InsertEmployeeRate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(employeeRates).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getEmployeeRateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employeeRates).where(eq(employeeRates.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getRatesByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employeeRates).where(and(
    eq(employeeRates.scopeType, "project"),
    eq(employeeRates.projectId, projectId),
  ));
}

export async function getRatesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employeeRates).where(eq(employeeRates.employeeId, employeeId));
}

export async function getRatesByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employeeRates).where(and(
    eq(employeeRates.scopeType, "client"),
    eq(employeeRates.clientId, clientId),
  ));
}

export async function getAllEmployeeRates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employeeRates);
}

export async function updateEmployeeRate(id: number, data: Partial<InsertEmployeeRate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employeeRates).set({ ...data, updatedAt: new Date() }).where(eq(employeeRates.id, id));
  return getEmployeeRateById(id);
}

export async function deleteEmployeeRate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(employeeRates).where(eq(employeeRates.id, id));
}

// ── Attendance ──

export async function createAttendance(data: InsertAttendance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(attendance).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getAttendanceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAttendanceByDateRange(startDate: Date, endDate: Date, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    gte(attendance.workDate, startDate),
    lte(attendance.workDate, endDate),
  ];
  if (projectId) conditions.push(eq(attendance.projectId, projectId));
  return db.select().from(attendance).where(and(...conditions));
}

export async function getAttendanceByEmployee(employeeId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(attendance.employeeId, employeeId)];
  if (startDate) conditions.push(gte(attendance.workDate, startDate));
  if (endDate) conditions.push(lte(attendance.workDate, endDate));
  return db.select().from(attendance).where(and(...conditions));
}

export async function getAttendanceByProject(projectId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(attendance.projectId, projectId)];
  if (startDate) conditions.push(gte(attendance.workDate, startDate));
  if (endDate) conditions.push(lte(attendance.workDate, endDate));
  return db.select().from(attendance).where(and(...conditions));
}

export async function updateAttendance(id: number, data: Partial<InsertAttendance>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(attendance).set({ ...data, updatedAt: new Date() }).where(eq(attendance.id, id));
  return getAttendanceById(id);
}

export async function deleteAttendance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(attendance).where(eq(attendance.id, id));
}

/** Delete attendance by key (employee/guest + project + date) */
export async function deleteAttendanceByKey(data: {
  employeeId: number | null;
  guestName: string | null;
  projectId: number;
  workDate: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const workDateStart = new Date(data.workDate);
  workDateStart.setHours(0, 0, 0, 0);
  const workDateEnd = new Date(data.workDate);
  workDateEnd.setHours(23, 59, 59, 999);
  
  const conditions = [
    eq(attendance.projectId, data.projectId),
    gte(attendance.workDate, workDateStart),
    lte(attendance.workDate, workDateEnd),
  ];
  
  if (data.employeeId) {
    conditions.push(eq(attendance.employeeId, data.employeeId));
  } else if (data.guestName) {
    conditions.push(eq(attendance.guestName, data.guestName));
  }
  
  await db.delete(attendance).where(and(...conditions));
}

/** Upsert attendance: if same employee+project+date+shift exists, update; else insert */
export async function upsertAttendance(data: InsertAttendance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if record exists for same employee/guest, project, date
  const workDateStart = new Date(data.workDate);
  workDateStart.setHours(0, 0, 0, 0);
  const workDateEnd = new Date(data.workDate);
  workDateEnd.setHours(23, 59, 59, 999);
  
  const conditions = [
    eq(attendance.projectId, data.projectId),
    gte(attendance.workDate, workDateStart),
    lte(attendance.workDate, workDateEnd),
  ];
  
  if (data.employeeId) {
    conditions.push(eq(attendance.employeeId, data.employeeId));
  } else if (data.guestName) {
    conditions.push(eq(attendance.guestName, data.guestName));
  }
  
  const existing = await db.select().from(attendance).where(
    and(...conditions)
  ).limit(1);
  
  if (existing.length > 0) {
    await db.update(attendance).set({
      hoursWorked: data.hoursWorked,
      overtimeHours: data.overtimeHours,
      workType: data.workType,
      shiftType: data.shiftType,
      notes: data.notes,
      guestName: data.guestName,
      updatedAt: new Date(),
    }).where(eq(attendance.id, existing[0].id));
    return { ...existing[0], ...data };
  } else {
    const result = await db.insert(attendance).values(data);
    return { id: result[0].insertId, ...data };
  }
}

// ── Invoices ──

export async function createInvoice(data: InsertInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoices).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllInvoices() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoices);
}

export async function getInvoicesByClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoices).where(eq(invoices.clientId, clientId));
}

export async function updateInvoice(id: number, data: Partial<InsertInvoice>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoices).set({ ...data, updatedAt: new Date() }).where(eq(invoices.id, id));
  return getInvoiceById(id);
}

export async function deleteInvoice(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Delete items first
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  await db.delete(invoices).where(eq(invoices.id, id));
}

// ── Invoice Items ──

export async function createInvoiceItem(data: InsertInvoiceItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(invoiceItems).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getInvoiceItemsByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

export async function deleteInvoiceItemsByInvoice(invoiceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
}

/** Generate next invoice number for a given month */
export async function getNextInvoiceNumber(yearMonth: string): Promise<string> {
  const db = await getDb();
  if (!db) return `INV-${yearMonth}-001`;
  const prefix = `INV-${yearMonth}-`;
  const existing = await db.select().from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${prefix + '%'}`)
  const maxNum = existing.reduce((max, inv) => {
    const num = parseInt(inv.invoiceNumber.replace(prefix, ""), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

// ── Project Members ──

export async function getProjectMembers(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
}

export async function getProjectsByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectMembers).where(
    and(eq(projectMembers.employeeId, employeeId), eq(projectMembers.isActive, true))
  );
}

export async function addProjectMember(data: InsertProjectMember) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Check if already exists
  const existing = await db.select().from(projectMembers).where(
    and(eq(projectMembers.projectId, data.projectId), eq(projectMembers.employeeId, data.employeeId))
  ).limit(1);
  if (existing.length > 0) {
    // Reactivate if deactivated
    await db.update(projectMembers).set({ isActive: true, updatedAt: new Date() }).where(eq(projectMembers.id, existing[0].id));
    return existing[0];
  }
  const result = await db.insert(projectMembers).values(data);
  return { id: result[0].insertId, ...data };
}

export async function removeProjectMember(projectId: number, employeeId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projectMembers).set({ isActive: false, updatedAt: new Date() }).where(
    and(eq(projectMembers.projectId, projectId), eq(projectMembers.employeeId, employeeId))
  );
}

export async function deleteProjectMember(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projectMembers).where(eq(projectMembers.id, id));
}

// ── Invoice Item CRUD (additional) ──

export async function getInvoiceItemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(invoiceItems).where(eq(invoiceItems.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateInvoiceItem(id: number, data: Partial<InsertInvoiceItem>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoiceItems).set(data).where(eq(invoiceItems.id, id));
  return getInvoiceItemById(id);
}

export async function deleteInvoiceItem(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
}

// ── Project Closings ──

export async function getProjectClosingByProjectMonth(projectId: number, closingMonth: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projectClosings).where(
    and(eq(projectClosings.projectId, projectId), eq(projectClosings.closingMonth, closingMonth))
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getProjectClosingById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projectClosings).where(eq(projectClosings.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getProjectClosingsByMonth(closingMonth: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectClosings).where(eq(projectClosings.closingMonth, closingMonth));
}

export async function createProjectClosing(data: InsertProjectClosing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectClosings).values(data);
  return { id: result[0].insertId, ...data };
}

export async function updateProjectClosing(id: number, data: Partial<InsertProjectClosing>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projectClosings).set({ ...data, updatedAt: new Date() }).where(eq(projectClosings.id, id));
  return getProjectClosingById(id);
}

// ── Closing Submissions ──

export async function getClosingSubmissionsByClosing(closingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(closingSubmissions).where(eq(closingSubmissions.closingId, closingId));
}

export async function getClosingSubmissionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(closingSubmissions).where(eq(closingSubmissions.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getClosingSubmissionByClosingEmployee(closingId: number, employeeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(closingSubmissions).where(
    and(eq(closingSubmissions.closingId, closingId), eq(closingSubmissions.employeeId, employeeId))
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertClosingSubmission(data: InsertClosingSubmission) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getClosingSubmissionByClosingEmployee(data.closingId, data.employeeId);
  if (existing?.id) {
    await db.update(closingSubmissions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(closingSubmissions.id, existing.id));
    return getClosingSubmissionById(existing.id);
  }
  const result = await db.insert(closingSubmissions).values(data);
  return { id: result[0].insertId, ...data };
}

export async function updateClosingSubmission(id: number, data: Partial<InsertClosingSubmission>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(closingSubmissions).set({ ...data, updatedAt: new Date() }).where(eq(closingSubmissions.id, id));
  return getClosingSubmissionById(id);
}


// ── Employee Payments ──

export async function getEmployeePaymentsByClosing(closingId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(employeePayments).where(eq(employeePayments.closingId, closingId));
}

export async function getEmployeePaymentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employeePayments).where(eq(employeePayments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getEmployeePaymentByClosingEmployee(closingId: number, employeeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(employeePayments).where(
    and(eq(employeePayments.closingId, closingId), eq(employeePayments.employeeId, employeeId))
  ).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertEmployeePayment(data: InsertEmployeePayment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getEmployeePaymentByClosingEmployee(data.closingId, data.employeeId);
  if (existing?.id) {
    await db.update(employeePayments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(employeePayments.id, existing.id));
    return getEmployeePaymentById(existing.id);
  }
  const result = await db.insert(employeePayments).values(data);
  return { id: result[0].insertId, ...data };
}

export async function updateEmployeePayment(id: number, data: Partial<InsertEmployeePayment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employeePayments).set({ ...data, updatedAt: new Date() }).where(eq(employeePayments.id, id));
  return getEmployeePaymentById(id);
}


// ── Audit Logs ──

export async function createAuditLog(data: InsertAuditLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(auditLogs).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getAuditLogsByMonth(monthKey: string) {
  const db = await getDb();
  if (!db) return [];
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return db.select().from(auditLogs).where(and(gte(auditLogs.performedAt, start), lte(auditLogs.performedAt, end)));
}

export async function upsertWorkerInvoice(data: InsertWorkerInvoice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(workerInvoices).values(data).onDuplicateKeyUpdate({ set: { ...data, updatedAt: new Date() } });
  return getWorkerInvoiceByClosingEmployee(data.closingId, data.employeeId);
}

export async function getWorkerInvoiceByClosingEmployee(closingId: number, employeeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workerInvoices).where(and(eq(workerInvoices.closingId, closingId), eq(workerInvoices.employeeId, employeeId))).limit(1);
  return result[0];
}


export async function getWorkerInvoiceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workerInvoices).where(eq(workerInvoices.id, id)).limit(1);
  return result[0];
}

export async function updateWorkerInvoice(id: number, data: Partial<InsertWorkerInvoice>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(workerInvoices).set({ ...data, updatedAt: new Date() }).where(eq(workerInvoices.id, id));
  return getWorkerInvoiceById(id);
}

export async function getWorkerInvoicesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerInvoices).where(eq(workerInvoices.employeeId, employeeId));
}

export async function listWorkerInvoicesForReview() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerInvoices);
}

export async function replaceWorkerInvoiceItems(workerInvoiceId: number, items: InsertWorkerInvoiceItem[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(workerInvoiceItems).where(eq(workerInvoiceItems.workerInvoiceId, workerInvoiceId));
  if (items.length > 0) await db.insert(workerInvoiceItems).values(items);
}

export async function getWorkerInvoiceItems(workerInvoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerInvoiceItems).where(eq(workerInvoiceItems.workerInvoiceId, workerInvoiceId));
}

export async function createWorkerInvoiceSnapshot(data: InsertWorkerInvoiceSnapshot) { const db = await getDb(); if (!db) throw new Error("Database not available"); const r = await db.insert(workerInvoiceSnapshots).values(data); return { id: r[0].insertId, ...data }; }
export async function getWorkerInvoiceSnapshots(workerInvoiceId: number) { const db = await getDb(); if (!db) return []; return db.select().from(workerInvoiceSnapshots).where(eq(workerInvoiceSnapshots.workerInvoiceId, workerInvoiceId)); }

export async function upsertInvoiceSupportingDocument(data: InsertInvoiceSupportingDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const r = await db.insert(invoiceSupportingDocuments).values(data);
  return { id: r[0].insertId, ...data };
}

export async function getSupportingDocumentsBySubmission(submissionId: number) { const db = await getDb(); if (!db) return []; return db.select().from(invoiceSupportingDocuments).where(eq(invoiceSupportingDocuments.submissionId, submissionId)); }
export async function getSupportingDocumentsByProjectMonth(projectId: number, closingMonth: string) { const db = await getDb(); if (!db) return []; return db.select().from(invoiceSupportingDocuments).where(and(eq(invoiceSupportingDocuments.projectId, projectId), eq(invoiceSupportingDocuments.closingMonth, closingMonth))); }
