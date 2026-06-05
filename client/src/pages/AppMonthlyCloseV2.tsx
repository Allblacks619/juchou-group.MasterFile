import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CalendarDays,
  FileCheck2,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
} from "lucide-react";

const PROJECT_STATUS_BADGE: Record<string, string> = {
  not_started:  "bg-muted text-muted-foreground border-border",
  info_missing: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  has_sendback: "bg-red-500/10 text-red-500 border-red-500/20",
  in_review:    "bg-blue-500/10 text-blue-500 border-blue-500/20",
  ready:        "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  closed:       "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const WORKER_STATUS_BADGE: Record<string, string> = {
  not_submitted:  "bg-muted text-muted-foreground border-border",
  submitted:      "bg-blue-500/10 text-blue-500 border-blue-500/20",
  sent_back:      "bg-red-500/10 text-red-500 border-red-500/20",
  accepted:       "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  ready_to_close: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  closed:         "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

type WorkerRow = {
  workerId: number;
  workerName: string;
  attendanceCount: number;
  status: string;
  statusLabel: string;
  expenseStatus: string;
};

type ProjectRow = {
  projectId: number;
  projectName: string;
  clientId: number | null;
  clientName: string | null;
  workerCount: number;
  projectStatus: string;
  projectStatusLabel: string;
  workers: WorkerRow[];
};

function WorkerDetailRow({ worker }: { worker: WorkerRow }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 px-4 border-b border-border/40 last:border-b-0 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
          {worker.workerName.charAt(0)}
        </div>
        <span className="text-sm font-medium truncate">{worker.workerName}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-sm text-muted-foreground">
        <span className="hidden sm:inline text-xs">{worker.attendanceCount}日</span>
        <span className="hidden md:inline text-xs px-2 py-0.5 rounded bg-muted/50">
          交通費: {worker.expenseStatus}
        </span>
        <Badge
          className={`text-xs ${WORKER_STATUS_BADGE[worker.status] ?? WORKER_STATUS_BADGE.not_submitted}`}
          variant="outline"
        >
          {worker.statusLabel}
        </Badge>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: ProjectRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors text-left"
        aria-expanded={expanded}
      >
        <span className="text-muted-foreground shrink-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="h-3.5 w-3.5 text-gold/60 shrink-0" />
            <span className="font-semibold text-sm truncate">{project.projectName}</span>
          </div>
          {project.clientName && (
            <p className="text-xs text-muted-foreground mt-0.5 ml-5">{project.clientName}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {project.workerCount}名
          </span>
          <Badge
            className={`text-xs ${PROJECT_STATUS_BADGE[project.projectStatus] ?? PROJECT_STATUS_BADGE.not_started}`}
            variant="outline"
          >
            {project.projectStatusLabel}
          </Badge>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border/60 bg-muted/10">
          {project.workers.length === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-3">参加作業員なし</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4 py-1.5 px-4 border-b border-border/30 bg-muted/20">
                <span className="text-xs text-muted-foreground font-medium">作業員</span>
                <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">出面</span>
                  <span className="hidden md:inline">交通費</span>
                  <span>ステータス</span>
                </div>
              </div>
              {project.workers.map((worker) => (
                <WorkerDetailRow key={worker.workerId} worker={worker} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function AppMonthlyCloseV2() {
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth);
  const queryInput = useMemo(() => ({ targetMonth }), [targetMonth]);

  const dashboardQuery = trpc.monthlyClosingV2.projectDashboard.useQuery(queryInput);
  const projectRows = dashboardQuery.data?.projects ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileCheck2 className="h-6 w-6 text-gold" />
            月締めV2
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            現場単位で月締め状況を管理します。
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
        <AlertTitle>Phase 1 基盤</AlertTitle>
        <AlertDescription>
          この画面は既存の出面レコードから現場・従業員別の基礎データのみを表示します。
          交通費・請求金額の詳細入力はPhase 2で追加予定です。
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
            <div className="space-y-2">
              {projectRows.map((project) => (
                <ProjectCard key={project.projectId} project={project} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
