import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

// 孤児マイグレーション（drizzle/*.sql にあるが _journal.json 未登録＝永久に実行されない）
// の再発防止ガード。過去に11本が journal 追記漏れで死にファイル化していた（2026-07 削除済み）。
// 逆方向（journal にあるがファイルが無い）は no-op 化運用と衝突しうるため対象外。
describe("drizzle マイグレーション journal 整合", () => {
  it("全ての drizzle/*.sql が _journal.json に登録されている（追記漏れ＝孤児の検出）", () => {
    const drizzleDir = path.resolve(__dirname, "../drizzle");
    const sqlFiles = fs.readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));
    const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8"));
    const tags = new Set<string>(journal.entries.map((e: any) => e.tag));
    const orphans = sqlFiles.filter((name) => !tags.has(name));
    expect(orphans, `journal 未登録の .sql（このままでは実行されません。_journal.json にエントリを追加するか、不要ならファイルを削除してください）: ${orphans.join(", ")}`).toEqual([]);
  });
});
