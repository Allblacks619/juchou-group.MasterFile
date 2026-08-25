import fs from "node:fs";

function patchFile(path, transforms) {
  let text = fs.readFileSync(path, "utf8");
  for (const [label, from, to] of transforms) {
    if (!text.includes(from)) throw new Error(`${path}: pattern not found: ${label}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patchFile("server/routers.ts", [
  [
    "advance helper import",
    'import { computeAdvanceBalance, computeAppliedOffset, computeMaxOffset, signedDelta } from "./workerAdvance";',
    'import { computeAdvanceBalance, computeAdvanceCharge, computeAppliedOffset, computeMaxOffset, signedDelta } from "./workerAdvance";',
  ],
  [
    "advance fee input",
    '        amount: z.number().int().positive(),\n        increase: z.boolean().optional().default(true),',
    '        amount: z.number().int().positive(),\n        feePercent: z.number().int().min(0).max(100).optional().default(10),\n        increase: z.boolean().optional().default(true),',
  ],
  [
    "advance fee calculation",
    '      .mutation(async ({ ctx, input }) => {\n        const delta = signedDelta(input.entryType, input.amount, input.increase);\n        const created = await db.createWorkerAdvance({',
    '      .mutation(async ({ ctx, input }) => {\n        // 前借りは「会社 → 作業員」の先払い。元金＋手数料を作業員の会社への返済残高として記録する。\n        const charge = input.entryType === "advance" ? computeAdvanceCharge(input.amount, input.feePercent) : null;\n        const effectiveAmount = charge ? charge.total : input.amount;\n        const delta = signedDelta(input.entryType, effectiveAmount, input.increase);\n        const reasonText = input.reason.trim();\n        const storedReason = charge\n          ? `元金 ${charge.principal}円 / 手数料 ${charge.feePercent}% (${charge.feeAmount}円) / 控除対象 ${charge.total}円${reasonText ? ` / ${reasonText}` : ""}`\n          : (reasonText || null);\n        const created = await db.createWorkerAdvance({',
  ],
  [
    "advance stored reason",
    '          reason: input.reason.trim() || null,',
    '          reason: storedReason,',
  ],
]);

patchFile("client/src/pages/AppPayments.tsx", [
  [
    "payment month helper import",
    'import { format } from "date-fns";\nimport { trpc } from "@/lib/trpc";',
    'import { format } from "date-fns";\nimport { paymentMonthToClosingMonth } from "@shared/paymentMonth";\nimport { trpc } from "@/lib/trpc";',
  ],
  [
    "advance wording",
    'const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: "前借り", repayment: "返済/相殺", adjustment: "調整" };',
    'const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: "会社からの前借り", repayment: "会社への返済/支払相殺", adjustment: "調整" };\nconst DEFAULT_ADVANCE_FEE_PERCENT = 10;',
  ],
  [
    "payment month state",
    '  const [closingMonth, setClosingMonth] = useState(format(new Date(), "yyyy-MM"));\n  const [query, setQuery] = useState("");',
    '  const [paymentMonth, setPaymentMonth] = useState(format(new Date(), "yyyy-MM"));\n  // 支払は2か月前に締めた出面を根拠にする（例: 10月支払 = 8月締め）。\n  const closingMonth = paymentMonthToClosingMonth(paymentMonth);\n  const [query, setQuery] = useState("");',
  ],
  [
    "payment header explanation",
    '            年月を選ぶと対象作業員が一覧表示されます。行をタップで内訳（検算）を確認できます。',
    '            支払月を選ぶと、2か月前に締めた出面から外注費を算出します。例：10月支払＝8月締め。行をタップで内訳（検算）を確認できます。',
  ],
  [
    "payment month input",
    '            <Label className="text-xs text-muted-foreground">対象月</Label>\n            <Input type="month" value={closingMonth} onChange={(e) => { setClosingMonth(e.target.value); setExpanded(null); }} className="w-[160px]" />',
    '            <Label className="text-xs text-muted-foreground">支払月</Label>\n            <Input type="month" value={paymentMonth} onChange={(e) => { setPaymentMonth(e.target.value); setExpanded(null); }} className="w-[160px]" />\n            <div className="text-[10px] text-muted-foreground mt-0.5">{monthLabel(closingMonth)}締め出面</div>',
  ],
  [
    "empty payment wording",
    '{workers.length === 0 ? `${monthLabel(closingMonth)} の支払対象がありません（月締めを進めると作成されます）` : "該当する作業員がいません"}',
    '{workers.length === 0 ? `${monthLabel(paymentMonth)} 支払の対象がありません（参照: ${monthLabel(closingMonth)}締め出面）` : "該当する作業員がいません"}',
  ],
  [
    "advance balance table label",
    '<th className="text-right font-medium px-2 py-2.5">前借り残高</th>',
    '<th className="text-right font-medium px-2 py-2.5">会社への返済残高</th>',
  ],
  [
    "advance balance detail label",
    '            前借り残高 <span className={`font-bold ${worker.advanceBalance > 0 ? "text-amber-400" : ""}`}>{yen(worker.advanceBalance)}</span>',
    '            会社への返済残高 <span className={`font-bold ${worker.advanceBalance > 0 ? "text-amber-400" : ""}`}>{yen(worker.advanceBalance)}</span>',
  ],
  [
    "fee state",
    '  const [reason, setReason] = useState("");\n  const [entryType, setEntryType] = useState<"advance" | "adjustment">("advance");',
    '  const [reason, setReason] = useState("");\n  const [feePercent, setFeePercent] = useState(DEFAULT_ADVANCE_FEE_PERCENT);\n  const [entryType, setEntryType] = useState<"advance" | "adjustment">("advance");',
  ],
  [
    "dialog trigger wording",
    '<Plus className="h-3.5 w-3.5" />前借り追加',
    '<Plus className="h-3.5 w-3.5" />作業員の前借りを記録',
  ],
  [
    "dialog title wording",
    '<DialogHeader><DialogTitle>前借り／調整の追加</DialogTitle></DialogHeader>',
    '<DialogHeader><DialogTitle>会社から作業員への前借り／調整</DialogTitle></DialogHeader>',
  ],
  [
    "principal label",
    '<Label className="text-xs">金額（円）</Label>\n              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />',
    '<Label className="text-xs">{entryType === "advance" ? "会社が作業員へ渡す元金（円）" : "調整額（円）"}</Label>\n              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10000" />',
  ],
  [
    "fee control",
    '            <div className="space-y-1">\n              <Label className="text-xs">理由（任意）</Label>',
    '            {entryType === "advance" && (\n              <div className="space-y-1">\n                <Label className="text-xs">手数料（1%刻み・既定10%）</Label>\n                <div className="flex items-center gap-2">\n                  <Input type="number" min={0} max={100} step={1} value={feePercent} onChange={(e) => setFeePercent(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))} />\n                  <span className="text-sm text-muted-foreground">%</span>\n                </div>\n                {Number(amount) > 0 && (\n                  <div className="text-xs text-muted-foreground">控除対象: {yen(Math.round(Number(amount) * (1 + feePercent / 100)))}（元金 {yen(Number(amount))} + 手数料 {yen(Math.round(Number(amount) * feePercent / 100))}）</div>\n                )}\n              </div>\n            )}\n            <div className="space-y-1">\n              <Label className="text-xs">理由（任意）</Label>',
  ],
  [
    "reason placeholder",
    'placeholder="前借り・立替の理由"',
    'placeholder="用途・理由"',
  ],
  [
    "mutation fee",
    '              addMutation.mutate({ employeeId, entryType, amount: n, reason });',
    '              addMutation.mutate({ employeeId, entryType, amount: n, feePercent: entryType === "advance" ? feePercent : 0, reason });',
  ],
]);

console.log("payment/advance fix applied");
