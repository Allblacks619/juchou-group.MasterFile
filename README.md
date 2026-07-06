# 充寵グループ 業務管理システム (juchou-group.MasterFile)

電気設備工事業・充寵グループの業務管理システム。コーポレートサイト（日本語/ポルトガル語/英語）と、従業員・現場・出面・請求書・月締めを扱う管理アプリ（`/app`）で構成される。

- サーバー: Express + tRPC v11 (`server/routers.ts` に単一 appRouter)
- DB: MariaDB/MySQL + drizzle-orm（マイグレーションは `drizzle/` + `node scripts/migrate.mjs`）
- フロント: React + Vite + wouter (`client/src/pages`)
- テスト: vitest (`pnpm test`)

## 現場ビジョン (genba)

図面ベースの現場タスク管理機能（プロトタイプ GenbaAppV18 の本体移植）。M1 では基盤のみ:
`genba_*` テーブル群・`genba` tRPCルーター（sites / me / settings が実装済み、他は M2 以降の typed スタブ）・入口ページ `/app/genba`。権限は既存 `users.appRole` から3段階（admin / leader / worker）に導出し（`shared/genba/roles.ts`）、新しい権限カラムは追加しない。

- **`GENBA_ENABLED`** (default `"true"`): `"false"` にすると genba ルーターの全手続きが FORBIDDEN を返し、サイドバーの「現場ビジョン」も非表示になる。既存アプリの動作には影響しない。
- **加算的スキーマ**: `genba_*` テーブル群は `drizzle/schema.genba.ts` に分離されており、既存テーブルへの変更（ALTER）は一切含まない。マイグレーション `0029_genba_foundation.sql` は CREATE TABLE / CREATE INDEX のみ。
- **テスト方針**: 固定Betaデータ方針（Beta_Worker_01 / Beta_Client_01 / 対象月 2024-01）に従い、genba のテストデータは `Genba_Beta_` プレフィックスのみを作成・削除する。既存テーブルのレコードは作成しない（users はテスト用 ctx のモックで代替）。

## 開発

```bash
pnpm i
pnpm test                     # vitest 全件
pnpm dev                      # 開発サーバー (要 DATABASE_URL, JWT_SECRET, VITE_APP_ID)
node scripts/migrate.mjs      # マイグレーション適用 (要 DATABASE_URL)
```
