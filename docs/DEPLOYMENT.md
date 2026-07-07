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

## オブジェクトストレージ（MinIO・自己ホスト）

- 生成/アップロードするファイル（確認表 PDF・Excel・請求書・領収書画像・資格証など）は S3 互換の **MinIO（VPS 内 docker）** に保存。Cloudflare R2 等の外部サービスは不使用。
- 公開は **`https://storage.juchou-group.com`**（Caddy → `minio:9000`）。バケット `juchou-uploads`（`minio-init` サービスが起動時に自動作成）。ファイル実体は VPS の `/opt/juchou/minio-data/`。
- `server/storage.ts` は **presigned URL** 方式（ブラウザが `S3_ENDPOINT` から直接取得）。そのため `S3_ENDPOINT` はブラウザから届く公開ドメインである必要があり、`S3_FORCE_PATH_STYLE=true` を設定（MinIO はパススタイル）。`.env` の主な値: `S3_ENDPOINT=https://storage.juchou-group.com` / `S3_BUCKET=juchou-uploads` / `S3_ACCESS_KEY_ID=MINIO_ROOT_USER と同じ` / `S3_FORCE_PATH_STYLE=true` / `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`。
- storage サブドメインを追加/変更したら **caddy を明示的に作り直す**こと（`docker compose up -d --force-recreate caddy`）。compose の他サービス追加だけでは caddy が再作成されず旧 Caddyfile のまま動き、新ドメインの証明書を取りに行かない。
- 旧 Manus 時代のファイルは AWS(Manus Forge, `d2xsxph8kpxj0f.cloudfront.net`)にあり、DB には URL が入っている。**MinIO への移行は未実施**（Manus 稼働中は表示可能。停止前に移行が必要）。

## バックアップ（3 段構成・全自動）

```
VPS: 毎日 03:37 に cron が /opt/juchou/backup.sh を実行
     → DB を mariadb-dump→gzip: /opt/juchou/backups/juchou_YYYYMMDD_HHMMSS.sql.gz
     → MinIO ファイルを tar.gz: /opt/juchou/backups/minio_YYYYMMDD_HHMMSS.tar.gz
     （どちらも 14 日保持）
NAS(Synology DS218play): タスクスケジューラが毎日 rsync で VPS の /opt/juchou/backups/ を取得
     → 取得先(Google Drive 同期対象フォルダ・正確なパス):
        /volume1/Servidor/Serviço/充寵グループ/JYUCHOU group Site/Host Files/vps-backups/
Google Drive: NAS の Cloud Sync が自動アップロード
```

- backup.sh の実体は `docs/deploy/backup.sh`（DB + MinIO 両方をバックアップする版）。
- NAS→VPS は読み取り専用ユーザー `nasbackup`（鍵認証、鍵は NAS 側 `/volume1/docker/vpskey/id_ed25519`）で pull。VPS を外部公開しない構成。
- backups/ を丸ごと NAS が取得するため、**MinIO ファイルのバックアップに NAS 側の設定変更は不要**（backup.sh が backups/ に置けば自動で流れる）。

### 復元
```
# DB
zcat /opt/juchou/backups/juchou_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T db sh -c 'exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD"'
# MinIO ファイル（app 停止して展開 → 再起動）
docker compose stop app minio && tar xzf /opt/juchou/backups/minio_YYYYMMDD_HHMMSS.tar.gz -C /opt/juchou && docker compose up -d
```

### 本番の compose / Caddyfile リファレンス
現行の本番構成は `docs/deploy/docker-compose.yml`（db / app / minio / minio-init / caddy / watchtower）と `docs/deploy/Caddyfile`（www + storage の 2 サイト）を参照。VPS `/opt/juchou/` の実体はこれらと同じ（値は `.env`）。

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
