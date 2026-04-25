import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { isWorkedType, extractDateKey } from "@shared/attendanceStatus";
import { resolveClientBillingRate, rateSourceLabel } from "./rateResolver";

export type InvoiceableClosingStatus = "ready" | "closed" | "locked";

export type BuiltInvoiceItem = {
  employeeId: number | null;
  itemType: "normal" | "text";
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  itemTaxRate: number;
  notes?: string | null;
  sortOrder: number;
};

export type InvoiceDraft = {
  clientId: number;
  client: any;
  projects: any[];
  projectIds: number[];
  primaryProjectId: number | null;
  periodStart: Date;
  periodEnd: Date;
  items: BuiltInvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  withholdingAmount: number;
  subject: string;
};

function isAllowedClosingStatus(status: string | null | undefined, allowed: InvoiceableClosingStatus[]) {
  return !!status && allowed.includes(status as InvoiceableClosingStatus);
}

function toYearMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sourceToInvoiceSuffix(source: string, shiftType: string) {
  const shiftLabel = shiftType === "night" ? " 夜勤" : "";
  if (source === "project_uniform") return `一律${shiftLabel}`;
  if (source === "employee_individual") return `個別${shiftLabel}`;
  return shiftLabel.trim() || "通常";
}

function lineDescriptionForBucket(bucketIndex: number, source: string, shiftType: string) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const letter = letters[bucketIndex] || String(bucketIndex + 1);
  const suffix = sourceToInvoiceSuffix(source, shiftType);
  return `電気工事業 ${letter}${suffix ? `（${suffix}）` : ""}`;
}

/**
 * Build an invoice draft from selected project closings.
 *
 * Important business rules:
 * - Source of truth is closing_submissions.
 * - Removed/non-target members are excluded.
 * - not_required, guests, absence, day_off are excluded.
 * - Client invoice is grouped by project/site and rate bucket, not one row per worker by default.
 * - Client billing rate priority is delegated to resolveClientBillingRate().
 */
export async function buildInvoiceDraftFromProjects(args: {
  projectIds: number[];
  periodStart: Date;
  periodEnd: Date;
  allowedClosingStatuses: InvoiceableClosingStatus[];
  expectedClientId?: number;
  taxRate?: number;
  withholding?: boolean;
  subject?: string;
  includeProjectSectionHeaders?: boolean;
}): Promise<InvoiceDraft> {
  const projectIds = Array.from(new Set(args.projectIds.map(Number).filter(Boolean)));
  if (!projectIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "案件が選択されていません" });
  }

  const projects = await Promise.all(projectIds.map((projectId) => db.getProjectById(projectId)));
  if (projects.some((project) => !project)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "指定された案件が見つかりません" });
  }

  const resolvedProjects = projects.filter(Boolean) as any[];
  const clientIds = new Set(resolvedProjects.map((project) => project.clientId).filter(Boolean));
  if (clientIds.size !== 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "同一の取引先の案件のみまとめて請求できます" });
  }

  const clientId = Number(Array.from(clientIds)[0]);
  if (!clientId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "取引先が設定されていない案件は請求できません" });
  }
  if (args.expectedClientId && clientId !== Number(args.expectedClientId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "選択した案件と取引先が一致していません" });
  }

  const client = await db.getClientById(clientId);
  if (!client) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "取引先情報が見つかりません" });
  }

  const closingMonth = toYearMonth(args.periodStart);
  const allEmployees = await db.getAllEmployees();
  const employeeMap = new Map<number, any>((allEmployees as any[]).map((employee) => [employee.id, employee]));

  const items: BuiltInvoiceItem[] = [];
  let subtotal = 0;
  const taxRate = Number(args.taxRate ?? 10);
  const includeProjectSectionHeaders = args.includeProjectSectionHeaders ?? projectIds.length > 1;
  const missingRateMessages: string[] = [];

  for (const project of resolvedProjects) {
    const closing = await db.getProjectClosingByProjectMonth(project.id, closingMonth);
    if (!closing?.id || !isAllowedClosingStatus(closing.status, args.allowedClosingStatuses)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `請求対象外の締め状態です: ${project.name}`,
      });
    }

    const [submissions, projectMembers, records] = await Promise.all([
      db.getClosingSubmissionsByClosing(closing.id),
      db.getProjectMembers(project.id),
      db.getAttendanceByDateRange(args.periodStart, args.periodEnd, project.id),
    ]);

    const activeMemberIds = new Set(
      (projectMembers as any[])
        .filter((member) => member.isActive)
        .map((member) => Number(member.employeeId))
    );

    const billableEmployeeIds = new Set(
      (submissions as any[])
        .filter((submission) =>
          submission.status !== "not_required" &&
          activeMemberIds.has(Number(submission.employeeId))
        )
        .map((submission) => Number(submission.employeeId))
    );

    if (!billableEmployeeIds.size) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `請求対象の提出者がいません: ${project.name}`,
      });
    }

    type Bucket = {
      projectId: number;
      projectName: string;
      clientRate: number;
      rateSource: string;
      shiftType: string;
      totalDaysTimes10: number;
      amount: number;
      employeeNames: Set<string>;
    };

    const buckets = new Map<string, Bucket>();

    for (const record of records as any[]) {
      if (!record.employeeId) continue;
      const employeeId = Number(record.employeeId);
      if (!billableEmployeeIds.has(employeeId)) continue;
      if (!isWorkedType(record.workType)) continue;
      if (Number(record.hoursWorked || 0) <= 0) continue;

      const shiftType = record.shiftType || "day";
      const workDateKey = extractDateKey(record.workDate);
      const workDate = new Date(`${workDateKey}T00:00:00.000Z`);

      let resolved;
      try {
        resolved = await resolveClientBillingRate({
          projectId: project.id,
          employeeId,
          shiftType,
          workDate,
        });
      } catch (error: any) {
        missingRateMessages.push(error?.message || `先方請求単価が未設定です: ${project.name}`);
        continue;
      }

      const totalHoursTimes10 = Number(record.hoursWorked || 0);
      const daysTimes10 = Math.round(totalHoursTimes10 / 8);
      if (daysTimes10 <= 0) continue;

      const key = `${project.id}:${resolved.rate}:${resolved.source}:${shiftType}`;
      const employee = employeeMap.get(employeeId);
      const employeeName = employee?.nameKanji || employee?.nameRomaji || `従業員${employeeId}`;

      const current = buckets.get(key) || {
        projectId: project.id,
        projectName: project.name,
        clientRate: resolved.rate,
        rateSource: resolved.source,
        shiftType,
        totalDaysTimes10: 0,
        amount: 0,
        employeeNames: new Set<string>(),
      };

      current.totalDaysTimes10 += daysTimes10;
      current.amount += Math.round((daysTimes10 / 10) * resolved.rate);
      current.employeeNames.add(employeeName);
      buckets.set(key, current);
    }

    if (missingRateMessages.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `請求単価未設定があります: ${missingRateMessages.join(" / ")}`,
      });
    }

    const projectBuckets = Array.from(buckets.values()).filter((bucket) => bucket.amount > 0);
    if (!projectBuckets.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `請求対象の billable data がありません: ${project.name}`,
      });
    }

    projectBuckets.sort((a, b) => {
      if (a.clientRate !== b.clientRate) return b.clientRate - a.clientRate;
      return a.shiftType.localeCompare(b.shiftType);
    });

    if (includeProjectSectionHeaders) {
      items.push({
        employeeId: null,
        itemType: "text",
        description: `【${project.name}】`,
        quantity: 0,
        unit: "",
        unitPrice: 0,
        amount: 0,
        itemTaxRate: 0,
        notes: null,
        sortOrder: items.length,
      });
    }

    projectBuckets.forEach((bucket, index) => {
      const amount = Math.round((bucket.totalDaysTimes10 / 10) * bucket.clientRate);
      subtotal += amount;

      items.push({
        employeeId: null,
        itemType: "normal",
        description: lineDescriptionForBucket(index, bucket.rateSource, bucket.shiftType),
        quantity: bucket.totalDaysTimes10,
        unit: "日",
        unitPrice: bucket.clientRate,
        amount,
        itemTaxRate: taxRate,
        notes: `${rateSourceLabel(bucket.rateSource as any)} / 対象: ${Array.from(bucket.employeeNames).join("、")}`,
        sortOrder: items.length,
      });
    });
  }

  const normalItems = items.filter((item) => item.itemType === "normal");
  if (!normalItems.length || subtotal <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "請求対象の billable data がありません。空の請求書は生成できません。",
    });
  }

  const withholdingAmount = args.withholding ? Math.floor(subtotal * 0.1021) : 0;
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const totalAmount = subtotal + taxAmount - withholdingAmount;

  const monthLabel = `${args.periodStart.getUTCMonth() + 1}`;
  const subject =
    args.subject?.trim() ||
    `${monthLabel}月分請求書 ${resolvedProjects.map((project) => project.name).join("・")}`;

  return {
    clientId,
    client,
    projects: resolvedProjects,
    projectIds,
    primaryProjectId: projectIds.length === 1 ? projectIds[0] : null,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    items: items.map((item, index) => ({ ...item, sortOrder: index })),
    subtotal,
    taxAmount,
    totalAmount,
    withholdingAmount,
    subject,
  };
}
