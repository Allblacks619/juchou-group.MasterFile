import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  User,
  ChevronRight,
  FileDown,
  Loader2,
  CheckSquare,
  List,
  FileText,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function AppEmployees() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [bulkRole, setBulkRole] = useState<"admin" | "manager" | "worker" | "guest">("worker");
  const [confirmDeleteText, setConfirmDeleteText] = useState("");
  const [pdfType, setPdfType] = useState<"list" | "individual">("list");
  const [projectName, setProjectName] = useState("");

  const employeesQuery = trpc.employee.list.useQuery();
  const meQuery = trpc.auth.me.useQuery();
  const isSuperAdmin = (meQuery.data as any)?.appRole === "super_admin";

  const filtered = useMemo(() => {
    return (employeesQuery.data || []).filter((emp) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        emp.nameKanji?.toLowerCase().includes(s) ||
        emp.nameKana?.toLowerCase().includes(s) ||
        emp.nameRomaji?.toLowerCase().includes(s) ||
        emp.phone?.includes(s)
      );
    });
  }, [employeesQuery.data, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      const newSet = new Set(selectedIds);
      filtered.forEach((e) => newSet.delete(e.id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      filtered.forEach((e) => newSet.add(e.id));
      setSelectedIds(newSet);
    }
  };

  const toggleOne = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // PDF mutations
  const generateRosterList = trpc.pdf.rosterList.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("名簿一覧PDF（リスト型）を生成しました");
      setShowPdfDialog(false);
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const generateRosterMulti = trpc.pdf.rosterMulti.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("名簿PDF（個別型）を生成しました");
      setShowPdfDialog(false);
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  const handleOpenPdfDialog = (type: "list" | "individual") => {
    setPdfType(type);
    setProjectName("");
    setShowPdfDialog(true);
  };

  const handleGeneratePdf = () => {
    const ids = Array.from(selectedIds);
    if (pdfType === "list") {
      generateRosterList.mutate({ employeeIds: ids, projectName: projectName || undefined });
    } else {
      if (ids.length === 0) {
        toast.error("作業員を1人以上選択してください");
        return;
      }
      generateRosterMulti.mutate({ employeeIds: ids, projectName: projectName || undefined });
    }
  };

  const isPending = generateRosterList.isPending || generateRosterMulti.isPending;

  const bulkRoleMutation = trpc.superAdmin.bulkChangeRoles.useMutation({
    onSuccess: () => toast.success("ロールを一括変更しました"),
    onError: (e) => toast.error(`一括変更エラー: ${e.message}`),
  });
  const bulkDeleteMutation = trpc.superAdmin.bulkDeleteEmployees.useMutation({
    onSuccess: () => {
      toast.success("従業員を一括削除しました");
      setConfirmDeleteText("");
      employeesQuery.refetch();
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error(`一括削除エラー: ${e.message}`),
  });

  const handleBulkRoleChange = () => {
    if (!isSuperAdmin) return;
    const selectedEmployees = (employeesQuery.data || []).filter((e) => selectedIds.has(e.id));
    const userIds = selectedEmployees.map((e) => e.userId).filter((id): id is number => typeof id === "number");
    if (!userIds.length) return toast.error("ユーザー連携済み従業員を選択してください");
    bulkRoleMutation.mutate({ userIds, appRole: bulkRole });
  };

  const handleBulkDelete = () => {
    if (!isSuperAdmin) return;
    const ids = Array.from(selectedIds);
    if (!ids.length) return toast.error("対象を選択してください");
    bulkDeleteMutation.mutate({ employeeIds: ids, confirmText: confirmDeleteText });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">従業員管理</h1>
          <p className="text-muted-foreground mt-1">
            従業員のプロフィール情報を管理します
          </p>
          <p className="text-xs text-muted-foreground mt-1">あなたの権限: {(meQuery.data as any)?.appRole || "worker"}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isSuperAdmin && (
            <>
              <Select value={bulkRole} onValueChange={(v: any) => setBulkRole(v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="ロール選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="manager">manager</SelectItem>
                  <SelectItem value="worker">worker</SelectItem>
                  <SelectItem value="guest">guest</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleBulkRoleChange} disabled={selectedIds.size === 0 || bulkRoleMutation.isPending}>
                ロール一括変更
              </Button>
              <Input
                value={confirmDeleteText}
                onChange={(e) => setConfirmDeleteText(e.target.value)}
                placeholder='DELETE'
                className="w-[110px]"
              />
              <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}>
                一括削除
              </Button>
            </>
          )}
          {/* PDF dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <FileDown className="h-4 w-4" />
                名簿PDF
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleOpenPdfDialog("list")}>
                <List className="h-4 w-4 mr-2" />
                リスト型（一覧表）
                <span className="text-xs text-muted-foreground ml-2">
                  {selectedIds.size > 0 ? `${selectedIds.size}名選択中` : "全員"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleOpenPdfDialog("individual")}
                disabled={selectedIds.size === 0}
              >
                <FileText className="h-4 w-4 mr-2" />
                個別型（詳細名簿）
                <span className="text-xs text-muted-foreground ml-2">
                  {selectedIds.size > 0 ? `${selectedIds.size}名選択中` : "選択してください"}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            className="bg-gold text-background hover:bg-gold-dim"
            onClick={() => setLocation("/app/employees/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            新規登録
          </Button>
        </div>
      </div>

      {/* Selection info bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-gold/10 border border-gold/20 rounded-md px-4 py-2">
          <CheckSquare className="h-4 w-4 text-gold" />
          <span className="text-sm font-medium">{selectedIds.size}名選択中</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setSelectedIds(new Set())}
          >
            選択解除
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="名前、フリガナ、電話番号で検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="secondary">{filtered.length}名</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {employeesQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">読み込み中...</p>
          ) : !filtered.length ? (
            <div className="text-center py-12">
              <User className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">
                {search ? "検索結果がありません" : "従業員がまだ登録されていません"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>氏名</TableHead>
                  <TableHead>フリガナ</TableHead>
                  <TableHead>国籍</TableHead>
                  <TableHead>電話番号</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer hover:bg-muted/50"
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(emp.id)}
                        onCheckedChange={() => toggleOne(emp.id)}
                      />
                    </TableCell>
                    <TableCell
                      className="font-medium"
                      onClick={() => setLocation(`/app/employees/${emp.id}`)}
                    >
                      {emp.nameKanji}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      onClick={() => setLocation(`/app/employees/${emp.id}`)}
                    >
                      {emp.nameKana || "-"}
                    </TableCell>
                    <TableCell onClick={() => setLocation(`/app/employees/${emp.id}`)}>
                      {emp.nationality || "日本"}
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      onClick={() => setLocation(`/app/employees/${emp.id}`)}
                    >
                      {emp.phone || "-"}
                    </TableCell>
                    <TableCell onClick={() => setLocation(`/app/employees/${emp.id}`)}>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* PDF Generation Dialog */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pdfType === "list" ? "名簿一覧PDF（リスト型）" : "名簿PDF（個別型）"}
            </DialogTitle>
            <DialogDescription>
              {pdfType === "list"
                ? selectedIds.size > 0
                  ? `選択された${selectedIds.size}名の作業員をリスト形式で出力します`
                  : "全作業員をリスト形式で出力します"
                : `選択された${selectedIds.size}名の作業員を個別の名簿形式で出力します（1人1ページ）`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">現場名（任意）</label>
              <Input
                placeholder="現場名を入力..."
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                PDFのヘッダーに現場名を表示します
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPdfDialog(false)}>
              キャンセル
            </Button>
            <Button
              className="bg-gold text-background hover:bg-gold-dim"
              onClick={handleGeneratePdf}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              PDF生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
