import { Fragment, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarDays, ChevronDown, ChevronRight, FileCheck2, Loader2, RefreshCw } from "lucide-react";

const PROJECT_STATUS_BADGE_CLASS: Record<string, string> = {
  未着手: "bg-muted text-muted-foreground border-border",
  確認中: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  情報不足: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  差し戻しあり: "bg-red-500/10 text-red-500 border-red-500/20",
  締め完了: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

const PARTICIPANT_STATUS_BADGE_CLASS: Record<string, string> = {
  未確認: "bg-muted text-muted-foreground border-border",
  出面確認済み: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  交通費未入力: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  情報不足: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  差し戻し: "bg-red-500/10 text-red-500 border-red-500/20",
  確認済み: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  締め完了: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function warningLabel(warningCount: number | null | undefined) {
  return `${warningCount ?? 0}件`;
}

export default function AppMonthlyCloseV2() {
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth());
  const [openProjectIds, setOpenProjectIds] = useState<Set<number>>(new Set());
  const queryInput = useMemo(() => ({ targetMonth }), [targetMonth]);

  const dashboardQuery = trpc.monthlyClosingV2.projectDashboard.useQuery(queryInput);
  const projectRows = dashboardQuery.data?.projects ?? [];

  const toggleProject = (projectId: number) => {
    setOpenProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileCheck2 className="h-6 w-6 text-gold" />
            月締めV2
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            対象月 × 現場 / プロジェクト単位で月締めを管理します。作業員情報は各現場の参加者明細で確認します。
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => dashboardQuery.refetch()}
          disabled={dashboardQuery.isFetching}
        >
          {dashboardQuery.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          更新
        </Button>
      </div>
      <Alert>
        <CalendarDays className="h-4 w-4" />
        <AlertTitle>Phase 2A</AlertTitle>
        <AlertDescription>
          この画面は既存の締め管理画面に依存せず、既存の出面レコードから対象月・現場別の月締めダッシュボードを表示します。
          ゲストは「ゲスト / 集計対象外」として表示し、検証・請求集計の対象には含めません。
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
              onChange={(e) => setTargetMonth(e.target.value || getCurrentMonth())}
              aria-label="対象月"
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>現場一覧</CardTitle>
          <CardDescription>対象月: {formatMonth(targetMonth)}</CardDescription>
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
          ) : projectRows.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              データがありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>対象月</TableHead>
                    <TableHead>取引先</TableHead>
                    <TableHead>現場 / プロジェクト</TableHead>
                    <TableHead className="text-right">参加人数</TableHead>
                    <TableHead className="text-right">出面件数</TableHead>
                    <TableHead>締めステータス</TableHead>
                    <TableHead>警告</TableHead>
                    <TableHead>詳細</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isOpen = openProjectIds.has(row.projectId);
                    return (
                      <Fragment key={`project-fragment-${row.projectId}`}>
                        <TableRow>
                          <TableCell className="whitespace-nowrap">{row.targetMonth}</TableCell>
                          <TableCell>{row.clientName}</TableCell>
                          <TableCell className="font-medium">{row.projectName}</TableCell>
                          <TableCell className="text-right">{row.participantCount.toLocaleString("ja-JP")}</TableCell>
                          <TableCell className="text-right">{row.attendanceCount.toLocaleString("ja-JP")}</TableCell>
                          <TableCell>
                            <Badge className={PROJECT_STATUS_BADGE_CLASS[row.closingStatus] || PROJECT_STATUS_BADGE_CLASS.未着手} variant="outline">
                              {row.closingStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{warningLabel(row.warningCount)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => toggleProject(row.projectId)} aria-expanded={isOpen}>
                              {isOpen ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                              詳細
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={`project-${row.projectId}-participants`}>
                            <TableCell colSpan={8} className="bg-muted/30 p-4">
                              <div className="space-y-3">
                                <div className="font-semibold">参加者明細</div>
                                {row.participants.length === 0 ? (
                                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                                    データがありません
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-md border bg-background">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>作業員</TableHead>
                                          <TableHead>区分</TableHead>
                                          <TableHead className="text-right">出面件数</TableHead>
                                          <TableHead>交通費状態</TableHead>
                                          <TableHead>請求情報状態</TableHead>
                                          <TableHead>個別ステータス</TableHead>
                                          <TableHead>差し戻し理由</TableHead>
                                          <TableHead>情報不足内容</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {row.participants.map((participant: any) => (
                                          <TableRow key={participant.participantKey}>
                                            <TableCell className="font-medium">{participant.workerName}</TableCell>
                                            <TableCell>
                                              {participant.isAggregationExcluded ? (
                                                <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                                                  ゲスト / 集計対象外
                                                </Badge>
                                              ) : (
                                                participant.category
                                              )}
                                            </TableCell>
                                            <TableCell className="text-right">{participant.attendanceCount.toLocaleString("ja-JP")}</TableCell>
                                            <TableCell>{participant.transportationStatus}</TableCell>
                                            <TableCell>{participant.invoiceInfoStatus}</TableCell>
                                            <TableCell>
                                              <Badge className={PARTICIPANT_STATUS_BADGE_CLASS[participant.individualStatus] || PARTICIPANT_STATUS_BADGE_CLASS.未確認} variant="outline">
                                                {participant.individualStatus}
                                              </Badge>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{participant.sendBackReason || "—"}</TableCell>
                                            <TableCell className="text-muted-foreground">{participant.missingInfo || "—"}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
