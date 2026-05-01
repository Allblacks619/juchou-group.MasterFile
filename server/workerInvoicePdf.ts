export type WorkerInvoicePreviewModel = {
  invoiceId: number;
  invoiceNumber: string | null;
  issueDate: string;
  subject: string;
  company: { name: string; address?: string | null; phone?: string | null };
  worker: { employeeId: number; name: string; bankInfo?: string | null; sealImageUrl?: string | null };
  lineItems: Array<{ label: string; quantity: number; unitPrice: number; amount: number; taxRate: number }>;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  supportingDocuments: Array<{ id: number; fileKey: string; originalFileName?: string | null }>;
};

export function buildWorkerInvoicePdfRenderPayload(model: WorkerInvoicePreviewModel) {
  return {
    renderVersion: 1,
    format: 'worker-invoice-v1',
    printable: false,
    message: 'PDF renderer scaffold: use this payload for final printable template.',
    model,
  };
}
