import PDFDocument from "pdfkit";

export type WorkerInvoicePreviewModel = {
  invoiceId: number;
  invoiceNumber: string | null;
  issueDate: string;
  closingMonth?: string;
  projectName?: string | null;
  subject: string;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  worker: {
    employeeId: number; name: string; address?: string | null; phone?: string | null; email?: string | null;
    bankInfo?: string | null; sealImageUrl?: string | null; invoiceRegistrationNumber?: string | null;
  };
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
    previewOnly: true,
    printablePdfAvailable: true,
    message: 'UI preview metadata. Use workerInvoice.downloadMyInvoicePdf for the printable PDF.',
    model,
  };
}

export async function generateWorkerInvoicePdf(model: WorkerInvoicePreviewModel): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, left: 40, right: 40, bottom: 40 } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const left = 40;
  const right = 555;
  let y = 40;
  doc.fontSize(20).text("請求書", left, y, { width: right - left, align: "center" });
  y += 34;
  doc.fontSize(10);
  const meta = [
    `請求書番号: ${model.invoiceNumber || `WI-${model.invoiceId}`}`,
    `発行日: ${model.issueDate}`,
    `締め月: ${model.closingMonth || "-"}`,
    `現場: ${model.projectName || "-"}`,
  ];
  meta.forEach((m) => { doc.text(m, left, y); y += 14; });
  y += 6;
  doc.text(`宛先: ${model.company.name}`, left, y); y += 14;
  if (model.company.address) { doc.text(`住所: ${model.company.address}`, left, y); y += 14; }
  if (model.company.phone || model.company.email) { doc.text(`連絡先: ${model.company.phone || "-"} / ${model.company.email || "-"}`, left, y); y += 14; }
  y += 4;
  doc.text(`請求者: ${model.worker.name}`, left, y); y += 14;
  if (model.worker.address) { doc.text(`住所: ${model.worker.address}`, left, y); y += 14; }
  if (model.worker.phone || model.worker.email) { doc.text(`連絡先: ${model.worker.phone || "-"} / ${model.worker.email || "-"}`, left, y); y += 14; }
  if (model.worker.invoiceRegistrationNumber) { doc.text(`適格請求書番号: ${model.worker.invoiceRegistrationNumber}`, left, y); y += 14; }
  y += 4;
  doc.text(`件名: ${model.subject}`, left, y); y += 20;
  doc.text("明細", left, y); y += 14;
  model.lineItems.forEach((li, i) => {
    doc.text(`${i + 1}. ${li.label}`, left, y, { width: 250 });
    doc.text(`${li.quantity}`, 300, y, { width: 50, align: "right" });
    doc.text(`${li.unitPrice.toLocaleString("ja-JP")}`, 360, y, { width: 80, align: "right" });
    doc.text(`${li.taxRate}%`, 445, y, { width: 40, align: "right" });
    doc.text(`${li.amount.toLocaleString("ja-JP")}`, 490, y, { width: 65, align: "right" });
    y += 14;
  });
  y += 8;
  doc.text(`小計: ${model.subtotal.toLocaleString("ja-JP")} 円`, 350, y, { width: 205, align: "right" }); y += 14;
  doc.text(`消費税: ${model.tax.toLocaleString("ja-JP")} 円`, 350, y, { width: 205, align: "right" }); y += 14;
  doc.fontSize(12).text(`合計: ${model.total.toLocaleString("ja-JP")} 円`, 350, y, { width: 205, align: "right" }); y += 18;
  doc.fontSize(10).text(`振込先: ${model.worker.bankInfo || "-"}`, left, y); y += 16;
  doc.text(`備考: ${model.notes || "-"}`, left, y, { width: right - left }); y += 20;
  doc.text("添付資料", left, y); y += 14;
  for (const d of model.supportingDocuments) {
    doc.text(`- ${d.originalFileName || d.fileKey}`, left, y); y += 12;
  }
  doc.end();
  await new Promise((resolve) => doc.on("end", resolve));
  return Buffer.concat(chunks);
}
