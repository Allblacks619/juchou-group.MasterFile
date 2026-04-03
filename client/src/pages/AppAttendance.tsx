import { useState, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  FileDown,
  UserPlus,
  Sun,
  Moon,
  Clock,
  X,
  Users,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getDay,
} from "date-fns";
import { ja } from "date-fns/locale";

type WorkType = "normal" | "half_day" | "overtime" | "holiday" | "absence";
type ShiftType = "day" | "night";

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  normal: "出勤",
  half_day: "半日",
  overtime: "残業",
  holiday: "休出",
  absence: "休",
};

const WORK_TYPE_SHORT: Record<WorkType, string> = {
  normal: "出",
  half_day: "半",
  overtime: "残",
  holiday: "休",
  absence: "休",
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
  employeeId: number | null;
  guestName: string | null;
  date: string;
  hoursWorked: number;
  overtimeHours: number;
  workType: WorkType;
  shiftType: ShiftType;
  notes: string;
  dirty: boolean;
}

interface CellEditPopoverProps {
  cell: CellData;
  onUpdate: (updates: Partial<CellData>) => void;
  onClear: () => void;
}

function CellEditPopover({ cell, onUpdate, onClear }: CellEditPopoverProps) {
  return (
    <div className="space-y-3 p-1">
      {/* Work Type */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">出勤タイプ</label>
        <div className="flex flex-wrap gap-1">
          {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(([type, label]) => (
            <button
              key={type}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                cell.workType === type && cell.hoursWorked > 0
                  ? WORK_TYPE_COLORS[type] + " border-current"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => {
                const hours = type === "absence" ? 0 : type === "half_day" ? 40 : 80;
                onUpdate({ workType: type, hoursWorked: hours });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Shift Type */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">シフト</label>
        <div className="flex gap-1">
          <button
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              cell.shiftType === "day"
                ? "bg-amber-500/20 text-amber-400 border-amber-400/50"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onUpdate({ shiftType: "day" })}
          >
            <Sun className="h-3 w-3" /> 昼勤
          </button>
          <button
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
              cell.shiftType === "night"
                ? "bg-indigo-500/20 text-indigo-400 border-indigo-400/50"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => onUpdate({ shiftType: "night" })}
          >
            <Moon className="h-3 w-3" /> 夜勤
          </button>
        </div>
      </div>

      {/* Overtime Hours - 0.5 increments up to 12h */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">
          <Clock className="h-3 w-3 inline mr-1" />残業時間
        </label>
        <Select
          value={cell.overtimeHours.toString()}
          onValueChange={(v) => onUpdate({ overtimeHours: Number(v) })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {Array.from({ length: 25 }, (_, i) => i * 5).map((val) => (
              <SelectItem key={val} value={val.toString()}>
                {val / 10}時間
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clear button */}
      <Button variant="outline" size="sm" className="w-full text-xs" onClick={onClear}>
        <X className="h-3 w-3 mr-1" /> クリア
      </Button>
    </div>
  );
}

export default function AppAttendance() {
  const { user } = useAuth();
  const appRole = (user as any)?.appRole || "worker";
  const isAdminOrLeader = appRole === "admin" || appRole === "leader";

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [cellEdits, setCellEdits] = useState<Record<string, CellData>>({});
  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [newGuestName, setNewGuestName] = useState("");
  const [guestNames, setGuestNames] = useState<string[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");

  // Queries
  const projectsQuery = trpc.project.list.useQuery();
  const employeesQuery = trpc.employee.list.useQuery();

  // Get project members for the selected project
  const projectMembersQuery = trpc.project.members.useQuery(
    { projectId: selectedProjectId! },
    { enabled: !!selectedProjectId && isAdminOrLeader }
  );

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

  const generatePdfMutation = trpc.attendance.generatePdf.useMutation({
    onSuccess: (data) => {
      toast.success("PDF生成完了");
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const generateExcelMutation = trpc.attendance.generateExcel.useMutation({
    onSuccess: (data) => {
      toast.success("Excel生成完了");
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(`Excel生成エラー: ${e.message}`),
  });

  const addMemberMutation = trpc.project.addMember.useMutation({
    onSuccess: () => {
      toast.success("作業員を現場に追加しました");
      projectMembersQuery.refetch();
      setShowAddMemberDialog(false);
      setSelectedMemberId("");
    },
    onError: (e) => toast.error(`追加エラー: ${e.message}`),
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
      if (rec.employeeId) {
        map[`emp-${rec.employeeId}-${dateKey}`] = rec;
      } else if (rec.guestName) {
        map[`guest-${rec.guestName}-${dateKey}`] = rec;
      }
    }
    return map;
  }, [attendanceQuery.data]);

  // Extract guest names from existing records
  const existingGuestNames = useMemo(() => {
    const names = new Set<string>();
    for (const rec of attendanceQuery.data || []) {
      if (rec.guestName) names.add(rec.guestName);
    }
    return Array.from(names);
  }, [attendanceQuery.data]);

  // All guest names (existing + newly added)
  const allGuestNames = useMemo(() => {
    const names = new Set([...existingGuestNames, ...guestNames]);
    return Array.from(names);
  }, [existingGuestNames, guestNames]);

  // Get cell value
  const getCellValue = useCallback(
    (rowKey: string, dateStr: string): CellData => {
      const key = `${rowKey}-${dateStr}`;
      if (cellEdits[key]) return cellEdits[key];
      const existing = attendanceMap[key];
      if (existing) {
        return {
          employeeId: existing.employeeId ?? null,
          guestName: existing.guestName ?? null,
          date: dateStr,
          hoursWorked: existing.hoursWorked,
          overtimeHours: existing.overtimeHours,
          workType: existing.workType as WorkType,
          shiftType: (existing.shiftType || "day") as ShiftType,
          notes: existing.notes || "",
          dirty: false,
        };
      }
      const isEmp = rowKey.startsWith("emp-");
      return {
        employeeId: isEmp ? parseInt(rowKey.replace("emp-", "")) : null,
        guestName: isEmp ? null : rowKey.replace("guest-", ""),
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

  // Quick toggle cell (click to set normal 8h, click again to clear)
  const quickToggleCell = useCallback(
    (rowKey: string, dateStr: string) => {
      const current = getCellValue(rowKey, dateStr);
      const key = `${rowKey}-${dateStr}`;
      const isEmp = rowKey.startsWith("emp-");

      if (current.hoursWorked > 0) {
        // Clear
        setCellEdits((prev) => ({
          ...prev,
          [key]: {
            employeeId: isEmp ? parseInt(rowKey.replace("emp-", "")) : null,
            guestName: isEmp ? null : rowKey.replace("guest-", ""),
            date: dateStr,
            hoursWorked: 0,
            overtimeHours: 0,
            workType: "normal",
            shiftType: current.shiftType,
            notes: "",
            dirty: true,
          },
        }));
      } else {
        // Set normal 8h
        setCellEdits((prev) => ({
          ...prev,
          [key]: {
            employeeId: isEmp ? parseInt(rowKey.replace("emp-", "")) : null,
            guestName: isEmp ? null : rowKey.replace("guest-", ""),
            date: dateStr,
            hoursWorked: 80,
            overtimeHours: 0,
            workType: "normal",
            shiftType: current.shiftType,
            notes: "",
            dirty: true,
          },
        }));
      }
    },
    [getCellValue]
  );

  // Update cell from popover
  const updateCell = useCallback(
    (rowKey: string, dateStr: string, updates: Partial<CellData>) => {
      const current = getCellValue(rowKey, dateStr);
      const key = `${rowKey}-${dateStr}`;
      const isEmp = rowKey.startsWith("emp-");

      const newCell: CellData = {
        ...current,
        ...updates,
        employeeId: isEmp ? parseInt(rowKey.replace("emp-", "")) : null,
        guestName: isEmp ? null : rowKey.replace("guest-", ""),
        date: dateStr,
        dirty: true,
      };

      // If setting a work type, ensure hours are set
      if (updates.workType && newCell.hoursWorked === 0 && updates.workType !== "absence") {
        newCell.hoursWorked = updates.workType === "half_day" ? 40 : 80;
      }

      setCellEdits((prev) => ({ ...prev, [key]: newCell }));
    },
    [getCellValue]
  );

  const clearCell = useCallback(
    (rowKey: string, dateStr: string) => {
      const key = `${rowKey}-${dateStr}`;
      const isEmp = rowKey.startsWith("emp-");
      setCellEdits((prev) => ({
        ...prev,
        [key]: {
          employeeId: isEmp ? parseInt(rowKey.replace("emp-", "")) : null,
          guestName: isEmp ? null : rowKey.replace("guest-", ""),
          date: dateStr,
          hoursWorked: 0,
          overtimeHours: 0,
          workType: "normal",
          shiftType: "day",
          notes: "",
          dirty: true,
        },
      }));
    },
    []
  );

  // Save all dirty cells
  const handleSave = () => {
    if (!selectedProjectId) {
      toast.error("現場を選択してください");
      return;
    }

    const dirtyRecords = Object.values(cellEdits).filter((c) => c.dirty);
    const recordsToSave = dirtyRecords.filter(c => c.hoursWorked > 0);
    if (recordsToSave.length === 0) {
      toast.info("変更がありません");
      return;
    }

    batchUpsertMutation.mutate({
      records: recordsToSave.map((c) => ({
        employeeId: c.employeeId,
        guestName: c.guestName || undefined,
        projectId: selectedProjectId,
        workDate: c.date,
        hoursWorked: c.hoursWorked,
        overtimeHours: c.overtimeHours,
        workType: c.workType,
        shiftType: c.shiftType,
        notes: c.notes || undefined,
      })),
    });
  };

  // PDF export
  const handleExportPdf = () => {
    if (!selectedProjectId) {
      toast.error("現場を選択してください");
      return;
    }
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    generatePdfMutation.mutate({ year, month, projectId: selectedProjectId });
  };

  // Excel export
  const handleExportExcel = () => {
    if (!selectedProjectId) {
      toast.error("現場を選択してください");
      return;
    }
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    generateExcelMutation.mutate({ year, month, projectId: selectedProjectId });
  };

  // Add guest
  const handleAddGuest = () => {
    const name = newGuestName.trim();
    if (!name) {
      toast.error("名前を入力してください");
      return;
    }
    if (allGuestNames.includes(name)) {
      toast.error("同じ名前のゲストが既に存在します");
      return;
    }
    setGuestNames((prev) => [...prev, name]);
    setNewGuestName("");
    setShowGuestDialog(false);
    toast.success(`ゲスト「${name}」を追加しました`);
  };

  // Add member to project
  const handleAddMember = () => {
    if (!selectedProjectId || !selectedMemberId) {
      toast.error("作業員を選択してください");
      return;
    }
    addMemberMutation.mutate({
      projectId: selectedProjectId,
      employeeId: parseInt(selectedMemberId),
    });
  };

  const dirtyCount = Object.values(cellEdits).filter((c) => c.dirty).length;

  // Compute summary per row
  const getRowSummary = (rowKey: string) => {
    let totalDays = 0;
    let totalHours = 0;
    let totalOvertime = 0;
    for (const day of daysInMonth) {
      const dateStr = format(day, "yyyy-MM-dd");
      const cell = getCellValue(rowKey, dateStr);
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

  // Build rows: use project members (not all employees) + guests from attendance records
  const projectMemberIds = useMemo(() => {
    if (!projectMembersQuery.data) return new Set<number>();
    return new Set(projectMembersQuery.data.map((m: any) => m.employeeId));
  }, [projectMembersQuery.data]);

  // Also include employees who have attendance records for this project (even if not assigned)
  const employeesWithRecords = useMemo(() => {
    const ids = new Set<number>();
    for (const rec of attendanceQuery.data || []) {
      if (rec.employeeId) ids.add(rec.employeeId);
    }
    return ids;
  }, [attendanceQuery.data]);

  const rows = useMemo(() => {
    // Combine project members + employees with existing records (deduplicated)
    const allEmpIds = new Set([...Array.from(projectMemberIds), ...Array.from(employeesWithRecords)]);
    const empRows = employees
      .filter((emp) => allEmpIds.has(emp.id))
      .map((emp) => ({
        key: `emp-${emp.id}`,
        label: emp.nameKanji || emp.nameRomaji || `ID:${emp.id}`,
        isGuest: false,
      }));
    const guestRows = allGuestNames.map((name) => ({
      key: `guest-${name}`,
      label: `${name}（ゲスト）`,
      isGuest: true,
    }));
    return [...empRows, ...guestRows];
  }, [employees, allGuestNames, projectMemberIds, employeesWithRecords]);

  // Employees not yet assigned to this project (for add member dialog)
  const availableEmployees = useMemo(() => {
    return employees.filter((emp) => !projectMemberIds.has(emp.id));
  }, [employees, projectMemberIds]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">出面表</h1>
          <p className="text-muted-foreground mt-1">月別の出勤記録を管理します</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {dirtyCount > 0 && (
            <span className="text-sm text-amber-400">{dirtyCount}件の未保存変更</span>
          )}
          {isAdminOrLeader && selectedProjectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddMemberDialog(true)}
            >
              <Users className="h-4 w-4 mr-1" />
              作業員追加
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGuestDialog(true)}
            disabled={!selectedProjectId}
          >
            <UserPlus className="h-4 w-4 mr-1" />
            ゲスト追加
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPdf}
            disabled={!selectedProjectId || generatePdfMutation.isPending}
          >
            {generatePdfMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <FileDown className="h-4 w-4 mr-1" />
            )}
            PDF出力
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={!selectedProjectId || generateExcelMutation.isPending}
          >
            {generateExcelMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <FileDown className="h-4 w-4 mr-1" />
            )}
            Excel出力
          </Button>
          <Button
            onClick={handleSave}
            disabled={dirtyCount === 0 || batchUpsertMutation.isPending}
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
                setGuestNames([]);
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
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>この現場にはまだ作業員が配属されていません</p>
            {isAdminOrLeader && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setShowAddMemberDialog(true)}
              >
                <UserPlus className="h-4 w-4 mr-1" />
                作業員を追加する
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
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
                      氏名
                    </TableHead>
                    {daysInMonth.map((day) => {
                      const dayOfWeek = getDay(day);
                      const isSat = dayOfWeek === 6;
                      const isSun = dayOfWeek === 0;
                      return (
                        <TableHead
                          key={format(day, "yyyy-MM-dd")}
                          className={`text-center min-w-[40px] px-0.5 ${
                            isSun ? "text-red-400" : isSat ? "text-blue-400" : ""
                          }`}
                        >
                          <div className="text-xs">{format(day, "d")}</div>
                          <div className="text-[10px]">{DAY_LABELS[dayOfWeek]}</div>
                        </TableHead>
                      );
                    })}
                    <TableHead className="text-center min-w-[45px]">日数</TableHead>
                    <TableHead className="text-center min-w-[45px]">時間</TableHead>
                    <TableHead className="text-center min-w-[45px]">残業</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const summary = getRowSummary(row.key);
                    return (
                      <TableRow key={row.key}>
                        <TableCell
                          className={`sticky left-0 bg-card z-10 font-medium text-sm whitespace-nowrap ${
                            row.isGuest ? "text-orange-400" : ""
                          }`}
                        >
                          {row.label}
                        </TableCell>
                        {daysInMonth.map((day) => {
                          const dateStr = format(day, "yyyy-MM-dd");
                          const cell = getCellValue(row.key, dateStr);
                          const hasValue = cell.hoursWorked > 0;
                          const dayOfWeek = getDay(day);
                          const isSat = dayOfWeek === 6;
                          const isSun = dayOfWeek === 0;

                          return (
                            <TableCell
                              key={dateStr}
                              className={`text-center px-0 py-0.5 select-none transition-colors ${
                                isSun ? "bg-red-500/5" : isSat ? "bg-blue-500/5" : ""
                              } ${cell.dirty ? "ring-1 ring-amber-400/50" : ""}`}
                            >
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    className="w-full h-full min-h-[28px] cursor-pointer hover:bg-muted/50 rounded-sm flex items-center justify-center"
                                    onClick={(e) => {
                                      // Quick toggle on single click
                                      if (!hasValue) {
                                        e.preventDefault();
                                        quickToggleCell(row.key, dateStr);
                                      }
                                    }}
                                  >
                                    {hasValue ? (
                                      <div className="flex flex-col items-center">
                                        <span
                                          className={`inline-block text-[9px] font-medium rounded px-0.5 ${
                                            WORK_TYPE_COLORS[cell.workType]
                                          }`}
                                        >
                                          {WORK_TYPE_SHORT[cell.workType]}
                                          {cell.shiftType === "night" ? "夜" : ""}
                                        </span>
                                        {cell.overtimeHours > 0 && (
                                          <span className="text-[8px] text-blue-400">
                                            +{cell.overtimeHours / 10}
                                          </span>
                                        )}
                                      </div>
                                    ) : null}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64" side="bottom" align="center">
                                  <CellEditPopover
                                    cell={cell}
                                    onUpdate={(updates) => updateCell(row.key, dateStr, updates)}
                                    onClear={() => clearCell(row.key, dateStr)}
                                  />
                                </PopoverContent>
                              </Popover>
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
            空セルをクリックで出勤（8h）を設定。出勤セルをクリックで詳細編集（シフト・残業時間・タイプ変更）。
          </p>
          <div className="flex flex-wrap gap-3">
            {(Object.entries(WORK_TYPE_LABELS) as [WorkType, string][]).map(
              ([type, label]) => (
                <span
                  key={type}
                  className={`text-xs font-medium rounded px-2 py-1 ${WORK_TYPE_COLORS[type]}`}
                >
                  {WORK_TYPE_SHORT[type]} = {label}
                </span>
              )
            )}
            <span className="text-xs font-medium rounded px-2 py-1 bg-indigo-500/20 text-indigo-400">
              夜 = 夜勤
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Guest Registration Dialog */}
      <Dialog open={showGuestDialog} onOpenChange={setShowGuestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ゲスト作業員の追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              一時的に現場に参加する作業員を名前だけで登録できます。
            </p>
            <Input
              placeholder="氏名（例: 山田太郎）"
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddGuest();
              }}
            />
            {allGuestNames.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">登録済みゲスト:</p>
                <div className="flex flex-wrap gap-2">
                  {allGuestNames.map((name) => (
                    <span
                      key={name}
                      className="text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGuestDialog(false)}>
              キャンセル
            </Button>
            <Button onClick={handleAddGuest} className="bg-gold text-background hover:bg-gold-dim">
              <UserPlus className="h-4 w-4 mr-1" />
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member to Project Dialog */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作業員を現場に追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              登録済みの従業員をこの現場に配属します。
            </p>
            <Select
              value={selectedMemberId}
              onValueChange={setSelectedMemberId}
            >
              <SelectTrigger>
                <SelectValue placeholder="作業員を選択" />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id.toString()}>
                    {emp.nameKanji || emp.nameRomaji || `ID:${emp.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableEmployees.length === 0 && (
              <p className="text-xs text-muted-foreground">
                すべての従業員が既にこの現場に配属されています。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleAddMember}
              disabled={!selectedMemberId || addMemberMutation.isPending}
              className="bg-gold text-background hover:bg-gold-dim"
            >
              {addMemberMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Users className="h-4 w-4 mr-1" />
              )}
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
