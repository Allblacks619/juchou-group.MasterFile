import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, FileCheck2, Loader2, RefreshCw } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  not_submitted: "未提出",
  submitted: "提出済",
  sent_back: "差戻し",
  accepted: "受理済",
  ready_to_close: "締め可能",
  closed: "締め済み",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  not_submitted: "bg-muted text-muted-foreground border-border",
  submitted: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  sent_back: "bg-red-500/10 text-red-500 border-red-500/20",
  accepted: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  ready_to_close: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  closed: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function warningLabel(warning: string | null | undefined) {
  if (!warning || warning === "placeholder") return "確認待ち";
  return warning;
}

export default function AppMonthlyCloseV2() {
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth());
  const queryInput = useMemo(() => ({ targetMonth }), [targetMonth]);
  const dashboardQuery = trpc.monthlyClosingV2.dashboard.useQuery(queryInput);

  const rows = dashboardQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileCheck2 className="h-6 w-6 text-gold" />
            月締めV2
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            出面データを元にした新しい月締めフローの基盤画面です。
          </p>
        </div>
        <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          {dashboardQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          更新
        </Button>
      </div>

      <Alert>
        <CalendarDays className="h-4 w-4" />
        <AlertTitle>Phase 1 基盤</AlertTitle>
        <AlertDescription>
          この画面は既存の締め管理画面に依存せず、既存の出面レコードから従業員・現場別の基礎データのみを表示します。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>対象月</CardTitle>
          <CardDescription>表示する月を選択してください。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Input
              type="month"
              value={targetMonth}
              onChange={(event) => setTargetMonth(event.target.value || getCurrentMonth())}
              aria-label="対象月"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>月締めV2 ダッシュボード</CardTitle>
          <CardDescription>対象月: {targetMonth}</CardDescription>
        </CardHeader>
        <CardContent>
          {dashboardQuery.isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              読み込み中
            </div>
          ) : dashboardQuery.isError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              データの取得に失敗しました: {dashboardQuery.error.message}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              データがありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>対象月</TableHead>
                    <TableHead>従業員</TableHead>
                    <TableHead>現場 / プロジェクト</TableHead>
                    <TableHead className="text-right">出面件数</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead>警告</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.workerId}-${row.projectId}`}>
                      <TableCell className="whitespace-nowrap">{row.targetMonth}</TableCell>
                      <TableCell className="font-medium">{row.workerName}</TableCell>
                      <TableCell>{row.projectName}</TableCell>
                      <TableCell className="text-right">{row.attendanceCount.toLocaleString("ja-JP")}</TableCell>
                      <TableCell>
                        <Badge className={STATUS_BADGE_CLASS[row.status] || STATUS_BADGE_CLASS.not_submitted} variant="outline">
                          {STATUS_LABELS[row.status] || "未提出"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{warningLabel(row.warning)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
