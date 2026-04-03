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

type WorkType = "normal" | "half_day" | "overtime" | "holiday" | "absence";
type ShiftType = "day" | "night";

function workTypeLabels(lang: AppLang): Record<WorkType, string> {
  return lang === "pt"
    ? { normal: "Presente", half_day: "Meio dia", overtime: "Hora extra", holiday: "Folga trab.", absence: "Ausente" }
    : { normal: "出勤", half_day: "半日", overtime: "残業", holiday: "休出", absence: "欠勤" };
}

function workTypeShort(lang: AppLang): Record<WorkType, string> {
  return lang === "pt"
    ? { normal: "P", half_day: "½", overtime: "HE", holiday: "FT", absence: "A" }
    : { normal: "出", half_day: "半", overtime: "残", holiday: "休", absence: "欠" };
}

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  normal: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  half_day: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  overtime: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  holiday: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  absence: "bg-red-500/20 text-red-400 border-red-500/30",
};

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

      {(appRole === "admin" || appRole === "leader") && <AdminStats />}

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
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectInitialized, setProjectInitialized] = useState(false);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const projectsQuery = trpc.attendance.myProjects.useQuery();
  const lastProjectQuery = trpc.attendance.lastProject.useQuery();
  const myInfoQuery = trpc.attendance.myEmployeeInfo.useQuery();

  const teamDataQuery = trpc.attendance.projectTeamData.useQuery(
    { projectId: selectedProjectId!, startDate, endDate },
    { enabled: !!selectedProjectId }
  );

  const upsertMutation = trpc.attendance.upsert.useMutation({
    onSuccess: () => {
      teamDataQuery.refetch();
    },
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
      const dateStr = format(new Date(rec.workDate), "yyyy-MM-dd");
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
      if (!selectedProjectId) return;
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
    [selectedProjectId, upsertMutation]
  );

  const quickToggle = useCallback(
    (memberId: number | null, memberName: string | null, dateStr: string) => {
      const key = memberId ? `emp-${memberId}-${dateStr}` : `guest-${memberName}-${dateStr}`;
      const existing = attendanceMap[key];
      if (existing && existing.hoursWorked > 0) {
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
    [attendanceMap, autoSave]
  );

  const handleAddGuest = () => {
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
    if (!myEmployeeId) return { totalDays: 0, totalHours: 0, totalOvertime: 0 };
    let totalDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;
    for (const day of daysInMonth) {
      const dateStr = format(day, "yyyy-MM-dd");
      const key = `emp-${myEmployeeId}-${dateStr}`;
      const rec = attendanceMap[key];
      if (rec && rec.hoursWorked > 0) {
        totalDays++;
        totalHours += rec.hoursWorked;
        totalOvertime += rec.overtimeHours;
      }
    }
    return { totalDays, totalHours: totalHours / 10, totalOvertime: totalOvertime / 10 };
  }, [daysInMonth, attendanceMap, myEmployeeId]);

  const monthLabel = formatMonthStr(currentMonth.getFullYear(), currentMonth.getMonth() + 1);

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-[130px] justify-center">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{monthLabel}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={selectedProjectId?.toString() || ""}
              onValueChange={(v) => setSelectedProjectId(Number(v))}
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
              <Button variant="outline" size="sm" onClick={() => setGuestDialogOpen(true)} disabled={!selectedProjectId}>
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
            </div>
          </div>
        </CardContent>
      </Card>

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
                </span>
                <div className="flex gap-3 text-sm font-normal text-muted-foreground">
                  <span>{t("dashboard_workDays")}: <strong className="text-foreground">{mySummary.totalDays}{t("attendance_days")}</strong></span>
                  <span>{t("dashboard_totalHours")}: <strong className="text-foreground">{mySummary.totalHours}h</strong></span>
                  {mySummary.totalOvertime > 0 && (
                    <span>{t("dashboard_overtime")}: <strong className="text-blue-400">{mySummary.totalOvertime}h</strong></span>
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
              <CardContent>
                <div className="space-y-4">
                  {members
                    .filter((m) => !(m.type === "employee" && m.id === myEmployeeId))
                    .map((member) => {
                      const isGuest = member.type === "guest";
                      const mKey = isGuest ? `guest-${member.nameKanji}` : `emp-${member.id}`;
                      let days = 0, hours = 0, ot = 0;
                      for (const day of daysInMonth) {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const rec = attendanceMap[`${mKey}-${dateStr}`];
                        if (rec && rec.hoursWorked > 0) {
                          days++;
                          hours += rec.hoursWorked;
                          ot += rec.overtimeHours;
                        }
                      }

                      return (
                        <div key={mKey} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{member.nameKanji}</span>
                              {isGuest && (
                                <Badge variant="outline" className="text-xs">
                                  {lang === "pt" ? "Convidado" : "ゲスト"}
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              <span>{days}{t("attendance_days")}</span>
                              <span>{hours / 10}h</span>
                              {ot > 0 && <span className="text-blue-400">{lang === "pt" ? "HE" : "残"}{ot / 10}h</span>}
                            </div>
                          </div>
                          <CalendarGrid
                            days={daysInMonth}
                            memberId={isGuest ? null : member.id}
                            memberName={isGuest ? member.nameKanji : null}
                            attendanceMap={attendanceMap}
                            compact
                            lang={lang}
                            onQuickToggle={(dateStr) =>
                              quickToggle(isGuest ? null : member.id, isGuest ? member.nameKanji : null, dateStr)
                            }
                            onSave={(dateStr, data) =>
                              autoSave({
                                employeeId: isGuest ? null : member.id,
                                guestName: isGuest ? member.nameKanji : null,
                                workDate: dateStr,
                                ...data,
                              })
                            }
                          />
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">
                {t("dashboard_attendanceHint")}
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
  onQuickToggle,
  onSave,
}: {
  days: Date[];
  memberId: number | null;
  memberName: string | null;
  attendanceMap: Record<string, any>;
  compact?: boolean;
  lang: AppLang;
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
        const hasValue = rec && rec.hoursWorked > 0;
        const dayOfWeek = getDay(day);
        const isSun = dayOfWeek === 0;
        const isSat = dayOfWeek === 6;
        const today = isToday(day);

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
