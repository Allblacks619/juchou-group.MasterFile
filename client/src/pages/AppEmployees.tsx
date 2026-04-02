import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, User, ChevronRight, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function RosterListPdfButton() {
  const generatePdf = trpc.pdf.rosterList.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("名簿一覧PDFを生成しました");
    },
    onError: (e) => toast.error(`PDF生成エラー: ${e.message}`),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={generatePdf.isPending}
      onClick={() => generatePdf.mutate({ employeeIds: [] })}
      className="gap-1.5"
    >
      {generatePdf.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      名簿一覧PDF
    </Button>
  );
}

export default function AppEmployees() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const employeesQuery = trpc.employee.list.useQuery();

  const filtered = (employeesQuery.data || []).filter((emp) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      emp.nameKanji?.toLowerCase().includes(s) ||
      emp.nameKana?.toLowerCase().includes(s) ||
      emp.nameRomaji?.toLowerCase().includes(s) ||
      emp.phone?.includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">従業員管理</h1>
          <p className="text-muted-foreground mt-1">
            従業員のプロフィール情報を管理します
          </p>
        </div>
        <div className="flex gap-2">
          <RosterListPdfButton />
          <Button
            className="bg-gold text-background hover:bg-gold-dim"
            onClick={() => setLocation("/app/employees/new")}
          >
            <Plus className="h-4 w-4 mr-2" />
            新規登録
          </Button>
        </div>
      </div>

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
            <Badge variant="secondary">
              {filtered.length}名
            </Badge>
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
                  <TableHead>氏名</TableHead>
                  <TableHead>フリガナ</TableHead>
                  <TableHead>国籍</TableHead>
                  <TableHead>電話番号</TableHead>
                  <TableHead>雇用形態</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setLocation(`/app/employees/${emp.id}`)}
                  >
                    <TableCell className="font-medium">{emp.nameKanji}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.nameKana || "-"}</TableCell>
                    <TableCell>{emp.nationality || "日本"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.phone || "-"}</TableCell>
                    <TableCell>
                      {emp.employmentType === "sole_proprietor" && (
                        <Badge variant="outline">個人事業主</Badge>
                      )}
                      {emp.employmentType === "employee" && (
                        <Badge variant="outline">従業員</Badge>
                      )}
                      {emp.employmentType === "other" && (
                        <Badge variant="outline">その他</Badge>
                      )}
                      {!emp.employmentType && "-"}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
