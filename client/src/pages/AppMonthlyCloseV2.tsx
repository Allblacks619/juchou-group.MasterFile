import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ChevronDown, ChevronRight, FileCheck2, Loader2, RefreshCw, Save } from "lucide-react";

const PROJECT_STATUS_OPTIONS = ["未着手", "確認中", "情報不足", "差し戻しあり", "締め完了"] as const;
const PARTICIPANT_STATUS_OPTIONS = ["未確認", "出面確認済み", "交通費未入力", "情報不足", "差し戻し", "確認済み", "締め完了"] as const;
const TRANSPORTATION_STATUS_OPTIONS = ["未入力", "入力済み", "確認待ち", "確認済み", "情報不足", "集計対象外"] as const;
const INVOICE_INFO_STATUS_OPTIONS = ["確認待ち", "確認中", "確認済み", "情報不足", "集計対象外"] as const;

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

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  return `${year}年${Number(month)}月`;
}

function getProjectKey(projectId: number | string) {
  return `project:${projectId}`;
}

function isAdminRole(appRole: unknown) {
  return appRole === "super_admin" || appRole === "admin";
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default function AppMonthlyCloseV2() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole;
  const canChangeAggregation = isAdminRole(appRole);
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth());
  const [openProjectIds, setOpenProjectIds] = useState<Set<string>>(new Set());
  const queryInput = useMemo(() => ({ targetMonth }), [targetMonth]);
  const utils = trpc.useUtils();

  const dashboardQuery = trpc.monthlyClosingV2.dashboard.useQuery(queryInput);
  const projectStatusMutation = trpc.monthlyClosingV2.updateProjectStatus.useMutation({
    onSuccess: () => utils.monthlyClosingV2.dashboard.invalidate(queryInput),
  });
  const participantStatusMutation = trpc.monthlyClosingV2.updateParticipantStatus.useMutation({
    onSuccess: () => utils.monthlyClosingV2.dashboard.invalidate(queryInput),
  });
  const projectRows = dashboardQuery.data?.rows ?? [];

  const toggleProject = (projectId: number | string) => {
    const projectKey = getProjectKey(projectId);
    setOpenProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectKey)) next.delete(projectKey);
      else next.add(projectKey);
      return next;
    });
  };

  const updateProjectStatus = (projectId: number, status: (typeof PROJECT_STATUS_OPTIONS)[number]) => {
    projectStatusMutation.mutate({ targetMonth, projectId, status });
  };

  const updateParticipant = (row: any, participant: any, patch: Record<string, unknown>) => {
    participantStatusMutation.mutate({
      targetMonth,
      projectId: Number(row.projectId),
      participantKey: String(participant.participantKey),
      workerId: participant.workerId ? Number(participant.workerId) : null,
      guestName: participant.isGuest ? String(participant.workerName) : null,
      individualStatus: (patch.individualStatus as any) ?? participant.individualStatus,
      transportationStatus: (patch.transportationStatus as any) ?? participant.transportationStatus,
      invoiceInfoStatus: (patch.invoiceInfoStatus as any) ?? participant.invoiceInfoStatus,
      sendBackReason: toText(patch.sendBackReason ?? participant.sendBackReason),
      missingInfo: toText(patch.missingInfo ?? participant.missingInfo),
      isAggregationExcluded: Boolean(patch.isAggregationExcluded ?? participant.isAggregationExcluded),
      aggregationOverrideReason: toText(patch.aggregationOverrideReason ?? participant.aggregationOverrideReason),
    });
  };

  const changeAggregation = (row: any, participant: any) => {
    if (!canChangeAggregation) return;
    const nextExcluded = !participant.isAggregationExcluded;
    const actionLabel = nextExcluded ? "集計対象外に変更" : "集計対象に含める";
    const reason = window.prompt(`${participant.workerName}を${actionLabel}します。監査用の理由を入力してください。`);
    if (!reason || reason.trim().length === 0) return;
    updateParticipant(row, participant, {
      isAggregationExcluded: nextExcluded,
      aggregationOverrideReason: reason.trim(),
      transportationStatus: nextExcluded ? "集計対象外" : participant.transportationStatus === "集計対象外" ? "確認待ち" : participant.transportationStatus,
      invoiceInfoStatus: nextExcluded ? "集計対象外" : participant.invoiceInfoStatus === "集計対象外" ? "確認待ち" : participant.invoiceInfoStatus,
      missingInfo: nextExcluded ? "管理者により集計対象外" : "管理者により集計対象に含める",
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
        <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          {dashboardQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          更新
        </Button>
      </div>

      <Alert>
        <CalendarDays className="h-4 w-4" />
        <AlertTitle>Phase 2B レビュー管理</AlertTitle>
        <AlertDescription>
          この画面は既存の締め管理画面に依存せず、現場 / プロジェクト別にステータスを編集します。ゲストは標準で「ゲスト / 集計対象外」とし、管理者が理由を入力して明示的に変更した場合のみ集計に含めます。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>対象月</CardTitle>
          <CardDescription>表示・編集する月を選択してください。</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value || getCurrentMonth())} aria-label="対象月" />
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
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">データがありません</div>
          ) : (
            <div className="space-y-4">
              {projectRows.map((row: any) => {
                const projectKey = getProjectKey(row.projectId);
                const isOpen = openProjectIds.has(projectKey);
                const participants = row.participants ?? [];
                return (
                  <div key={projectKey} className="rounded-lg border bg-background">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      className="grid cursor-pointer gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"
                      onClick={() => toggleProject(row.projectId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleProject(row.projectId);
                        }
                      }}
                    >
                      <div className="min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          {isOpen ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold">{row.projectName}</div>
                            <div className="text-sm text-muted-foreground">{row.clientName} / {row.targetMonth}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Badge variant="outline">参加人数 {row.participantCount.toLocaleString("ja-JP")}人</Badge>
                          <Badge variant="outline">出面 {row.attendanceCount.toLocaleString("ja-JP")}件</Badge>
                          <Badge variant="outline">警告 {warningLabel(row.warningCount)}</Badge>
                          <Badge className={PROJECT_STATUS_BADGE_CLASS[row.closingStatus] || PROJECT_STATUS_BADGE_CLASS.未着手} variant="outline">
                            {row.closingStatus}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                        <Label className="whitespace-nowrap text-xs text-muted-foreground">現場ステータス</Label>
                        <Select value={row.closingStatus} onValueChange={(value) => updateProjectStatus(Number(row.projectId), value as any)} disabled={projectStatusMutation.isPending}>
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="border-t bg-muted/20 p-4">
                        <div className="mb-3 font-semibold">参加者明細</div>
                        {participants.length === 0 ? (
                          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">参加者明細がありません</div>
                        ) : (
                          <div className="grid gap-3">
                            {participants.map((participant: any) => (
                              <ParticipantEditor
                                key={participant.participantKey}
                                row={row}
                                participant={participant}
                                canChangeAggregation={canChangeAggregation}
                                isSaving={participantStatusMutation.isPending}
                                onUpdate={updateParticipant}
                                onChangeAggregation={changeAggregation}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ParticipantEditor({ row, participant, canChangeAggregation, isSaving, onUpdate, onChangeAggregation }: {
  row: any;
  participant: any;
  canChangeAggregation: boolean;
  isSaving: boolean;
  onUpdate: (row: any, participant: any, patch: Record<string, unknown>) => void;
  onChangeAggregation: (row: any, participant: any) => void;
}) {
  const [sendBackReason, setSendBackReason] = useState(toText(participant.sendBackReason));
  const [missingInfo, setMissingInfo] = useState(toText(participant.missingInfo));

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{participant.workerName}</span>
            {participant.isAggregationExcluded ? (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">{participant.isGuest ? "ゲスト / 集計対象外" : "集計対象外"}</Badge>
            ) : participant.isGuest ? (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">ゲスト / 管理者により集計対象</Badge>
            ) : (
              <Badge variant="outline">作業員</Badge>
            )}
            <Badge className={PARTICIPANT_STATUS_BADGE_CLASS[participant.individualStatus] || PARTICIPANT_STATUS_BADGE_CLASS.未確認} variant="outline">
              {participant.individualStatus}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">出面 {participant.attendanceCount.toLocaleString("ja-JP")}件 / 警告 {warningLabel(participant.warningCount)}</div>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!canChangeAggregation || isSaving} onClick={() => onChangeAggregation(row, participant)}>
          {participant.isAggregationExcluded ? "集計対象に含める" : "集計対象外にする"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label>個別ステータス</Label>
          <Select value={participant.individualStatus} disabled={isSaving} onValueChange={(value) => onUpdate(row, participant, { individualStatus: value })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{PARTICIPANT_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>交通費状態</Label>
          <Select value={participant.transportationStatus} disabled={isSaving} onValueChange={(value) => onUpdate(row, participant, { transportationStatus: value })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{TRANSPORTATION_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>請求情報状態</Label>
          <Select value={participant.invoiceInfoStatus} disabled={isSaving} onValueChange={(value) => onUpdate(row, participant, { invoiceInfoStatus: value })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{INVOICE_INFO_STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>差し戻し理由</Label>
          <Textarea value={sendBackReason} onChange={(event) => setSendBackReason(event.target.value)} placeholder="差し戻し理由を入力" />
        </div>
        <div className="space-y-1">
          <Label>情報不足内容</Label>
          <Textarea value={missingInfo} onChange={(event) => setMissingInfo(event.target.value)} placeholder="不足している情報を入力" />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-xs text-muted-foreground">
          {participant.aggregationOverrideReason ? `集計変更理由: ${participant.aggregationOverrideReason}` : "集計対象の変更には管理者操作と理由入力が必要です。"}
        </div>
        <Button type="button" size="sm" disabled={isSaving} onClick={() => onUpdate(row, participant, { sendBackReason, missingInfo })}>
          <Save className="mr-2 h-4 w-4" />
          理由・メモを保存
        </Button>
      </div>
    </div>
  );
}
