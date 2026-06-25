#!/usr/bin/env node
// Git 管理下のファイルから未解決のマージ競合マーカーを検出する。
// 1つでも見つかれば exit code 1 で失敗する（CI / pnpm から呼び出し可能）。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// 行頭の競合マーカー。`=======` は Markdown の見出し区切り(---)等と紛れないよう
// 7文字以上の連続 `=` のみを対象にする。
const MARKERS = [/^<{7}( |$)/, /^={7}$/, /^>{7}( |$)/];

// バイナリ等を避けるため、テキストとして扱う拡張子のみ検査する。
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|scss|html|yml|yaml|sql|sh|txt|env)$/i;

let files = [];
try {
  files = execSync("git ls-files", { encoding: "utf8" })
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => TEXT_EXT.test(f));
} catch {
  console.error("git ls-files に失敗しました。Git リポジトリ内で実行してください。");
  process.exit(2);
}

const hits = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (MARKERS.some((re) => re.test(line))) {
      hits.push({ file, line: i + 1, text: line });
    }
  });
}

if (hits.length > 0) {
  console.error(`\n❌ マージ競合マーカーが ${hits.length} 件見つかりました:\n`);
  for (const h of hits) {
    console.error(`  ${h.file}:${h.line}  ${h.text}`);
  }
  console.error("\n解決してから再実行してください。");
  process.exit(1);
}

console.log("✅ マージ競合マーカーは見つかりませんでした。");
