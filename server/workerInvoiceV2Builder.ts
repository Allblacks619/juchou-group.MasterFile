import * as db from "./db";
import { resolveWorkerPaymentRate } from "./rateResolver";
import { computeWorkerInvoiceDraft, monthRange, type WorkerInvoiceV2Draft, type WorkerInvoiceV2TaxRates } from "./workerInvoiceV2Core";

// Re-export the core types/helpers so existing importers keep working.
export * from "./workerInvoiceV2Core";

/**
 * Build an editable worker-invoice draft for a single worker + month from Monthly Closing V2 data.
 *
 * Thin DB-backed wrapper around the pure `computeWorkerInvoiceDraft` core: it fetches the worker's
 * V2 submission, their attendance for the month, and their V2 expense lines, then delegates all
 * business logic to the core. A missing worker rate is surfaced as `null` (→ warning) rather than
 * throwing, so the draft can still be produced.
 */
export async function buildWorkerInvoiceDraftFromV2(args: {
  workerId: number;
  targetMonth: string;
  taxRates?: WorkerInvoiceV2TaxRates;
}): Promise<WorkerInvoiceV2Draft> {
  const { workerId, targetMonth } = args;
  const submission = await db.getMonthlyClosingV2WorkerSubmission(workerId, targetMonth);
  const { start, end } = monthRange(targetMonth);
  const [records, expenseLines] = await Promise.all([
    db.getAttendanceByDateRange(start, end),
    db.getMonthlyClosingV2ExpenseLinesByWorkerMonth(workerId, targetMonth),
  ]);

  return computeWorkerInvoiceDraft({
    workerId,
    targetMonth,
    submissionStatus: submission ? String((submission as any).status) : undefined,
    attendanceRecords: records as any[],
    expenseLines: expenseLines as any[],
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
}
