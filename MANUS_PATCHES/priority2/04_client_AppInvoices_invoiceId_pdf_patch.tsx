// PATCH 04: client/src/pages/AppInvoices.tsx
// Goal: /app/invoices?invoiceId=<id> opens invoice edit/detail.
// PDF output happens only here.

import { useEffect } from "react";
import { useLocation } from "wouter";

// Inside AppInvoices component:
const [location, setLocation] = useLocation();
const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const invoiceIdParam = params.get("invoiceId");
  if (invoiceIdParam) {
    const id = Number(invoiceIdParam);
    if (!Number.isNaN(id)) setSelectedInvoiceId(id);
  }
}, [location]);

// If an invoice detail dialog already exists, reuse it.
// Make sure it opens when selectedInvoiceId is set.

{selectedInvoiceId && (
  <Dialog open={!!selectedInvoiceId} onOpenChange={(open) => {
    if (!open) {
      setSelectedInvoiceId(null);
      setLocation("/app/invoices");
    }
  }}>
    <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>請求書編集・プレビュー</DialogTitle>
      </DialogHeader>
      <InvoiceDetailDialog
        invoiceId={selectedInvoiceId}
        onClose={() => {
          setSelectedInvoiceId(null);
          setLocation("/app/invoices");
        }}
      />
    </DialogContent>
  </Dialog>
)}

// Inside InvoiceDetailDialog:
// Keep/edit existing preview.
// Add PDF button that calls invoice.generatePdf only from this page.

const generatePdfMutation = trpc.invoice.generatePdf.useMutation({
  onSuccess: (data: any) => {
    toast.success("PDFを出力しました");
    if (data.url) window.open(data.url, "_blank");
    detailQuery.refetch();
  },
  onError: (e: any) => toast.error(`PDF出力エラー: ${e.message}`),
});

// Action area:
<Button variant="outline" onClick={() => setActiveTab("preview")}>
  プレビュー
</Button>

<Button
  onClick={() => generatePdfMutation.mutate({ id: invoice.id })}
  disabled={generatePdfMutation.isPending}
>
  {generatePdfMutation.isPending ? "PDF出力中..." : "PDF出力"}
</Button>
