/**
 * AppWorkerInvoiceV2 — 作業員請求書（月締めV2）プレビュー（管理者確認用）
 *
 * 作業員 × 対象月 を選ぶと、月締めV2のデータから組み立てた
 *  - 作業員請求書（労務費＝出勤日数×単価／交通費＝日割り／経費）
 *  - 日報（出面表そのままの形：日付・曜日・現場・残業・交通費）
 * を読み取り専用で表示します（DB保存はしません）。admin/manager のみ。
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const yen = (n: number) => "¥" + Math.round(n || 0).toLocaleString("ja-JP");
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
const CAT_LABEL: Record<string, string> = { labor: "労務費", transport: "交通費", expense: "経費" };

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AppWorkerInvoiceV2() {
  const [targetMonth, setTargetMonth] = useState(currentMonth());
  const [workerId, setWorkerId] = useState<number | null>(null);

  const employeesQuery = trpc.employee.list.useQuery();
  const monthValid = /^\d{4}-\d{2}$/.test(targetMonth);
  const draftQuery = trpc.workerInvoice.getV2Draft.useQuery(
    { workerId: workerId ?? 0, targetMonth },
    { enabled: !!workerId && monthValid, retry: false }
  );
  const draft = draftQuery.data;

  const reportRows = useMemo(() => {
    const rows: { day: number; dow: string; recs: any[] }[] = [];
    if (!draft) return rows;
    const byDate = new Map<string, any[]>();
    for (const d of draft.attendanceBreakdown) {
      const arr = byDate.get(d.workDate) ?? [];
      arr.push(d);
      byDate.set(d.workDate, arr);
    }
    const [y, m] = targetMonth.split("-").map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let i = 1; i <= days; i++) {
      const ds = `${targetMonth}-${String(i).padStart(2, "0")}`;
      rows.push({ day: i, dow: DOW[new Date(ds + "T00:00:00Z").getUTCDay()], recs: byDate.get(ds) ?? [] });
    }
    return rows;
  }, [draft, targetMonth]);

  const summary = useMemo(() => {
    let dayDays = 0, nightDays = 0, otTotal = 0, transportTotal = 0;
    for (const d of draft?.attendanceBreakdown ?? []) {
      if (d.shiftType === "night") nightDays += d.days; else dayDays += d.days;
      otTotal += d.overtimeHours;
      transportTotal += d.transport;
    }
    return { dayDays, nightDays, otTotal, transportTotal };
  }, [draft]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">作業員請求書（月締めV2）プレビュー</h1>
        <p className="text-sm text-muted-foreground">
          月締め提出済みの作業員について、請求書と日報を確認できます（読み取り専用・DB保存なし）。
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="targetMonth">対象月</Label>
            <Input id="targetMonth" type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label>作業員</Label>
            <Select value={workerId ? String(workerId) : ""} onValueChange={(v) => setWorkerId(Number(v))}>
              <SelectTrigger className="w-64"><SelectValue placeholder="作業員を選択" /></SelectTrigger>
              <SelectContent>
                {(employeesQuery.data ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.nameKanji || e.nameRomaji || `ID:${e.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!workerId && (
        <p className="text-muted-foreground">作業員を選択してください。</p>
      )}

      {workerId && draftQuery.isLoading && (
        <p className="text-muted-foreground">読み込み中...</p>
      )}

      {workerId && draftQuery.error && (
        <Alert variant="destructive">
          <AlertTitle>生成できません</AlertTitle>
          <AlertDescription>{draftQuery.error.message}</AlertDescription>
        </Alert>
      )}

      {draft && (
        <>
          {draft.warnings.length > 0 && (
            <Alert>
              <AlertTitle>確認が必要な項目</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5">
                  {draft.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>作業員請求書 — {draft.workerName}（{draft.targetMonth}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>区分</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead>単位</TableHead>
                    <TableHead className="text-right">単価</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="text-right">税率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.items.map((it, idx) => (
                    <TableRow key={idx}>
                      <TableCell><Badge variant="outline">{CAT_LABEL[it.category] ?? it.category}</Badge></TableCell>
                      <TableCell>{it.label}</TableCell>
                      <TableCell className="text-right">{it.quantity}</TableCell>
                      <TableCell>{it.unit}</TableCell>
                      <TableCell className="text-right">{yen(it.unitPrice)}</TableCell>
                      <TableCell className="text-right">{yen(it.amount)}</TableCell>
                      <TableCell className="text-right">{it.taxRate}%</TableCell>
                    </TableRow>
                  ))}
                  {draft.items.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-muted-foreground">明細がありません。</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>

              <Separator />
              <div className="ml-auto w-full max-w-sm space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">労務費計</span><span>{yen(draft.laborAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">交通費計</span><span>{yen(draft.transportAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">経費計</span><span>{yen(draft.expenseAmount)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">小計</span><span>{yen(draft.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">消費税</span><span>{yen(draft.taxAmount)}</span></div>
                <div className="flex justify-between text-base font-semibold"><span>合計</span><span>{yen(draft.totalAmount)}</span></div>
              </div>

              {draft.excludedExpenseLines.length > 0 && (
                <div className="rounded-md border border-dashed p-3 text-sm">
                  <p className="mb-1 font-medium text-muted-foreground">請求対象外（会社/取引先負担として記録のみ）</p>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {draft.excludedExpenseLines.map((ex, i) => (
                      <li key={i}>{ex.expenseType} {yen(ex.amount)}（支払: {ex.paymentMethod}）</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>日報（作業報告） — {draft.workerName}（{draft.targetMonth}）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">日付</TableHead>
                    <TableHead className="w-12">曜日</TableHead>
                    <TableHead>現場名</TableHead>
                    <TableHead className="text-right">残業</TableHead>
                    <TableHead className="text-right">交通費</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportRows.map((r) =>
                    r.recs.length === 0 ? (
                      <TableRow key={r.day} className="text-muted-foreground">
                        <TableCell>{r.day}日</TableCell>
                        <TableCell>{r.dow}</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    ) : (
                      r.recs.map((rec, i) => (
                        <TableRow key={`${r.day}-${i}`} className={rec.shiftType === "night" ? "bg-purple-500/10" : ""}>
                          <TableCell>{r.day}日</TableCell>
                          <TableCell>{r.dow}</TableCell>
                          <TableCell>
                            {rec.shiftType === "night" && <Badge className="mr-1">夜</Badge>}
                            {rec.projectName ?? `現場${rec.projectId}`}
                          </TableCell>
                          <TableCell className="text-right">{rec.overtimeHours ? `${rec.overtimeHours}h` : "—"}</TableCell>
                          <TableCell className="text-right">{rec.transport ? yen(rec.transport) : "—"}</TableCell>
                        </TableRow>
                      ))
                    )
                  )}
                </TableBody>
              </Table>
              <Separator />
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>昼勤出勤日数 <span className="font-medium text-foreground">{summary.dayDays}日</span></span>
                <span>夜勤出勤日数 <span className="font-medium text-foreground">{summary.nightDays}日</span></span>
                <span>残業時間 <span className="font-medium text-foreground">{summary.otTotal}h</span></span>
                <span>交通費合計 <span className="font-medium text-foreground">{yen(summary.transportTotal)}</span></span>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
