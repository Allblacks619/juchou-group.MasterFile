// PATCH 01: server/routers.ts
// Goal: replace old worker payment rate calculation with resolveWorkerPaymentRate.
// Do not replace the entire routers.ts file.

// Find old helper function:
// function findBestWorkerRate(rates: any[], employeeId: number, shiftType: string) { ... }
// After this patch, findBestWorkerRate should be unused and can be removed.

// In ensurePaymentRowsForProjectMonth(), remove `rates` from this Promise.all:
// const [submissions, rates] = await Promise.all([
//   db.getClosingSubmissionsByClosing(closing.id!),
//   db.getRatesByProject(projectId),
// ]);
//
// Replace with:
const submissions = await db.getClosingSubmissionsByClosing(closing.id!);

// Then replace this old loop:
//
// for (const [shiftType, totalHoursTimes10] of Array.from(byShift.entries())) {
//   const daysTimes10 = Math.round(totalHoursTimes10 / 8);
//   baseDaysTimes10 += daysTimes10;
//   const rate = findBestWorkerRate(rates as any[], submission.employeeId, shiftType);
//   const workerRate = rate?.workerRate || 0;
//   baseAmount += Math.round((daysTimes10 / 10) * workerRate);
// }
//
// With this:

for (const [shiftType, totalHoursTimes10] of Array.from(byShift.entries())) {
  const daysTimes10 = Math.round(totalHoursTimes10 / 8);
  if (daysTimes10 <= 0) continue;

  baseDaysTimes10 += daysTimes10;

  const sampleRecord = empRecords.find((rec: any) => (rec.shiftType || "day") === shiftType);
  const workDate = sampleRecord?.workDate
    ? (sampleRecord.workDate instanceof Date ? sampleRecord.workDate : new Date(sampleRecord.workDate))
    : start;

  const resolvedWorkerRate = await resolveWorkerPaymentRate({
    projectId,
    employeeId: submission.employeeId,
    shiftType,
    workDate,
  });

  baseAmount += Math.round((daysTimes10 / 10) * resolvedWorkerRate.rate);
}

// Expected behavior:
// - project-specific worker rate wins
// - fixed employee worker rate from worker_base_rates is fallback
// - missing rate throws clear BAD_REQUEST from rateResolver
