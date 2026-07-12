import { useMemo, useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, ChevronRight, FileDown, Loader2 } from "lucide-react";

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

function yen(n: number) {
  return `¥${Number(n || 0).toLocaleString("ja-JP")}`;
}

/** 土=青 / 日=赤 の文字色（それ以外は既定色） */
function weekdayClass(weekday: number) {
  if (weekday === 0) return "text-red-400";
  if (weekday === 6) return "text-blue-400";
  return "";
}

/** 日別テーブル（日付/現場名/残業/交通費）＋集計3行。作業員ビューと管理者ドリルダウンで共用。 */
function WorkReportDailyTable({ report, includeTransport }: { report: WorkReportData; includeTransport: boolean }) {
  // 1日〜月末まで全日を行として並べる（出勤していない日は空欄で残す）。
  const rows = useMemo(() => {
    const byDay = new Map(report.rows.map(r => [r.day, r]));
    return Array.from({ length: report.daysInMonth }, (_, i) => {
      const day = i + 1;
      const r = byDay.get(day);
      return {
        day,
        weekday: r?.weekday ?? new Date(report.year, report.monthNum - 1, day).getDay(),
        projectNames: r?.projectNames ?? [],
        isNight: !!r?.isNight,
        overtimeTimes10: r?.overtimeTimes10 ?? 0,
        transport: r?.transport ?? 0,
      };
    });
  }, [report]);

  const columnCount = includeTransport ? 4 : 3;

  return (
    <div className="space-y-3">
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
                  className={row.isNight ? "bg-purple-200/20 text-purple-300" : ""}
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
                    {row.transport > 0 ? row.transport.toLocaleString("ja-JP") : ""}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={columnCount - 1}>昼勤出勤日数</TableCell>
              <TableCell className="text-right tabular-nums">{report.summary.dayShiftDays}日</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={columnCount - 1}>夜勤出勤日数</TableCell>
              <TableCell className="text-right tabular-nums">{report.summary.nightShiftDays}日</TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={columnCount - 1}>残業時間</TableCell>
              <TableCell className="text-right tabular-nums">{report.summary.overtimeHoursTimes10 / 10}h</TableCell>
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
    </div>
  );
}

export default function AppWorkReports() {
  const { user } = useAuth();
  const isManager = isManagerLikeAppRole((user as any)?.appRole);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const pdfViewer = usePdfViewer();

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">作業日報</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? "年月を選ぶと対象作業員が一覧表示されます。行をタップで内訳（検算）を確認できます。"
              : "月ごとの勤務記録（現場・残業・交通費）を確認・PDF出力できます"}
          </p>
        </div>
        <div className="w-full sm:w-[180px]">
          <Label className="text-xs text-muted-foreground">対象月</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>

      {isManager ? (
        <ManagerWorkReportList month={month} pdfViewer={pdfViewer} />
      ) : (
        <WorkerWorkReportView month={month} pdfViewer={pdfViewer} />
      )}

      {pdfViewer.dialog}
    </div>
  );
}

/** 管理者向け: 年月選択→対象作業員を一覧（行）表示。行タップで日報の検算ドリルダウン。 */
function ManagerWorkReportList({ month, pdfViewer }: { month: string; pdfViewer: ReturnType<typeof usePdfViewer> }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [includeTransport, setIncludeTransport] = useState(true);

  const listQuery = trpc.workReport.monthList.useQuery(
    { month },
    { enabled: /^\d{4}-\d{2}$/.test(month) }
  );
  const rows = listQuery.data?.rows || [];

  const generatePdfMutation = trpc.workReport.generatePdf.useMutation({
    onSuccess: (res: any) => pdfViewer.open(res.url, res.fileName, "作業日報"),
    onError: (e: any) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  return (
    <Card>
      <CardContent className="p-0">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">この月の出面がありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2.5 w-8"></th>
                  <th className="text-left font-medium px-2 py-2.5">作業員</th>
                  <th className="text-right font-medium px-2 py-2.5">昼勤日数</th>
                  <th className="text-right font-medium px-2 py-2.5">夜勤日数</th>
                  <th className="text-right font-medium px-2 py-2.5">残業(h)</th>
                  <th className="text-right font-medium px-2 py-2.5">交通費対象</th>
                  <th className="px-2 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w: any) => {
                  const isOpen = expanded === w.employeeId;
                  return (
                    <>
                      <tr
                        key={w.employeeId}
                        className={`border-b border-border/60 cursor-pointer transition-colors hover:bg-muted/20 ${isOpen ? "bg-muted/20" : ""}`}
                        onClick={() => setExpanded(isOpen ? null : w.employeeId)}
                      >
                        <td className="px-3 py-3 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-2 py-3 font-medium">{w.name}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{w.dayShiftDays}日</td>
                        <td className="px-2 py-3 text-right tabular-nums">{w.nightShiftDays}日</td>
                        <td className="px-2 py-3 text-right tabular-nums">{w.overtimeHoursTimes10 / 10}</td>
                        <td className="px-2 py-3 text-right tabular-nums">
                          {w.projectCount > 0 ? `${w.projectCount}現場・${yen(w.transportTotal)}` : "—"}
                        </td>
                        <td className="px-2 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm" variant="outline" className="h-8 gap-1"
                            disabled={generatePdfMutation.isPending}
                            onClick={() => generatePdfMutation.mutate({ month, employeeId: w.employeeId, includeTransport })}
                          >
                            <FileDown className="h-3.5 w-3.5" />PDF
                          </Button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${w.employeeId}-d`} className="bg-muted/10">
                          <td colSpan={7} className="px-3 py-4">
                            <ManagerWorkReportDrilldown
                              employeeId={w.employeeId}
                              month={month}
                              includeTransport={includeTransport}
                              setIncludeTransport={setIncludeTransport}
                              generatePdfMutation={generatePdfMutation}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 検算ドリルダウン: その作業員の日報（日別テーブル＋集計）。交通費記載トグルとPDF出力を併設。 */
function ManagerWorkReportDrilldown({
  employeeId,
  month,
  includeTransport,
  setIncludeTransport,
  generatePdfMutation,
}: {
  employeeId: number;
  month: string;
  includeTransport: boolean;
  setIncludeTransport: (v: boolean) => void;
  generatePdfMutation: ReturnType<typeof trpc.workReport.generatePdf.useMutation>;
}) {
  const dataQuery = trpc.workReport.data.useQuery({ month, employeeId });
  const report: WorkReportData | undefined = dataQuery.data;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch
            id={`include-transport-${employeeId}`}
            checked={includeTransport}
            onCheckedChange={setIncludeTransport}
          />
          <Label
            htmlFor={`include-transport-${employeeId}`}
            className="text-sm font-normal text-muted-foreground cursor-pointer"
          >
            交通費を記載する
          </Label>
        </div>
        <Button
          size="sm"
          className="bg-gold text-background hover:bg-gold-dim"
          disabled={generatePdfMutation.isPending}
          onClick={() => generatePdfMutation.mutate({ month, employeeId, includeTransport })}
        >
          {generatePdfMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4 mr-1.5" />
          )}
          PDFダウンロード
        </Button>
      </div>
      {dataQuery.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
      ) : !report ? (
        <p className="text-sm text-muted-foreground py-4">日報データがありません</p>
      ) : (
        <WorkReportDailyTable report={report} includeTransport={includeTransport} />
      )}
    </div>
  );
}

/** 作業員本人ビュー: 自分の月別日報＋PDF出力（従来どおり）。 */
function WorkerWorkReportView({ month, pdfViewer }: { month: string; pdfViewer: ReturnType<typeof usePdfViewer> }) {
  const [includeTransport, setIncludeTransport] = useState(true);
  const dataQuery = trpc.workReport.data.useQuery(
    { month },
    { enabled: /^\d{4}-\d{2}$/.test(month) }
  );
  const generatePdfMutation = trpc.workReport.generatePdf.useMutation({
    onSuccess: (res: any) => {
      pdfViewer.open(res.url, res.fileName, "作業日報");
    },
    onError: (e: any) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const report: WorkReportData | undefined = dataQuery.data;
  const hasAttendance =
    !!report && report.summary.dayShiftDays + report.summary.nightShiftDays > 0;

  if (dataQuery.isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </CardContent>
      </Card>
    );
  }
  if (dataQuery.error) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-2">
          <div className="text-lg font-medium">作業日報を取得できませんでした</div>
          <p className="text-sm text-muted-foreground">{dataQuery.error.message}</p>
        </CardContent>
      </Card>
    );
  }
  if (!report || !hasAttendance) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>この月の出面がありません</p>
        </CardContent>
      </Card>
    );
  }

  return (
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
                generatePdfMutation.mutate({ month, includeTransport })
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
      <CardContent>
        <WorkReportDailyTable report={report} includeTransport={includeTransport} />
      </CardContent>
    </Card>
  );
}
