import { TRPCError } from "@trpc/server";
import * as db from "./db";

type RateSource =
  | "project_employee"
  | "project_uniform"
  | "client_employee"
  | "client_uniform"
  | "employee_individual"
  | "project_variable"
  | "employee_fixed";

export type ResolvedRate = {
  rate: number;
  source: RateSource;
  rateRecord: any;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function isActiveOn(rate: any, workDate: Date): boolean {
  const from = toDate(rate.effectiveFrom);
  const until = toDate(rate.effectiveUntil);
  if (from && from.getTime() > workDate.getTime()) return false;
  if (until && until.getTime() < workDate.getTime()) return false;
  return true;
}

function chooseLatestEffective<T extends any>(rates: T[]): T | null {
  if (!rates.length) return null;
  return [...rates].sort((a: any, b: any) => {
    const at = toDate(a.effectiveFrom)?.getTime() ?? 0;
    const bt = toDate(b.effectiveFrom)?.getTime() ?? 0;
    if (bt !== at) return bt - at;
    const aut = toDate(a.updatedAt)?.getTime() ?? 0;
    const but = toDate(b.updatedAt)?.getTime() ?? 0;
    if (but !== aut) return but - aut;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  })[0];
}

async function getContextNames(projectId: number, employeeId: number) {
  const [project, employee] = await Promise.all([
    db.getProjectById(projectId),
    db.getEmployeeById(employeeId),
  ]);
  return {
    projectName: project?.name || `projectId:${projectId}`,
    employeeName: employee?.nameKanji || employee?.nameRomaji || `employeeId:${employeeId}`,
  };
}

/**
 * Client billing rate = rate charged to the client.
 *
 * Priority:
 * 1. Project-wide uniform client rate: employeeId == null
 * 2. Employee-specific client rate
 * 3. Error
 */
export async function resolveClientBillingRate(args: {
  projectId: number;
  employeeId: number;
  shiftType?: string | null;
  workDate: Date;
}): Promise<ResolvedRate> {
  const shiftType = args.shiftType || "day";
  const project = await db.getProjectById(args.projectId);
  const rates = await db.getAllEmployeeRates();

  const validRates = (rates as any[]).filter((rate) => {
    if (rate.shiftType && rate.shiftType !== shiftType) return false;
    if (!isActiveOn(rate, args.workDate)) return false;
    return Number(rate.clientRate || 0) > 0;
  });

  const projectEmployee = chooseLatestEffective(
    validRates.filter((rate) => rate.scopeType === "project" && Number(rate.projectId) === Number(args.projectId) && Number(rate.employeeId) === Number(args.employeeId))
  );
  if (projectEmployee) {
    return { rate: Number(projectEmployee.clientRate), source: "project_employee", rateRecord: projectEmployee };
  }

  const projectUniform = chooseLatestEffective(
    validRates.filter((rate) => rate.scopeType === "project" && Number(rate.projectId) === Number(args.projectId) && (rate.employeeId === null || rate.employeeId === undefined))
  );
  if (projectUniform) {
    return {
      rate: Number(projectUniform.clientRate),
      source: "project_uniform",
      rateRecord: projectUniform,
    };
  }

  if (project?.clientId) {
    const clientEmployee = chooseLatestEffective(
      validRates.filter((rate) => rate.scopeType === "client" && Number(rate.clientId) === Number(project.clientId) && Number(rate.employeeId) === Number(args.employeeId))
    );
    if (clientEmployee) {
      return { rate: Number(clientEmployee.clientRate), source: "client_employee", rateRecord: clientEmployee };
    }
  }

  const clientUniform = project?.clientId ? chooseLatestEffective(
    validRates.filter((rate) => rate.scopeType === "client" && Number(rate.clientId) === Number(project.clientId) && (rate.employeeId === null || rate.employeeId === undefined))
  ) : null;
  if (clientUniform) {
    return { rate: Number(clientUniform.clientRate), source: "client_uniform", rateRecord: clientUniform };
  }

  const employeeIndividual = chooseLatestEffective(
    validRates.filter((rate) => rate.scopeType === "project" && Number(rate.projectId) === Number(args.projectId) && Number(rate.employeeId) === Number(args.employeeId))
  );
  if (employeeIndividual) {
    return {
      rate: Number(employeeIndividual.clientRate),
      source: "employee_individual",
      rateRecord: employeeIndividual,
    };
  }

  const ctx = await getContextNames(args.projectId, args.employeeId);
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `先方請求単価が未設定です: ${ctx.projectName} / ${ctx.employeeName} / ${shiftType}`,
  });
}

/**
 * Worker payment rate = rate paid by our company to the worker.
 *
 * Priority:
 * 1. Project-specific worker rate: employeeId + projectId
 * 2. Employee fixed worker rate: worker_base_rates
 * 3. Error
 */
export async function resolveWorkerPaymentRate(args: {
  projectId: number;
  employeeId: number;
  shiftType?: string | null;
  workDate: Date;
}): Promise<ResolvedRate> {
  const shiftType = args.shiftType || "day";
  const rates = await db.getRatesByProject(args.projectId);

  const projectVariable = chooseLatestEffective(
    (rates as any[]).filter((rate) => {
      if (Number(rate.employeeId) !== Number(args.employeeId)) return false;
      if (rate.shiftType && rate.shiftType !== shiftType) return false;
      if (!isActiveOn(rate, args.workDate)) return false;
      return Number(rate.workerRate || 0) > 0;
    })
  );

  if (projectVariable) {
    return {
      rate: Number(projectVariable.workerRate),
      source: "project_variable",
      rateRecord: projectVariable,
    };
  }

  const baseRates = await db.getWorkerBaseRatesByEmployee(args.employeeId);
  const employeeFixed = chooseLatestEffective(
    (baseRates as any[]).filter((rate) => {
      if (rate.shiftType && rate.shiftType !== shiftType) return false;
      if (!isActiveOn(rate, args.workDate)) return false;
      return Number(rate.workerRate || 0) > 0;
    })
  );

  if (employeeFixed) {
    return {
      rate: Number(employeeFixed.workerRate),
      source: "employee_fixed",
      rateRecord: employeeFixed,
    };
  }

  const ctx = await getContextNames(args.projectId, args.employeeId);
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `従業員支払単価が未設定です: ${ctx.projectName} / ${ctx.employeeName} / ${shiftType}`,
  });
}

export function rateSourceLabel(source: RateSource): string {
  switch (source) {
    case "project_uniform": return "プロジェクト一律単価";
    case "project_employee": return "プロジェクト個別単価";
    case "client_employee": return "取引先個別単価";
    case "client_uniform": return "取引先一律単価";
    case "employee_individual": return "個別型単価";
    case "project_variable": return "プロジェクト変動単価";
    case "employee_fixed": return "固定単価";
    default: return source;
  }
}

export async function resolveProjectMemberRatesForMonth(args: {
  projectId: number;
  closingMonth: string;
}) {
  const [project, members, employees] = await Promise.all([
    db.getProjectById(args.projectId),
    db.getProjectMembers(args.projectId),
    db.getAllEmployees(),
  ]);

  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "現場が見つかりません" });
  }

  const [year, month] = args.closingMonth.split("-").map(Number);
  const workDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const employeeMap = new Map((employees as any[]).map((e) => [e.id, e]));

  const rows = [];
  for (const member of (members as any[]).filter((m) => m.isActive)) {
    const employee = employeeMap.get(member.employeeId);
    const row: any = {
      projectId: args.projectId,
      projectName: project.name,
      employeeId: member.employeeId,
      employeeName: employee?.nameKanji || employee?.nameRomaji || `ID:${member.employeeId}`,
      shiftType: "day",
      clientRate: null,
      clientRateSource: null,
      workerRate: null,
      workerRateSource: null,
      warnings: [],
    };

    try {
      const client = await resolveClientBillingRate({
        projectId: args.projectId,
        employeeId: member.employeeId,
        shiftType: "day",
        workDate,
      });
      row.clientRate = client.rate;
      row.clientRateSource = rateSourceLabel(client.source);
    } catch (error: any) {
      row.warnings.push(error?.message || "先方請求単価未設定");
    }

    try {
      const worker = await resolveWorkerPaymentRate({
        projectId: args.projectId,
        employeeId: member.employeeId,
        shiftType: "day",
        workDate,
      });
      row.workerRate = worker.rate;
      row.workerRateSource = rateSourceLabel(worker.source);
    } catch (error: any) {
      row.warnings.push(error?.message || "従業員支払単価未設定");
    }

    rows.push(row);
  }

  return rows;
}
