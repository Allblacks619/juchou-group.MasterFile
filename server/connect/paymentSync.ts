import * as connectDb from "./db";
import { isMultiTenantEnabled } from "../tenancy";

/**
 * 提出側の入金操作（receivable.update / markReceived / markUnreceived）を
 * partner_invoice_submissions へ反映する（Phase 4 PR2・入金/支払の対称表示）。
 * 受領側の受領箱に「相手の入金状況」を表示するためだけのもので、強制同期はしない。
 * connect 層の不調で入金記録の本処理を落とさないため、失敗はログのみで握りつぶす。
 */
export async function reflectSubmitterPaymentStatus(
  companyId: number | undefined,
  invoiceId: number,
  status: "partial" | "paid" | null,
): Promise<void> {
  if (!isMultiTenantEnabled() || companyId == null) return;
  try {
    const subs = await connectDb.listInvoiceSubmissionsByInvoiceRef(companyId, invoiceId);
    for (const sub of subs) {
      await connectDb.updateInvoiceSubmission(sub.id, {
        submitterPaymentStatus: status,
        submitterPaidAt: status === "paid" ? new Date() : null,
      } as any);
    }
  } catch (error) {
    console.error("[connect] reflectSubmitterPaymentStatus failed", error);
  }
}
