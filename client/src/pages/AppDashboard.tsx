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
  CheckCircle,
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

type WorkType = "normal" | "half_day" | "overtime" | "holiday" | "absence";
type ShiftType = "day" | "night";

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  normal: "出勤",
  half_day: "半日",
  overtime: "残業",
  holiday: "休出",
  absence: "欠勤",
};

const WORK_TYPE_SHORT: Record<WorkType, string> = {
  normal: "出",
  half_day: "半",
  overtime: "残",
  holiday: "休",
  absence: "欠",
};

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  normal: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  half_day: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  overtime: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  holiday: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  absence: "bg-red-500/20 text-red-400 border-red-500/30",
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// Overtime options: 0 to 12 in 0.5 steps, stored as *10
const OVERTIME_OPTIONS: number[] = [];
for (let i = 0; i <= 120; i += 5) {
  OVERTIME_OPTIONS.push(i);
}

export default function AppDashboard() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole || "worker";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-muted-foreground mt-1">
          ようこそ、{user?.name || "ユーザー"}さん
        </p>
      </div>

      <ProfileCompletionAlert />

      {(appRole === "admin" || appRole === "leader") && <AdminStats />}

      {/* Attendance calendar for all roles */}
      <AttendanceCalendar />
    </div>
  );
}

/** Alert banner for missing required profile fields */
function ProfileCompletionAlert() {
  const [, setLocation] = useLocation();
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
                <p className="font-medium text-yellow-500">プロフィールが未登録です</p>
                <p className="text-sm text-muted-foreground mt-1">
                  現場への提出書類に必要な情報を入力してください。
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gold text-background hover:bg-gold/90 shrink-0"
              onClick={() => setLocation("/app/my-profile")}
            >
              入力する <ArrowRight className="h-4 w-4 ml-1" />
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
                  未記入の必須項目があります（{missingInfo.missingFields.length}件）
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {missingInfo.missingFields.slice(0, 6).map((f) => (
                    <Badge key={f.key} variant="outline" className="text-xs">{f.label}</Badge>
                  ))}
                  {missingInfo.missingFields.length > 6 && (
                    <Badge variant="outline" className="text-xs">+{missingInfo.missingFields.length - 6}件</Badge>
                  )}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gold text-background hover:bg-gold/90 shrink-0"
              onClick={() => setLocation("/app/my-profile")}
            >
              入力する <ArrowRight className="h-4 w-4 ml-1" />
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
  const employeesQuery = trpc.employee.list.useQuery(undefined, { retry: false });
  const invitationsQuery = trpc.invitation.list.useQuery(undefined, { retry: false });

  const stats = [
    { title: "従業員数", value: employeesQuery.data?.length ?? "-", icon: Users, path: "/app/employees" },
    { title: "招待数", value: invitationsQuery.data?.length ?? "-", icon: UserPlus, path: "/app/invitations" },
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
    </div>
  );
}

/** Main attendance calendar component */
function AttendanceCalendar() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [projectInitialized, setProjectInitialized] = useState(false);
  const [guestDialogOpen, setGuestDialogOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [editingMember, setEditingMember] = useState<{ id: number | null; name: string; type: "employee" | "guest" } | null>(null);

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  // Queries
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
    onError: (e) => toast.error(`保存エラー: ${e.message}`),
  });

  const pdfMutation = trpc.attendance.generatePdf.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("PDFを生成しました");
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  // Auto-select last project
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

  // Build attendance map: key = "emp-{id}-{date}" or "guest-{name}-{date}"
  const attendanceMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const rec of teamDataQuery.data?.records || []) {
      const dateStr = format(new Date(rec.workDate), "yyyy-MM-dd");
      const key = rec.employeeId ? `emp-${rec.employeeId}-${dateStr}` : `guest-${rec.guestName}-${dateStr}`;
      map[key] = rec;
    }
    return map;
  }, [teamDataQuery.data]);

  const members = teamDataQuery.data?.members || [];
  const myEmployeeId = myInfoQuery.data?.id;
  const projects = projectsQuery.data || [];

  // Auto-save: when user clicks a cell, immediately save
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

  // Quick toggle for a member on a date
  const quickToggle = useCallback(
    (memberId: number | null, memberName: string | null, dateStr: string) => {
      const key = memberId ? `emp-${memberId}-${dateStr}` : `guest-${memberName}-${dateStr}`;
      const existing = attendanceMap[key];
      if (existing && existing.hoursWorked > 0) {
        // Clear
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
        // Set to normal day
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
      toast.error("名前を入力してください");
      return;
    }
    if (!selectedProjectId) {
      toast.error("現場を選択してください");
      return;
    }
    // Add guest by creating an attendance record for today
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
    toast.success(`ゲスト「${guestName.trim()}」を追加しました`);
    setGuestName("");
    setGuestDialogOpen(false);
  };

  const handlePdfDownload = () => {
    if (!selectedProjectId) return;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    pdfMutation.mutate({ year, month, projectId: selectedProjectId });
  };

  // Summary for my attendance
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

  return (
    <>
      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-[130px] justify-center">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{format(currentMonth, "yyyy年M月", { locale: ja })}</span>
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
                <SelectValue placeholder="現場を選択" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setGuestDialogOpen(true)} disabled={!selectedProjectId}>
                <Plus className="h-4 w-4 mr-1" /> ゲスト追加
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePdfDownload}
                disabled={!selectedProjectId || pdfMutation.isPending}
              >
                {pdfMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                PDF出力
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedProjectId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>現場を選択して出面表を表示してください</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* My Calendar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                <span className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4" />
                  マイ出面表
                </span>
                <div className="flex gap-3 text-sm font-normal text-muted-foreground">
                  <span>出勤: <strong className="text-foreground">{mySummary.totalDays}日</strong></span>
                  <span>時間: <strong className="text-foreground">{mySummary.totalHours}h</strong></span>
                  {mySummary.totalOvertime > 0 && (
                    <span>残業: <strong className="text-blue-400">{mySummary.totalOvertime}h</strong></span>
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
                  onQuickToggle={(dateStr) => quickToggle(myEmployeeId, null, dateStr)}
                  onSave={(dateStr, data) =>
                    autoSave({ employeeId: myEmployeeId, guestName: null, workDate: dateStr, ...data })
                  }
                />
              ) : (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  従業員プロフィールが未登録です。管理者にお問い合わせください。
                </p>
              )}
            </CardContent>
          </Card>

          {/* Team members */}
          {members.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  チームメンバーの出面状況
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {members
                    .filter((m) => !(m.type === "employee" && m.id === myEmployeeId))
                    .map((member) => {
                      const isGuest = member.type === "guest";
                      const mKey = isGuest ? `guest-${member.nameKanji}` : `emp-${member.id}`;
                      // Calculate summary
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
                                <Badge variant="outline" className="text-xs">ゲスト</Badge>
                              )}
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              <span>{days}日</span>
                              <span>{hours / 10}h</span>
                              {ot > 0 && <span className="text-blue-400">残{ot / 10}h</span>}
                            </div>
                          </div>
                          <CalendarGrid
                            days={daysInMonth}
                            memberId={isGuest ? null : member.id}
                            memberName={isGuest ? member.nameKanji : null}
                            attendanceMap={attendanceMap}
                            compact
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

          {/* Legend */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">
                日付をタップで出勤を記録（自動保存）。もう一度タップで詳細編集。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(([type, label]) => (
                  <span key={type} className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${WORK_TYPE_COLORS[type]}`}>
                    {WORK_TYPE_SHORT[type]} = {label}
                  </span>
                ))}
                <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-indigo-500/20 text-indigo-400">夜 = 夜勤</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Guest dialog */}
      <Dialog open={guestDialogOpen} onOpenChange={setGuestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ゲスト追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">名前を入力してゲスト作業員を追加します。今日の出勤として記録されます。</p>
            <Input
              placeholder="ゲスト名（例：田中太郎）"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddGuest(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestDialogOpen(false)}>キャンセル</Button>
            <Button className="bg-gold text-background hover:bg-gold/90" onClick={handleAddGuest}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Reusable calendar grid for a single member */
function CalendarGrid({
  days,
  memberId,
  memberName,
  attendanceMap,
  compact = false,
  onQuickToggle,
  onSave,
}: {
  days: Date[];
  memberId: number | null;
  memberName: string | null;
  attendanceMap: Record<string, any>;
  compact?: boolean;
  onQuickToggle: (dateStr: string) => void;
  onSave: (dateStr: string, data: { hoursWorked: number; overtimeHours: number; workType: WorkType; shiftType: ShiftType; notes?: string }) => void;
}) {
  const keyPrefix = memberId ? `emp-${memberId}` : `guest-${memberName}`;
  const cellSize = compact ? "min-h-[40px]" : "min-h-[52px]";
  const fontSize = compact ? "text-[9px]" : "text-xs";
  const detailFontSize = compact ? "text-[8px]" : "text-[10px]";

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {/* Day headers */}
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

      {/* Empty cells */}
      {Array.from({ length: getDay(days[0]) }).map((_, i) => (
        <div key={`empty-${i}`} />
      ))}

      {/* Day cells */}
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
                      {WORK_TYPE_SHORT[rec.workType as WorkType]}
                      {rec.shiftType === "night" ? "夜" : ""}
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

/** Popover cell editor */
function CellEditor({
  dateStr,
  day,
  existing,
  onSave,
  onClear,
}: {
  dateStr: string;
  day: Date;
  existing: any;
  onSave: (dateStr: string, data: { hoursWorked: number; overtimeHours: number; workType: WorkType; shiftType: ShiftType }) => void;
  onClear: () => void;
}) {
  const currentWorkType = (existing?.workType as WorkType) || "normal";
  const currentShift = (existing?.shiftType as ShiftType) || "day";
  const currentOvertime = existing?.overtimeHours || 0;

  return (
    <div className="space-y-3 p-1">
      <p className="text-sm font-medium">{format(day, "M月d日(E)", { locale: ja })}</p>

      {/* Work Type */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">出勤タイプ</label>
        <div className="flex flex-wrap gap-1">
          {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(([type, label]) => (
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

      {/* Shift */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">シフト</label>
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
            <Sun className="h-3 w-3" /> 昼勤
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
            <Moon className="h-3 w-3" /> 夜勤
          </button>
        </div>
      </div>

      {/* Overtime - 0.5 increments up to 12h */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          <Clock className="h-3 w-3 inline mr-1" />残業時間
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
                {val / 10}時間
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" size="sm" className="w-full text-xs" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> クリア
      </Button>
    </div>
  );
}
