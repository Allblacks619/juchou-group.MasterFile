import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Calendar,
  Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDay, isWeekend } from "date-fns";
import { ja } from "date-fns/locale";

type WorkType = "normal" | "half_day" | "overtime" | "holiday" | "absence";

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  normal: "出勤",
  half_day: "半日",
  overtime: "残業",
  holiday: "休日出勤",
  absence: "欠勤",
};

const WORK_TYPE_COLORS: Record<WorkType, string> = {
  normal: "bg-emerald-500/20 text-emerald-400",
  half_day: "bg-amber-500/20 text-amber-400",
  overtime: "bg-blue-500/20 text-blue-400",
  holiday: "bg-purple-500/20 text-purple-400",
  absence: "bg-red-500/20 text-red-400",
};

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

interface CellData {
  employeeId: number;
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  workType: WorkType;
  notes: string;
  dirty: boolean;
}

export default function AppAttendance() {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [cellEdits, setCellEdits] = useState<Record<string, CellData>>({});

  // Queries
  const projectsQuery = trpc.project.list.useQuery();
  const employeesQuery = trpc.employee.list.useQuery();

  const startDate = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const endDate = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const attendanceQuery = trpc.attendance.list.useQuery(
    {
      startDate,
      endDate,
      projectId: selectedProjectId || undefined,
    },
    { enabled: !!selectedProjectId }
  );

  const batchUpsertMutation = trpc.attendance.batchUpsert.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.count}件の出勤記録を保存しました`);
      setCellEdits({});
      attendanceQuery.refetch();
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

  // Build attendance map: employeeId-date -> record
  const attendanceMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const rec of attendanceQuery.data || []) {
      const dateKey = format(new Date(rec.workDate), "yyyy-MM-dd");
      map[`${rec.employeeId}-${dateKey}`] = rec;
    }
    return map;
  }, [attendanceQuery.data]);

  // Get cell value (edited or from DB)
  const getCellValue = useCallback(
    (employeeId: number, dateStr: string): CellData => {
      const key = `${employeeId}-${dateStr}`;
      if (cellEdits[key]) return cellEdits[key];
      const existing = attendanceMap[key];
      if (existing) {
        return {
          employeeId,
          date: dateStr,
          hoursWorked: existing.hoursWorked,
          overtimeHours: existing.overtimeHours,
          workType: existing.workType as WorkType,
          notes: existing.notes || "",
          dirty: false,
        };
      }
      return {
        employeeId,
        date: dateStr,
        hoursWorked: 0,
        overtimeHours: 0,
        workType: "normal" as WorkType,
        notes: "",
        dirty: false,
      };
    },
    [cellEdits, attendanceMap]
  );

  // Toggle cell: cycle through work types on click
  const toggleCell = useCallback(
    (employeeId: number, dateStr: string) => {
      const current = getCellValue(employeeId, dateStr);
      const key = `${employeeId}-${dateStr}`;

      // Cycle: empty -> normal(8h) -> half_day(4h) -> overtime -> holiday -> absence -> empty
      let nextType: WorkType;
      let nextHours: number;
      let nextOvertime: number;

      if (current.hoursWorked === 0 && current.workType === "normal") {
        // Empty -> normal 8h
        nextType = "normal";
        nextHours = 80;
        nextOvertime = 0;
      } else if (current.workType === "normal" && current.hoursWorked === 80) {
        nextType = "half_day";
        nextHours = 40;
        nextOvertime = 0;
      } else if (current.workType === "half_day") {
        nextType = "overtime";
        nextHours = 80;
        nextOvertime = 20;
      } else if (current.workType === "overtime") {
        nextType = "holiday";
        nextHours = 80;
        nextOvertime = 0;
      } else if (current.workType === "holiday") {
        nextType = "absence";
        nextHours = 0;
        nextOvertime = 0;
      } else {
        // absence -> empty
        nextType = "normal";
        nextHours = 0;
        nextOvertime = 0;
      }

      setCellEdits((prev) => ({
        ...prev,
        [key]: {
          employeeId,
          date: dateStr,
          hoursWorked: nextHours,
          overtimeHours: nextOvertime,
          workType: nextType,
          notes: current.notes,
          dirty: true,
        },
      }));
    },
    [getCellValue]
  );

  // Save all dirty cells
  const handleSave = () => {
    if (!selectedProjectId) {
      toast.error("現場を選択してください");
      return;
    }

    const dirtyRecords = Object.values(cellEdits).filter((c) => c.dirty && c.hoursWorked > 0);
    if (dirtyRecords.length === 0) {
      toast.info("変更がありません");
      return;
    }

    batchUpsertMutation.mutate({
      records: dirtyRecords.map((c) => ({
        employeeId: c.employeeId,
        projectId: selectedProjectId,
        workDate: c.date,
        hoursWorked: c.hoursWorked,
        overtimeHours: c.overtimeHours,
        workType: c.workType,
        notes: c.notes || undefined,
      })),
    });
  };

  // Count dirty cells
  const dirtyCount = Object.values(cellEdits).filter((c) => c.dirty).length;

  // Compute summary per employee
  const getEmployeeSummary = (employeeId: number) => {
    let totalDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;
    for (const day of daysInMonth) {
      const dateStr = format(day, "yyyy-MM-dd");
      const cell = getCellValue(employeeId, dateStr);
      if (cell.hoursWorked > 0) {
        totalDays++;
        totalHours += cell.hoursWorked;
        totalOvertime += cell.overtimeHours;
      }
    }
    return { totalDays, totalHours: totalHours / 10, totalOvertime: totalOvertime / 10 };
  };

  const employees = employeesQuery.data || [];
  const projects = projectsQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">出面表</h1>
          <p className="text-muted-foreground mt-1">
            月別の出勤記録を管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <span className="text-sm text-amber-400">{dirtyCount}件の未保存変更</span>
          )}
          <Button
            onClick={handleSave}
            disabled={dirtyCount === 0 || batchUpsertMutation.isPending}
            className="bg-gold text-background hover:bg-gold-dim gap-1.5"
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

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Month navigation */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setCurrentMonth(subMonths(currentMonth, 1));
                  setCellEdits({});
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
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Project selector */}
            <Select
              value={selectedProjectId?.toString() || ""}
              onValueChange={(v) => {
                setSelectedProjectId(Number(v));
                setCellEdits({});
              }}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="現場を選択" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Grid */}
      {!selectedProjectId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>現場を選択して出面表を表示してください</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {format(currentMonth, "yyyy年M月", { locale: ja })} 出面表
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-card z-10 min-w-[120px]">
                      従業員
                    </TableHead>
                    {daysInMonth.map((day) => {
                      const dayOfWeek = getDay(day);
                      const isSat = dayOfWeek === 6;
                      const isSun = dayOfWeek === 0;
                      return (
                        <TableHead
                          key={format(day, "yyyy-MM-dd")}
                          className={`text-center min-w-[36px] px-1 ${
                            isSun ? "text-red-400" : isSat ? "text-blue-400" : ""
                          }`}
                        >
                          <div className="text-xs">{format(day, "d")}</div>
                          <div className="text-[10px]">{DAY_LABELS[dayOfWeek]}</div>
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-center min-w-[50px]">日数</TableHead>
                    <TableHead className="text-center min-w-[50px]">時間</TableHead>
                    <TableHead className="text-center min-w-[50px]">残業</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => {
                    const summary = getEmployeeSummary(emp.id);
                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="sticky left-0 bg-card z-10 font-medium text-sm whitespace-nowrap">
                          {emp.nameKanji || emp.nameRomaji || `ID:${emp.id}`}
                        </TableCell>
                        {daysInMonth.map((day) => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const cell = getCellValue(emp.id, dateStr);
                          const hasValue = cell.hoursWorked > 0;
                          const dayOfWeek = getDay(day);
                          const isSat = dayOfWeek === 6;
                          const isSun = dayOfWeek === 0;

                          return (
                            <TableCell
                              key={dateStr}
                              className={`text-center px-0.5 py-1 cursor-pointer select-none transition-colors hover:bg-muted/50 ${
                                isSun ? "bg-red-500/5" : isSat ? "bg-blue-500/5" : ""
                              } ${cell.dirty ? "ring-1 ring-amber-400/50" : ""}`}
                              onClick={() => toggleCell(emp.id, dateStr)}
                            >
                              {hasValue ? (
                                <span
                                  className={`inline-block text-[10px] font-medium rounded px-1 py-0.5 ${
                                    WORK_TYPE_COLORS[cell.workType]
                                  }`}
                                >
                                  {cell.hoursWorked / 10}
                                </span>
                              ) : null}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center text-sm font-medium">
                          {summary.totalDays > 0 ? summary.totalDays : "-"}
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium">
                          {summary.totalHours > 0 ? summary.totalHours : "-"}
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium">
                          {summary.totalOvertime > 0 ? summary.totalOvertime : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground mb-3">
            セルをクリックして出勤タイプを切り替えます:
          </p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(
              ([type, label]) => (
                <span
                  key={type}
                  className={`text-xs font-medium rounded px-2 py-1 ${WORK_TYPE_COLORS[type]}`}
                >
                  {label}
                </span>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
