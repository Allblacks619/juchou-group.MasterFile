import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { isWorkedType, extractDateKey } from "@shared/attendanceStatus";
import { resolveClientBillingRate, rateSourceLabel } from "./rateResolver";
import {
  computeClientInvoiceDraft,
  type ClientInvoiceComputeResult,
  type ClientInvoiceLaborInput,
  type ClientInvoiceProjectInput,
  type ClientInvoiceTaxRates,
  type ClientInvoiceUnits,
} from "./clientInvoiceV2Core";

export type ClientInvoiceV2Draft = ClientInvoiceComputeResult & {
  clientId: number;
  client: any;
  projects: any[];
  projectIds: number[];
  primaryProjectId: number | null;
  periodStart: Date;
  periodEnd: Date;
  subject: string;
  /** per-project closing source: native V2 締め完了 or bridged from legacy V1 project_closings */
  closingSourceByProject: Record<number, "v2" | "v1_bridge">;
};

/** 昼勤の残業のうち、この時間(×10, =5.0h)までは時間外(×1.25)。6時間目以降(5時間超)は深夜帯(×1.50)。作業員請求書と共通。 */
const DAY_OT_REGULAR_CAP_TIMES10 = 50;

/** V2 project-review statuses that mean "this project is closed → billable". */
const V2_PROJECT_CLOSED = "締め完了";
/** V2 participant statuses that mean "confirmed / billable". */
const V2_PARTICIPANT_CONFIRMED = new Set(["確認済み", "締め完了"]);
/** V1 closing statuses that allow client billing (legacy bridge). */
const V1_BILLABLE_CLOSING = new Set(["ready", "closed", "locked"]);

function toYearMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(targetMonth: string): { start: Date; end: Date } {
  const [year, month] = targetMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

/**
 * Build an editable client-invoice (取引先請求書) draft for selected projects + month.
 *
 * Primary source is Monthly Closing V2 (`monthly_closing_v2_*`): a project is billable when
 * its V2 project-review status is 締め完了, and the billable participants come from the V2
 * participant reviews (workerId set, not aggregation-excluded, confirmed status). Transport is
 * the V2 client-billable summary (isClientBillable, paid_by_client already excluded).
 *
 * During the V1→V2 transition this bridges to legacy V1 per project: if there is no V2 締め完了
 * review, it falls back to `project_closings` (ready/closed/locked) + `closing_submissions`. If a
 * V2-closed project has no participant reviews yet, it falls back to active project members with
 * attendance. Missing client rates do not hard-fail — the line is emitted at ¥0 with a warning so
 * an admin can set the rate and regenerate. The pure `computeClientInvoiceDraft` core is unchanged.
 */
export async function buildClientInvoiceDraftFromV2(args: {
  projectIds: number[];
  targetMonth: string;
  taxRates?: ClientInvoiceTaxRates;
  units?: ClientInvoiceUnits;
  overtimeMultiplier?: number;
  standardDayHours?: number;
  subject?: string;
  includeProjectSectionHeaders?: boolean;
  expectedClientId?: number;
}): Promise<ClientInvoiceV2Draft> {
  const projectIds = Array.from(new Set(args.projectIds.map(Number).filter(Boolean)));
  if (!projectIds.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "案件が選択されていません" });
  }

  const { start, end } = monthRange(args.targetMonth);

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

  const [
    allEmployees,
    v2ProjectReviews,
    v2ParticipantReviews,
    v2TransportSummary,
    companyProfile,
  ] = await Promise.all([
    db.getAllEmployees(),
    db.getMonthlyClosingV2ProjectReviewsByMonth(args.targetMonth),
    db.getMonthlyClosingV2ParticipantReviewsByMonth(args.targetMonth),
    db.getMonthlyClosingV2ClientTransportationBillingSummary(args.targetMonth),
    db.getCompanyProfile(),
  ]);

  // インボイス制度: 自社（発行者）がインボイス番号未登録なら作業費・残業代に消費税10%を適用しない（作業員請求書と同ルール）。
  const companyInvoiceNumber = (companyProfile as any)?.invoiceIssuerNumber;
  const issuerHasQualifiedInvoiceNumber =
    typeof companyInvoiceNumber === "string" && companyInvoiceNumber.trim().length > 0;

  const employeeName = (employeeId: number) => {
    const e = (allEmployees as any[]).find((emp) => Number(emp.id) === Number(employeeId));
    return e?.nameKanji || e?.nameRomaji || `従業員${employeeId}`;
  };

  const v2ProjectStatus = new Map<number, string>(
    (v2ProjectReviews as any[]).map((r) => [Number(r.projectId), String(r.status)])
  );
  const transportByProject = new Map<number, number>(
    (v2TransportSummary as any[]).map((row) => [Number(row.projectId), Number(row.totalAmount || 0)])
  );

  const warnings: string[] = [];
  const labor: ClientInvoiceLaborInput[] = [];
  const projectInputs: ClientInvoiceProjectInput[] = [];
  const closingSourceByProject: Record<number, "v2" | "v1_bridge"> = {};

  for (const project of resolvedProjects) {
    const projectId = Number(project.id);
    const projectName = project.name as string;

    // ── Gate: V2 締め完了 first, else legacy V1 closing status. ──
    let closingSource: "v2" | "v1_bridge";
    if (v2ProjectStatus.get(projectId) === V2_PROJECT_CLOSED) {
      closingSource = "v2";
    } else {
      const v1Closing = await db.getProjectClosingByProjectMonth(projectId, toYearMonth(start));
      if (v1Closing?.id && V1_BILLABLE_CLOSING.has(String(v1Closing.status))) {
        closingSource = "v1_bridge";
        warnings.push(`現場「${projectName}」は月締めV2が締め完了でないため、旧V1の締め状態(${v1Closing.status})で請求対象にしました。`);
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `請求対象外の締め状態です: ${projectName}`,
        });
      }
    }
    closingSourceByProject[projectId] = closingSource;

    // ── Billable participant ids for this project. ──
    const billableWorkerIds = new Set<number>();
    if (closingSource === "v2") {
      const reviews = (v2ParticipantReviews as any[]).filter((r) => Number(r.projectId) === projectId);
      for (const r of reviews) {
        if (r.workerId == null) continue; // guests excluded from aggregation
        if (r.isAggregationExcluded) continue;
        if (!V2_PARTICIPANT_CONFIRMED.has(String(r.individualStatus))) continue;
        billableWorkerIds.add(Number(r.workerId));
      }
      if (billableWorkerIds.size === 0) {
        // V2 closed but participant reviews not populated → fall back to active members with attendance.
        const members = await db.getProjectMembers(projectId);
        for (const m of members as any[]) {
          if (m.isActive && m.employeeId != null) billableWorkerIds.add(Number(m.employeeId));
        }
        warnings.push(`現場「${projectName}」の参加者確認データが見つからないため、稼働した在籍メンバーを請求対象にしました。`);
      }
    } else {
      // V1 bridge: closing_submissions (submitted/approved-ish) ∩ active members.
      const v1Closing = await db.getProjectClosingByProjectMonth(projectId, toYearMonth(start));
      const [submissions, members] = await Promise.all([
        v1Closing?.id ? db.getClosingSubmissionsByClosing(v1Closing.id) : Promise.resolve([]),
        db.getProjectMembers(projectId),
      ]);
      const activeMemberIds = new Set(
        (members as any[]).filter((m) => m.isActive).map((m) => Number(m.employeeId))
      );
      for (const s of submissions as any[]) {
        if (s.status !== "not_required" && activeMemberIds.has(Number(s.employeeId))) {
          billableWorkerIds.add(Number(s.employeeId));
        }
      }
    }

    // ── Aggregate attendance for billable workers, per (worker, shift). ──
    // 残業は日単位で band 分け（時間外/深夜帯）してから積み上げる（作業員請求書と同ルール）:
    //  - 夜勤の残業は全て深夜帯。昼勤は5hまで時間外・6時間目以降(5時間超)深夜帯。
    const records = await db.getAttendanceByDateRange(start, end, projectId);
    // 日数は出面（実働の重複なし日数）で数える。hoursWorked は将来の労基記録用で、日数換算には使わない。
    type Agg = { dateKeys: Set<string>; overtimeRegularTimes10: number; overtimeLateNightTimes10: number; sampleWorkDate: Date };
    const aggByWorkerShift = new Map<string, Agg>();
    for (const record of records as any[]) {
      const employeeId = Number(record.employeeId);
      if (!employeeId || !billableWorkerIds.has(employeeId)) continue;
      if (!isWorkedType(record.workType)) continue;
      const hoursWorked = Number(record.hoursWorked || 0);
      if (hoursWorked <= 0) continue;
      const shiftType = record.shiftType || "day";
      const workDateKey = extractDateKey(record.workDate);
      const workDate = new Date(`${workDateKey}T00:00:00.000Z`);
      const key = `${employeeId}:${shiftType}`;
      const agg = aggByWorkerShift.get(key) || { dateKeys: new Set<string>(), overtimeRegularTimes10: 0, overtimeLateNightTimes10: 0, sampleWorkDate: workDate };
      agg.dateKeys.add(workDateKey);
      const recOt = Math.max(0, Number(record.overtimeHours || 0));
      if (recOt > 0) {
        if (shiftType === "night") {
          agg.overtimeLateNightTimes10 += recOt;
        } else {
          const reg = Math.min(recOt, DAY_OT_REGULAR_CAP_TIMES10);
          agg.overtimeRegularTimes10 += reg;
          agg.overtimeLateNightTimes10 += recOt - reg;
        }
      }
      aggByWorkerShift.set(key, agg);
    }

    // ── Resolve client rate per (worker, shift); missing rate → null + warning (no hard fail). ──
    for (const [key, agg] of Array.from(aggByWorkerShift.entries())) {
      const [workerIdStr, shiftType] = key.split(":");
      const workerId = Number(workerIdStr);
      let clientRate: number | null = null;
      let clientRateSource: string | null = null;
      try {
        const resolved = await resolveClientBillingRate({
          projectId,
          employeeId: workerId,
          shiftType,
          workDate: agg.sampleWorkDate,
        });
        clientRate = resolved.rate;
        clientRateSource = rateSourceLabel(resolved.source);
      } catch {
        clientRate = null; // core emits a ¥0 line + warning
      }
      labor.push({
        projectId,
        projectName,
        workerId,
        workerName: employeeName(workerId),
        shiftType,
        daysTimes10: agg.dateKeys.size * 10,
        overtimeHoursTimes10: agg.overtimeRegularTimes10 + agg.overtimeLateNightTimes10,
        overtimeRegularTimes10: agg.overtimeRegularTimes10,
        overtimeLateNightTimes10: agg.overtimeLateNightTimes10,
        clientRate,
        clientRateSource,
      });
    }

    const transportTotal = closingSource === "v2" ? transportByProject.get(projectId) || 0 : 0;
    projectInputs.push({ projectId, projectName, transportTotal });
  }

  // 件名の既定形式（オーナー指定）: 「○○年○○月分請求書　取引先名○○様」。編集は請求書詳細で可能。
  const subject =
    args.subject?.trim() ||
    `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月分請求書　${client?.name || "取引先"}様`;

  const computed = computeClientInvoiceDraft({
    targetMonth: args.targetMonth,
    projectOrder: projectIds,
    projects: projectInputs,
    labor,
    taxRates: args.taxRates,
    units: args.units,
    overtimeMultiplier: args.overtimeMultiplier,
    standardDayHours: args.standardDayHours,
    includeProjectSectionHeaders: args.includeProjectSectionHeaders ?? projectIds.length > 1,
    issuerHasQualifiedInvoiceNumber,
  });

  return {
    ...computed,
    warnings: [...warnings, ...computed.warnings],
    clientId,
    client,
    projects: resolvedProjects,
    projectIds,
    primaryProjectId: projectIds.length === 1 ? projectIds[0] : null,
    periodStart: start,
    periodEnd: end,
    subject,
    closingSourceByProject,
  };
}
