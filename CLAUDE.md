# CLAUDE.md

充寵グループ 業務管理システム。サーバーは Express + tRPC v11（`server/routers.ts` に単一 appRouter）、DB は MariaDB + drizzle-orm、フロントは React + Vite + wouter、テストは vitest（`pnpm test`）。

## Claude 作業ポリシー（オーナー合意済み・毎回確認不要）
オーナー(biguoki@gmail.com / ログインID: mitsuru)との合意。以降のセッションでも都度確認せずこのとおり進めること。
- **言語**: オーナーへの回答は日本語。
- **途中経過**: CI 待ちなどの「待機中」進捗メッセージは書かない（完了・要判断・失敗時のみ報告）。
- **自動マージ**: PR の CI が全て green（`ci.yml` の build-and-test と `build.yml` の migration-test/build の両方）になったら、draft を ready にして即マージ（merge method: `merge`）。都度「マージしていいか」を確認しない。
- **自動デプロイ**: マージ後は全自動で本番反映される（GHCR push → VPS の Watchtower が5〜10分で更新、DB マイグレーションも起動時に自動）。**オーナーに手動デプロイ / Publish を依頼しない**（「マージしました。約5〜10分で本番反映されます」で締める）。
- **PR作法**: draft で作成 → CI green → ready+merge。開発は指定ブランチで行い main へ直接コミットしない。

## デプロイ / インフラ（自己ホスト）
- 本番は自社 VPS(ConoHa/Ubuntu, IP 133.88.120.12, `/opt/juchou`)で docker compose 稼働。公開 URL は https://www.juchou-group.com （`/app` が業務アプリ）。**Manus は撤去済み**。
- **デプロイは全自動**: main へマージ → GitHub Actions がマルチアーキ image を GHCR へ push → VPS の Watchtower が 5 分以内に `app` を自動更新（DB マイグレーションは起動時に自動実行）。**VPS 手動操作は基本不要**。即時反映は `cd /opt/juchou && docker compose pull && docker compose up -d`。
- 構成/CI/バックアップ/認証の落とし穴/よく使うコマンドは **`docs/DEPLOYMENT.md` に集約**。デプロイ・インフラ・認証・マイグレーション関連の作業前に必ず参照すること。
- 認証の要注意点(詳細は docs/DEPLOYMENT.md): Cookie は `sameSite:"lax"`(cookies.ts) / `verifySession` は openId のみ必須で appId 空を許容(sdk.ts) / `server/_core/vite.ts` は vite を動的 import(本番は vite 未インストール)。ここを壊すとログイン不能・起動クラッシュになる。

## 現場ビジョン(genba)開発ルール
- 設計正本: docs/genba/ 配下(migration_design_v1.1 / ROADMAP / prototype)
- 既存コードは加算のみ。genba_プレフィックス外のテーブル・ルーターを変更しない
- ブランチ: feat/genba-m{n}。mainへ直接コミット禁止。マージはユーザー承認後
- 全mutationは権限チェック(shared/genba/roles.ts)+safeAuditLog必須
- テストはGenba_Beta_*データのみ。pnpm test全グリーンでない状態で完了報告しない
- 画像はR2キーのみDB保存。base64禁止
- UI/挙動の正はdocs/genba/prototype/GenbaAppV18.jsx。CUD配色はテーマ不変
