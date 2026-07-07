import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, FileDown, History, FileText } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAppLang } from "@/contexts/AppLanguageContext";
import { usePdfViewer } from "@/components/PdfViewer";

function buildMonthString(year: string, month: string): string {
  return `${year}-${month.padStart(2, "0")}`;
}

export default function AppConfirmationPdf() {
  const { user } = useAuth();
  const { t } = useAppLang();

  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1);

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const pdfViewer = usePdfViewer();

  const closingMonth = buildMonthString(selectedYear, selectedMonth);

  // Get employees list (for managers)
  const employeesQuery = trpc.employee.list.useQuery(undefined, {
    enabled: !!user,
  });

  // Get current user's employee info
  const meQuery = trpc.employee.getMyProfile.useQuery(undefined, {
    enabled: !!user,
  });

  // Set default employee when loaded
  React.useEffect(() => {
    if (meQuery.data && !selectedEmployeeId) {
      setSelectedEmployeeId(meQuery.data.id);
    }
  }, [meQuery.data, selectedEmployeeId]);

  // Get confirmation PDF history
  const historyQuery = trpc.closing.confirmationPdfHistory.useQuery(
    { employeeId: selectedEmployeeId!, closingMonth },
    { enabled: !!selectedEmployeeId }
  );

  const generateMutation = trpc.closing.generateConfirmationPdf.useMutation({
    onSuccess: (data) => {
      toast.success("確認表PDFを生成しました");
      pdfViewer.open(data.url, "確認表.pdf", "確認表PDF");
      historyQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "PDF生成に失敗しました");
    },
  });

  const handleGenerate = () => {
    if (!selectedEmployeeId) {
      toast.error("従業員を選択してください");
      return;
    }
    setGenerating(true);
    generateMutation.mutate(
      {
        employeeId: selectedEmployeeId,
        closingMonth,
      },
      { onSettled: () => setGenerating(false) }
    );
  };

  const years = useMemo(() => {
    const arr = [];
    for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      arr.push(String(y));
    }
    return arr;
  }, []);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => String(i + 1));
  }, []);

  const isManager = (user as any)?.appRole === "admin" || (user as any)?.appRole === "super_admin" || (user as any)?.appRole === "manager";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("confirmation_pdf_title")}</h1>
      </div>

      {/* Generation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            確認表PDF生成
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Year/Month selector */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">年</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}年
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">月</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}月
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Employee selector (managers only) */}
          {isManager && employeesQuery.data && (
            <div>
              <label className="text-sm font-medium mb-1 block">従業員</label>
              <Select
                value={selectedEmployeeId ? String(selectedEmployeeId) : ""}
                onValueChange={(v) => setSelectedEmployeeId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="従業員を選択" />
                </SelectTrigger>
                <SelectContent>
                  {employeesQuery.data.map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.nameKanji || emp.nameRomaji || `ID:${emp.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={generating || !selectedEmployeeId}
            className="w-full"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                確認表PDFを生成
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            生成履歴
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !historyQuery.data || historyQuery.data.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              まだ生成履歴がありません
            </p>
          ) : (
            <div className="space-y-2">
              {historyQuery.data.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {item.closingMonth || "不明"} - 従業員月次PDF
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleString("ja-JP")
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {pdfViewer.dialog}
    </div>
  );
}
