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
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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
  RotateCcw,
  UserCog,
  Lock,
  Sparkles,
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

// 「承認済み」とみなす個別ステータス（＝この作業員は会社確認OK）。
const PARTICIPANT_OK_STATUSES = ["確認済み", "締め完了"] as const;

/** 現場の参加者から提出状況の内訳（OK / 差し戻し / 未対応）と完了可否を集計する。 */
function summarizeParticipants(participants: any[]) {
  const active = (participants ?? []).filter((p: any) => !p.isAggregationExcluded);
  const ok = active.filter((p: any) => (PARTICIPANT_OK_STATUSES as readonly string[]).includes(p.individualStatus)).length;
  const sentBack = active.filter((p: any) => p.individualStatus === "差し戻し").length;
  const pending = active.length - ok - sentBack;
  const allClosed = active.length > 0 && active.every((p: any) => p.individualStatus === "締め完了");
  const allOk = active.length > 0 && active.every((p: any) => (PARTICIPANT_OK_STATUSES as readonly string[]).includes(p.individualStatus));
  return { total: active.length, ok, sentBack, pending, allClosed, allOk };
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
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [, navigate] = useLocation();
  const queryInput = useMemo(() => ({ targetMonth }), [targetMonth]);
  const utils = trpc.useUtils();

  const dashboardQuery = trpc.monthlyClosingV2.dashboard.useQuery(queryInput);
  // 既存請求書（対象月×取引先の生成済みドラフトへの導線に使う）。
  // 請求書の閲覧は「取引先請求」エリアの許可が必要（管理者以上のみ既定）なので無い場合は取得しない
  const permQuery = trpc.permission.my.useQuery();
  const invoicesQuery = trpc.invoice.list.useQuery(undefined, { enabled: !!permQuery.data?.areas?.billing, retry: false });
  const [generatingClient, setGeneratingClient] = useState<string | null>(null);
  const generateInvoiceMutation = trpc.closing.generateForClosing.useMutation();
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

  // ── クイックアクション：承認 / 差し戻し / 代行 / プロジェクト締め完了 ──────────
  const completeProjectCore = useCallback(
    async (row: any) => {
      const active = (row.participants ?? []).filter((p: any) => !p.isAggregationExcluded);
      setCompletingId(Number(row.projectId));
      try {
        // 全員を締め完了に確定してから、現場ステータスを締め完了へ。
        for (const p of active) {
          if (p.individualStatus !== "締め完了") {
            await updateParticipant(row, p, { individualStatus: "締め完了", invoiceInfoStatus: "確認済み" });
          }
        }
        await projectStatusMutation.mutateAsync({ targetMonth, projectId: Number(row.projectId), status: "締め完了" });
        return true;
      } finally {
        setCompletingId(null);
      }
    },
    [updateParticipant, projectStatusMutation, targetMonth]
  );

  const approveParticipant = useCallback(
    async (row: any, participant: any) => {
      try {
        await updateParticipant(row, participant, {
          individualStatus: "確認済み",
          invoiceInfoStatus: "確認済み",
          sendBackReason: "",
        });
        // 全員承認でプロジェクト自動完了（オーナー確定済みの設計判断）。
        // 直近で承認した本人はローカルデータ上まだ旧ステータスのため、承認済みとみなして判定する。
        const active = (row.participants ?? []).filter((p: any) => !p.isAggregationExcluded);
        const othersAllOk = active
          .filter((p: any) => p.participantKey !== participant.participantKey)
          .every((p: any) => (PARTICIPANT_OK_STATUSES as readonly string[]).includes(p.individualStatus));
        if (active.length > 0 && othersAllOk && row.closingStatus !== "締め完了") {
          await completeProjectCore(row);
          toast.success(`全員承認 — ${row.projectName} を締め完了にしました`);
        } else {
          toast.success(`${participant.workerName} を承認しました`);
        }
      } catch {
        toast.error("承認に失敗しました");
      }
    },
    [updateParticipant, completeProjectCore]
  );

  const sendBackParticipant = useCallback(
    async (row: any, participant: any) => {
      const reason = window.prompt(
        `${participant.workerName} を差し戻します。理由を入力してください（作業員に表示されます）。`,
        toText(participant.sendBackReason)
      );
      if (reason == null) return;
      if (reason.trim().length === 0) {
        toast.error("差し戻し理由を入力してください");
        return;
      }
      try {
        await updateParticipant(row, participant, {
          individualStatus: "差し戻し",
          invoiceInfoStatus: "確認中",
          sendBackReason: reason.trim(),
          missingInfo: reason.trim(),
        });
        toast.success(`${participant.workerName} を差し戻しました`);
      } catch {
        toast.error("差し戻しに失敗しました");
      }
    },
    [updateParticipant]
  );

  const delegateParticipant = useCallback(
    (row: any, participant: any) => {
      if (!participant.workerId) {
        toast.error("ゲストは代行できません");
        return;
      }
      navigate(`/app/my-closing?projectId=${row.projectId}&month=${targetMonth}&employeeId=${participant.workerId}`);
    },
    [navigate, targetMonth]
  );

  const completeProject = useCallback(
    async (row: any) => {
      const active = (row.participants ?? []).filter((p: any) => !p.isAggregationExcluded);
      if (active.length === 0) return;
      const notOk = active.filter((p: any) => !(PARTICIPANT_OK_STATUSES as readonly string[]).includes(p.individualStatus));
      if (notOk.length > 0) {
        toast.error("未承認の作業員がいます。全員を承認してから締め完了できます。");
        return;
      }
      try {
        await completeProjectCore(row);
        toast.success(`${row.projectName} を締め完了にしました`);
      } catch {
        toast.error("締め完了処理に失敗しました");
      }
    },
    [completeProjectCore]
  );

  // 取引先ごとにプロジェクトをグルーピング（projectRows は取引先→現場名の順で整列済み）。
  const clientGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const row of projectRows) {
      const key = row.clientName || "未設定";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return Array.from(groups.entries()).map(([clientName, rows]) => {
      const closedCount = rows.filter((r: any) => r.closingStatus === "締め完了").length;
      return {
        clientName,
        clientId: rows[0]?.clientId ? Number(rows[0].clientId) : null,
        rows,
        closedCount,
        total: rows.length,
        allClosed: rows.length > 0 && closedCount === rows.length,
      };
    });
  }, [projectRows]);

  // 対象月×取引先の生成済み請求書（取消除く・最新を採用）。「請求書を開く」導線に使う。
  const invoiceByClient = useMemo(() => {
    const map = new Map<number, any>();
    for (const inv of (invoicesQuery.data || []) as any[]) {
      if (inv.status === "cancelled") continue;
      const d = inv.periodStart ? new Date(inv.periodStart) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthKey !== targetMonth) continue;
      const prev = map.get(Number(inv.clientId));
      if (!prev || Number(inv.id) > Number(prev.id)) map.set(Number(inv.clientId), inv);
    }
    return map;
  }, [invoicesQuery.data, targetMonth]);

  // 全現場締め完了 → 取引先請求書を自動生成してプレビュー(編集)へ。これが月締め後の「次」。
  const generateClientInvoice = useCallback(
    async (group: { clientName: string; rows: any[] }) => {
      setGeneratingClient(group.clientName);
      try {
        const result = await generateInvoiceMutation.mutateAsync({
          projectIds: group.rows.map((r: any) => Number(r.projectId)),
          closingMonth: targetMonth,
        });
        toast.success(result.message || "請求書ドラフトを作成しました");
        utils.invoice.list.invalidate();
        navigate(result.editUrl || `/app/invoices?invoiceId=${result.invoiceId}`);
      } catch (e: any) {
        toast.error(e?.message || "請求書の自動生成に失敗しました");
      } finally {
        setGeneratingClient(null);
      }
    },
    [generateInvoiceMutation, targetMonth, navigate, utils]
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
          <p className="text-xs text-muted-foreground mt-0.5">取引先 › 現場 › 作業員。提出を確認して承認／差し戻し、全員承認で現場を締め完了。</p>
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
        <div className="space-y-8">
          {clientGroups.map((group) => (
            <section key={group.clientName} className="space-y-3">
              {/* 取引先ヘッダー */}
              <div className="flex items-center gap-3 border-b border-gold/20 pb-2">
                <div className="shrink-0 w-8 h-8 rounded-md bg-gold/10 border border-gold/30 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold truncate">{group.clientName}</h2>
                  <p className="text-[11px] text-muted-foreground">現場 {group.closedCount}/{group.total} 締め完了</p>
                </div>
                {group.allClosed ? (
                  (() => {
                    const existing = group.clientId ? invoiceByClient.get(group.clientId) : null;
                    if (existing) {
                      // 生成済み → 次のステップはプレビュー・確定。請求書へ直行。
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 shrink-0 gap-1.5 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
                          onClick={() => navigate(`/app/invoices?invoiceId=${existing.id}`)}
                        >
                          <FileCheck2 className="h-3.5 w-3.5" />
                          請求書を開く（{existing.invoiceNumber}）
                        </Button>
                      );
                    }
                    return (
                      <Button
                        size="sm"
                        className="h-8 shrink-0 gap-1.5 bg-gold text-black hover:bg-gold/90"
                        disabled={generatingClient === group.clientName}
                        onClick={() => generateClientInvoice(group)}
                      >
                        {generatingClient === group.clientName ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        取引先請求書を自動生成
                      </Button>
                    );
                  })()
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">残り {group.total - group.closedCount} 現場</span>
                )}
              </div>

              <div className="space-y-4">
                {group.rows.map((row: any) => {
                  const projectKey = `project:${row.projectId}`;
                  const isOpen = openProjectIds.has(projectKey);
                  const participants = row.participants ?? [];
                  const summary = summarizeParticipants(participants);
                  const isClosed = row.closingStatus === "締め完了";
                  const canComplete = summary.total > 0 && summary.allOk && !isClosed;

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

                        {/* Project name + status summary */}
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
                          {/* 提出状況の内訳 */}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                              承認 {summary.ok}/{summary.total}
                            </span>
                            {summary.sentBack > 0 && (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] border border-red-500/30 bg-red-500/10 text-red-500">
                                差戻 {summary.sentBack}
                              </span>
                            )}
                            {summary.pending > 0 && (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] border border-amber-500/30 bg-amber-500/10 text-amber-500">
                                未対応 {summary.pending}
                              </span>
                            )}
                          </div>
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
                          </div>
                        </div>
                      </div>

                      {/* 締め完了アクションバー（全員承認済み時／完了済み時） */}
                      {(canComplete || isClosed) && (
                        <div className="flex items-center justify-between gap-3 border-t bg-muted/10 px-4 py-2.5">
                          <span className="text-xs text-muted-foreground">
                            {isClosed ? "この現場は締め完了しています。" : "全作業員が承認済みです。現場を締め完了にできます。"}
                          </span>
                          {isClosed ? (
                            <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-500 text-xs">
                              <Lock className="h-3 w-3" />締め完了
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 shrink-0 gap-1 bg-gold text-black hover:bg-gold/90"
                              disabled={completingId === Number(row.projectId)}
                              onClick={(e) => { e.stopPropagation(); completeProject(row); }}
                            >
                              {completingId === Number(row.projectId) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              現場を締め完了にする
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Expanded participant section */}
                      {isOpen && (
                        <div className="border-t">
                          {/* Participant table header — desktop */}
                          <div className={`hidden md:grid ${canManageTransportation ? "md:grid-cols-[minmax(0,2fr)_72px_minmax(0,1.4fr)_100px_minmax(0,1.1fr)_150px]" : "md:grid-cols-[minmax(0,2fr)_72px_minmax(0,1.4fr)_150px]"} gap-x-3 px-5 py-2 text-xs font-medium text-muted-foreground bg-muted/20 border-b`}>
                            <span>作業員名</span>
                            <span className="text-center">出勤日数</span>
                            <span>状態</span>
                            {canManageTransportation && <span>交通費金額</span>}
                            {canManageTransportation && <span>領収書状況</span>}
                            <span className="text-right">操作</span>
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
                                  onApprove={approveParticipant}
                                  onSendBack={sendBackParticipant}
                                  onDelegate={delegateParticipant}
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
            </section>
          ))}
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
  onApprove,
  onSendBack,
  onDelegate,
}: {
  row: any;
  participant: any;
  targetMonth: string;
  canChangeAggregation: boolean;
  canManageTransportation: boolean;
  isSavingStatus: boolean;
  onUpdate: (row: any, participant: any, patch: Record<string, unknown>) => Promise<void>;
  onChangeAggregation: (row: any, participant: any) => void;
  onApprove: (row: any, participant: any) => void;
  onSendBack: (row: any, participant: any) => void;
  onDelegate: (row: any, participant: any) => void;
}) {
  const utils = trpc.useUtils();
  const [isEditing, setIsEditing] = useState(false);

  // Local edit state (initialized from participant data)
  const [payerType, setPayerType] = useState<PayerType>("none");
  const [clientBillable, setClientBillable] = useState(false);
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
    { enabled: canManageTransportation && !isGuest && workerId != null, staleTime: 30_000 }
  );

  // Initialize transport fields once after loading existing internal management data.
  useEffect(() => {
    if (transportInitialized.current || transportQuery.isLoading || !transportQuery.data || workerId == null) return;
    const existing = transportQuery.data[workerId];
    if (existing) {
      setPayerType((existing.payerType as PayerType) || "none");
      setClientBillable(Boolean(existing.clientBillable));
      setTransportAmount(String(existing.amount ?? 0));
      setTransportMemo(existing.memo ?? "");
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
    const amount = parseOptionalAmount(transportAmount);
    if (isNaN(amount)) return;
    setTransportSaveState("saving");
    await upsertTransportMutation.mutateAsync({
      targetMonth,
      projectId,
      workerId,
      payerType,
      clientBillable,
      amount,
      memo: transportMemo.trim(),
    });
  };

  // 交通費（内部管理）の保存のみ。状態の承認/差し戻しはクイックアクションが担う。
  // 交通費を入力して保存する（交通費なし=0円含む）なら「交通費未入力」の警告は自動で解除する。
  const saveAll = async () => {
    setStatusSaveState("saving");
    try {
      if (canManageTransportation && !isGuest && workerId != null) {
        const transportationStatus = payerType === "none" ? "確認済み" : "入力済み";
        let individualStatus = toText(participant.individualStatus) || "未確認";
        let resolvedMissingInfo = toText(participant.missingInfo);
        if (individualStatus === "交通費未入力") {
          individualStatus = "出面確認済み";
          if (resolvedMissingInfo === "交通費・請求情報の確認が必要です") resolvedMissingInfo = "";
        }
        await onUpdate(row, participant, {
          individualStatus,
          transportationStatus,
          missingInfo: resolvedMissingInfo,
        });
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

  const transportAmountNum = parseOptionalAmount(transportAmount) || 0;
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

  const individualStatus = toText(participant.individualStatus);
  const isApproved = (PARTICIPANT_OK_STATUSES as readonly string[]).includes(individualStatus);
  const isSentBack = individualStatus === "差し戻し";
  const isLocked = individualStatus === "締め完了";

  // アイコン式クイックアクション（承認 / 差し戻し / 代行入力 / 詳細編集）。
  const quickActions = (
    <div className="flex items-center justify-end gap-0.5">
      {!isApproved && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="承認"
          disabled={isSavingStatus}
          className="h-7 w-7 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500"
          onClick={() => onApprove(row, participant)}
        >
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      )}
      {!isSentBack && !isLocked && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="差し戻し"
          disabled={isSavingStatus}
          className="h-7 w-7 text-red-500 hover:bg-red-500/10 hover:text-red-500"
          onClick={() => onSendBack(row, participant)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      )}
      {!isGuest && workerId != null && !isLocked && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="代行入力（交通費・提出を代行）"
          className="h-7 w-7 text-blue-500 hover:bg-blue-500/10 hover:text-blue-500"
          onClick={() => onDelegate(row, participant)}
        >
          <UserCog className="h-4 w-4" />
        </Button>
      )}
      {canManageTransportation && !isGuest && workerId != null && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="交通費・領収書（内部管理）"
          className="h-7 w-7 text-muted-foreground hover:bg-muted"
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  );

  // ── Collapsed read-only row (desktop) ────────────────────────────────────
  const desktopReadRow = (
    <div className={`hidden md:grid ${canManageTransportation ? "md:grid-cols-[minmax(0,2fr)_72px_minmax(0,1.4fr)_100px_minmax(0,1.1fr)_150px]" : "md:grid-cols-[minmax(0,2fr)_72px_minmax(0,1.4fr)_150px]"} gap-x-3 px-5 py-2.5 items-center hover:bg-muted/5 transition-colors`}>
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
        {!isExcluded && isSentBack && toText(participant.sendBackReason) && (
          <span className="text-xs text-red-400 truncate">理由: {toText(participant.sendBackReason)}</span>
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
      {/* 操作 */}
      {!isExcluded ? (
        quickActions
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
          {!isExcluded && isSentBack && toText(participant.sendBackReason) && (
            <div className="text-xs text-red-400">理由: {toText(participant.sendBackReason)}</div>
          )}
        </div>
        {!isExcluded && <div className="shrink-0">{quickActions}</div>}
      </div>
    </div>
  );

  // ── Edit panel (shown when isEditing) ─────────────────────────────────────
  // 交通費・領収書の内部管理のみ。状態変更（承認/差し戻し）は行のクイックアクションで行う。
  const editPanel = isEditing && (
    <div className="mx-4 mb-3 rounded-lg border bg-card shadow-sm">
      {/* Edit panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">{participant.workerName} の交通費・領収書（内部管理）</span>
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
        {/* 支払元 / 支払方法 */}
        {canManageTransportation && !isGuest && workerId != null && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold">支払元 / 支払方法</Label>
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
                      setClientBillable(false);
                      setTransportAmount("");
                    }
                    if (cat.value === "client_paid_direct") {
                      setClientBillable(false);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* 内部交通費設定 + メモ + 領収書 (permitted internal roles only) */}
        {canManageTransportation && !isGuest && workerId != null && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_180px_1fr_180px]">
            {/* 取引先請求 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">取引先請求</Label>
              <div className="flex flex-wrap gap-2">
                <ChipButton
                  label="する"
                  isActive={clientBillable}
                  activeClass="border-blue-500 bg-blue-500 text-white"
                  inactiveClass="border-border text-muted-foreground hover:bg-muted/50"
                  onClick={() => setClientBillable(true)}
                  disabled={payerType === "none" || payerType === "client_paid_direct"}
                />
                <ChipButton
                  label="しない"
                  isActive={!clientBillable}
                  activeClass="border-blue-500 bg-blue-500 text-white"
                  inactiveClass="border-border text-muted-foreground hover:bg-muted/50"
                  onClick={() => setClientBillable(false)}
                />
              </div>
            </div>

            {/* 交通費金額 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">交通費金額（内部管理用）</Label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-9 text-sm text-right"
                  placeholder="0"
                  value={transportAmount}
                  onChange={(e) => setTransportAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  disabled={payerType === "none"}
                />
                <span className="text-sm text-muted-foreground shrink-0">円</span>
              </div>
            </div>

            {/* メモ */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">メモ（任意）</Label>
              <Textarea
                className="text-sm min-h-[36px] h-9 resize-none"
                placeholder="社内向けメモを入力"
                value={transportMemo}
                onChange={(e) => setTransportMemo(e.target.value)}
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
