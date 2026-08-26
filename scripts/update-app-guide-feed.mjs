import fs from "node:fs";
import { execFileSync } from "node:child_process";

const target = "client/src/generated/appUpdates.ts";
const subject = execFileSync("git", ["log", "-1", "--pretty=%s"], { encoding: "utf8" }).trim();
const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
const date = execFileSync("git", ["log", "-1", "--date=format:%Y-%m-%d", "--pretty=%ad"], { encoding: "utf8" }).trim();

if (/\[guide-feed\]/i.test(subject) || /onboarding|guide|ガイド/i.test(subject)) process.exit(0);

let changed = [];
try {
  changed = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], { encoding: "utf8" })
    .split("\n").map((v) => v.trim()).filter(Boolean);
} catch {
  process.exit(0);
}

const userFacing = changed.filter((p) =>
  !/\.(test|spec)\.[^.]+$/.test(p) &&
  !p.startsWith("docs/") &&
  !p.endsWith(".md") &&
  (p.startsWith("client/src/pages/") || p.startsWith("client/src/components/") || p.startsWith("server/") || p.startsWith("shared/") || p.startsWith("drizzle/"))
);
if (userFacing.length === 0) process.exit(0);

const catalog = [
  { re: /AppPayments|workerAdvance|payment/i, ja: "支払管理", pt: "Pagamentos", audience: "manager" },
  { re: /MonthlyClose|closing/i, ja: "月締め", pt: "Fechamento mensal", audience: "all" },
  { re: /Invoice|invoice/i, ja: "請求", pt: "Faturamento", audience: "manager" },
  { re: /Receivable|receivable/i, ja: "入金管理", pt: "Recebimentos", audience: "manager" },
  { re: /Genba|genba/i, ja: "GENBA・現場", pt: "GENBA / Obras", audience: "all" },
  { re: /Connect|connect/i, ja: "会社間連携", pt: "Integração entre empresas", audience: "manager" },
  { re: /Invitation|Employee|employees/i, ja: "招待・作業員", pt: "Convites / Equipe", audience: "manager" },
  { re: /Attendance|WorkReport|attendance|workReport/i, ja: "出面・作業日報", pt: "Presença / Relatórios", audience: "all" },
  { re: /MyProfile|MyClosing/i, ja: "作業員向け機能", pt: "Área do trabalhador", audience: "worker" },
  { re: /AppLayout|client\/src\/App\.tsx/i, ja: "画面・ナビゲーション", pt: "Telas / Navegação", audience: "all" },
];

const hits = catalog.filter((entry) => userFacing.some((path) => entry.re.test(path)));
const uniqueJa = [...new Set((hits.length ? hits : [{ ja: "アプリ機能" }]).map((v) => v.ja))].slice(0, 3);
const uniquePt = [...new Set((hits.length ? hits : [{ pt: "Funções do aplicativo" }]).map((v) => v.pt))].slice(0, 3);
const audiences = new Set(hits.map((v) => v.audience));
const audience = audiences.size === 1 ? [...audiences][0] : "all";
const cleanedSubject = subject.replace(/^Merge pull request[^:]*:?\s*/i, "").slice(0, 180);

const item = `  {\n    id: ${JSON.stringify(sha)},\n    date: ${JSON.stringify(date)},\n    audience: ${JSON.stringify(audience)},\n    titleJa: ${JSON.stringify(`${uniqueJa.join("・")}を更新しました`)},\n    titlePt: ${JSON.stringify(`Atualização: ${uniquePt.join(" / ")}`)},\n    detailJa: ${JSON.stringify(cleanedSubject || "機能・仕様・操作フローを更新しました。")},\n    detailPt: ${JSON.stringify("Funções, especificações ou fluxo de uso desta área foram atualizados.")},\n    areas: ${JSON.stringify(uniqueJa)},\n  },\n`;

let source = fs.readFileSync(target, "utf8");
if (source.includes(`id: ${JSON.stringify(sha)}`)) process.exit(0);
source = source.replace("export const APP_UPDATES: AppUpdate[] = [\n", `export const APP_UPDATES: AppUpdate[] = [\n${item}`);

// 最大12件。単純なオブジェクト境界で古い項目を削る（生成フォーマットは固定）。
const start = source.indexOf("export const APP_UPDATES: AppUpdate[] = [");
const prefixEnd = source.indexOf("[\n", start) + 2;
const end = source.lastIndexOf("\n];");
const prefix = source.slice(0, prefixEnd);
const body = source.slice(prefixEnd, end);
const blocks = body.match(/  \{[\s\S]*?\n  \},\n/g) || [];
fs.writeFileSync(target, prefix + blocks.slice(0, 12).join("") + "\n];\n");
