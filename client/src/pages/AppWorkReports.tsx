import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isManagerLikeAppRole } from "@/lib/appRoles";
import { usePdfViewer } from "@/components/PdfViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { CalendarDays, FileDown, Loader2 } from "lucide-react";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type WorkReportData = {
  employeeId: number;
  name: string;
  month: string;
  year: number;
  monthNum: number;
  daysInMonth: number;
  rows: Array<{
    day: number;
    weekday: number; // 0=日
    projectNames: string[];
    isNight: boolean;
    overtimeTimes10: number;
    transport: number;
  }>;
  summary: {
    dayShiftDays: number;
    nightShiftDays: number;
    overtimeHoursTimes10: number;
  };
  transportByProject: Array<{
    projectId: number;
    projectName: string;
    total: number;
    days: number;
  }>;
};

/** 土=青 / 日=赤 の文字色（それ以外は既定色） */
function weekdayClass(weekday: number) {
  if (weekday === 0) return "text-red-400";
  if (weekday === 6) return "text-blue-400";
  return "";
}

export default function AppWorkReports() {
  const { user } = useAuth();
  const isManager = isManagerLikeAppRole((user as any)?.appRole);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  // 未指定 = 自分。管理者系のみ他の作業員を選択できる。
  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [includeTransport, setIncludeTransport] = useState(true);
  const pdfViewer = usePdfViewer();

  const employeesQuery = trpc.employee.list.useQuery(undefined, {
    enabled: isManager,
  });
  // workReport ルーターの型がクライアント側 worktree に無い場合があるため any 経由で呼ぶ。
  const dataQuery = (trpc as any).workReport.data.useQuery(
    { month, employeeId },
    { enabled: /^\d{4}-\d{2}$/.test(month) }
  );
  const generatePdfMutation = (trpc as any).workReport.generatePdf.useMutation({
    onSuccess: (res: any) => {
      pdfViewer.open(res.url, res.fileName, "作業日報");
    },
    onError: (e: any) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const report: WorkReportData | undefined = dataQuery.data;
  const hasAttendance =
    !!report &&
    report.summary.dayShiftDays + report.summary.nightShiftDays > 0;

  // 1日〜月末まで全日を行として並べる（出勤していない日は空欄で残す）。
  const rows = useMemo(() => {
    if (!report) return [];
    const byDay = new Map(report.rows.map(r => [r.day, r]));
    return Array.from({ length: report.daysInMonth }, (_, i) => {
      const day = i + 1;
      const r = byDay.get(day);
      return {
        day,
        weekday:
          r?.weekday ?? new Date(report.year, report.monthNum - 1, day).getDay(),
        projectNames: r?.projectNames ?? [],
        isNight: !!r?.isNight,
        overtimeTimes10: r?.overtimeTimes10 ?? 0,
        transport: r?.transport ?? 0,
      };
    });
  }, [report]);

  const columnCount = includeTransport ? 4 : 3;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">作業日報</h1>
          <p className="text-sm text-muted-foreground">
            月ごとの勤務記録（現場・残業・交通費）を確認・PDF出力できます
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="w-full sm:w-[180px]">
            <Label className="text-xs text-muted-foreground">対象月</Label>
            <Input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
            />
          </div>
          {isManager && (
            <div className="w-full sm:w-[240px]">
              <Label className="text-xs text-muted-foreground">作業員</Label>
              <Select
                value={employeeId ? String(employeeId) : "me"}
                onValueChange={v =>
                  setEmployeeId(v === "me" ? undefined : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="作業員を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">自分</SelectItem>
                  {(employeesQuery.data || []).map((emp: any) => (
                    <SelectItem key={emp.id} value={String(emp.id)}>
                      {emp.nameKanji || emp.nameRomaji || `ID:${emp.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {dataQuery.isLoading ? (
        <Card>
          <CardContent className="py-12 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
          </CardContent>
        </Card>
      ) : dataQuery.error ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <div className="text-lg font-medium">作業日報を取得できませんでした</div>
            <p className="text-sm text-muted-foreground">
              {dataQuery.error.message}
            </p>
          </CardContent>
        </Card>
      ) : !report || !hasAttendance ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>この月の出面がありません</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
              <span>
                {report.year}年{report.monthNum}月 作業日報
                <span className="ml-3 text-sm font-normal text-muted-foreground">
                  {report.name}
                </span>
              </span>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    id="include-transport"
                    checked={includeTransport}
                    onCheckedChange={setIncludeTransport}
                  />
                  <Label
                    htmlFor="include-transport"
                    className="text-sm font-normal text-muted-foreground cursor-pointer"
                  >
                    交通費を記載する
                  </Label>
                </div>
                <Button
                  size="sm"
                  className="bg-gold text-background hover:bg-gold-dim"
                  disabled={generatePdfMutation.isPending}
                  onClick={() =>
                    generatePdfMutation.mutate({ month, employeeId, includeTransport })
                  }
                >
                  {generatePdfMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-1.5" />
                  )}
                  PDFダウンロード
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[110px]">日付</TableHead>
                    <TableHead>現場名</TableHead>
                    <TableHead className="w-[90px] text-right">残業(h)</TableHead>
                    {includeTransport && (
                      <TableHead className="w-[110px] text-right">交通費(円)</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.day}>
                      <TableCell
                        className={`whitespace-nowrap tabular-nums ${weekdayClass(row.weekday)}`}
                      >
                        {row.day}日（{WEEKDAY_LABELS[row.weekday]}）
                      </TableCell>
                      <TableCell
                        className={
                          row.isNight ? "bg-purple-200/20 text-purple-300" : ""
                        }
                      >
                        {row.projectNames.length > 0
                          ? `${row.projectNames.join("、")}${row.isNight ? " [夜]" : ""}`
                          : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.overtimeTimes10 > 0 ? row.overtimeTimes10 / 10 : ""}
                      </TableCell>
                      {includeTransport && (
                        <TableCell className="text-right tabular-nums">
                          {row.transport > 0
                            ? row.transport.toLocaleString("ja-JP")
                            : ""}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={columnCount - 1}>昼勤出勤日数</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {report.summary.dayShiftDays}日
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={columnCount - 1}>夜勤出勤日数</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {report.summary.nightShiftDays}日
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={columnCount - 1}>残業時間</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {report.summary.overtimeHoursTimes10 / 10}h
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            {includeTransport && report.transportByProject.length > 0 && (
              <p className="text-xs text-muted-foreground">
                交通費内訳（現場別・本人提出分）:{" "}
                {report.transportByProject
                  .map(
                    tp =>
                      `${tp.projectName} ¥${tp.total.toLocaleString("ja-JP")}（${tp.days}日で日割り）`
                  )
                  .join(" ／ ")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {pdfViewer.dialog}
    </div>
  );
}
