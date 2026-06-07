/**
 * AppMonthlyCloseV2 — 月締めV2
 * UI: compact table for project list + participant list.
 * Editing controls appear only when 編集 is clicked.
 * Backend / schema / migrations: UNCHANGED.
 */
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
  Pencil,
  X,
  Paperclip,
  Upload,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_STATUS_OPTIONS = ["未着手", "確認中", "情報不足", "差し戻しあり", "締め完了"] as const;
const PARTICIPANT_STATUS_OPTIONS = ["未確認", "出面確認済み", "交通費未入力", "情報不足", "差し戻し", "確認済み", "締め完了"] as const;
const TRANSPORTATION_STATUS_OPTIONS = ["未入力", "入力済み", "確認待ち", "確認済み", "情報不足", "集計対象外"] as const;
const INVOICE_INFO_STATUS_OPTIONS = ["確認待ち", "確認中", "確認済み", "情報不足", "集計対象外"] as const;

const PROJECT_STATUS_BADGE: Record<string, string> = {
  未着手: "bg-muted text-muted-foreground border-border",
  確認中: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  情報不足: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  差し戻しあり: "bg-red-500/10 text-red-500 border-red-500/20",
  締め完了: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};

const PARTICIPANT_STATUS_BADGE: Record<string, string> = {
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

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatYen(amount: number | null | undefined) {
  if (amount == null || amount === 0) return null;
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function isAdminRole(appRole: unknown) {
  return appRole === "super_admin" || appRole === "admin";
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AppMonthlyCloseV2() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole;
  const canChangeAggregation = isAdminRole(appRole);
  const [targetMonth, setTargetMonth] = useState(getCurrentMonth);
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
    const key = `project:${projectId}`;
    setOpenProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updateParticipant = useCallback(
    (row: any, participant: any, patch: Record<string, unknown>) => {
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
    },
    [targetMonth, participantStatusMutation]
  );

  const changeAggregation = useCallback(
    (row: any, participant: any) => {
      if (!canChangeAggregation) return;
      const nextExcluded = !participant.isAggregationExcluded;
      const actionLabel = nextExcluded ? "集計対象外に変更" : "集計対象に含める";
      const reason = window.prompt(`${participant.workerName}を${actionLabel}します。監査用の理由を入力してください。`);
      if (!reason || reason.trim().length === 0) return;
      updateParticipant(row, participant, {
        isAggregationExcluded: nextExcluded,
        aggregationOverrideReason: reason.trim(),
        transportationStatus: nextExcluded
          ? "集計対象外"
          : participant.transportationStatus === "集計対象外"
          ? "確認待ち"
          : participant.transportationStatus,
        invoiceInfoStatus: nextExcluded
          ? "集計対象外"
          : participant.invoiceInfoStatus === "集計対象外"
          ? "確認待ち"
          : participant.invoiceInfoStatus,
        missingInfo: nextExcluded ? "管理者により集計対象外" : "管理者により集計対象に含める",
      });
    },
    [canChangeAggregation, updateParticipant]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileCheck2 className="h-5 w-5 text-gold" />
            月締めV2
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => dashboardQuery.refetch()}
          disabled={dashboardQuery.isFetching}
        >
          {dashboardQuery.isFetching ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          更新
        </Button>
      </div>

      <Alert className="py-2 px-3">
        <CalendarDays className="h-4 w-4" />
        <AlertTitle className="text-sm">Phase 2A 基盤</AlertTitle>
        <AlertDescription className="text-xs">
          この画面は既存の締め管理画面に依存せず、既存の出面レコードから従業員・現場別の基礎データのみを表示します。
        </AlertDescription>
      </Alert>

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm font-medium">対象月</Label>
        <Input
          type="month"
          value={targetMonth}
          onChange={(e) => setTargetMonth(e.target.value || getCurrentMonth())}
          className="w-44 h-9 text-sm"
          aria-label="対象月"
        />
        <span className="text-sm text-muted-foreground">{formatMonth(targetMonth)}</span>
      </div>

      {/* Project list */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base">現場一覧</CardTitle>
          <CardDescription className="text-xs">対象月: {formatMonth(targetMonth)}</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {dashboardQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              読み込み中
            </div>
          ) : dashboardQuery.isError ? (
            <div className="mx-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              データの取得に失敗しました: {dashboardQuery.error.message}
            </div>
          ) : projectRows.length === 0 ? (
            <div className="mx-4 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              データがありません
            </div>
          ) : (
            <>
              {/* Desktop table header */}
              <div className="hidden md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_56px_56px_56px_minmax(0,1.5fr)_100px] gap-x-3 px-4 py-1.5 text-xs font-medium text-muted-foreground border-b bg-muted/20">
                <span>現場 / プロジェクト</span>
                <span>取引先</span>
                <span className="text-center">参加</span>
                <span className="text-center">出面</span>
                <span className="text-center">警告</span>
                <span>ステータス</span>
                <span></span>
              </div>

              <div className="divide-y">
                {projectRows.map((row: any) => {
                  const projectKey = `project:${row.projectId}`;
                  const isOpen = openProjectIds.has(projectKey);
                  const participants = row.participants ?? [];

                  return (
                    <div key={projectKey}>
                      {/* Desktop row */}
                      <div className="hidden md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_56px_56px_56px_minmax(0,1.5fr)_100px] gap-x-3 px-4 py-2.5 items-center hover:bg-muted/10 transition-colors">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => toggleProject(row.projectId)}
                            aria-label={isOpen ? "折りたたむ" : "展開する"}
                          >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            className="truncate text-sm font-medium text-left hover:underline"
                            onClick={() => toggleProject(row.projectId)}
                          >
                            {row.projectName}
                          </button>
                        </div>
                        <span className="truncate text-sm text-muted-foreground">{row.clientName}</span>
                        <span className="text-center text-sm">{row.participantCount}</span>
                        <span className="text-center text-sm">{row.attendanceCount}</span>
                        <span className="text-center text-sm">
                          {row.warningCount > 0 ? (
                            <span className="text-amber-500 font-medium">{row.warningCount}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                        {/* Project status selector */}
                        <div>
                          <Select
                            value={row.closingStatus}
                            onValueChange={(value) =>
                              projectStatusMutation.mutate({
                                targetMonth,
                                projectId: Number(row.projectId),
                                status: value as any,
                              })
                            }
                            disabled={projectStatusMutation.isPending}
                          >
                            <SelectTrigger className="h-7 text-xs px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => toggleProject(row.projectId)}
                          >
                            {isOpen ? "閉じる" : "詳細"}
                          </Button>
                        </div>
                      </div>

                      {/* Mobile row */}
                      <div
                        className="md:hidden px-4 py-3 cursor-pointer hover:bg-muted/10 transition-colors"
                        onClick={() => toggleProject(row.projectId)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="font-medium text-sm">{row.projectName}</span>
                              <Badge
                                variant="outline"
                                className={`text-xs ${PROJECT_STATUS_BADGE[row.closingStatus] || PROJECT_STATUS_BADGE.未着手}`}
                              >
                                {row.closingStatus}
                              </Badge>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground pl-5">
                              <span>{row.clientName}</span>
                              <span>参加 {row.participantCount}名</span>
                              <span>出面 {row.attendanceCount}件</span>
                              {row.warningCount > 0 && (
                                <span className="text-amber-500">
                                  <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                                  警告 {row.warningCount}件
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded participant section */}
                      {isOpen && (
                        <div className="border-t bg-muted/5">
                          {/* Participant table header — desktop */}
                          <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_70px_50px_110px_90px_110px_90px_80px_80px] gap-x-2 px-6 py-1.5 text-xs font-medium text-muted-foreground border-b bg-muted/20">
                            <span>作業員</span>
                            <span>区分</span>
                            <span className="text-center">出面</span>
                            <span>個別ステータス</span>
                            <span>交通費状態</span>
                            <span>交通費金額</span>
                            <span>請求情報</span>
                            <span>領収書</span>
                            <span></span>
                          </div>

                          {/* Mobile participant header */}
                          <div className="md:hidden px-4 py-1.5 text-xs font-medium text-muted-foreground border-b bg-muted/20">
                            参加者明細
                          </div>

                          {participants.length === 0 ? (
                            <div className="px-6 py-6 text-center text-sm text-muted-foreground">
                              参加者明細がありません
                            </div>
                          ) : (
                            <div className="divide-y">
                              {participants.map((participant: any) => (
                                <ParticipantRow
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Participant Row ──────────────────────────────────────────────────────────

function ParticipantRow({
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
  const [isEditing, setIsEditing] = useState(false);

  // Local edit state (initialized from participant data)
  const [localIndividualStatus, setLocalIndividualStatus] = useState(toText(participant.individualStatus) || "未確認");
  const [localTransportStatus, setLocalTransportStatus] = useState(toText(participant.transportationStatus) || "未入力");
  const [localInvoiceStatus, setLocalInvoiceStatus] = useState(toText(participant.invoiceInfoStatus) || "確認待ち");
  const [sendBackReason, setSendBackReason] = useState(toText(participant.sendBackReason));
  const [missingInfo, setMissingInfo] = useState(toText(participant.missingInfo));
  const [transportAmount, setTransportAmount] = useState<string>("");
  const [transportMemo, setTransportMemo] = useState<string>("");
  const [transportSaveState, setTransportSaveState] = useState<SaveState>("idle");
  const [statusSaveState, setStatusSaveState] = useState<SaveState>("idle");
  const transportInitialized = useRef(false);

  const isGuest = participant.isGuest;
  const isExcluded = participant.isAggregationExcluded;
  const workerId = participant.workerId ? Number(participant.workerId) : null;
  const projectId = Number(row.projectId);

  // Fetch transportation expense
  const transportQuery = trpc.monthlyClosingV2.getTransportationExpenses.useQuery(
    { targetMonth, projectId },
    { enabled: !isGuest && workerId != null, staleTime: 30_000 }
  );

  // Initialize transport fields once
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
    upsertTransportMutation.mutate({ targetMonth, projectId, workerId, amount, memo: transportMemo.trim() });
  };

  const saveStatus = () => {
    setStatusSaveState("saving");
    try {
      onUpdate(row, participant, {
        individualStatus: localIndividualStatus,
        transportationStatus: localTransportStatus,
        invoiceInfoStatus: localInvoiceStatus,
        sendBackReason,
        missingInfo,
      });
      setStatusSaveState("saved");
      setTimeout(() => {
        setStatusSaveState("idle");
        setIsEditing(false);
      }, 1500);
    } catch {
      setStatusSaveState("error");
      setTimeout(() => setStatusSaveState("idle"), 3000);
    }
  };

  const transportAmountNum = parseInt(transportAmount.replace(/[^0-9]/g, ""), 10);
  const transportDisplayText = !isGuest && workerId != null
    ? (transportQuery.isLoading
        ? null
        : transportAmountNum > 0
        ? formatYen(transportAmountNum)
        : "交通費未入力")
    : null;

  const categoryLabel = isGuest
    ? isExcluded
      ? "ゲスト / 集計対象外"
      : "ゲスト / 集計対象"
    : "作業員";

  // Receipt placeholder state (future implementation)
  const receiptStatus = "未添付";

  // ── Collapsed read-only row (desktop) ────────────────────────────────────
  const desktopReadRow = (
    <div className="hidden md:grid md:grid-cols-[minmax(0,2fr)_70px_50px_110px_90px_110px_90px_80px_80px] gap-x-2 px-6 py-2 items-center">
      {/* 作業員 */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-sm truncate ${isExcluded ? "text-muted-foreground" : ""}`}>
          {participant.workerName}
        </span>
        {participant.warningCount > 0 && !isExcluded && (
          <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
        )}
      </div>
      {/* 区分 */}
      <span className="text-xs text-muted-foreground truncate">{categoryLabel}</span>
      {/* 出面 */}
      <span className="text-center text-sm">{participant.attendanceCount}</span>
      {/* 個別ステータス */}
      <Badge
        variant="outline"
        className={`text-xs justify-center ${PARTICIPANT_STATUS_BADGE[participant.individualStatus] || PARTICIPANT_STATUS_BADGE.未確認}`}
      >
        {participant.individualStatus}
      </Badge>
      {/* 交通費状態 */}
      <span className="text-xs text-muted-foreground truncate">{participant.transportationStatus}</span>
      {/* 交通費金額 */}
      <span className={`text-xs truncate ${transportDisplayText === "交通費未入力" ? "text-amber-500" : "text-foreground"}`}>
        {transportDisplayText ?? "—"}
      </span>
      {/* 請求情報 */}
      <span className="text-xs text-muted-foreground truncate">{participant.invoiceInfoStatus}</span>
      {/* 領収書 */}
      <span className="text-xs text-muted-foreground">
        {!isGuest && workerId != null ? (
          <span className={receiptStatus === "添付済み" ? "text-emerald-600" : "text-muted-foreground"}>
            {receiptStatus}
          </span>
        ) : "—"}
      </span>
      {/* 編集ボタン */}
      {!(isExcluded && isGuest) && (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            編集
          </Button>
        </div>
      )}
    </div>
  );

  // ── Mobile collapsed row ──────────────────────────────────────────────────
  const mobileReadRow = (
    <div className="md:hidden px-4 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-sm font-medium ${isExcluded ? "text-muted-foreground" : ""}`}>
              {participant.workerName}
            </span>
            <span className="text-xs text-muted-foreground">{categoryLabel}</span>
            <Badge
              variant="outline"
              className={`text-xs ${PARTICIPANT_STATUS_BADGE[participant.individualStatus] || PARTICIPANT_STATUS_BADGE.未確認}`}
            >
              {participant.individualStatus}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>出面 {participant.attendanceCount}件</span>
            {transportDisplayText && (
              <span className={transportDisplayText === "交通費未入力" ? "text-amber-500" : ""}>
                {transportDisplayText}
              </span>
            )}
            {!isGuest && workerId != null && (
              <span className={receiptStatus === "添付済み" ? "text-emerald-600" : ""}>
                <Paperclip className="inline h-3 w-3 mr-0.5" />
                領収書: {receiptStatus}
              </span>
            )}
            {participant.warningCount > 0 && !isExcluded && (
              <span className="text-amber-500">
                <AlertTriangle className="inline h-3 w-3 mr-0.5" />
                警告 {participant.warningCount}件
              </span>
            )}
          </div>
        </div>
        {!(isExcluded && isGuest) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 shrink-0"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            編集
          </Button>
        )}
      </div>
    </div>
  );

  // ── Edit panel (shown when isEditing) ─────────────────────────────────────
  const editPanel = isEditing && (
    <div className="mx-4 mb-3 rounded-md border bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
        <span className="text-sm font-medium">{participant.workerName} — 編集</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setIsEditing(false)}
          aria-label="閉じる"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Status dropdowns */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">個別ステータス</Label>
            <Select value={localIndividualStatus} onValueChange={setLocalIndividualStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PARTICIPANT_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">交通費状態</Label>
            <Select value={localTransportStatus} onValueChange={setLocalTransportStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSPORTATION_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">請求情報状態</Label>
            <Select value={localInvoiceStatus} onValueChange={setLocalInvoiceStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INVOICE_INFO_STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Transportation amount (non-guest only) */}
        {!isGuest && workerId != null && (
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Truck className="h-3 w-3" />交通費金額（内部管理用）
            </Label>
            <div className="flex gap-2 items-center flex-wrap">
              <div className="relative w-36">
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
              <Input
                type="text"
                className="h-9 text-sm flex-1 min-w-[120px]"
                placeholder="メモ（任意）"
                value={transportMemo}
                onChange={(e) => setTransportMemo(e.target.value)}
                maxLength={100}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 shrink-0"
                disabled={transportSaveState === "saving" || upsertTransportMutation.isPending}
                onClick={saveTransportation}
              >
                {transportSaveState === "saving" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : transportSaveState === "saved" ? (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mr-1" />保存しました</>
                ) : transportSaveState === "error" ? (
                  <><AlertTriangle className="h-3.5 w-3.5 text-destructive mr-1" />エラー</>
                ) : (
                  <><Save className="h-3.5 w-3.5 mr-1" />交通費保存</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Receipt placeholder */}
        {!isGuest && workerId != null && (
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1">
              <Paperclip className="h-3 w-3" />領収書
            </Label>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={
                  receiptStatus === "添付済み"
                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs"
                    : "bg-muted text-muted-foreground border-border text-xs"
                }
              >
                {receiptStatus}
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled
                title="領収書アップロード（次フェーズで実装）"
              >
                <Upload className="h-3 w-3 mr-1" />
                {receiptStatus === "添付済み" ? "差し替え" : "アップロード"}
              </Button>
              <span className="text-xs text-muted-foreground">PDF / JPEG / PNG</span>
            </div>
          </div>
        )}

        {/* Advanced: send-back reason / missing info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">差し戻し理由</Label>
            <Textarea
              className="text-sm min-h-[72px]"
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="差し戻し理由を入力"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">情報不足内容</Label>
            <Textarea
              className="text-sm min-h-[72px]"
              value={missingInfo}
              onChange={(e) => setMissingInfo(e.target.value)}
              placeholder="不足している情報を入力"
            />
          </div>
        </div>

        {/* Admin aggregation toggle */}
        {canChangeAggregation && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isSavingStatus}
              onClick={() => onChangeAggregation(row, participant)}
            >
              {isExcluded ? "集計対象に含める" : "集計対象外にする"}
            </Button>
          </div>
        )}

        {/* Save status button */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={statusSaveState === "saving" || isSavingStatus}
            onClick={saveStatus}
          >
            {statusSaveState === "saving" ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />保存中</>
            ) : statusSaveState === "saved" ? (
              <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />保存しました</>
            ) : statusSaveState === "error" ? (
              <><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />エラー</>
            ) : (
              <><Save className="mr-1.5 h-3.5 w-3.5" />保存</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={isExcluded ? "opacity-70" : ""}>
      {desktopReadRow}
      {mobileReadRow}
      {editPanel}
    </div>
  );
}
