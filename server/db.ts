import { eq, and, lt, gte, lte, sql, inArray } from "drizzle-orm";
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
  InsertClosingSubmissionDocument, closingSubmissionDocuments,
  InsertEmployeePayment, employeePayments,
  InsertAuditLog, auditLogs,
  workerInvoices, InsertWorkerInvoice,
  workerInvoiceItems, InsertWorkerInvoiceItem,
  workerInvoiceSnapshots, InsertWorkerInvoiceSnapshot,
  invoiceSupportingDocuments, InsertInvoiceSupportingDocument,
  monthlyClosingV2WorkerSubmissions,
  monthlyClosingV2ProjectReviews,
  monthlyClosingV2ParticipantReviews,
  monthlyClosingV2ExpenseLines,
  monthlyClosingV2ExpenseLineReceipts,
  workerBaseRates,
  InsertWorkerBaseRate,
  workerAdvances,
  InsertWorkerAdvance,
  companies, InsertCompany,
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


// ── Monthly Closing V2 ──

export async function getMonthlyClosingV2WorkerSubmissionsByMonth(targetMonth: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(monthlyClosingV2WorkerSubmissions.targetMonth, targetMonth)];
  if (companyId != null) conds.push(eq(monthlyClosingV2WorkerSubmissions.companyId, companyId));
  return db.select().from(monthlyClosingV2WorkerSubmissions).where(and(...conds));
}

export async function getMonthlyClosingV2ProjectReviewsByMonth(targetMonth: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(monthlyClosingV2ProjectReviews.targetMonth, targetMonth)];
  if (companyId != null) conds.push(eq(monthlyClosingV2ProjectReviews.companyId, companyId));
  return db.select().from(monthlyClosingV2ProjectReviews).where(and(...conds));
}

export async function upsertMonthlyClosingV2ProjectReview(data: {
  targetMonth: string;
  projectId: number;
  status: "未着手" | "確認中" | "情報不足" | "差し戻しあり" | "締め完了";
  updatedBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(monthlyClosingV2ProjectReviews).values(data).onDuplicateKeyUpdate({
    set: { status: data.status, updatedBy: data.updatedBy ?? null },
  });
  const result = await db.select().from(monthlyClosingV2ProjectReviews).where(and(
    eq(monthlyClosingV2ProjectReviews.targetMonth, data.targetMonth),
    eq(monthlyClosingV2ProjectReviews.projectId, data.projectId),
  )).limit(1);
  return result[0];
}

export async function getMonthlyClosingV2ParticipantReviewsByMonth(targetMonth: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(monthlyClosingV2ParticipantReviews.targetMonth, targetMonth)];
  if (companyId != null) conds.push(eq(monthlyClosingV2ParticipantReviews.companyId, companyId));
  return db.select().from(monthlyClosingV2ParticipantReviews).where(and(...conds));
}

export async function getMonthlyClosingV2ParticipantReview(targetMonth: string, projectId: number, participantKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(monthlyClosingV2ParticipantReviews).where(and(
    eq(monthlyClosingV2ParticipantReviews.targetMonth, targetMonth),
    eq(monthlyClosingV2ParticipantReviews.projectId, projectId),
    eq(monthlyClosingV2ParticipantReviews.participantKey, participantKey),
  )).limit(1);
  return result[0];
}

export async function upsertMonthlyClosingV2ParticipantReview(data: {
  targetMonth: string;
  projectId: number;
  participantKey: string;
  workerId?: number | null;
  guestName?: string | null;
  individualStatus: "未確認" | "出面確認済み" | "交通費未入力" | "情報不足" | "差し戻し" | "確認済み" | "締め完了";
  transportationStatus: string;
  invoiceInfoStatus: string;
  sendBackReason?: string | null;
  missingInfo?: string | null;
  isAggregationExcluded: boolean;
  aggregationOverrideReason?: string | null;
  aggregationOverrideBy?: number | null;
  aggregationOverrideAt?: Date | null;
  updatedBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(monthlyClosingV2ParticipantReviews).values(data).onDuplicateKeyUpdate({
    set: {
      workerId: data.workerId ?? null,
      guestName: data.guestName ?? null,
      individualStatus: data.individualStatus,
      transportationStatus: data.transportationStatus,
      invoiceInfoStatus: data.invoiceInfoStatus,
      sendBackReason: data.sendBackReason ?? null,
      missingInfo: data.missingInfo ?? null,
      isAggregationExcluded: data.isAggregationExcluded,
      aggregationOverrideReason: data.aggregationOverrideReason ?? null,
      aggregationOverrideBy: data.aggregationOverrideBy ?? null,
      aggregationOverrideAt: data.aggregationOverrideAt ?? null,
      updatedBy: data.updatedBy ?? null,
    },
  });
  const result = await db.select().from(monthlyClosingV2ParticipantReviews).where(and(
    eq(monthlyClosingV2ParticipantReviews.targetMonth, data.targetMonth),
    eq(monthlyClosingV2ParticipantReviews.projectId, data.projectId),
    eq(monthlyClosingV2ParticipantReviews.participantKey, data.participantKey),
  )).limit(1);
  return result[0];
}

// ── Monthly Closing V2 Expense Lines (Transportation) ──

export async function getMonthlyClosingV2ExpenseLinesByWorkerProjectMonth(
  workerId: number,
  projectId: number,
  targetMonth: string
) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monthlyClosingV2ExpenseLines).where(
    and(
      eq(monthlyClosingV2ExpenseLines.workerId, workerId),
      eq(monthlyClosingV2ExpenseLines.projectId, projectId),
      eq(monthlyClosingV2ExpenseLines.targetMonth, targetMonth),
      eq(monthlyClosingV2ExpenseLines.expenseType, "transportation"),
    )
  );
}

/** Single worker monthly submission for a target month (月締めV2 提出状況・1件) */
export async function getMonthlyClosingV2WorkerSubmission(workerId: number, targetMonth: string) {
  const db = await getDb();
  if (!db) return undefined;
  // 本番でV2テーブルが未マイグレーションだと select が例外を投げ、呼び出し側の自動生成が
  // まるごと失敗して「明細が空」になる。テーブル未整備時は undefined を返して継続する。
  try {
    const result = await db.select().from(monthlyClosingV2WorkerSubmissions).where(
      and(
        eq(monthlyClosingV2WorkerSubmissions.workerId, workerId),
        eq(monthlyClosingV2WorkerSubmissions.targetMonth, targetMonth),
      )
    ).limit(1);
    return result[0];
  } catch (error) {
    console.error("[db] getMonthlyClosingV2WorkerSubmission failed (table not migrated?)", error);
    return undefined;
  }
}

/**
 * All expense lines (transportation + other, all projects) for a worker in a target month.
 * Used by the worker invoice V2 draft builder.
 */
export async function getMonthlyClosingV2ExpenseLinesByWorkerMonth(workerId: number, targetMonth: string) {
  const db = await getDb();
  if (!db) return [];
  // V2テーブル未整備でも自動生成（出面×単価）を止めないよう、失敗時は空配列で継続する。
  try {
    return await db.select().from(monthlyClosingV2ExpenseLines).where(
      and(
        eq(monthlyClosingV2ExpenseLines.workerId, workerId),
        eq(monthlyClosingV2ExpenseLines.targetMonth, targetMonth),
      )
    );
  } catch (error) {
    console.error("[db] getMonthlyClosingV2ExpenseLinesByWorkerMonth failed (table not migrated?)", error);
    return [];
  }
}

export async function getMonthlyClosingV2ExpenseLinesByProjectMonth(
  projectId: number,
  targetMonth: string
) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monthlyClosingV2ExpenseLines).where(
    and(
      eq(monthlyClosingV2ExpenseLines.projectId, projectId),
      eq(monthlyClosingV2ExpenseLines.targetMonth, targetMonth),
      eq(monthlyClosingV2ExpenseLines.expenseType, "transportation"),
    )
  );
}

/**
 * 月内すべての交通費行（全現場・全作業員）。月締めV2ダッシュボードで
 * 「交通費が入力済みか（0円=交通費なし も入力済み扱い）」を判定するのに使う。
 */
export async function getMonthlyClosingV2TransportationLinesByMonth(targetMonth: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    const conds = [
      eq(monthlyClosingV2ExpenseLines.targetMonth, targetMonth),
      eq(monthlyClosingV2ExpenseLines.expenseType, "transportation"),
    ];
    if (companyId != null) conds.push(eq(monthlyClosingV2ExpenseLines.companyId, companyId));
    return await db.select().from(monthlyClosingV2ExpenseLines).where(and(...conds));
  } catch (error) {
    console.error("[db] getMonthlyClosingV2TransportationLinesByMonth failed (table not migrated?)", error);
    return [];
  }
}

export type MonthlyClosingV2PayerType =
  | "none"
  | "worker_paid"
  | "company_card_etc"
  | "company_paid"
  | "client_paid_direct";

function paymentMethodFromPayerType(payerType: MonthlyClosingV2PayerType) {
  switch (payerType) {
    case "worker_paid":
      return "paid_by_worker" as const;
    case "company_card_etc":
      return "company_card" as const;
    case "client_paid_direct":
      return "paid_by_client" as const;
    case "company_paid":
    case "none":
      return "other" as const;
  }
}

export function payerTypeFromPaymentMethod(line: { paymentMethod?: string | null; amount?: number | null }): MonthlyClosingV2PayerType {
  if (line.paymentMethod === "paid_by_worker") return "worker_paid";
  if (line.paymentMethod === "company_card" || line.paymentMethod === "etc") return "company_card_etc";
  if (line.paymentMethod === "paid_by_client") return "client_paid_direct";
  if ((line.amount ?? 0) === 0) return "none";
  return "company_paid";
}

export async function upsertMonthlyClosingV2TransportationExpense(data: {
  workerId: number;
  projectId: number;
  targetMonth: string;
  payerType: MonthlyClosingV2PayerType;
  clientBillable: boolean;
  amount: number;
  memo?: string | null;
  updatedBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedAmount = data.payerType === "none" ? 0 : data.amount;
  const paymentMethod = paymentMethodFromPayerType(data.payerType);
  const isClientBillable = data.payerType === "client_paid_direct" ? false : data.clientBillable;
  const existing = await db.select().from(monthlyClosingV2ExpenseLines).where(
    and(
      eq(monthlyClosingV2ExpenseLines.workerId, data.workerId),
      eq(monthlyClosingV2ExpenseLines.projectId, data.projectId),
      eq(monthlyClosingV2ExpenseLines.targetMonth, data.targetMonth),
      eq(monthlyClosingV2ExpenseLines.expenseType, "transportation"),
    )
  ).limit(1);
  if (existing.length > 0) {
    await db.update(monthlyClosingV2ExpenseLines)
      .set({
        amount: normalizedAmount,
        paymentMethod,
        isClientBillable,
        memo: data.memo ?? null,
        updatedAt: new Date(),
      })
      .where(eq(monthlyClosingV2ExpenseLines.id, existing[0].id));
    const updated = await db.select().from(monthlyClosingV2ExpenseLines).where(eq(monthlyClosingV2ExpenseLines.id, existing[0].id)).limit(1);
    return updated[0];
  }

  const result = await db.insert(monthlyClosingV2ExpenseLines).values({
    workerId: data.workerId,
    projectId: data.projectId,
    targetMonth: data.targetMonth,
    expenseType: "transportation",
    amount: normalizedAmount,
    paymentMethod,
    memo: data.memo ?? null,
    allocationMethod: "manual",
    isClientBillable,
    status: "draft",
  });
  const inserted = await db.select().from(monthlyClosingV2ExpenseLines).where(eq(monthlyClosingV2ExpenseLines.id, result[0].insertId)).limit(1);
  return inserted[0];
}


/** 対象月×現場の交通費領収書（管理側アップロード）。請求書への添付候補に使う。 */
export async function getMonthlyClosingV2ExpenseLineReceiptsByMonthProject(targetMonth: string, projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monthlyClosingV2ExpenseLineReceipts).where(and(
    eq(monthlyClosingV2ExpenseLineReceipts.targetMonth, targetMonth),
    eq(monthlyClosingV2ExpenseLineReceipts.projectId, projectId),
  ));
}

export async function getMonthlyClosingV2ExpenseLineReceiptsByExpenseLineIds(expenseLineIds: number[]) {
  const db = await getDb();
  if (!db || expenseLineIds.length === 0) return [];
  return db.select().from(monthlyClosingV2ExpenseLineReceipts).where(
    inArray(monthlyClosingV2ExpenseLineReceipts.expenseLineId, expenseLineIds)
  );
}

export async function createMonthlyClosingV2ExpenseLineReceipt(data: {
  expenseLineId: number;
  workerId: number;
  targetMonth: string;
  projectId: number;
  receiptFileKey: string;
  receiptFileUrl: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(monthlyClosingV2ExpenseLineReceipts).values({
    expenseLineId: data.expenseLineId,
    workerId: data.workerId,
    targetMonth: data.targetMonth,
    projectId: data.projectId,
    receiptFileKey: data.receiptFileKey,
    receiptFileUrl: data.receiptFileUrl,
    originalFileName: data.originalFileName,
    mimeType: data.mimeType,
    fileSize: data.fileSize,
    uploadedBy: data.uploadedBy ?? null,
  });
  const inserted = await db.select().from(monthlyClosingV2ExpenseLineReceipts).where(eq(monthlyClosingV2ExpenseLineReceipts.id, result[0].insertId)).limit(1);
  return inserted[0];
}

export async function getMonthlyClosingV2ClientTransportationBillingSummary(targetMonth: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      clientId: projects.clientId,
      projectId: monthlyClosingV2ExpenseLines.projectId,
      totalAmount: sql<number>`sum(${monthlyClosingV2ExpenseLines.amount})`,
      lineCount: sql<number>`count(*)`,
    })
    .from(monthlyClosingV2ExpenseLines)
    .leftJoin(projects, eq(projects.id, monthlyClosingV2ExpenseLines.projectId))
    .where(and(
      eq(monthlyClosingV2ExpenseLines.targetMonth, targetMonth),
      eq(monthlyClosingV2ExpenseLines.expenseType, "transportation"),
      eq(monthlyClosingV2ExpenseLines.isClientBillable, true),
      sql`${monthlyClosingV2ExpenseLines.paymentMethod} <> 'paid_by_client'`,
    ))
    .groupBy(projects.clientId, monthlyClosingV2ExpenseLines.projectId);
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

export async function getAllWorkerBaseRates(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(workerBaseRates).where(eq(workerBaseRates.companyId, companyId));
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

    if (user.companyId !== undefined) {
      values.companyId = user.companyId;
      updateSet.companyId = user.companyId;
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

export async function getAllUsers(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(users).where(eq(users.companyId, companyId));
  return db.select().from(users);
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** 個人別 表示/ブロック設定（JSON文字列 or null）を保存する */
export async function updateUserPermissionOverrides(userId: number, overridesJson: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ permissionOverrides: overridesJson }).where(eq(users.id, userId));
}

// ── Companies (テナント台帳 / マルチテナント化 Phase 1a) ──

export async function getAllCompanies() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(companies);
}

export async function getCompanyById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCompany(data: InsertCompany) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(companies).values(data);
  return { id: result[0].insertId, ...data };
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

export async function getAllInvitations(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const results = companyId != null
    ? await db.select().from(invitations).where(eq(invitations.companyId, companyId))
    : await db.select().from(invitations);
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

export async function getAllEmployees(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(employees).where(eq(employees.companyId, companyId));
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

export async function getQualificationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(qualifications).where(eq(qualifications.id, id)).limit(1);
  return rows[0];
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

export async function getAllClients(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(clients).where(eq(clients.companyId, companyId));
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

export async function getAllProjects(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(projects).where(eq(projects.companyId, companyId));
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

export async function getAllEmployeeRates(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(employeeRates).where(eq(employeeRates.companyId, companyId));
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

export async function getAttendanceByDateRange(startDate: Date, endDate: Date, projectId?: number, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [
    gte(attendance.workDate, startDate),
    lte(attendance.workDate, endDate),
  ];
  if (projectId) conditions.push(eq(attendance.projectId, projectId));
  if (companyId != null) conditions.push(eq(attendance.companyId, companyId));
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

export async function getAllInvoices(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(invoices).where(eq(invoices.companyId, companyId));
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
/**
 * Auto-generate the next invoice number (請求書番号).
 *
 * 管理方法（簡単すぎず難しすぎない中間設計）: `INV-<請求月>-<連番>` 例: `INV-2024-05-001`
 *  - `INV`     請求書である目印。
 *  - `<請求月>` 請求対象月 (YYYY-MM)。読みやすく・並び替え可能。
 *  - `<連番>`   その月内の 3桁ゼロ埋め通し番号 (001, 002 …)。
 * 取引先コード・現場コードは埋め込まない（過度に複雑にしない）。番号は手入力させず、全作成経路
 * （手動 / 出面表から / 締めから）で常に自動採番する。同月1000件超は桁あふれ時に自然拡張。
 */
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

export async function getProjectClosingsByMonth(closingMonth: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(projectClosings.closingMonth, closingMonth)];
  if (companyId != null) conds.push(eq(projectClosings.companyId, companyId));
  return db.select().from(projectClosings).where(and(...conds));
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

/**
 * All V1 closing submissions for an employee in a target month, across projects.
 * Used by the worker-invoice V2 transition bridge: while V2 worker submissions /
 * expense lines are not yet populated, the submission signal and transport/expense
 * amounts still live in the legacy `closing_submissions` (joined to project_closings
 * for the month + projectId).
 */
export async function getClosingSubmissionsByEmployeeMonth(employeeId: number, closingMonth: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      submissionId: closingSubmissions.id,
      closingId: closingSubmissions.closingId,
      projectId: projectClosings.projectId,
      status: closingSubmissions.status,
      transportAmount: closingSubmissions.transportAmount,
      expenseAmount: closingSubmissions.expenseAmount,
    })
    .from(closingSubmissions)
    .innerJoin(projectClosings, eq(projectClosings.id, closingSubmissions.closingId))
    .where(and(
      eq(closingSubmissions.employeeId, employeeId),
      eq(projectClosings.closingMonth, closingMonth),
    ));
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




export async function listClosingSubmissionDocuments(submissionId: number) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(closingSubmissionDocuments).where(eq(closingSubmissionDocuments.submissionId, submissionId));
  } catch (error) {
    // 添付書類テーブル/列が本番DBに未適用(マイグレーション遅延)でも、月締め画面全体を落とさない。
    // 書類一覧は空で返し、提出フォームは利用可能にする。
    console.warn("listClosingSubmissionDocuments failed (returning []):", (error as any)?.message || error);
    return [];
  }
}

/** 対象月×現場の作業員アップロード書類（領収書など）。請求書への添付候補に使う。 */
export async function listClosingSubmissionDocumentsByProjectMonth(projectId: number, closingMonth: string) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(closingSubmissionDocuments).where(and(
      eq(closingSubmissionDocuments.projectId, projectId),
      eq(closingSubmissionDocuments.closingMonth, closingMonth),
    ));
  } catch (error) {
    console.warn("listClosingSubmissionDocumentsByProjectMonth failed (returning []):", (error as any)?.message || error);
    return [];
  }
}

export async function createClosingSubmissionDocument(data: InsertClosingSubmissionDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(closingSubmissionDocuments).values(data);
  return { id: result[0].insertId, ...data };
}

export async function getClosingSubmissionDocumentById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(closingSubmissionDocuments).where(eq(closingSubmissionDocuments.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteClosingSubmissionDocument(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(closingSubmissionDocuments).where(eq(closingSubmissionDocuments.id, id));
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

// ─── 前借り／立替 台帳 (worker_advances) ─────────────────────────────────────
export async function getWorkerAdvancesByEmployee(employeeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerAdvances).where(eq(workerAdvances.employeeId, employeeId));
}

export async function getAllWorkerAdvances(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(workerAdvances).where(eq(workerAdvances.companyId, companyId));
  return db.select().from(workerAdvances);
}

export async function getWorkerAdvancesByPayment(paymentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workerAdvances).where(eq(workerAdvances.relatedPaymentId, paymentId));
}

export async function getWorkerAdvanceById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(workerAdvances).where(eq(workerAdvances.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createWorkerAdvance(data: InsertWorkerAdvance) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workerAdvances).values(data);
  return { id: result[0].insertId, ...data };
}

export async function deleteWorkerAdvance(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(workerAdvances).where(eq(workerAdvances.id, id));
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

export async function getAuditLogsByMonth(monthKey: string, companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const conds = [gte(auditLogs.performedAt, start), lte(auditLogs.performedAt, end)];
  if (companyId != null) conds.push(eq(auditLogs.companyId, companyId));
  return db.select().from(auditLogs).where(and(...conds));
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

export async function listWorkerInvoicesForReview(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId != null) return db.select().from(workerInvoices).where(eq(workerInvoices.companyId, companyId));
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
export async function getAuditLogsByAction(action: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).where(eq(auditLogs.action, action));
}
