import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Calendar,
  Loader2,
  Sun,
  Moon,
  Clock,
  X,
  Check,
  Lock,
  Unlock,
} from "lucide-react";
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

type WorkType = "normal" | "half_day" | "overtime" | "holiday" | "absence" | "day_off";
type ShiftType = "day" | "night";

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  normal: "出勤",
  half_day: "半日",
  overtime: "残業",
  holiday: "休出",
  absence: "欠勤",
  day_off: "休日",
};

const WORK_TYPE_SHORT: Record<WorkType, string> = {
  normal: "出",
  half_day: "半",
  overtime: "残",
  holiday: "休出",
  absence: "欠",
  day_off: "休",
};

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  normal: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  half_day: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  overtime: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  holiday: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  absence: "bg-red-500/20 text-red-400 border-red-500/30",
  day_off: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

interface CellData {
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  workType: WorkType;
  shiftType: ShiftType;
  notes: string;
  dirty: boolean;
}

export default function AppMyAttendance() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [cellEdits, setCellEdits] = useState<Record<string, CellData>>({});

  // Lock state: default LOCKED
  const [isLocked, setIsLocked] = useState(true);

  // Get employee's projects
  const projectsQuery = trpc.attendance.myProjects.useQuery();

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const attendanceQuery = trpc.attendance.myAttendance.useQuery(
    { startDate, endDate, projectId: selectedProjectId || undefined },
    { enabled: !!selectedProjectId }
  );

  const upsertMutation = trpc.attendance.upsert.useMutation({
    onSuccess: () => {
      toast.success("出勤記録を保存しました");
      attendanceQuery.refetch();
      setIsLocked(true); // Auto-lock after save
    },
    onError: (e) => toast.error(`保存エラー: ${e.message}`),
  });

  const batchUpsertMutation = trpc.attendance.batchUpsert.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count}件の出勤記録を保存しました`);
      setCellEdits({});
      attendanceQuery.refetch();
      setIsLocked(true); // Auto-lock after save
    },
    onError: (e) => toast.error(`保存エラー: ${e.message}`),
  });

  // Compute days of month
  const daysInMonth = useMemo(() => {
    return eachDayOfInterval({
      start: startOfMonth(currentMonth),
      end: endOfMonth(currentMonth),
    });
  }, [currentMonth]);

  // Build attendance map
  const attendanceMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const rec of attendanceQuery.data || []) {
      const dateKey = format(new Date(rec.workDate), "yyyy-MM-dd");
      map[dateKey] = rec;
    }
    return map;
  }, [attendanceQuery.data]);

  // Get cell value
  const getCellValue = useCallback(
    (dateStr: string): CellData => {
      if (cellEdits[dateStr]) return cellEdits[dateStr];
      const existing = attendanceMap[dateStr];
      if (existing) {
        return {
          date: dateStr,
          hoursWorked: existing.hoursWorked,
          overtimeHours: existing.overtimeHours,
          workType: existing.workType as WorkType,
          shiftType: (existing.shiftType || "day") as ShiftType,
          notes: existing.notes || "",
          dirty: false,
        };
      }
      return {
        date: dateStr,
        hoursWorked: 0,
        overtimeHours: 0,
        workType: "normal" as WorkType,
        shiftType: "day" as ShiftType,
        notes: "",
        dirty: false,
      };
    },
    [cellEdits, attendanceMap]
  );

  // Quick toggle
  const quickToggle = useCallback(
    (dateStr: string) => {
      if (isLocked) return;
      const current = getCellValue(dateStr);
      if (current.hoursWorked > 0 || current.workType === "day_off" || current.workType === "absence") {
        setCellEdits((prev) => ({
          ...prev,
          [dateStr]: { ...current, hoursWorked: 0, overtimeHours: 0, workType: "normal", dirty: true },
        }));
      } else {
        setCellEdits((prev) => ({
          ...prev,
          [dateStr]: { ...current, hoursWorked: 80, workType: "normal", dirty: true },
        }));
      }
    },
    [getCellValue, isLocked]
  );

  // Update cell
  const updateCell = useCallback(
    (dateStr: string, updates: Partial<CellData>) => {
      if (isLocked) return;
      const current = getCellValue(dateStr);
      const newCell: CellData = { ...current, ...updates, date: dateStr, dirty: true };
      if (updates.workType === "day_off" || updates.workType === "absence") {
        newCell.hoursWorked = 0;
        newCell.overtimeHours = 0;
      } else if (updates.workType && newCell.hoursWorked === 0) {
        newCell.hoursWorked = updates.workType === "half_day" ? 40 : 80;
      }
      setCellEdits((prev) => ({ ...prev, [dateStr]: newCell }));
    },
    [getCellValue, isLocked]
  );

  const clearCell = useCallback((dateStr: string) => {
    if (isLocked) return;
    setCellEdits((prev) => ({
      ...prev,
      [dateStr]: {
        date: dateStr,
        hoursWorked: 0,
        overtimeHours: 0,
        workType: "normal",
        shiftType: "day",
        notes: "",
        dirty: true,
      },
    }));
  }, [isLocked]);

  // Save
  const handleSave = () => {
    if (!selectedProjectId) {
      toast.error("現場を選択してください");
      return;
    }
    const dirtyRecords = Object.values(cellEdits).filter((c) => c.dirty);
    if (dirtyRecords.length === 0) {
      toast.info("変更がありません");
      return;
    }
    const recordsToSave = dirtyRecords.filter(c => c.hoursWorked > 0 || c.workType === "day_off" || c.workType === "absence");
    const recordsToDelete = dirtyRecords.filter(c => c.hoursWorked === 0 && c.workType !== "day_off" && c.workType !== "absence");

    batchUpsertMutation.mutate({
      records: recordsToSave.map((c) => ({
        projectId: selectedProjectId,
        workDate: c.date,
        hoursWorked: c.hoursWorked,
        overtimeHours: c.overtimeHours,
        workType: c.workType,
        shiftType: c.shiftType,
        notes: c.notes || undefined,
      })),
      deletes: recordsToDelete.map((c) => ({
        projectId: selectedProjectId,
        workDate: c.date,
      })),
    });
  };

  const dirtyCount = Object.values(cellEdits).filter((c) => c.dirty).length;
  const projects = projectsQuery.data || [];

  // Check if a cell has a value
  const cellHasValue = (cell: CellData) => {
    return cell.hoursWorked > 0 || cell.workType === "day_off" || cell.workType === "absence";
  };

  // Summary — day_off and absence are NOT counted as worked days
  const summary = useMemo(() => {
    let totalDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;
    let dayOffCount = 0;
    for (const day of daysInMonth) {
      const dateStr = format(day, "yyyy-MM-dd");
      const cell = getCellValue(dateStr);
      if (cell.workType === "day_off") {
        dayOffCount++;
      } else if (cell.hoursWorked > 0) {
        totalDays++;
        totalHours += cell.hoursWorked;
        totalOvertime += cell.overtimeHours;
      }
    }
    return { totalDays, totalHours: totalHours / 10, totalOvertime: totalOvertime / 10, dayOffCount };
  }, [daysInMonth, getCellValue]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">マイ出面表</h1>
          <p className="text-muted-foreground mt-1">自分の出勤記録を入力します</p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-sm text-amber-400">{dirtyCount}件の未保存変更</span>
          )}

          {/* Lock/Unlock toggle */}
          <Button
            variant={isLocked ? "outline" : "default"}
            size="sm"
            onClick={() => setIsLocked(!isLocked)}
            className={!isLocked ? "bg-amber-500 hover:bg-amber-600 text-black" : ""}
          >
            {isLocked ? (
              <>
                <Lock className="h-4 w-4 mr-1" />
                ロック中
              </>
            ) : (
              <>
                <Unlock className="h-4 w-4 mr-1" />
                編集中
              </>
            )}
          </Button>

          <Button
            onClick={handleSave}
            disabled={dirtyCount === 0 || batchUpsertMutation.isPending || isLocked}
            className="bg-gold text-background hover:bg-gold-dim gap-1.5"
            size="sm"
          >
            {batchUpsertMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            保存
          </Button>
        </div>
      </div>

      {/* Lock banner */}
      {isLocked && selectedProjectId && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border border-border rounded-md text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span>出面表はロックされています。編集するには「ロック中」ボタンをクリックして解除してください。</span>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setCurrentMonth(subMonths(currentMonth, 1));
                  setCellEdits({});
                  setIsLocked(true);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-[140px] justify-center">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {format(currentMonth, "yyyy年M月", { locale: ja })}
                </span>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setCurrentMonth(addMonths(currentMonth, 1));
                  setCellEdits({});
                  setIsLocked(true);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={selectedProjectId?.toString() || ""}
              onValueChange={(v) => {
                setSelectedProjectId(Number(v));
                setCellEdits({});
                setIsLocked(true);
              }}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="現場を選択" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          {/* Calendar Grid - Mobile Friendly */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{format(currentMonth, "yyyy年M月", { locale: ja })}</span>
                  {!isLocked && (
                    <span className="text-xs font-normal px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded">
                      編集モード
                    </span>
                  )}
                </div>
                <div className="flex gap-4 text-sm font-normal text-muted-foreground">
                  <span>出勤: <strong className="text-foreground">{summary.totalDays}日</strong></span>
                  <span>時間: <strong className="text-foreground">{summary.totalHours}h</strong></span>
                  {summary.totalOvertime > 0 && (
                    <span>残業: <strong className="text-blue-400">{summary.totalOvertime}h</strong></span>
                  )}
                  {summary.dayOffCount > 0 && (
                    <span>休: <strong className="text-gray-400">{summary.dayOffCount}日</strong></span>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {/* Day headers */}
                {DAY_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className={`text-center text-xs font-medium py-1 ${
                      i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </div>
                ))}

                {/* Empty cells for days before month start */}
                {Array.from({ length: getDay(daysInMonth[0]) }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}

                {/* Day cells */}
                {daysInMonth.map((day) => {
                  const dateStr = format(day, "yyyy-MM-dd");
                  const cell = getCellValue(dateStr);
                  const hasValue = cellHasValue(cell);
                  const dayOfWeek = getDay(day);
                  const isSun = dayOfWeek === 0;
                  const isSat = dayOfWeek === 6;
                  const today = isToday(day);

                  if (isLocked) {
                    // Locked: display only, no interaction
                    return (
                      <div
                        key={dateStr}
                        className={`relative rounded-lg border p-1.5 min-h-[56px] flex flex-col items-center justify-center ${
                          today ? "ring-2 ring-gold/50" : ""
                        } ${
                          hasValue
                            ? WORK_TYPE_COLORS[cell.workType]
                            : isSun
                            ? "border-red-500/20 bg-red-500/5"
                            : isSat
                            ? "border-blue-500/20 bg-blue-500/5"
                            : "border-border"
                        }`}
                      >
                        <span
                          className={`text-xs ${
                            isSun ? "text-red-400" : isSat ? "text-blue-400" : "text-muted-foreground"
                          } ${today ? "font-bold" : ""}`}
                        >
                          {format(day, "d")}
                        </span>
                        {hasValue && (
                          <>
                            <span className="text-[10px] font-bold mt-0.5">
                              {WORK_TYPE_SHORT[cell.workType]}
                              {cell.shiftType === "night" ? "夜" : ""}
                            </span>
                            {cell.overtimeHours > 0 && (
                              <span className="text-[8px] text-blue-400">+{cell.overtimeHours / 10}h</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  }

                  // Unlocked: interactive
                  return (
                    <Popover key={dateStr}>
                      <PopoverTrigger asChild>
                        <button
                          className={`relative rounded-lg border p-1.5 min-h-[56px] flex flex-col items-center justify-center transition-all ${
                            today ? "ring-2 ring-gold/50" : ""
                          } ${
                            hasValue
                              ? WORK_TYPE_COLORS[cell.workType]
                              : isSun
                              ? "border-red-500/20 bg-red-500/5"
                              : isSat
                              ? "border-blue-500/20 bg-blue-500/5"
                              : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                          } ${cell.dirty ? "ring-1 ring-amber-400/50" : ""}`}
                          onClick={(e) => {
                            if (!hasValue) {
                              e.preventDefault();
                              quickToggle(dateStr);
                            }
                          }}
                        >
                          <span
                            className={`text-xs ${
                              isSun ? "text-red-400" : isSat ? "text-blue-400" : "text-muted-foreground"
                            } ${today ? "font-bold" : ""}`}
                          >
                            {format(day, "d")}
                          </span>
                          {hasValue && (
                            <>
                              <span className="text-[10px] font-bold mt-0.5">
                                {WORK_TYPE_SHORT[cell.workType]}
                                {cell.shiftType === "night" ? "夜" : ""}
                              </span>
                              {cell.overtimeHours > 0 && (
                                <span className="text-[8px] text-blue-400">+{cell.overtimeHours / 10}h</span>
                              )}
                            </>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" side="bottom">
                        <div className="space-y-3 p-1">
                          <p className="text-sm font-medium">
                            {format(day, "M月d日(E)", { locale: ja })}
                          </p>
                          {/* Work Type */}
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">出勤タイプ</label>
                            <div className="flex flex-wrap gap-1">
                              {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(([type, label]) => (
                                <button
                                  key={type}
                                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                                    cell.workType === type && (cell.hoursWorked > 0 || type === "day_off" || type === "absence")
                                      ? WORK_TYPE_COLORS[type].replace(" border-", " border-current border-")
                                      : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                  onClick={() => {
                                    if (type === "day_off" || type === "absence") {
                                      updateCell(dateStr, { workType: type, hoursWorked: 0, overtimeHours: 0 });
                                    } else {
                                      const hours = type === "half_day" ? 40 : 80;
                                      updateCell(dateStr, { workType: type, hoursWorked: hours });
                                    }
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
                                  cell.shiftType === "day"
                                    ? "bg-amber-500/20 text-amber-400 border-amber-400/50"
                                    : "border-border text-muted-foreground"
                                }`}
                                onClick={() => updateCell(dateStr, { shiftType: "day" })}
                              >
                                <Sun className="h-3 w-3" /> 昼勤
                              </button>
                              <button
                                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                                  cell.shiftType === "night"
                                    ? "bg-indigo-500/20 text-indigo-400 border-indigo-400/50"
                                    : "border-border text-muted-foreground"
                                }`}
                                onClick={() => updateCell(dateStr, { shiftType: "night" })}
                              >
                                <Moon className="h-3 w-3" /> 夜勤
                              </button>
                            </div>
                          </div>
                          {/* Overtime */}
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              <Clock className="h-3 w-3 inline mr-1" />残業時間
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {[0, 10, 20, 30, 40, 50, 60, 70, 80].map((val) => (
                                <button
                                  key={val}
                                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                                    cell.overtimeHours === val
                                      ? "bg-blue-500/20 text-blue-400 border-blue-400/50"
                                      : "border-border text-muted-foreground"
                                  }`}
                                  onClick={() => updateCell(dateStr, { overtimeHours: val })}
                                >
                                  {val / 10}h
                                </button>
                              ))}
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => clearCell(dateStr)}>
                            <X className="h-3 w-3 mr-1" /> クリア
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-3">
                {isLocked
                  ? "出面表はロック中です。「ロック中」ボタンをクリックして編集を開始してください。"
                  : "日付をタップで出勤を記録。もう一度タップで詳細編集。"}
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(([type, label]) => (
                  <span key={type} className={`text-xs font-medium rounded px-2 py-1 ${WORK_TYPE_COLORS[type]}`}>
                    {WORK_TYPE_SHORT[type]} = {label}
                  </span>
                ))}
                <span className="text-xs font-medium rounded px-2 py-1 bg-indigo-500/20 text-indigo-400">
                  夜 = 夜勤
                </span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
