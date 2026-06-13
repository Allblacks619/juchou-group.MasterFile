/*
 * AppMonthlyCloseV2 — 月締めV2
 * UI: 現場カード + コンパクト参加者テーブル + インライン編集パネル
 * モックアップ（FC80AA22）に合わせてリデザイン済み
 * - 「出勤日数」表示（「出面件数」廃止）
 * - 「職種」列削除
 * - チップ/ボタン型ステータス選択（ドロップダウン廃止）
 * - 交通費区分: 交通費なし / 本人立替 / 会社カード・ETC / 客先請求 / 会社負担
 * - 現場ステータスもチップ型
 */
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Building2,
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
  Users,
  Flag,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_STATUS_OPTIONS = ["未着手", "確認中", "情報不足", "差し戻しあり", "締め完了"] as const;
const PARTICIPANT_STATUS_OPTIONS = ["未確認", "出面確認済み", "交通費未入力", "情報不足", "差し戻し", "確認済み", "締め完了"] as const;
const PAYER_TYPE_OPTIONS = [
  { value: "none", label: "交通費なし" },
  { value: "worker_paid", label: "作業員支払" },
  { value: "company_card_etc", label: "会社カード・ETC" },
  { value: "company_paid", label: "会社支払" },
  { value: "client_paid_direct", label: "客先直接支払" },
] as const;
const INVOICE_INFO_STATUS_OPTIONS = ["確認待ち", "確認中", "確認済み", "情報不足"] as const;

type PayerType = typeof PAYER_TYPE_OPTIONS[number]["value"];

const PROJECT_STATUS_CHIP: Record<string, string> = {
  未着手: "border-border text-muted-foreground hover:bg-muted/50",
  確認中: "border-blue-500/40 text-blue-500 bg-blue-500/10 hover:bg-blue-500/20",
  情報不足: "border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
  差し戻しあり: "border-red-500/40 text-red-500 bg-red-500/10 hover:bg-red-500/20",
  締め完了: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20",
};

const PROJECT_STATUS_CHIP_ACTIVE: Record<string, string> = {
  未着手: "border-border bg-muted text-foreground",
  確認中: "border-blue-500 bg-blue-500 text-white",
  情報不足: "border-amber-500 bg-amber-500 text-white",
  差し戻しあり: "border-red-500 bg-red-500 text-white",
  締め完了: "border-emerald-500 bg-emerald-500 text-white",
};

const PARTICIPANT_STATUS_CHIP: Record<string, string> = {
  未確認: "border-border text-muted-foreground hover:bg-muted/50",
  出面確認済み: "border-blue-500/40 text-blue-500 bg-blue-500/10 hover:bg-blue-500/20",
  交通費未入力: "border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
  情報不足: "border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
  差し戻し: "border-red-500/40 text-red-500 bg-red-500/10 hover:bg-red-500/20",
  確認済み: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20",
  締め完了: "border-purple-500/40 text-purple-500 bg-purple-500/10 hover:bg-purple-500/20",
};

const PARTICIPANT_STATUS_CHIP_ACTIVE: Record<string, string> = {
  未確認: "border-border bg-muted text-foreground",
  出面確認済み: "border-blue-500 bg-blue-500 text-white",
  交通費未入力: "border-amber-500 bg-amber-500 text-white",
  情報不足: "border-amber-500 bg-amber-500 text-white",
  差し戻し: "border-red-500 bg-red-500 text-white",
  確認済み: "border-emerald-500 bg-emerald-500 text-white",
  締め完了: "border-purple-500 bg-purple-500 text-white",
};

// Badge for read-only display in table
const PARTICIPANT_STATUS_BADGE: Record<string, string> = {
  未確認: "bg-muted text-muted-foreground border-border",
  出面確認済み: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  交通費未入力: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  情報不足: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  差し戻し: "bg-red-500/10 text-red-500 border-red-500/20",
  確認済み: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  締め完了: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const INVOICE_STATUS_CHIP: Record<string, string> = {
  確認待ち: "border-border text-muted-foreground hover:bg-muted/50",
  確認中: "border-blue-500/40 text-blue-500 bg-blue-500/10 hover:bg-blue-500/20",
  確認済み: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20",
  情報不足: "border-amber-500/40 text-amber-500 bg-amber-500/10 hover:bg-amber-500/20",
};

const INVOICE_STATUS_CHIP_ACTIVE: Record<string, string> = {
  確認待ち: "border-border bg-muted text-foreground",
  確認中: "border-blue-500 bg-blue-500 text-white",
  確認済み: "border-emerald-500 bg-emerald-500 text-white",
  情報不足: "border-amber-500 bg-amber-500 text-white",
};

const INVOICE_STATUS_BADGE: Record<string, string> = {
  確認待ち: "bg-muted text-muted-foreground border-border",
  確認中: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  確認済み: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  情報不足: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  集計対象外: "bg-muted text-muted-foreground border-border",
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

function canManageTransportationRole(appRole: unknown) {
  return ["super_admin", "admin", "manager", "leader", "supervisor", "accounting-manager"].includes(String(appRole || ""));
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ─── Chip Button ─────────────────────────────────────────────────────────────

function ChipButton({
  label,
  isActive,
  activeClass,
  inactiveClass,
  onClick,
  disabled,
}: {
  label: string;
  isActive: boolean;
  activeClass: string;
  inactiveClass: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-all duration-150 ${
        isActive ? activeClass : inactiveClass
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {label}
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AppMonthlyCloseV2() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole;
  const canChangeAggregation = isAdminRole(appRole);
  const canManageTransportation = canManageTransportationRole(appRole);
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
    async (row: any, participant: any, patch: Record<string, unknown>) => {
      await participantStatusMutation.mutateAsync({
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileCheck2 className="h-5 w-5 text-gold" />
            月締め管理
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">対象月 × 現場／プロジェクト単位で月締めを管理</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month selector */}
          <div className="flex items-center gap-2 border rounded-md px-3 py-1.5 bg-card">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground shrink-0">対象月</span>
            <Input
              type="month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value || getCurrentMonth())}
              className="w-36 h-7 text-sm border-0 p-0 focus-visible:ring-0 bg-transparent"
              aria-label="対象月"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => dashboardQuery.refetch()}
            disabled={dashboardQuery.isFetching}
          >
            {dashboardQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Project list */}
      {dashboardQuery.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          読み込み中
        </div>
      ) : dashboardQuery.isError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          データの取得に失敗しました: {dashboardQuery.error.message}
        </div>
      ) : projectRows.length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          {formatMonth(targetMonth)} のデータがありません
        </div>
      ) : (
        <div className="space-y-4">
          {projectRows.map((row: any) => {
            const projectKey = `project:${row.projectId}`;
            const isOpen = openProjectIds.has(projectKey);
            const participants = row.participants ?? [];

            return (
              <Card key={projectKey} className="overflow-hidden">
                {/* Project card header */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/10 transition-colors"
                  onClick={() => toggleProject(row.projectId)}
                >
                  {/* Building icon */}
                  <div className="shrink-0 w-12 h-12 rounded-md bg-muted/30 border flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  </div>

                  {/* Project name + client */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-base font-bold text-left hover:underline truncate"
                        onClick={(e) => { e.stopPropagation(); toggleProject(row.projectId); }}
                      >
                        {row.projectName}
                      </button>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{row.clientName}</p>
                  </div>

                  {/* Stats */}
                  <div className="hidden sm:flex items-center gap-6 shrink-0">
                    {/* 参加 */}
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                        <Users className="h-3 w-3" />参加
                      </div>
                      <div className="text-lg font-bold">{row.participantCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">名</span></div>
                    </div>
                    {/* 出勤日数 */}
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                        <CalendarDays className="h-3 w-3" />出勤日数
                      </div>
                      <div className="text-lg font-bold">{row.attendanceCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">日</span></div>
                    </div>
                    {/* 警告 */}
                    <div className="text-center">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                        <AlertTriangle className="h-3 w-3" />警告
                      </div>
                      <div className={`text-lg font-bold ${row.warningCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {row.warningCount}<span className="text-xs font-normal ml-0.5">件</span>
                      </div>
                    </div>
                    {/* 月締めステータス */}
                    <div className="text-center min-w-[80px]">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5 justify-center">
                        <Flag className="h-3 w-3" />月締めステータス
                      </div>
                      <ProjectStatusSelector
                        value={row.closingStatus}
                        onChange={(value) =>
                          projectStatusMutation.mutate({
                            targetMonth,
                            projectId: Number(row.projectId),
                            status: value as any,
                          })
                        }
                        disabled={projectStatusMutation.isPending}
                      />
                    </div>
                  </div>

                  {/* Mobile stats */}
                  <div className="sm:hidden flex flex-col items-end gap-1 shrink-0">
                    <Badge
                      variant="outline"
                      className={`text-xs ${PROJECT_STATUS_CHIP[row.closingStatus] || PROJECT_STATUS_CHIP.未着手}`}
                    >
                      {row.closingStatus}
                    </Badge>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <span>{row.participantCount}名</span>
                      <span>{row.attendanceCount}日</span>
                      {row.warningCount > 0 && (
                        <span className="text-amber-500">{row.warningCount}件警告</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded participant section */}
                {isOpen && (
                  <div className="border-t">
                    {/* Participant table header — desktop */}
                    <div className={`hidden md:grid ${canManageTransportation ? "md:grid-cols-[minmax(0,2fr)_80px_minmax(0,1.5fr)_110px_minmax(0,1.2fr)_minmax(0,1.2fr)_80px]" : "md:grid-cols-[minmax(0,2fr)_80px_minmax(0,1.5fr)_minmax(0,1.2fr)_80px]"} gap-x-3 px-5 py-2 text-xs font-medium text-muted-foreground bg-muted/20 border-b`}>
                      <span>作業員名</span>
                      <span className="text-center">出勤日数</span>
                      <span>個別状態</span>
                      {canManageTransportation && <span>交通費金額</span>}
                      {canManageTransportation && <span>領収書状況</span>}
                      <span>請求情報状態</span>
                      <span></span>
                    </div>

                    {/* Mobile participant header */}
                    <div className="md:hidden px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/20 border-b">
                      参加者明細
                    </div>

                    {participants.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
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
                            canManageTransportation={canManageTransportation}
                            isSavingStatus={participantStatusMutation.isPending}
                            onUpdate={updateParticipant}
                            onChangeAggregation={changeAggregation}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Project Status Selector (chip dropdown) ─────────────────────────────────

function ProjectStatusSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative group">
      <button
        type="button"
        disabled={disabled}
        className={`px-2.5 py-1 text-xs rounded-md border font-medium transition-all ${
          PROJECT_STATUS_CHIP_ACTIVE[value] || "border-border bg-muted text-foreground"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {value || "未着手"}
      </button>
      {/* Dropdown on hover/focus - simple select overlay */}
      <select
        value={value}
        onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
        disabled={disabled}
        className="absolute inset-0 opacity-0 cursor-pointer w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {PROJECT_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Participant Row ──────────────────────────────────────────────────────────

function ParticipantRow({
  row,
  participant,
  targetMonth,
  canChangeAggregation,
  canManageTransportation,
  isSavingStatus,
  onUpdate,
  onChangeAggregation,
}: {
  row: any;
  participant: any;
  targetMonth: string;
  canChangeAggregation: boolean;
  canManageTransportation: boolean;
  isSavingStatus: boolean;
  onUpdate: (row: any, participant: any, patch: Record<string, unknown>) => Promise<void>;
  onChangeAggregation: (row: any, participant: any) => void;
}) {
  const utils = trpc.useUtils();
  const [isEditing, setIsEditing] = useState(false);

  // Local edit state (initialized from participant data)
  const [localIndividualStatus, setLocalIndividualStatus] = useState(toText(participant.individualStatus) || "未確認");
  const [localInvoiceStatus, setLocalInvoiceStatus] = useState(toText(participant.invoiceInfoStatus) || "確認待ち");
  const [payerType, setPayerType] = useState<PayerType>("none");
  const [workerReimbursementRequired, setWorkerReimbursementRequired] = useState(false);
  const [clientBillable, setClientBillable] = useState(false);
  const [sendBackReason, setSendBackReason] = useState(toText(participant.sendBackReason));
  const [missingInfo, setMissingInfo] = useState(toText(participant.missingInfo));
  const [workerReimbursementAmount, setWorkerReimbursementAmount] = useState<string>("");
  const [clientBillableAmount, setClientBillableAmount] = useState<string>("");
  const [internalMemo, setInternalMemo] = useState<string>("");
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
    { enabled: canManageTransportation && !isGuest && workerId != null, staleTime: 30_000 }
  );

  // Initialize transport fields once after loading existing internal management data.
  useEffect(() => {
    if (transportInitialized.current || transportQuery.isLoading || !transportQuery.data || workerId == null) return;
    const existing = transportQuery.data[workerId];
    if (existing) {
      setPayerType((existing.payerType as PayerType) || "none");
      setWorkerReimbursementRequired(Boolean(existing.workerReimbursementRequired));
      setClientBillable(Boolean(existing.clientBillable));
      setWorkerReimbursementAmount(String(existing.workerReimbursementAmount ?? 0));
      setClientBillableAmount(String(existing.clientBillableAmount ?? 0));
      setInternalMemo(existing.internalMemo ?? "");
    }
    transportInitialized.current = true;
  }, [transportQuery.isLoading, transportQuery.data, workerId]);

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

  const parseOptionalAmount = (value: string) => {
    const rawAmount = value.replace(/[^0-9]/g, "");
    return rawAmount === "" ? 0 : parseInt(rawAmount, 10);
  };

  const saveTransportation = async () => {
    if (workerId == null || !canManageTransportation) return;
    const reimbursementAmount = parseOptionalAmount(workerReimbursementAmount);
    const billableAmount = parseOptionalAmount(clientBillableAmount);
    if (isNaN(reimbursementAmount) || isNaN(billableAmount)) return;
    setTransportSaveState("saving");
    await upsertTransportMutation.mutateAsync({
      targetMonth,
      projectId,
      workerId,
      payerType,
      workerReimbursementRequired,
      clientBillable,
      workerReimbursementAmount: reimbursementAmount,
      clientBillableAmount: billableAmount,
      internalMemo: internalMemo.trim(),
    });
  };

  const saveAll = async () => {
    setStatusSaveState("saving");
    try {
      // Derive transportationStatus from category
      let transportationStatus = participant.transportationStatus;
      if (canManageTransportation && !isGuest && workerId != null) {
        if (payerType === "none") {
          transportationStatus = "確認済み";
        } else {
          transportationStatus = "入力済み";
        }
      }

      await onUpdate(row, participant, {
        individualStatus: localIndividualStatus,
        transportationStatus,
        invoiceInfoStatus: localInvoiceStatus,
        sendBackReason,
        missingInfo,
      });

      // Also persist internal transportation settings before closing the edit panel.
      if (canManageTransportation && !isGuest && workerId != null) {
        await saveTransportation();
      }

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

  const transportAmountNum = Math.max(parseOptionalAmount(workerReimbursementAmount) || 0, parseOptionalAmount(clientBillableAmount) || 0);
  const existingTransport = !isGuest && workerId != null ? transportQuery.data?.[workerId] : undefined;
  const transportDisplayText = !isGuest && workerId != null
    ? (transportQuery.isLoading
        ? null
        : transportAmountNum > 0
        ? formatYen(transportAmountNum)
        : "—")
    : null;

  const receiptStatus: string = existingTransport?.receiptStatus || "未添付";
  const receiptCount = existingTransport?.receiptCount || 0;
  const uploadReceiptMutation = trpc.monthlyClosingV2.uploadTransportationReceipt.useMutation({
    onSuccess: () => {
      utils.monthlyClosingV2.getTransportationExpenses.invalidate({ targetMonth, projectId });
    },
  });

  const handleReceiptUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || workerId == null || !canManageTransportation) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",").pop() || "" : result;
      uploadReceiptMutation.mutate({
        targetMonth,
        projectId,
        workerId,
        base64,
        mimeType: file.type as "application/pdf" | "image/jpeg" | "image/jpg" | "image/png",
        fileName: file.name,
        payerType: payerType === "none" ? "company_card_etc" : payerType,
      });
    };
    reader.readAsDataURL(file);
  };

  // ── Collapsed read-only row (desktop) ────────────────────────────────────
  const desktopReadRow = (
    <div className={`hidden md:grid ${canManageTransportation ? "md:grid-cols-[minmax(0,2fr)_80px_minmax(0,1.5fr)_110px_minmax(0,1.2fr)_minmax(0,1.2fr)_80px]" : "md:grid-cols-[minmax(0,2fr)_80px_minmax(0,1.5fr)_minmax(0,1.2fr)_80px]"} gap-x-3 px-5 py-2.5 items-center hover:bg-muted/5 transition-colors`}>
      {/* 作業員名 */}
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isExcluded ? "text-muted-foreground" : ""}`}>
          {participant.workerName}
          {participant.warningCount > 0 && !isExcluded && (
            <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
          )}
        </span>
        {isExcluded && (
          <span className="text-xs text-muted-foreground">ゲスト／集計対象外</span>
        )}
      </div>
      {/* 出勤日数 */}
      <span className="text-center text-sm">{participant.attendanceCount}<span className="text-xs text-muted-foreground ml-0.5">日</span></span>
      {/* 個別状態 */}
      {isExcluded ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <Badge
          variant="outline"
          className={`text-xs w-fit ${PARTICIPANT_STATUS_BADGE[participant.individualStatus] || PARTICIPANT_STATUS_BADGE.未確認}`}
        >
          {participant.individualStatus}
        </Badge>
      )}
      {/* 交通費金額 */}
      {canManageTransportation && (isExcluded ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <span className={`text-sm ${transportDisplayText && transportDisplayText !== "—" ? "font-medium" : "text-muted-foreground"}`}>
          {transportDisplayText ?? "—"}
        </span>
      ))}
      {/* 領収書状況 */}
      {canManageTransportation && (isExcluded ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : !isGuest && workerId != null ? (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          領収書：{receiptStatus}{receiptCount > 0 ? `（${receiptCount}件）` : ""}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ))}
      {/* 請求情報状態 */}
      {isExcluded ? (
        <span className="text-xs text-muted-foreground">—</span>
      ) : (
        <Badge
          variant="outline"
          className={`text-xs w-fit ${INVOICE_STATUS_BADGE[participant.invoiceInfoStatus] || INVOICE_STATUS_BADGE.確認待ち}`}
        >
          {participant.invoiceInfoStatus}
        </Badge>
      )}
      {/* 操作 */}
      {!isExcluded ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            編集
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          {canChangeAggregation && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2 text-muted-foreground"
              disabled={isSavingStatus}
              onClick={() => onChangeAggregation(row, participant)}
            >
              集計対象に含める
            </Button>
          )}
        </div>
      )}
    </div>
  );

  // ── Mobile collapsed row ──────────────────────────────────────────────────
  const mobileReadRow = (
    <div className="md:hidden px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-sm font-medium ${isExcluded ? "text-muted-foreground" : ""}`}>
              {participant.workerName}
            </span>
            {isExcluded && (
              <span className="text-xs text-muted-foreground">ゲスト／集計対象外</span>
            )}
            {!isExcluded && (
              <Badge
                variant="outline"
                className={`text-xs ${PARTICIPANT_STATUS_BADGE[participant.individualStatus] || PARTICIPANT_STATUS_BADGE.未確認}`}
              >
                {participant.individualStatus}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span>出勤 {participant.attendanceCount}日</span>
            {!isExcluded && canManageTransportation && transportDisplayText && transportDisplayText !== "—" && (
              <span className="text-foreground font-medium">{transportDisplayText}</span>
            )}
            {!isExcluded && canManageTransportation && !isGuest && workerId != null && (
              <span>
                <Paperclip className="inline h-3 w-3 mr-0.5" />
                領収書: {receiptStatus}{receiptCount > 0 ? `（${receiptCount}件）` : ""}
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
        {!isExcluded && (
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
    <div className="mx-4 mb-3 rounded-lg border bg-card shadow-sm">
      {/* Edit panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">{participant.workerName} の詳細編集</span>
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

      <div className="p-4 space-y-5">
        {/* 個別ステータス — chip group */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold">個別ステータス</Label>
          <div className="flex flex-wrap gap-2">
            {PARTICIPANT_STATUS_OPTIONS.map((s) => (
              <ChipButton
                key={s}
                label={s}
                isActive={localIndividualStatus === s}
                activeClass={PARTICIPANT_STATUS_CHIP_ACTIVE[s] || "border-border bg-muted text-foreground"}
                inactiveClass={PARTICIPANT_STATUS_CHIP[s] || "border-border text-muted-foreground hover:bg-muted/50"}
                onClick={() => setLocalIndividualStatus(s)}
              />
            ))}
          </div>
        </div>

        {/* 交通区分 + 請求情報状態 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 交通区分 */}
          {canManageTransportation && !isGuest && workerId != null && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">交通区分</Label>
              <div className="flex flex-wrap gap-2">
                {PAYER_TYPE_OPTIONS.map((cat) => (
                  <ChipButton
                    key={cat.value}
                    label={cat.label}
                    isActive={payerType === cat.value}
                    activeClass="border-blue-500 bg-blue-500 text-white"
                    inactiveClass="border-border text-muted-foreground hover:bg-muted/50"
                    onClick={() => {
                      setPayerType(cat.value);
                      if (cat.value === "none") {
                        setWorkerReimbursementRequired(false);
                        setClientBillable(false);
                        setWorkerReimbursementAmount("");
                        setClientBillableAmount("");
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 請求情報状態 */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">請求情報状態</Label>
            <div className="flex flex-wrap gap-2">
              {INVOICE_INFO_STATUS_OPTIONS.map((s) => (
                <ChipButton
                  key={s}
                  label={s}
                  isActive={localInvoiceStatus === s}
                  activeClass={INVOICE_STATUS_CHIP_ACTIVE[s] || "border-border bg-muted text-foreground"}
                  inactiveClass={INVOICE_STATUS_CHIP[s] || "border-border text-muted-foreground hover:bg-muted/50"}
                  onClick={() => setLocalInvoiceStatus(s)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 内部交通費設定 + メモ + 領収書 (permitted internal roles only) */}
        {canManageTransportation && !isGuest && workerId != null && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_160px_160px_1fr_180px]">
            {/* 精算／請求設定 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">精算／請求設定</Label>
              <div className="space-y-1.5 rounded-md border p-2 text-xs">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={workerReimbursementRequired}
                    onChange={(event) => setWorkerReimbursementRequired(event.target.checked)}
                    disabled={payerType === "none"}
                  />
                  作業員へ精算
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={clientBillable}
                    onChange={(event) => setClientBillable(event.target.checked)}
                    disabled={payerType === "none"}
                  />
                  客先へ請求
                </label>
              </div>
            </div>

            {/* 作業員精算額 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">作業員精算額</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-9 text-sm text-right"
                  placeholder="0"
                  value={workerReimbursementAmount}
                  onChange={(e) => setWorkerReimbursementAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={!workerReimbursementRequired}
                />
                <span className="text-sm text-muted-foreground shrink-0">円</span>
              </div>
            </div>

            {/* 客先請求額 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">客先請求額</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-9 text-sm text-right"
                  placeholder="0"
                  value={clientBillableAmount}
                  onChange={(e) => setClientBillableAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={!clientBillable}
                />
                <span className="text-sm text-muted-foreground shrink-0">円</span>
              </div>
            </div>

            {/* メモ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">社内メモ（任意）</Label>
              <Textarea
                className="text-sm min-h-[36px] h-9 resize-none"
                placeholder="社内向けメモを入力"
                value={internalMemo}
                onChange={(e) => setInternalMemo(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* 領収書 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">領収書</Label>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={
                    receiptStatus === "添付済み"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs"
                      : "bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs"
                  }
                >
                  {receiptStatus}
                </Badge>
                <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground">
                  <Upload className="h-3 w-3 mr-1" />
                  {uploadReceiptMutation.isPending ? "アップロード中" : receiptCount > 0 ? "追加アップロード" : "アップロード"}
                  <input
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/jpeg,image/jpg,image/png,.pdf,.jpg,.jpeg,.png"
                    onChange={handleReceiptUpload}
                    disabled={uploadReceiptMutation.isPending}
                  />
                </label>
                {uploadReceiptMutation.isError && (
                  <span className="text-xs text-destructive">アップロードに失敗しました</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PDF / JPEG / PNG</p>
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
        {canChangeAggregation && isExcluded && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isSavingStatus}
              onClick={() => onChangeAggregation(row, participant)}
            >
              集計対象に含める
            </Button>
          </div>
        )}

        {/* Info note */}
        {canManageTransportation && !isGuest && workerId != null && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 border rounded-md p-2.5 bg-muted/20">
            <span className="shrink-0 mt-0.5">ℹ</span>
            交通費金額が0円または空欄の場合、金額入力は不要です。会社カード・ETCなどは金額0円でも領収書・証憑をアップロードできます。
          </p>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(false)}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            size="sm"
            className="min-w-[80px]"
            disabled={statusSaveState === "saving" || isSavingStatus}
            onClick={saveAll}
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
    <div className={isExcluded ? "opacity-60" : ""}>
      {desktopReadRow}
      {mobileReadRow}
      {editPanel}
    </div>
  );
}
