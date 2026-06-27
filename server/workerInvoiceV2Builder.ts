import * as db from "./db";
import { resolveWorkerPaymentRate } from "./rateResolver";
import { computeWorkerInvoiceDraft, monthRange, type ExpenseLineLike, type WorkerInvoiceV2Draft, type WorkerInvoiceV2TaxRates } from "./workerInvoiceV2Core";

// Re-export the core types/helpers so existing importers keep working.
export * from "./workerInvoiceV2Core";

export type WorkerInvoiceV2DraftWithSource = WorkerInvoiceV2Draft & {
  /** Where the submission/expense data came from: native V2, or bridged from legacy V1. */
  submissionSource: "v2" | "v1_bridge";
};

/** V1 submission statuses that count as "the worker submitted their closing". */
const V1_SUBMITTED_STATUSES = new Set(["submitted", "approved"]);

/**
 * Build an editable worker-invoice draft for a single worker + month.
 *
 * Primary source is Monthly Closing V2 (`monthly_closing_v2_*`). During the V1→V2 transition,
 * the V2 worker-submission table and V2 expense lines may not be populated yet, while the real
 * submission signal and transport/expense amounts still live in legacy V1 (`closing_submissions`).
 * So this wrapper bridges: it uses V2 data when present, otherwise falls back to V1 for the gate
 * and for transport/expense. Labor always comes from shared `attendance`. The pure
 * `computeWorkerInvoiceDraft` core is unchanged — only its inputs are sourced V2-first, V1-fallback.
 */
export async function buildWorkerInvoiceDraftFromV2(args: {
  workerId: number;
  targetMonth: string;
  taxRates?: WorkerInvoiceV2TaxRates;
}): Promise<WorkerInvoiceV2DraftWithSource> {
  const { workerId, targetMonth } = args;
  const { start, end } = monthRange(targetMonth);
  const [v2Submission, records, v2ExpenseLines, v1Submissions] = await Promise.all([
    db.getMonthlyClosingV2WorkerSubmission(workerId, targetMonth),
    db.getAttendanceByDateRange(start, end),
    db.getMonthlyClosingV2ExpenseLinesByWorkerMonth(workerId, targetMonth),
    db.getClosingSubmissionsByEmployeeMonth(workerId, targetMonth),
  ]);

  // ── Submission gate: V2 status if present, else bridge from a V1 submitted/approved closing.
  let submissionStatus: string | undefined;
  let bridgedSubmission = false;
  if (v2Submission) {
    submissionStatus = String((v2Submission as any).status);
  } else if ((v1Submissions as any[]).some((s) => V1_SUBMITTED_STATUSES.has(String(s.status)))) {
    submissionStatus = "submitted";
    bridgedSubmission = true;
  }

  // ── Transport/expense: prefer V2 worker-paid lines; else bridge from V1 amounts (per project).
  let expenseLines = v2ExpenseLines as ExpenseLineLike[];
  let bridgedExpense = false;
  const hasV2WorkerExpense = (v2ExpenseLines as any[]).some(
    (line) => line.paymentMethod === "paid_by_worker" && Number(line.amount || 0) > 0
  );
  if (!hasV2WorkerExpense) {
    const bridged: ExpenseLineLike[] = [];
    for (const submission of v1Submissions as any[]) {
      const projectId = submission.projectId ?? null;
      if (Number(submission.transportAmount || 0) > 0) {
        bridged.push({ projectId, expenseType: "transportation", amount: Number(submission.transportAmount), paymentMethod: "paid_by_worker" });
      }
      if (Number(submission.expenseAmount || 0) > 0) {
        bridged.push({ projectId, expenseType: "other", amount: Number(submission.expenseAmount), paymentMethod: "paid_by_worker" });
      }
    }
    if (bridged.length > 0) {
      expenseLines = bridged;
      bridgedExpense = true;
    }
  }

  const draft = await computeWorkerInvoiceDraft({
    workerId,
    targetMonth,
    submissionStatus,
    attendanceRecords: records as any[],
    expenseLines,
    resolveRate: async ({ projectId, shiftType, workDate }) => {
      try {
        const resolved = await resolveWorkerPaymentRate({ projectId, employeeId: workerId, shiftType, workDate });
        return Number(resolved.rate || 0);
      } catch {
        return null;
      }
    },
    resolveProjectName: async (projectId) => {
      const project = await db.getProjectById(projectId);
      return project?.name ?? null;
    },
    taxRates: args.taxRates,
  });

  const submissionSource: "v2" | "v1_bridge" = bridgedSubmission || bridgedExpense ? "v1_bridge" : "v2";
  if (submissionSource === "v1_bridge") {
    draft.warnings.unshift("V2（新・月締め）未提出のため、V1（旧・月締め）のデータから暫定生成しています。V2移行後に再生成してください。");
  }

  return { ...draft, submissionSource };
}
