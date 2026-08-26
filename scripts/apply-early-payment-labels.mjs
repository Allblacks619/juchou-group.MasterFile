import fs from "node:fs";

const path = "client/src/pages/AppPayments.tsx";
let text = fs.readFileSync(path, "utf8");

const replacements = [
  ["comment intro", " * 前借り台帳を展開して金額の根拠を確認（検算）できる。", " * 早期支払台帳を展開して金額の根拠を確認（検算）できる。"],
  ["type labels", "const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: \"会社からの前借り\", repayment: \"会社への返済/支払相殺\", adjustment: \"調整\" };", "const ADVANCE_TYPE_LABELS: Record<string, string> = { advance: \"外注費の早期支払\", repayment: \"支払時の精算\", adjustment: \"調整\" };"],
  ["balance header", ">会社への返済残高</th>", ">早期支払精算残高</th>"],
  ["drilldown comment", "/** 検算ドリルダウン: 現場別内訳＋前借り台帳（残高・履歴・相殺・追加）。 */", "/** 検算ドリルダウン: 現場別内訳＋早期支払台帳（残高・履歴・精算・追加）。 */"],
  ["offset toast", "toast.success(`前借りを ${yen(r.applied)} 相殺しました（残高 ${yen(r.balance)}）`)", "toast.success(`早期支払分を ${yen(r.applied)} 精算しました（残高 ${yen(r.balance)}）`)"],
  ["section comment", "{/* 前借り／相殺 */}", "{/* 早期支払／精算 */}"],
  ["balance detail", "            会社への返済残高 <span", "            早期支払精算残高 <span"],
  ["offset label", ">相殺額</span>", ">精算額</span>"],
  ["offset validation", "toast.error(\"相殺額を入力してください\")", "toast.error(\"精算額を入力してください\")"],
  ["offset button", ">相殺（最大 {yen(worker.maxOffset)}）", ">精算（最大 {yen(worker.maxOffset)}）"],
  ["delete comment", "// 前借り台帳は金銭記録。誤タップで消えると残高が狂うため、内容を出して確認する。", "// 早期支払台帳は金銭記録。誤タップで消えると残高が狂うため、内容を出して確認する。"],
  ["delete confirm", "この前借り記録（${label}）を消します。元に戻せません。よろしいですか？", "この早期支払記録（${label}）を消します。元に戻せません。よろしいですか？"],
  ["success add", "toast.success(\"前借り台帳に追加しました\")", "toast.success(\"早期支払台帳に追加しました\")"],
  ["trigger", ">作業員の前借りを記録", ">早期支払を記録"],
  ["dialog title", "<DialogHeader><DialogTitle>会社から作業員への前借り／調整</DialogTitle></DialogHeader>", "<DialogHeader><DialogTitle>外注費の早期支払／調整</DialogTitle></DialogHeader>"],
  ["select item", "<SelectItem value=\"advance\">前借り（残高が増える）</SelectItem>", "<SelectItem value=\"advance\">早期支払（精算残高が増える）</SelectItem>"],
  ["principal label", "\"会社が作業員へ渡す元金（円）\"", "\"先に支払う外注費（円）\""],
  ["fee label", ">手数料（1%刻み・既定10%）</Label>", ">早期支払手数料（1%刻み・既定10%）</Label>"],
  ["calculation label", "控除対象:", "精算対象:"],
  ["reason placeholder", "placeholder=\"用途・理由\"", "placeholder=\"早期支払の理由・メモ\""],
];

for (const [name, from, to] of replacements) {
  if (!text.includes(from)) throw new Error(`pattern not found: ${name}`);
  text = text.replace(from, to);
}

fs.writeFileSync(path, text);
console.log("early-payment labels applied");
