# デプロイ / インフラ リファレンス（自己ホスト運用）

> 2026-07 に Manus ホスティングから自社 VPS への完全移行を実施。本番は自己ホストで 24 時間稼働。
> このドキュメントは今後の Claude / 開発者の作業用リファレンス。**秘密情報（パスワード・JWT_SECRET・鍵・DB 認証情報）は記載しない**。

## 全体像

```
コードの正本: GitHub (Allblacks619/juchou-group.MasterFile)
   │  main へマージ
   ▼
GitHub Actions (.github/workflows/build.yml)
   ├─ migration-test: MariaDB 11 に全マイグレーションを流して検証 + 冪等性チェック
   └─ build: マルチアーキ(amd64+arm64) Docker イメージをビルドし GHCR へ push
   │       ghcr.io/allblacks619/juchou-group.masterfile:latest （public）
   ▼
VPS (ConoHa, Ubuntu 24.04, x86_64) /opt/juchou で docker compose 稼働
   ├─ db        : mariadb:11（データ。自動更新しない）
   ├─ app       : GHCR の :latest（本番アプリ）
   ├─ caddy     : リバースプロキシ + 自動 HTTPS(Let's Encrypt)
   └─ watchtower: app のみ 5 分毎に監視し新イメージを自動デプロイ
   │
   ▼ 自動 HTTPS
https://www.juchou-group.com  （/app が業務アプリのログイン）
```

## インフラ基本情報

- **VPS**: ConoHa VPS / Ubuntu 24.04 / x86_64 / メモリ 2GB。グローバル IP `133.88.120.12`。
- **デプロイ先**: `/opt/juchou`（`docker-compose.yml`, `Caddyfile`, `.env`, `backups/`, `data/db`）。
- **接続**: SSH は Termius から鍵認証（パスワードログインは無効化済み）。root ログインは公開鍵のみ。
- **ドメイン**: `www.juchou-group.com`（お名前.com / DNS は dnsv.jp）。`www` と apex(`@`) の A レコードを VPS IP に向けている。**MX(Google) / TXT(DKIM 等) は変更しない**こと（メールが止まる）。
- **HTTPS**: Caddy が Let's Encrypt 証明書を自動取得・自動更新。HTTP は自動で HTTPS にリダイレクト。
- **ファイアウォール**: ufw で 22 のみ許可。80/443 は Docker(Caddy) が公開（ufw の一覧には出ないが開いている）。db(3306)/app(3000) はホスト非公開（内部通信のみ）。fail2ban で SSH 総当たりを自動 BAN。

## デプロイ

### 自動（通常はこれ）
`main` にマージ → Actions がイメージを publish → Watchtower が 5 分以内に検知して `app` を自動更新（DB マイグレーションは起動時に自動実行）。**VPS 操作は不要。** マージから本番反映まで約 5〜10 分。

- Watchtower は `com.centurylinklabs.watchtower.enable=true` ラベルの付いた `app` のみ更新する（`WATCHTOWER_LABEL_ENABLE=true`）。db/caddy は対象外。
- Watchtower は新しめの Docker daemon 対策で `DOCKER_API_VERSION: "1.44"` を環境変数に設定している（無いと `client version 1.25 too old` で失敗する）。

### 手動（即時反映したいとき）
```
cd /opt/juchou && docker compose pull && docker compose up -d
```

### 設定ファイル変更時（compose / Caddyfile を差し替えたとき）
SFTP で `/opt/juchou/` に上書き → `cd /opt/juchou && docker compose up -d`。
※ `Caddyfile` は「ファイル」であること（存在しない状態で up すると Docker が同名ディレクトリを誤作成し `not a directory` エラーになる）。

## DB マイグレーション（drizzle）

- マイグレーションは `drizzle/` 配下。アプリ起動時に `docker-entrypoint.sh` → `scripts/migrate.mjs` が自動実行（`drizzle-orm/mysql2` migrator）。
- **journal に載っているファイルのみ実行される**（`drizzle/meta/_journal.json`）。journal 外の `.sql`（例 `0012_closing_core.sql` 等）は実行されない死にファイル。
- 過去に MariaDB 11 で `ER_PARSE_ERROR(1064)` / `1050` / `1061` が出た手書きマイグレーション（`0018_worker_invoices_v1.sql` 等）は、drizzle-kit 生成版と重複していたため **no-op 化(`SELECT 1;`)** して解消済み。journal エントリは保持している（消すと migrator の整合が崩れる）。
- CI の `migration-test` が全マイグレーションを MariaDB 11 で流して検証するので、SQL 非互換は push 時点で検出される。

## バックアップ（3 段構成・全自動）

```
VPS: 毎日 03:37 に cron が /opt/juchou/backup.sh を実行
     → mariadb-dump を gzip して /opt/juchou/backups/juchou_YYYYMMDD_HHMMSS.sql.gz（14 日保持）
NAS(Synology DS218play): タスクスケジューラが毎日 rsync で VPS の backups/ を取得
     → 取得先は Google Drive 同期対象フォルダ（/volume1/Servidor/.../vps-backups）
Google Drive: NAS の Cloud Sync が自動アップロード
```

- NAS→VPS は読み取り専用ユーザー `nasbackup`（鍵認証）で pull。VPS を外部公開しない構成。

### 復元
```
zcat /opt/juchou/backups/<ファイル名>.sql.gz | docker compose exec -T db sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'
```

### 旧 Manus データの一括移行（実施済み・参考）
旧 DB は TiDB Cloud(MySQL 8 互換)。mysqldump を取得 → 一時 DB `oldimport` に読み込み → 新スキーマの共通カラムのみ `INSERT ... SELECT` でコピー、という方式で全 27 テーブルを移行した（旧→新でカラム欠損なし。新規追加は `company_profile.logoSettings` のみ）。

## 認証まわり（重要な仕様と既知の落とし穴）

- ID/パスワードのローカル JWT 認証（Manus OAuth は撤去済み）。ログインは `/app/login`、API は `server/customAuth.ts`。セッションは Cookie（`shared/const.ts` の `COOKIE_NAME`）。
- **Cookie は `sameSite: "lax"`**（`server/_core/cookies.ts`）。`"none"` は Secure 必須で HTTP 配信時にブラウザが破棄するため lax にしている。HTTPS(Caddy) 経由では `X-Forwarded-Proto: https` により Secure が付く。
- **`verifySession`（`server/_core/sdk.ts`）は `openId` のみ必須**。`appId(=VITE_APP_ID)` は自己ホストで空になるため必須にしない（空を許容）。ここを厳格にすると「ログインが必要です」で全リクエストが弾かれる。
- 本番バンドルは `esbuild --packages=external`。`server/_core/vite.ts` は `vite` / `vite.config` を**動的 import で遅延ロード**（開発時のみ）。静的 import すると本番イメージ(vite 未インストール)で `ERR_MODULE_NOT_FOUND('vite')` クラッシュになる。
- オーナー/管理者の作成・パスワード再設定: `docker compose exec -e OWNER_LOGIN_ID=... -e OWNER_PASSWORD=... app node scripts/seed-owner.mjs`（env 名は `OWNER_LOGIN_ID` / `OWNER_PASSWORD`。`SEED_` 接頭辞ではない）。現オーナーのログイン ID: `mitsuru`。

## よく使うコマンド

```
# ログ確認
cd /opt/juchou && docker compose logs --tail 50 app
docker compose logs --tail 30 caddy
docker compose logs --tail 30 watchtower

# 手動更新
cd /opt/juchou && docker compose pull && docker compose up -d

# 稼働状況
docker compose ps

# バックアップ手動実行
/opt/juchou/backup.sh && cat /opt/juchou/backups/backup.log
```

## 未了 / 任意タスク

- 移行作業中にスクリーンショットへ写った秘密情報（`JWT_SECRET` / DB パスワード / オーナーのパスワード）は、余裕があればローテーション推奨。`JWT_SECRET` 変更時は全セッションが無効化される（再ログインが必要）。
