import { useCallback, useMemo, useRef, useState } from "react";
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
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  FileCheck2,
  Loader2,
  RefreshCw,
  Save,
  Truck,
  AlertTriangle,
  CheckCircle2,
  User,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

function formatYen(amount: number | null | undefined) {
  if (amount == null || amount === 0) return "¥0";
  return `¥${amount.toLocaleString("ja-JP")}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

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

  const updateParticipant = useCallback((row: any, participant: any, patch: Record<string, unknown>) => {
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
  }, [targetMonth, participantStatusMutation]);

  const changeAggregation = useCallback((row: any, participant: any) => {
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
  }, [canChangeAggregation, updateParticipant]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <FileCheck2 className="h-6 w-6 text-gold" />
            月締めV2
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            対象月 × 現場 / プロジェクト単位で月締めを管理します。
          </p>
        </div>
        <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
          {dashboardQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          更新
        </Button>
      </div>

      <Alert>
        <CalendarDays className="h-4 w-4" />
        <AlertTitle>Phase 2A 基盤</AlertTitle>
        <AlertDescription>
          この画面は既存の締め管理画面に依存せず、既存の出面レコードから従業員・現場別の基礎データのみを表示します。
        </AlertDescription>
      </Alert>

      {/* Month selector */}
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

      {/* Project list */}
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
            <div className="space-y-3">
              {projectRows.map((row: any) => {
                const projectKey = getProjectKey(row.projectId);
                const isOpen = openProjectIds.has(projectKey);
                const participants = row.participants ?? [];
                const hasWarnings = row.warningCount > 0;

                return (
                  <div key={projectKey} className="overflow-hidden rounded-lg border bg-background shadow-sm">
                    {/* Project header row */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      className="cursor-pointer p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => toggleProject(row.projectId)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleProject(row.projectId);
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold">{row.projectName}</span>
                            <Badge
                              className={PROJECT_STATUS_BADGE_CLASS[row.closingStatus] || PROJECT_STATUS_BADGE_CLASS.未着手}
                              variant="outline"
                            >
                              {row.closingStatus}
                            </Badge>
                            {hasWarnings && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                警告 {row.warningCount}件
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                            <span>{row.clientName}</span>
                            <span>参加 {row.participantCount}名</span>
                            <span>出面 {row.attendanceCount}件</span>
                          </div>
                        </div>
                      </div>

                      {/* Project status selector — stop propagation so click doesn't toggle */}
                      <div
                        className="mt-3 flex items-center gap-2"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <Label className="shrink-0 text-xs text-muted-foreground">現場ステータス</Label>
                        <Select
                          value={row.closingStatus}
                          onValueChange={(value) => updateProjectStatus(Number(row.projectId), value as any)}
                          disabled={projectStatusMutation.isPending}
                        >
                          <SelectTrigger className="h-8 w-[160px] text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PROJECT_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>{status}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {projectStatusMutation.isPending && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Expanded participant list */}
                    {isOpen && (
                      <div className="border-t bg-muted/10 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold text-sm">参加者明細</span>
                        </div>
                        {participants.length === 0 ? (
                          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                            参加者明細がありません
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {participants.map((participant: any) => (
                              <ParticipantCard
                                key={participant.participantKey}
                                row={row}
                                participant={participant}
                                targetMonth={targetMonth}
                                canChangeAggregation={canChangeAggregation}
                                isSavingStatus={participantStatusMutation.isPending}
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

// ─── Participant Card ─────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

function ParticipantCard({
  row,
  participant,
  targetMonth,
  canChangeAggregation,
  isSavingStatus,
  onUpdate,
  onChangeAggregation,
}: {
  row: any;
  participant: any;
  targetMonth: string;
  canChangeAggregation: boolean;
  isSavingStatus: boolean;
  onUpdate: (row: any, participant: any, patch: Record<string, unknown>) => void;
  onChangeAggregation: (row: any, participant: any) => void;
}) {
  const utils = trpc.useUtils();

  // Local state for text fields
  const [sendBackReason, setSendBackReason] = useState(toText(participant.sendBackReason));
  const [missingInfo, setMissingInfo] = useState(toText(participant.missingInfo));
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Transportation amount state
  const [transportAmount, setTransportAmount] = useState<string>("");
  const [transportMemo, setTransportMemo] = useState<string>("");
  const [transportSaveState, setTransportSaveState] = useState<SaveState>("idle");
  const [statusSaveState, setStatusSaveState] = useState<SaveState>("idle");
  const transportInitialized = useRef(false);

  const isGuest = participant.isGuest;
  const isExcluded = participant.isAggregationExcluded;
  const workerId = participant.workerId ? Number(participant.workerId) : null;
  const projectId = Number(row.projectId);

  // Fetch transportation expense for this participant (only for non-guest workers)
  const transportQuery = trpc.monthlyClosingV2.getTransportationExpenses.useQuery(
    { targetMonth, projectId },
    {
      enabled: !isGuest && workerId != null,
      staleTime: 30_000,
    }
  );

  // Initialize transport fields from server data
  if (!transportInitialized.current && !transportQuery.isLoading && transportQuery.data && workerId != null) {
    const existing = transportQuery.data[workerId];
    if (existing) {
      setTransportAmount(String(existing.amount));
      setTransportMemo(existing.memo ?? "");
    }
    transportInitialized.current = true;
  }

  const upsertTransportMutation = trpc.monthlyClosingV2.upsertTransportationExpense.useMutation({
    onSuccess: () => {
      setTransportSaveState("saved");
      utils.monthlyClosingV2.getTransportationExpenses.invalidate({ targetMonth, projectId });
      setTimeout(() => setTransportSaveState("idle"), 2000);
    },
    onError: () => {
      setTransportSaveState("error");
      setTimeout(() => setTransportSaveState("idle"), 3000);
    },
  });

  const saveTransportation = () => {
    if (workerId == null) return;
    const amount = parseInt(transportAmount.replace(/[^0-9]/g, ""), 10);
    if (isNaN(amount) || amount < 0) return;
    setTransportSaveState("saving");
    upsertTransportMutation.mutate({
      targetMonth,
      projectId,
      workerId,
      amount,
      memo: transportMemo.trim() || "",
    });
  };

  const saveStatus = () => {
    setStatusSaveState("saving");
    try {
      onUpdate(row, participant, { sendBackReason, missingInfo });
      setStatusSaveState("saved");
      setTimeout(() => setStatusSaveState("idle"), 2000);
    } catch {
      setStatusSaveState("error");
      setTimeout(() => setStatusSaveState("idle"), 3000);
    }
  };

  const transportAmountNum = parseInt(transportAmount.replace(/[^0-9]/g, ""), 10);
  const hasTransportAmount = !isNaN(transportAmountNum) && transportAmountNum > 0;

  return (
    <div className={`rounded-lg border bg-background p-4 ${isExcluded ? "opacity-70" : ""}`}>
      {/* Participant header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{participant.workerName}</span>
            {isExcluded ? (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                {isGuest ? "ゲスト / 集計対象外" : "集計対象外"}
              </Badge>
            ) : isGuest ? (
              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                ゲスト / 管理者により集計対象
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted/50 text-foreground border-border">
                作業員
              </Badge>
            )}
            <Badge
              className={PARTICIPANT_STATUS_BADGE_CLASS[participant.individualStatus] || PARTICIPANT_STATUS_BADGE_CLASS.未確認}
              variant="outline"
            >
              {participant.individualStatus}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            出面 {participant.attendanceCount}件
            {!isExcluded && participant.warningCount > 0 && (
              <span className="ml-2 text-amber-500">
                <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                警告 {participant.warningCount}件
              </span>
            )}
            {!isGuest && hasTransportAmount && (
              <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                <Truck className="inline h-3 w-3 mr-0.5" />
                交通費 {formatYen(transportAmountNum)}
              </span>
            )}
          </div>
        </div>
        {canChangeAggregation && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-xs"
            disabled={isSavingStatus}
            onClick={() => onChangeAggregation(row, participant)}
          >
            {isExcluded ? "集計対象に含める" : "集計対象外にする"}
          </Button>
        )}
      </div>

      {/* Skip editing UI for excluded guests */}
      {isExcluded && isGuest ? null : (
        <div className="mt-4 space-y-4">
          {/* Status dropdowns */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">個別ステータス</Label>
              <Select
                value={participant.individualStatus}
                disabled={isSavingStatus}
                onValueChange={(value) => onUpdate(row, participant, { individualStatus: value })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PARTICIPANT_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">交通費状態</Label>
              <Select
                value={participant.transportationStatus}
                disabled={isSavingStatus}
                onValueChange={(value) => onUpdate(row, participant, { transportationStatus: value })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSPORTATION_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">請求情報状態</Label>
              <Select
                value={participant.invoiceInfoStatus}
                disabled={isSavingStatus}
                onValueChange={(value) => onUpdate(row, participant, { invoiceInfoStatus: value })}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INVOICE_INFO_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Transportation amount input (non-guest only) */}
          {!isGuest && workerId != null && (
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">交通費金額（内部管理用）</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">金額（円）</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="pl-7 h-9 text-sm"
                      placeholder="0"
                      value={transportAmount}
                      onChange={(e) => setTransportAmount(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">メモ（任意）</Label>
                  <Input
                    type="text"
                    className="h-9 text-sm"
                    placeholder="交通手段など"
                    value={transportMemo}
                    onChange={(e) => setTransportMemo(e.target.value)}
                    maxLength={100}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 whitespace-nowrap"
                    disabled={transportSaveState === "saving" || upsertTransportMutation.isPending}
                    onClick={saveTransportation}
                  >
                    {transportSaveState === "saving" ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" />保存中</>
                    ) : transportSaveState === "saved" ? (
                      <><CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" />保存済み</>
                    ) : transportSaveState === "error" ? (
                      <><AlertTriangle className="mr-1 h-3 w-3 text-destructive" />エラー</>
                    ) : (
                      <><Save className="mr-1 h-3 w-3" />保存</>
                    )}
                  </Button>
                </div>
              </div>
              {transportQuery.isLoading && (
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />読み込み中
                </div>
              )}
            </div>
          )}

          {/* Advanced fields (差し戻し理由・情報不足) — collapsed by default */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              差し戻し理由・情報不足内容
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">差し戻し理由</Label>
                    <Textarea
                      className="text-sm min-h-[80px]"
                      value={sendBackReason}
                      onChange={(e) => setSendBackReason(e.target.value)}
                      placeholder="差し戻し理由を入力"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">情報不足内容</Label>
                    <Textarea
                      className="text-sm min-h-[80px]"
                      value={missingInfo}
                      onChange={(e) => setMissingInfo(e.target.value)}
                      placeholder="不足している情報を入力"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {participant.aggregationOverrideReason ? (
                    <span className="text-xs text-muted-foreground">集計変更理由: {participant.aggregationOverrideReason}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">集計対象の変更には管理者操作と理由入力が必要です。</span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={statusSaveState === "saving" || isSavingStatus}
                    onClick={saveStatus}
                  >
                    {statusSaveState === "saving" ? (
                      <><Loader2 className="mr-1 h-3 w-3 animate-spin" />保存中</>
                    ) : statusSaveState === "saved" ? (
                      <><CheckCircle2 className="mr-1 h-3 w-3 text-emerald-500" />保存しました</>
                    ) : statusSaveState === "error" ? (
                      <><AlertTriangle className="mr-1 h-3 w-3 text-destructive" />エラー</>
                    ) : (
                      <><Save className="mr-1 h-3 w-3" />保存</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
