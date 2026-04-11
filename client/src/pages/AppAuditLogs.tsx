import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSearch, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AppAuditLogs() {
  const [month, setMonth] = useState(defaultMonth());
  const [entityType, setEntityType] = useState("all");
  const [actionFilter, setActionFilter] = useState("");
  const query = trpc.audit.list.useQuery({ month, entityType: entityType === "all" ? undefined : entityType, action: actionFilter || undefined });

  const rows = query.data?.rows || [];
  const summary = query.data?.summary || { total: 0, byEntity: {} };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">監査ログ</h1>
        <p className="text-muted-foreground mt-1">誰がいつ何を変更したかを確認します</p>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>対象月</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>種別</Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                <SelectItem value="closing">締め</SelectItem>
                <SelectItem value="submission">提出</SelectItem>
                <SelectItem value="payment">支払</SelectItem>
                <SelectItem value="receivable">入金</SelectItem>
                <SelectItem value="invoice">請求書</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>アクション検索</Label>
            <Input placeholder="例: markPaid" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">総件数</div><div className="text-2xl font-bold">{summary.total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">締め系</div><div className="text-2xl font-bold text-gold">{Number(summary.byEntity?.closing || 0) + Number(summary.byEntity?.submission || 0)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">請求/入金/支払</div><div className="text-2xl font-bold text-emerald-400">{Number(summary.byEntity?.invoice || 0) + Number(summary.byEntity?.receivable || 0) + Number(summary.byEntity?.payment || 0)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-gold" />監査履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">読み込み中...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <FileSearch className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>該当する監査ログがありません</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">日時</TableHead>
                    <TableHead className="w-32">ユーザー</TableHead>
                    <TableHead className="w-32">種別</TableHead>
                    <TableHead className="w-48">アクション</TableHead>
                    <TableHead>内容</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-xs">{row.performedAt ? format(new Date(row.performedAt), "yyyy-MM-dd HH:mm") : "-"}</TableCell>
                      <TableCell>{row.user?.name || row.user?.loginId || row.performedBy || "-"}</TableCell>
                      <TableCell className="capitalize">{row.entityType}</TableCell>
                      <TableCell className="font-mono text-xs">{row.action}</TableCell>
                      <TableCell>
                        <div className="text-sm">{row.note || "-"}</div>
                        {(row.projectName || row.invoiceNumber || row.employeeName) && (
                          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                            {row.projectName && <span>案件: {row.projectName}</span>}
                            {row.invoiceNumber && <span>請求書: {row.invoiceNumber}</span>}
                            {row.employeeName && <span>作業員: {row.employeeName}</span>}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
