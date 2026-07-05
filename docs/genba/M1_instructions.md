# 現場ビジョン M1 実装指示書(Claude Code 用)

**対象リポジトリ:** Allblacks619/juchou-group.MasterFile
**フェーズ:** M1 — 基盤(スキーマ + genbaRouter骨組み + 画面の入口)
**基準文書:** 現場ビジョン_移行設計書 v1.1 / プロトタイプ GenbaAppV18.jsx
**作業原則:** 既存のテーブル・ルーター・認証・テストには一切変更を加えない(加算のみ)。既存のコード規約(単一 `server/routers.ts` へのマージ、`drizzle/schema.ts` の型export慣習、vitest テストスタイル)に従う。

---

## 0. 事前確認(必ず最初に実行)

1. `git pull` 後、`pnpm i && pnpm test` が全件グリーンであることを確認(現状 224 tests)。
2. **リポジトリが private であることを確認。** public の場合は作業を止め、ユーザーに private 化を促す(GitHub Settings → Danger Zone → Change visibility)。
3. `drizzle/schema.ts` に以下が存在することを確認(M1 はこれらを参照する):
   - `users.appRole`: enum `["super_admin","admin","manager","leader","worker","guest"]`
   - `projects` (startDate / endDate / status)
   - `attendance` (projectId / workDate / hoursWorked ※int×10, 80=8.0h)
   - `projectMembers`, `employees`, `auditLogs`
4. `server/_core/trpc.ts` の `publicProcedure` / `protectedProcedure` / `adminProcedure` / `superAdminProcedure` の実装を読み、ctx.user の形を把握する。
5. DB は開発用MariaDBに対して `node scripts/migrate.mjs` が通る状態であること。

---

## 1. ロールマッピング(新規ファイル `shared/genba/roles.ts`)

現場ビジョンの3段階権限は **既存 `users.appRole` から導出**する。新しい権限カラムは作らない。

```ts
// shared/genba/roles.ts
export type GenbaRole = "admin" | "leader" | "worker";

/** 既存 appRole → 現場ビジョン権限のマッピング */
export function genbaRoleOf(appRole: string): GenbaRole {
  switch (appRole) {
    case "super_admin":
    case "admin":
      return "admin";        // 全機能(予算トラッカー含む)
    case "manager":
    case "leader":
      return "leader";       // 予算・システム設定以外
    default:
      return "worker";       // worker / guest: 現場入力のみ
  }
}
```

テスト `server/genba.roles.test.ts` を追加: 6つの appRole 全てのマッピングを検証。

---

## 2. スキーマ(新規ファイル `drizzle/schema.genba.ts`)

`drizzle.config.ts` の `schema` を配列に変更: `["./drizzle/schema.ts", "./drizzle/schema.genba.ts"]`。既存 schema.ts は変更しない。

命名・型は既存規約に合わせる: `int().autoincrement().primaryKey()` は使わず、プロトタイプ互換の `varchar(24)` ID(クライアント生成のuid)を主キーにする。ただし高頻度追記の `genba_activity_logs` のみ autoincrement。FK制約は既存同様張らず、indexで担保。全テーブルに `createdAt`/`updatedAt`(既存パターン準拠)。

**テーブル一覧(M1で全定義・マイグレーション1本にまとめる):**

| テーブル | 要点 |
|---|---|
| `genba_sites` | name, **projectId int (既存projectsへの任意リンク)**, driveUrl varchar(500), archived |
| `genba_floors` | siteId, name, **imageKey varchar(200)(R2キーのみ。base64禁止)**, w, h, sortOrder |
| `genba_zones` | floorId, parentZoneId(自己参照), name, polygon **json**, priority int?, workStatus varchar(16)? |
| `genba_tasks` | zoneId, parentTaskId(自己参照), name, romaji, status(todo/progress/done/issue), percent?, priority?, issueText, startDate/dueDate varchar(10), memo, memoVisible bool, linkUrl, sortOrder |
| `genba_task_assignees` | taskId, userId int(既存users.id) — 複合index |
| `genba_task_teams` | taskId, teamId |
| `genba_teams` / `genba_team_members` | siteId, name / teamId, userId |
| `genba_instructions` | siteId, text, target(kind: all/team/worker + targetId), zoneId?, byUserId |
| `genba_instruction_reads` | instructionId, userId, readAt |
| `genba_task_events` | taskId, kind(status/issue/reply/handover), byUserId, text, photoKeys json, createdAt — 履歴と返信を集約 |
| `genba_material_presets` | siteId?, workName, parts json(文字列配列) |
| `genba_material_requests` | siteId, byUserId, status(pending/ordered/delivered), note, orderedAt?, deliveredAt? |
| `genba_material_request_items` | requestId, name, qty int, unit varchar(8) |
| `genba_task_templates` | 自己参照ツリー(parentId, name, romaji, sortOrder) |
| `genba_shares` | siteId, name, token varchar(64) unique, scopes json, expiresAt? |
| `genba_budgets` | **siteId PK**, enabled bool, contractAmount int, targetType(percent/amount), targetValue int, costPerManDay int, monthlyExpense int, periodStart/periodEnd varchar(10), preManDays decimal(8,1), **attendanceSource enum("manual","project")** |
| `genba_budget_attendance` | id, siteId, date varchar(10), manDays decimal(6,1) — 手入力分 |
| `genba_user_settings` | **userId PK(int)**, color varchar(9), theme varchar(24), lang varchar(4), guideSeen bool — 端末をまたぐ個人設定 |
| `genba_activity_logs` | id autoincrement, type varchar(24), byUserId?, payload json, createdAt + (type, createdAt) index |

**設計判断(v1.1で確定・指示書に反映済み):**
- `genba_budget_links` テーブルは**廃止**。`genba_sites.projectId` + `genba_budgets.attendanceSource="project"` で既存 `attendance` から人工を直接集計する: `SUM(hoursWorked)/80.0`(80=8.0h=1人工)を `projectId` × 期間でGROUP BY。手入力(manual)は `genba_budget_attendance` を使用し、`preManDays` は両モード共通の補正値。
- `projects.startDate/endDate` があるため、projectId連携時は工期の初期値を projects から自動提案する(M4で実装、スキーマは対応済み)。

各テーブル定義後に既存慣習どおり `export type GenbaSite = typeof genbaSites.$inferSelect;` 等の型exportを付けること。

## 3. マイグレーション

```bash
pnpm drizzle-kit generate   # 生成SQLを目視確認: genba_* のCREATE TABLEのみで、既存テーブルへのALTERが無いこと
node scripts/migrate.mjs    # 開発DBへ適用
```

生成SQLに既存テーブルへの変更が1行でも含まれる場合は**適用せず停止**し、原因(config/schema定義ミス)を修正する。

---

## 4. genbaRouter 骨組み(新規ファイル `server/genba/router.ts`)

### 4.1 権限プロシージャ

```ts
import { router, protectedProcedure } from "../_core/trpc";
import { genbaRoleOf } from "../../shared/genba/roles";
import { TRPCError } from "@trpc/server";

const genbaFieldProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = genbaRoleOf(ctx.user.appRole);
  if (role === "worker") throw new TRPCError({ code: "FORBIDDEN", message: "現場編集権限がありません" });
  return next({ ctx: { ...ctx, genbaRole: role } });
});

const genbaAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (genbaRoleOf(ctx.user.appRole) !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "管理者権限が必要です" });
  return next({ ctx: { ...ctx, genbaRole: "admin" as const } });
});
```

### 4.2 M1 で実装する実スライス(スタブでなく動くもの)

- `genba.sites.list` (protectedProcedure): archived=false の現場一覧
- `genba.sites.create / rename / archive / setDriveUrl` (genbaFieldProcedure。archiveのみ genbaAdminProcedure)
- `genba.me` (protectedProcedure): `{ userId, name, genbaRole, settings }` を返す(settings は genba_user_settings、無ければデフォルト生成)
- `genba.settings.update` (protectedProcedure): color/theme/lang/guideSeen の upsert

zod で入力検証(name: 1..120, driveUrl: `https?://` or 空)。mutation成功時は既存の `safeAuditLog(ctx.user.id, "genba.sites.create", ...)` を呼ぶ(既存auditLogs流用)。

### 4.3 それ以外は typed スタブ

floors/zones/tasks/instructions/materials/templates/shares/budgets/logs は、zodスキーマと手続き名だけ定義し `throw new TRPCError({ code: "NOT_IMPLEMENTED" as any, message: "M2以降で実装" })` を返す(コンパイルが通り、フロントの型が先に固まる)。※ tRPCに NOT_IMPLEMENTED が無い場合は `METHOD_NOT_SUPPORTED` を使用。

### 4.4 マージとフラグ

`server/routers.ts` の `appRouter` に `genba: genbaRouter` を追加(既存キーの変更禁止)。環境変数 `GENBA_ENABLED`(default "true")が "false" のとき、genbaRouter の全手続きが FORBIDDEN を返すガードmiddlewareを先頭に挟む。

---

## 5. フロント入口(最小)

1. `client/src/pages/AppGenba.tsx` を新規作成: `genba.me` と `genba.sites.list` を呼び、現場一覧+「＋現場」だけ動くプレースホルダ(本移植はM2)。既存ページのレイアウト/認証ガードの慣習に従う。
2. 既存のナビゲーション定義に「現場ビジョン」を追加(`GENBA_ENABLED` と appRole を見て表示)。ルーティング登録は既存 pages の追加手順に倣う。

---

## 6. テスト(vitest / 既存スタイル準拠)

- `server/genba.roles.test.ts` — appRole 6種のマッピング
- `server/genba.sites.test.ts` — create/rename/archive/setDriveUrl の正常系 + **worker(appRole:"worker")での403** + driveUrl バリデーション
- `server/genba.settings.test.ts` — upsert と初期値
- **Beta方針の厳守:** テストデータは `Genba_Beta_` プレフィックスのみ作成・削除。既存テーブルのレコードは作成しない(usersはテスト用ctxのモックで代替。既存テストのctx生成ヘルパーを再利用)。

## 7. README 追記

「現場ビジョン(genba)」節を追加: 概要1段落、`GENBA_ENABLED`、genba_* テーブル群は加算的で既存に影響しないこと、テストは固定Betaデータ方針(Beta_Worker_01 / Beta_Client_01 / 2024-01 / Genba_Beta_*)に従うこと。

## 8. 完了条件(Definition of Done)

- [ ] `pnpm test` 既存224件 + 新規テスト 全グリーン
- [ ] 生成マイグレーションSQLに既存テーブルへの変更が含まれない
- [ ] ARM64 Dockerビルド(既存GitHub Actions)が成功
- [ ] `GENBA_ENABLED=false` で既存アプリが従来どおり・genbaが遮断される
- [ ] ブラウザで /genba(相当ルート)を開き、現場の作成・一覧・リネーム・Driveリンク設定が動く
- [ ] PR タイトル: `feat(genba): M1 foundation — schema, router skeleton, entry page`(1 PR にまとめる)
