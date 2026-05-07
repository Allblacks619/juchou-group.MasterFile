import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  AlertCircle,
  ArrowRight,
  UserCircle,
  FileCheck2,
  FileText,
  Wallet,
  Landmark,
  ClipboardList,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sun,
  Moon,
  Clock,
  X,
  Download,
  Plus,
  Lock,
  LockOpen,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getDay,
  isToday,
} from "date-fns";
import { ja } from "date-fns/locale";
import { useAppLang } from "@/contexts/AppLanguageContext";
import type { AppLang } from "@/lib/appTranslations";
import {
  type WorkType,
  type ShiftType,
  WORK_TYPE_COLORS,
  cellHasValue,
  isWorkedType,
  extractDateKey,
} from "@shared/attendanceStatus";

function isManagerLikeRole(role?: string | null) {
  return role === "super_admin" || role === "admin" || role === "manager" || role === "leader";
}

function workTypeLabels(lang: AppLang): Record<WorkType, string> {
  return lang === "pt"
    ? { normal: "Presente", half_day: "Meio dia", overtime: "Hora extra", holiday: "Folga trab.", absence: "Ausente", day_off: "Folga" }
    : { normal: "出勤", half_day: "半日", overtime: "残業", holiday: "休出", absence: "欠勤", day_off: "休日" };
}

function workTypeShort(lang: AppLang): Record<WorkType, string> {
  return lang === "pt"
    ? { normal: "P", half_day: "½", overtime: "HE", holiday: "P", absence: "F", day_off: "F" }
    : { normal: "出", half_day: "半", overtime: "残", holiday: "出", absence: "休", day_off: "休" };
}

function dayLabels(lang: AppLang) {
  return lang === "pt"
    ? ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
    : ["日", "月", "火", "水", "木", "金", "土"];
}

const OVERTIME_OPTIONS: number[] = [];
for (let i = 0; i <= 120; i += 5) {
  OVERTIME_OPTIONS.push(i);
}

export default function AppDashboard() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole || "worker";
  const isManagerLike = isManagerLikeRole(appRole);
  const { t, lang } = useAppLang();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("nav_dashboard")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("dashboard_welcome")}{user?.name || (lang === "pt" ? "Usuário" : "ユーザー")}{lang === "ja" ? "さん" : ""}
        </p>
      </div>

      <ProfileCompletionAlert />

      <WorkflowShortcuts appRole={appRole} />

      {isManagerLike && <AdminStats />}

      <AttendanceCalendar />
    </div>
  );
}

function ProfileCompletionAlert() {
  const [, setLocation] = useLocation();
  const { t, lang } = useAppLang();
  const { data: missingInfo, isLoading } = trpc.employee.getMyMissingFields.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) return null;

  if (missingInfo && !missingInfo.hasProfile) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">
                  {lang === "pt" ? "Perfil não registrado" : "プロフィールが未登録です"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {lang === "pt"
                    ? "Preencha as informações necessárias para os documentos de obra."
                    : "現場への提出書類に必要な情報を入力してください。"}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gold text-background hover:bg-gold/90 shrink-0"
              onClick={() => setLocation("/app/my-profile")}
            >
              {lang === "pt" ? "Preencher" : "入力する"} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (missingInfo && missingInfo.missingFields.length > 0) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-500">
                  {lang === "pt"
                    ? `Há itens obrigatórios pendentes (${missingInfo.missingFields.length})`
                    : `未記入の必須項目があります（${missingInfo.missingFields.length}件）`}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {missingInfo.missingFields.slice(0, 6).map((f) => (
                    <Badge key={f.key} variant="outline" className="text-xs">{f.label}</Badge>
                  ))}
                  {missingInfo.missingFields.length > 6 && (
                    <Badge variant="outline" className="text-xs">+{missingInfo.missingFields.length - 6}</Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gold text-background hover:bg-gold/90 shrink-0"
              onClick={() => setLocation("/app/my-profile")}
            >
              {lang === "pt" ? "Preencher" : "入力する"} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

function WorkflowShortcuts({ appRole }: { appRole: string }) {
  const [, setLocation] = useLocation();
  const isAdminOrLeader = isManagerLikeRole(appRole);

  const items = isAdminOrLeader
    ? [
        { title: "締め管理", icon: FileCheck2, path: "/app/closings" },
        { title: "請求管理", icon: FileText, path: "/app/invoices" },
        { title: "支払管理", icon: Wallet, path: "/app/payments" },
        { title: "入金管理", icon: Landmark, path: "/app/receivables" },
        { title: "月締め提出", icon: FileCheck2, path: "/app/my-closing" },
      ]
    : [
        { title: "月締め提出", icon: FileCheck2, path: "/app/my-closing" },
        { title: "プロフィール", icon: UserCircle, path: "/app/my-profile" },
      ];

  return (
    <div className="flex gap-3 flex-wrap">
      {items.map((item) => (
        <button
          key={item.path}
          onClick={() => setLocation(item.path)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/20 hover:border-gold/50 hover:bg-gold/5 transition-all"
          title={item.title}
        >
          <item.icon className="h-5 w-5 text-gold" />
          <span className="text-sm font-medium text-foreground">{item.title}</span>
        </button>
      ))}
    </div>
  );
}

function AdminStats() {
  const [, setLocation] = useLocation();
  const { t, lang } = useAppLang();
  const employeesQuery = trpc.employee.list.useQuery(undefined, { retry: false });
  const invitationsQuery = trpc.invitation.list.useQuery(undefined, { retry: false });

  const stats = [
    { title: t("dashboard_totalEmployees"), value: employeesQuery.data?.length ?? "-", icon: Users, path: "/app/employees" },
    { title: t("dashboard_totalInvitations"), value: invitationsQuery.data?.length ?? "-", icon: UserPlus, path: "/app/invitations" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className="cursor-pointer hover:border-gold/30 transition-colors"
          onClick={() => setLocation(stat.path)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
      <Card
        className="cursor-pointer hover:border-gold/30 transition-colors border-dashed"
        onClick={() => setLocation("/app/employees")}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard_addEmployee")}</CardTitle>
          <Plus className="h-4 w-4 text-gold" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("dashboard_newEmployee")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function AttendanceCalendar() {
  const { t, lang, formatMonthStr } = useAppLang();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const appRole = (user as any)?.appRole || "worker";
  const isAdminOrLeader = isManagerLikeRole(appRole);
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectInitialized, setProjectInitialized] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const utils = trpc.useUtils();
  const projectsQuery = trpc.attendance.myProjects.useQuery();
  const lastProjectQuery = trpc.attendance.lastProject.useQuery();
  const myInfoQuery = trpc.attendance.myEmployeeInfo.useQuery();

  const teamDataQuery = trpc.attendance.projectTeamData.useQuery(
    { projectId: selectedProjectId!, startDate, endDate },
    { enabled: !!selectedProjectId }
  );

  const refreshAttendanceQueries = useCallback(() => {
    utils.attendance.projectTeamData.invalidate({ projectId: selectedProjectId!, startDate, endDate });
    utils.attendance.list.invalidate({ projectId: selectedProjectId || undefined, startDate, endDate });
    utils.attendance.myAttendance.invalidate({ projectId: selectedProjectId || undefined, startDate, endDate });
    teamDataQuery.refetch();
  }, [utils, selectedProjectId, startDate, endDate, teamDataQuery]);

  const upsertMutation = trpc.attendance.upsert.useMutation({
    onSuccess: refreshAttendanceQueries,
    onError: (e) => toast.error(`${lang === "pt" ? "Erro ao salvar" : "保存エラー"}: ${e.message}`),
  });

  const myBatchUpsertMutation = trpc.attendance.myBatchUpsert.useMutation({
    onSuccess: refreshAttendanceQueries,
    onError: (e) => toast.error(`${lang === "pt" ? "Erro ao salvar" : "保存エラー"}: ${e.message}`),
  });

  const pdfMutation = trpc.attendance.generatePdf.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success(lang === "pt" ? "PDF gerado com sucesso" : "PDFを生成しました");
    },
    onError: (e) => toast.error(`${lang === "pt" ? "Erro ao gerar PDF" : "PDF生成エラー"}: ${e.message}`),
  });

  useEffect(() => {
    if (projectInitialized) return;
    if (lastProjectQuery.data && !selectedProjectId) {
      setSelectedProjectId(lastProjectQuery.data.id);
      setProjectInitialized(true);
    } else if (lastProjectQuery.data === null && projectsQuery.data && projectsQuery.data.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projectsQuery.data[0].id);
      setProjectInitialized(true);
    }
  }, [lastProjectQuery.data, projectsQuery.data, selectedProjectId, projectInitialized]);

  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  const attendanceMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const rec of teamDataQuery.data?.records || []) {
      const dateStr = extractDateKey(rec.workDate);
      const key = rec.employeeId ? `emp-${rec.employeeId}-${dateStr}` : `guest-${rec.guestName}-${dateStr}`;
      map[key] = rec;
    }
    return map;
  }, [teamDataQuery.data]);

  // Deduplicate members by type+id/name
  const members = (() => {
    const raw = teamDataQuery.data?.members || [];
    const seen = new Set<string>();
    return raw.filter((m) => {
      const key = m.type === "guest" ? `guest-${m.nameKanji}` : `emp-${m.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();
  const myEmployeeId = myInfoQuery.data?.id;
  const projects = projectsQuery.data || [];

  const autoSave = useCallback(
    (params: {
      employeeId: number | null;
      guestName: string | null;
      workDate: string;
      hoursWorked: number;
      overtimeHours: number;
      workType: WorkType;
      shiftType: ShiftType;
      notes?: string;
    }) => {
      if (!selectedProjectId || isLocked) return;
      if (!isAdminOrLeader) {
        if (!myEmployeeId || params.employeeId !== myEmployeeId || params.guestName) {
          toast.error(lang === "pt" ? "Você só pode editar sua própria presença." : "自分の出面のみ編集できます。");
          return;
        }
        myBatchUpsertMutation.mutate({
          records: [{
            projectId: selectedProjectId,
            workDate: params.workDate,
            hoursWorked: params.hoursWorked,
            overtimeHours: params.overtimeHours,
            workType: params.workType,
            shiftType: params.shiftType,
            notes: params.notes,
          }],
        });
        return;
      }
      upsertMutation.mutate({
        employeeId: params.employeeId,
        guestName: params.guestName || undefined,
        projectId: selectedProjectId,
        workDate: params.workDate,
        hoursWorked: params.hoursWorked,
        overtimeHours: params.overtimeHours,
        workType: params.workType,
        shiftType: params.shiftType,
        notes: params.notes,
      });
    },
    [selectedProjectId, isLocked, isAdminOrLeader, myEmployeeId, lang, myBatchUpsertMutation, upsertMutation]
  );

  const quickToggle = useCallback(
    (memberId: number | null, memberName: string | null, dateStr: string) => {
      if (isLocked) return;
      const key = memberId ? `emp-${memberId}-${dateStr}` : `guest-${memberName}-${dateStr}`;
      const existing = attendanceMap[key];
      if (existing && cellHasValue(existing.hoursWorked, existing.workType)) {
        autoSave({
          employeeId: memberId,
          guestName: memberName,
          workDate: dateStr,
          hoursWorked: 0,
          overtimeHours: 0,
          workType: "absence",
          shiftType: "day",
        });
      } else {
        autoSave({
          employeeId: memberId,
          guestName: memberName,
          workDate: dateStr,
          hoursWorked: 80,
          overtimeHours: 0,
          workType: "normal",
          shiftType: "day",
        });
      }
    },
    [attendanceMap, autoSave, isLocked]
  );

  const handleAddGuest = () => {
    if (isLocked) return;
    if (!guestName.trim()) {
      toast.error(lang === "pt" ? "Digite o nome" : "名前を入力してください");
      return;
    }
    if (!selectedProjectId) {
      toast.error(t("attendance_selectProject"));
      return;
    }
    const today = format(new Date(), "yyyy-MM-dd");
    autoSave({
      employeeId: null,
      guestName: guestName.trim(),
      workDate: today,
      hoursWorked: 80,
      overtimeHours: 0,
      workType: "normal",
      shiftType: "day",
    });
    toast.success(lang === "pt" ? `Convidado "${guestName.trim()}" adicionado` : `ゲスト「${guestName.trim()}」を追加しました`);
    setGuestName("");
    setGuestDialogOpen(false);
  };

  const handlePdfDownload = () => {
    if (!selectedProjectId) return;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    pdfMutation.mutate({ year, month, projectId: selectedProjectId });
  };

  const mySummary = useMemo(() => {
    if (!myEmployeeId) return { totalDays: 0, totalHours: 0, totalOvertime: 0, dayOffCount: 0 };
    let totalDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;
    let dayOffCount = 0;
    for (const day of daysInMonth) {
      const dateStr = format(day, "yyyy-MM-dd");
      const key = `emp-${myEmployeeId}-${dateStr}`;
      const rec = attendanceMap[key];
      if (rec && !isWorkedType(rec.workType) && cellHasValue(rec.hoursWorked, rec.workType)) {
        dayOffCount++;
      } else if (rec && rec.hoursWorked > 0) {
        totalDays++;
        totalHours += rec.hoursWorked;
        totalOvertime += rec.overtimeHours;
      }
    }
    return { totalDays, totalHours: totalHours / 10, totalOvertime: totalOvertime / 10, dayOffCount };
  }, [daysInMonth, attendanceMap, myEmployeeId]);

  const monthLabel = formatMonthStr(currentMonth.getFullYear(), currentMonth.getMonth() + 1);

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => { setCurrentMonth(subMonths(currentMonth, 1)); setIsLocked(true); }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-[130px] justify-center">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{monthLabel}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => { setCurrentMonth(addMonths(currentMonth, 1)); setIsLocked(true); }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={selectedProjectId?.toString() || ""}
              onValueChange={(v) => { setSelectedProjectId(Number(v)); setIsLocked(true); }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder={t("attendance_selectProject")} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 ml-auto">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsLocked(!isLocked)}
                title={isLocked ? (lang === "pt" ? "Desbloquear" : "ロック解除") : (lang === "pt" ? "Bloquear" : "ロック")}
                className={!isLocked ? "text-amber-400 bg-amber-500/20 hover:bg-amber-500/30" : "text-muted-foreground"}
              >
                {isLocked ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
              </Button>
              {isAdminOrLeader ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setGuestDialogOpen(true)} disabled={!selectedProjectId || isLocked}>
                    <Plus className="h-4 w-4 mr-1" /> {t("dashboard_addGuest")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePdfDownload}
                    disabled={!selectedProjectId || pdfMutation.isPending}
                  >
                    {pdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                    {t("dashboard_pdfExport")}
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setLocation("/app/my-closing")}>
                  <FileCheck2 className="h-4 w-4 mr-1" /> 月締め提出
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLocked && selectedProjectId && (
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2">
          <LockOpen className="h-4 w-4" />
          <span>{lang === "pt" ? "Modo de edição — toque nas datas para registrar presença." : "編集モード — 日付をタップして出面を登録できます。"}</span>
        </div>
      )}

      {!selectedProjectId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{lang === "pt" ? "Selecione uma obra para ver a presença" : "現場を選択して出面表を表示してください"}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4" />
                  {t("dashboard_myAttendance")}
                  {!isLocked && (
                    <span className="text-xs font-normal px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                      {lang === "pt" ? "Editando" : "編集中"}
                    </span>
                  )}
                </span>
                <div className="flex gap-3 text-sm font-normal text-muted-foreground">
                  <span>{t("dashboard_workDays")}: <strong className="text-foreground">{mySummary.totalDays}{t("attendance_days")}</strong></span>
                  <span>{t("dashboard_totalHours")}: <strong className="text-foreground">{mySummary.totalHours}h</strong></span>
                  {mySummary.totalOvertime > 0 && (
                    <span>{t("dashboard_overtime")}: <strong className="text-blue-400">{mySummary.totalOvertime}h</strong></span>
                  )}
                  {mySummary.dayOffCount > 0 && (
                    <span>{lang === "pt" ? "Folgas" : "休"}: <strong className="text-gray-400">{mySummary.dayOffCount}{t("attendance_days")}</strong></span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myEmployeeId ? (
                <CalendarGrid
                  days={daysInMonth}
                  memberId={myEmployeeId}
                  memberName={null}
                  attendanceMap={attendanceMap}
                  lang={lang}
                  isLocked={isLocked}
                  onQuickToggle={(dateStr) => quickToggle(myEmployeeId, null, dateStr)}
                  onSave={(dateStr, data) =>
                    autoSave({ employeeId: myEmployeeId, guestName: null, workDate: dateStr, ...data })
                  }
                />
              ) : (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  {lang === "pt"
                    ? "Perfil de funcionário não registrado. Contate o administrador."
                    : "従業員プロフィールが未登録です。管理者にお問い合わせください。"}
                </p>
              )}
            </CardContent>
          </Card>

          {members.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t("dashboard_teamMembers")}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-2 text-left font-medium min-w-[120px]">
                          {lang === "pt" ? "Nome" : "氏名"}
                        </th>
                        {daysInMonth.map((day) => {
                          const dow = getDay(day);
                          const isSun = dow === 0;
                          const isSat = dow === 6;
                          const today = isToday(day);
                          return (
                            <th
                              key={format(day, "yyyy-MM-dd")}
                              className={`border-b border-border px-1 py-2 text-center font-medium min-w-[36px] ${
                                today ? "bg-gold/10" : isSun ? "bg-red-500/5" : isSat ? "bg-blue-500/5" : ""
                              }`}
                            >
                              <div className={`${isSun ? "text-red-400" : isSat ? "text-blue-400" : "text-muted-foreground"}`}>
                                <div className="text-[10px]">{dayLabels(lang)[dow]}</div>
                                <div className={`text-xs ${today ? "font-bold text-gold" : ""}`}>{format(day, "d")}</div>
                              </div>
                            </th>
                          );
                        })}
                        <th className="border-b border-l border-border px-2 py-2 text-center font-medium min-w-[50px]">
                          {lang === "pt" ? "Dias" : "日数"}
                        </th>
                        <th className="border-b border-border px-2 py-2 text-center font-medium min-w-[50px]">
                          {lang === "pt" ? "Horas" : "時間"}
                        </th>
                        <th className="border-b border-border px-2 py-2 text-center font-medium min-w-[50px]">
                          {lang === "pt" ? "HE" : "残業"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {members
                        .filter((m) => !(m.type === "employee" && m.id === myEmployeeId))
                        .map((member) => {
                          const isGuest = member.type === "guest";
                          const mKey = isGuest ? `guest-${member.nameKanji}` : `emp-${member.id}`;
                          let totalDays = 0, totalHours = 0, totalOt = 0;

                          return (
                            <tr key={mKey} className="hover:bg-muted/10 transition-colors">
                              <td className="sticky left-0 z-10 bg-card border-b border-r border-border px-3 py-1.5 font-medium whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span>{member.nameKanji}</span>
                                  {isGuest && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0">
                                      {lang === "pt" ? "G" : "ゲ"}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              {daysInMonth.map((day) => {
                                const dateStr = format(day, "yyyy-MM-dd");
                                const rec = attendanceMap[`${mKey}-${dateStr}`];
                                const hasValue = rec && cellHasValue(rec.hoursWorked, rec.workType);
                                const dow = getDay(day);
                                const isSun = dow === 0;
                                const isSat = dow === 6;
                                const today = isToday(day);

                                if (hasValue) {
                                  totalDays++;
                                  totalHours += rec.hoursWorked;
                                  totalOt += rec.overtimeHours;
                                }

                                const WT_SHORT = workTypeShort(lang);

                                return (
                                  <td
                                    key={dateStr}
                                    className={`border-b border-border text-center py-1 transition-colors ${
                                      today ? "bg-gold/5" : isSun ? "bg-red-500/5" : isSat ? "bg-blue-500/5" : ""
                                    }`}
                                  >
                                    {isLocked ? (
                                      <div
                                        className={`w-full h-full min-h-[28px] flex flex-col items-center justify-center rounded-sm ${
                                          hasValue
                                            ? WORK_TYPE_COLORS[rec.workType as WorkType]
                                            : ""
                                        }`}
                                      >
                                        {hasValue && (
                                          <>
                                            <span className="text-[9px] font-bold leading-none">
                                              {WT_SHORT[rec.workType as WorkType]}
                                              {rec.shiftType === "night" ? (lang === "pt" ? "N" : "夜") : ""}
                                            </span>
                                            {rec.overtimeHours > 0 && (
                                              <span className="text-[7px] text-blue-400 leading-none">+{rec.overtimeHours / 10}h</span>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    ) : (
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            className={`w-full h-full min-h-[28px] flex flex-col items-center justify-center rounded-sm transition-colors ${
                                              hasValue
                                                ? WORK_TYPE_COLORS[rec.workType as WorkType]
                                                : "hover:bg-muted/30"
                                            }`}
                                            onClick={(e) => {
                                              if (!hasValue) {
                                                e.preventDefault();
                                                quickToggle(isGuest ? null : member.id, isGuest ? member.nameKanji : null, dateStr);
                                              }
                                            }}
                                          >
                                            {hasValue && (
                                              <>
                                                <span className="text-[9px] font-bold leading-none">
                                                  {WT_SHORT[rec.workType as WorkType]}
                                                  {rec.shiftType === "night" ? (lang === "pt" ? "N" : "夜") : ""}
                                                </span>
                                                {rec.overtimeHours > 0 && (
                                                  <span className="text-[7px] text-blue-400 leading-none">+{rec.overtimeHours / 10}h</span>
                                                )}
                                              </>
                                            )}
                                          </button>
                                        </PopoverTrigger>
                                        {hasValue && (
                                          <PopoverContent className="w-60" side="bottom">
                                            <CellEditor
                                              dateStr={dateStr}
                                              day={day}
                                              existing={rec}
                                              lang={lang}
                                              onSave={(d, data) =>
                                                autoSave({
                                                  employeeId: isGuest ? null : member.id,
                                                  guestName: isGuest ? member.nameKanji : null,
                                                  workDate: d,
                                                  ...data,
                                                })
                                              }
                                              onClear={() =>
                                                autoSave({
                                                  employeeId: isGuest ? null : member.id,
                                                  guestName: isGuest ? member.nameKanji : null,
                                                  workDate: dateStr,
                                                  hoursWorked: 0,
                                                  overtimeHours: 0,
                                                  workType: "absence",
                                                  shiftType: "day",
                                                })
                                              }
                                            />
                                          </PopoverContent>
                                        )}
                                      </Popover>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="border-b border-l border-border px-2 py-1.5 text-center font-medium">
                                {totalDays}{lang === "pt" ? "d" : "日"}
                              </td>
                              <td className="border-b border-border px-2 py-1.5 text-center">
                                {totalHours / 10}h
                              </td>
                              <td className="border-b border-border px-2 py-1.5 text-center">
                                {totalOt > 0 ? <span className="text-blue-400">{totalOt / 10}h</span> : "-"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">
                {isLocked
                  ? (lang === "pt" ? "O painel está bloqueado. Clique no ícone de chave para liberar a edição e evitar registros acidentais ao rolar a tela." : "ダッシュボードはロック中です。スクロール時の誤登録防止のため、編集する時だけ鍵アイコンで解除してください。")
                  : t("dashboard_attendanceHint")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(workTypeLabels(lang)) as [WorkType, string][]).map(([type, label]) => (
                  <span key={type} className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${WORK_TYPE_COLORS[type]}`}>
                    {workTypeShort(lang)[type]} = {label}
                  </span>
                ))}
                <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400">
                  {lang === "pt" ? "N = Noturno" : "夜 = 夜勤"}
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={guestDialogOpen} onOpenChange={setGuestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard_addGuest")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {lang === "pt"
                ? "Digite o nome para adicionar um trabalhador convidado. Será registrado como presente hoje."
                : "名前を入力してゲスト作業員を追加します。今日の出勤として記録されます。"}
            </p>
            <Input
              placeholder={lang === "pt" ? "Nome do convidado" : "ゲスト名（例：田中太郎）"}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGuest(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestDialogOpen(false)}>{t("cancel")}</Button>
            <Button className="bg-gold text-background hover:bg-gold/90" onClick={handleAddGuest}>{t("add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CalendarGrid({
  days,
  memberId,
  memberName,
  attendanceMap,
  compact = false,
  lang,
  isLocked,
  onQuickToggle,
  onSave,
}: {
  days: Date[];
  memberId: number | null;
  memberName: string | null;
  attendanceMap: Record<string, any>;
  compact?: boolean;
  lang: AppLang;
  isLocked: boolean;
  onQuickToggle: (dateStr: string) => void;
  onSave: (dateStr: string, data: { hoursWorked: number; overtimeHours: number; workType: WorkType; shiftType: ShiftType; notes?: string }) => void;
}) {
  const keyPrefix = memberId ? `emp-${memberId}` : `guest-${memberName}`;
  const cellSize = compact ? "min-h-[40px]" : "min-h-[52px]";
  const fontSize = compact ? "text-[9px]" : "text-xs";
  const detailFontSize = compact ? "text-[8px]" : "text-[10px]";
  const DAY_LABELS = dayLabels(lang);
  const WT_SHORT = workTypeShort(lang);

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {DAY_LABELS.map((label, i) => (
        <div
          key={label}
          className={`text-center text-[10px] font-medium py-0.5 ${
            i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"
          }`}
        >
          {label}
        </div>
      ))}

      {Array.from({ length: getDay(days[0]) }).map((_, i) => (
        <div key={`empty-${i}`} />
      ))}

      {days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const key = `${keyPrefix}-${dateStr}`;
        const rec = attendanceMap[key];
        const hasValue = rec && cellHasValue(rec.hoursWorked, rec.workType);
        const dayOfWeek = getDay(day);
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;
        const today = isToday(day);

        if (isLocked) {
          return (
            <div
              key={dateStr}
              className={`relative rounded-md border p-0.5 ${cellSize} flex flex-col items-center justify-center ${
                today ? "ring-1 ring-gold/50" : ""
              } ${
                hasValue
                  ? WORK_TYPE_COLORS[rec.workType as WorkType]
                  : isSun
                  ? "border-red-500/15 bg-red-500/5"
                  : isSat
                  ? "border-blue-500/15 bg-blue-500/5"
                  : "border-border"
              }`}
            >
              <span className={`${fontSize} ${isSun ? "text-red-400" : isSat ? "text-blue-400" : "text-muted-foreground"} ${today ? "font-bold" : ""}`}>
                {format(day, "d")}
              </span>
              {hasValue && (
                <>
                  <span className={`${detailFontSize} font-bold mt-0.5`}>
                    {WT_SHORT[rec.workType as WorkType]}
                    {rec.shiftType === "night" ? (lang === "pt" ? "N" : "夜") : ""}
                  </span>
                  {rec.overtimeHours > 0 && (
                    <span className="text-[7px] text-blue-400">+{rec.overtimeHours / 10}h</span>
                  )}
                </>
              )}
            </div>
          );
        }

        return (
          <Popover key={dateStr}>
            <PopoverTrigger asChild>
              <button
                className={`relative rounded-md border p-0.5 ${cellSize} flex flex-col items-center justify-center transition-all ${
                  today ? "ring-1 ring-gold/50" : ""
                } ${
                  hasValue
                    ? WORK_TYPE_COLORS[rec.workType as WorkType]
                    : isSun
                    ? "border-red-500/15 bg-red-500/5"
                    : isSat
                    ? "border-blue-500/15 bg-blue-500/5"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/20"
                }`}
                onClick={(e) => {
                  if (!hasValue) {
                    e.preventDefault();
                    onQuickToggle(dateStr);
                  }
                }}
              >
                <span className={`${fontSize} ${isSun ? "text-red-400" : isSat ? "text-blue-400" : "text-muted-foreground"} ${today ? "font-bold" : ""}`}>
                  {format(day, "d")}
                </span>
                {hasValue && (
                  <>
                    <span className={`${detailFontSize} font-bold mt-0.5`}>
                      {WT_SHORT[rec.workType as WorkType]}
                      {rec.shiftType === "night" ? (lang === "pt" ? "N" : "夜") : ""}
                    </span>
                    {rec.overtimeHours > 0 && (
                      <span className="text-[7px] text-blue-400">+{rec.overtimeHours / 10}h</span>
                    )}
                  </>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60" side="bottom">
              <CellEditor
                dateStr={dateStr}
                day={day}
                existing={rec}
                lang={lang}
                onSave={onSave}
                onClear={() =>
                  onSave(dateStr, { hoursWorked: 0, overtimeHours: 0, workType: "absence", shiftType: "day" })
                }
              />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
}

function CellEditor({
  dateStr,
  day,
  existing,
  lang,
  onSave,
  onClear,
}: {
  dateStr: string;
  day: Date;
  existing: any;
  lang: AppLang;
  onSave: (dateStr: string, data: { hoursWorked: number; overtimeHours: number; workType: WorkType; shiftType: ShiftType }) => void;
  onClear: () => void;
}) {
  const currentWorkType = (existing?.workType as WorkType) || "normal";
  const currentShift = (existing?.shiftType as ShiftType) || "day";
  const currentOvertime = existing?.overtimeHours || 0;
  const WT_LABELS = workTypeLabels(lang);

  const dateLabel = lang === "pt"
    ? format(day, "dd/MM")
    : format(day, "M月d日(E)", { locale: ja });

  return (
    <div className="space-y-3 p-1">
      <p className="text-sm font-medium">{dateLabel}</p>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          {lang === "pt" ? "Tipo de presença" : "出勤タイプ"}
        </label>
        <div className="flex flex-wrap gap-1">
          {(Object.entries(WT_LABELS) as [WorkType, string][]).map(([type, label]) => (
            <button
              key={type}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                currentWorkType === type && existing?.hoursWorked > 0
                  ? WORK_TYPE_COLORS[type]
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                const hours = type === "absence" ? 0 : type === "half_day" ? 40 : 80;
                onSave(dateStr, {
                  hoursWorked: hours,
                  overtimeHours: type === "absence" ? 0 : currentOvertime,
                  workType: type,
                  shiftType: currentShift,
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          {lang === "pt" ? "Turno" : "シフト"}
        </label>
        <div className="flex gap-1">
          <button
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              currentShift === "day" ? "bg-amber-500/20 text-amber-400 border-amber-400/50" : "border-border text-muted-foreground"
            }`}
            onClick={() => {
              if (existing?.hoursWorked > 0) {
                onSave(dateStr, { hoursWorked: existing.hoursWorked, overtimeHours: currentOvertime, workType: currentWorkType, shiftType: "day" });
              }
            }}
          >
            <Sun className="h-3 w-3" /> {lang === "pt" ? "Diurno" : "昼勤"}
          </button>
          <button
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              currentShift === "night" ? "bg-indigo-500/20 text-indigo-400 border-indigo-400/50" : "border-border text-muted-foreground"
            }`}
            onClick={() => {
              if (existing?.hoursWorked > 0) {
                onSave(dateStr, { hoursWorked: existing.hoursWorked, overtimeHours: currentOvertime, workType: currentWorkType, shiftType: "night" });
              }
            }}
          >
            <Moon className="h-3 w-3" /> {lang === "pt" ? "Noturno" : "夜勤"}
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          <Clock className="h-3 w-3 inline mr-1" />{lang === "pt" ? "Hora extra" : "残業時間"}
        </label>
        <Select
          value={currentOvertime.toString()}
          onValueChange={(v) => {
            const val = Number(v);
            if (existing?.hoursWorked > 0) {
              onSave(dateStr, { hoursWorked: existing.hoursWorked, overtimeHours: val, workType: currentWorkType, shiftType: currentShift });
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {OVERTIME_OPTIONS.map((val) => (
              <SelectItem key={val} value={val.toString()}>
                {val / 10}{lang === "pt" ? " horas" : "時間"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" size="sm" className="w-full text-xs" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> {lang === "pt" ? "Limpar" : "クリア"}
      </Button>
    </div>
  );
}
