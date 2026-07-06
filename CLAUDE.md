# CLAUDE.md

充寵グループ 業務管理システム。サーバーは Express + tRPC v11（`server/routers.ts` に単一 appRouter）、DB は MariaDB + drizzle-orm、フロントは React + Vite + wouter、テストは vitest（`pnpm test`）。

## 現場ビジョン(genba)開発ルール
- 設計正本: docs/genba/ 配下(migration_design_v1.1 / ROADMAP / prototype)
- 既存コードは加算のみ。genba_プレフィックス外のテーブル・ルーターを変更しない
- ブランチ: feat/genba-m{n}。mainへ直接コミット禁止。マージはユーザー承認後
- 全mutationは権限チェック(shared/genba/roles.ts)+safeAuditLog必須
- テストはGenba_Beta_*データのみ。pnpm test全グリーンでない状態で完了報告しない
- 画像はR2キーのみDB保存。base64禁止
- UI/挙動の正はdocs/genba/prototype/GenbaAppV18.jsx。CUD配色はテーマ不変
