
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { isWorkedType } from "@shared/attendanceStatus";

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
}) : Promise<InvoiceDraft> {
  if (!args.projectIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "案件が選択されていません" });
  }

  const projects = await Promise.all(args.projectIds.map((projectId) => db.getProjectById(projectId)));
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
  if (args.expectedClientId && clientId !== args.expectedClientId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "選択した案件と取引先が一致していません" });
  }

  const closingMonth = toYearMonth(args.periodStart);
  const closings = await Promise.all(
    args.projectIds.map((projectId) => db.getProjectClosingByProjectMonth(projectId, closingMonth))
  );
  if (closings.some((closing) => !isAllowedClosingStatus(closing?.status, args.allowedClosingStatuses))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "請求対象の案件に未締めまたは請求不可の締め状態が含まれています" });
  }

  const client = await db.getClientById(clientId);
  if (!client) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "取引先情報が見つかりません" });
  }

  const allEmployees = await db.getAllEmployees();
  const employeeMap = new Map<number, any>(allEmployees.map((employee: any) => [employee.id, employee]));

  const items: BuiltInvoiceItem[] = [];
  let subtotal = 0;
  const taxRate = Number(args.taxRate ?? 10);
  const includeProjectSectionHeaders = args.includeProjectSectionHeaders ?? args.projectIds.length > 1;

  for (const project of resolvedProjects) {
    const records = await db.getAttendanceByDateRange(args.periodStart, args.periodEnd, project.id);
    const rates = await db.getRatesByProject(project.id);

    const individualRateMap = new Map<number, any>();
    let defaultRate: any = null;
    for (const rate of rates) {
      if (rate.employeeId) {
        individualRateMap.set(rate.employeeId, rate);
      } else {
        defaultRate = rate;
      }
    }

    const recordsByEmployee = new Map<number, any[]>();
    for (const record of records) {
      if (!record.employeeId || !isWorkedType(record.workType)) continue;
      const current = recordsByEmployee.get(record.employeeId) || [];
      current.push(record);
      recordsByEmployee.set(record.employeeId, current);
    }

    const projectItems: BuiltInvoiceItem[] = [];
    for (const [employeeId, employeeRecords] of Array.from(recordsByEmployee.entries())) {
      const employee = employeeMap.get(employeeId);
      const rate = individualRateMap.get(employeeId) || defaultRate;
      const clientRate = Number(rate?.clientRate || 0);
      if (!clientRate) continue;

      const totalHoursTimes10 = employeeRecords.reduce((sum, record) => sum + Number(record.hoursWorked || 0), 0);
      const totalDaysTimes10 = Math.round(totalHoursTimes10 / 8);
      if (totalDaysTimes10 <= 0) continue;

      const amount = Math.round((totalDaysTimes10 / 10) * clientRate);
      if (amount <= 0) continue;

      projectItems.push({
        employeeId,
        itemType: "normal",
        description: includeProjectSectionHeaders ? `${employee?.nameKanji || `従業員${employeeId}`}` : `${employee?.nameKanji || `従業員${employeeId}`}`,
        quantity: totalDaysTimes10,
        unit: "日",
        unitPrice: clientRate,
        amount,
        itemTaxRate: taxRate,
        notes: null,
        sortOrder: 0,
      });
      subtotal += amount;
    }

    if (projectItems.length && includeProjectSectionHeaders) {
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
        sortOrder: 0,
      });
    }

    for (const projectItem of projectItems) {
      items.push({
        ...projectItem,
        description: includeProjectSectionHeaders ? projectItem.description : (args.projectIds.length > 1 ? `[${project.name}] ${projectItem.description}` : projectItem.description),
        sortOrder: items.length,
      });
    }
  }

  const normalItems = items.filter((item) => item.itemType === "normal");
  if (!normalItems.length || subtotal <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "請求対象の billable data がありません。空の請求書は生成できません。" });
  }

  const withholdingAmount = args.withholding ? Math.floor(subtotal * 0.1021) : 0;
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const totalAmount = subtotal + taxAmount - withholdingAmount;

  const monthLabel = `${args.periodStart.getUTCMonth() + 1}`;
  const subject = args.subject?.trim() || `${monthLabel}月分請求書 ${resolvedProjects.map((project) => project.name).join("・")}`;

  return {
    clientId,
    client,
    projects: resolvedProjects,
    projectIds: args.projectIds,
    primaryProjectId: args.projectIds.length === 1 ? args.projectIds[0] : null,
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
