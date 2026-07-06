# 現場ビジョン 開発ロードマップ(M2〜M5) — Claude Code 自走用

**正本:** docs/genba/migration_design_v1.1.md(設計思想) / docs/genba/prototype/GenbaAppV18.jsx(機能の参照実装=正解の挙動)
**進め方:** 各フェーズごとにブランチ `feat/genba-m{n}` → 実装 → pnpm test 全グリーン → 変更一覧と迷った点を報告してユーザーレビュー → マージ。フェーズをまたいで先走らない。

---

## 常設ルール(全フェーズ共通)

1. 既存テーブル・ルーター・テスト・認証は変更しない(加算のみ)。生成SQLに既存へのALTERが出たら停止・報告
2. プロトタイプ(GenbaAppV18.jsx)が仕様の正。UI文言・挙動・権限の出し分け・CUD配色(FF4B00/F6AA00/4DC4FF/84919E、完了03AF7A)はテーマ不変で忠実に移植
3. 全mutationにサーバー側権限チェック(genbaRoleOf: super_admin/admin→admin、manager/leader→leader、他→worker)+ safeAuditLog
4. 画像・PDFはクライアント処理→R2直PUT。DBにはR2キーのみ。base64をDBに入れない
5. テストは固定Betaデータ方針(Genba_Beta_* のみ作成・削除。本番データ・既存テーブルに触れない)
6. i18n(日/pt-BR)・ローマ字辞書・電材カタログはプロトタイプから shared/genba/ へ定数移植(DBに入れない)
7. 改善提案は歓迎だが、実装前にユーザーへ提示して承認を得る

---

## M2 — コア(図面・エリア・作業・進捗)

**スコープ:** floors(R2直PUTアップロード+PDF.jsクライアント変換)/ zones(ポリゴン描画・頂点後編集・階層・優先度・workStatus・名前編集)/ tasks(テンプレート自動適用・階層・ステータス4種+percent・問題報告+写真R2・期限/開始日・メモ・linkUrl・romaji)/ 進捗集計(MariaDB再帰CTE。zones.listByFloorに集計を同梱)/ site.driveUrl表示
**参照実装:** プロトタイプの MapTab / ZoneSheet / TaskRow / TaskDetailModal / StatusModal / TemplateEditor
**DoD:** 図面タブ・作業タブ・全体タブ相当が実データで動く。worker権限で他人の作業更新が403。写真がR2に保存され署名URLで表示される

## M3 — 協働(班・指示・引き継ぎ・配置)

**スコープ:** teams CRUD+メンバー / task_assignees・task_teams / instructions(対象all/team/worker・エリアリンク・既読reads・未読バッジ)/ 引き継ぎ(handover: 担当付替+相手宛て指示自動生成+task_events記録)/ 配置ボード(人別/エリア別、割当から自動生成)
**DoD:** 複数ユーザーで割当→指示→既読→引き継ぎが一巡する。配置ボードが割当と即時整合

## M4 — 材料・予算・共有・学習・i18n

**スコープ:** 材料発注(カタログ定数+presets+requests/items・単位・サジェスト・Σ集計=DB側GROUP BY・status進行+ordered/deliveredAt)/ 予算トラッカー(budgets: enabledオプトイン、attendanceSource manual|project。project時は genba_sites.projectId で既存attendanceをSUM(hoursWorked)/80.0集計、工期初期値をprojectsから提案)/ 外部共有(shares: token・scopes・expiresAt、非認証ルート、内部情報を返さない)/ 学習・提案(activity_logs+InsightsCard相当)/ i18n・ローマ字・テーマ16種+ガイド(user_settings: theme/lang/guideSeen、初回ログインでガイド自動表示→既読でOFF)
**DoD:** プロトタイプv18の全機能が本体で再現。共有トークンで社内メモ・Driveリンク・予算が漏れないテストがある

## M5 — PWA・仕上げ

**スコープ:** manifest+Service Worker(Workbox: 読み取りキャッシュ+skipWaiting更新トースト)/ 進捗登録・問題報告のIndexedDBアウトボックス(オンライン復帰で送信)/ 権限・共有・R2 TTLの最終セキュリティテスト / ARM64イメージでのメモリ実測
**DoD:** スマホで「ホーム画面に追加」→アプリとして起動。機内モードで進捗登録→復帰で同期。NAS上で安定稼働

---

## CLAUDE.md への追記(M1ブランチで実施)

リポジトリ直下の CLAUDE.md(無ければ新規作成)に以下を追記し、以後のセッションが自動でルールを守るようにする:

```md
## 現場ビジョン(genba)開発ルール
- 設計正本: docs/genba/ 配下(migration_design_v1.1 / ROADMAP / prototype)
- 既存コードは加算のみ。genba_プレフィックス外のテーブル・ルーターを変更しない
- ブランチ: feat/genba-m{n}。mainへ直接コミット禁止。マージはユーザー承認後
- 全mutationは権限チェック(shared/genba/roles.ts)+safeAuditLog必須
- テストはGenba_Beta_*データのみ。pnpm test全グリーンでない状態で完了報告しない
- 画像はR2キーのみDB保存。base64禁止
- UI/挙動の正はdocs/genba/prototype/GenbaAppV18.jsx。CUD配色はテーマ不変
```
