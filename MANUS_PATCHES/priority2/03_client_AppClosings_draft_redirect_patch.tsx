// PATCH 03: client/src/pages/AppClosings.tsx
// Goal: closing page creates invoice draft and redirects to invoice edit page.
// Do not open/download PDF from AppClosings.

// Ensure useLocation is available:
import { useLocation } from "wouter";

// Inside component:
const [, setLocation] = useLocation();

const [invoiceProjectIds, setInvoiceProjectIds] = useState<number[]>([]);

useEffect(() => {
  if (selectedProjectId) setInvoiceProjectIds([selectedProjectId]);
}, [selectedProjectId]);

const createInvoiceDraftMutation = trpc.closing.generateForClosing.useMutation({
  onSuccess: (data: any) => {
    toast.success(data.message || "請求書ドラフトを作成しました");
    if (data.editUrl) {
      setLocation(data.editUrl);
    } else if (data.invoiceId) {
      setLocation(`/app/invoices?invoiceId=${data.invoiceId}`);
    }
  },
  onError: (e: any) => toast.error(`請求書ドラフト作成エラー: ${e.message}`),
});

// Existing same-client selection should set invoiceProjectIds.
// If sameClientInvoiceCandidates is already rendered, keep it.
// If the action button still says 請求書出力, change it to:

<Button
  onClick={() => createInvoiceDraftMutation.mutate({
    projectIds: invoiceProjectIds.length ? invoiceProjectIds : [selectedProjectId],
    closingMonth,
  })}
  disabled={!selectedProjectId || createInvoiceDraftMutation.isPending}
>
  {createInvoiceDraftMutation.isPending ? "作成中..." : "請求書ドラフト作成"}
</Button>

<p className="text-xs text-muted-foreground">
  PDFはここでは出力しません。ドラフト作成後、請求書編集画面で確認・編集してからPDF出力します。
</p>
