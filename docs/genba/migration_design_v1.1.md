# 現場ビジョン(Genba Vision)本体統合 移行設計書 v1.0

**対象リポジトリ:** `Allblacks619 / juchou-group.MasterFile`
**目的:** アーティファクトで作り込んだプロトタイプ「現場ビジョン v13」を、充寵グループの既存業務システム(React 19 + Vite + Express + tRPC + Drizzle/MariaDB)へ、独立した1機能モジュールとして統合する。
**制約前提:** Synology DS218play(ARM64 / RAM 1GB 非増設)/ MariaDB 11 / Cloudflare R2 / 既存JWT認証(bcryptjs + jose)。

---

## 0. 設計の基本方針

現代的・直感的・プロ仕込みを保つために、次の原則を貫く。

1. **既存を壊さない(加算的統合)** — 現場ビジョンは `genba` という名前空間で追加する。既存テーブル・ルーター・認証には触れず、`genbaRouter` を1本ぶら下げるだけにする。既存の `users` テーブルは再利用し、作業員テーブルを新設しない(「管理者も一作業員」というプロトタイプの思想が、既存の単一ユーザーモデルと完全に一致する)。
2. **プロトタイプのデータ構造をほぼそのまま持ち込む** — アーティファクトは最初から移行を見据えて正規化してあるので、`state` の各配列がほぼそのままテーブルになる。
3. **1GB RAMを最優先制約に** — 画像リサイズはクライアント側維持、ログは1000件ローテーション、集計はDB側でpage分割。サーバーメモリに全件ロードする実装は禁止。
4. **オフライン対応(PWA)で現場の電波弱でも使える** — Service Worker + IndexedDB キャッシュ + 楽観的更新。
5. **コピー・漏洩対策をアーキテクチャに織り込む** — サーバー権限チェックを全ルートに、R2は署名付きURL、共有ビューは期限付きトークン、リポジトリは非公開。

> **改善提案(重要):** プロトタイプでは「作業員」を独自配列で持っていたが、本体統合では **既存 `users` テーブルに一本化**することを強く推奨する。理由は (a) ログインが既存JWTでそのまま通る、(b) 「管理者も作業員」を `appRole` で自然表現できる、(c) 二重管理による不整合を防げる。以下の設計はこの前提で書く。

---

## 1. 全体アーキテクチャ

```
[スマホ/タブレット ブラウザ]
   │  PWA (Service Worker + IndexedDB オフラインキャッシュ)
   │  React 19 コンポーネント(現場ビジョンUI = プロトタイプ移植)
   ▼  tRPC over HTTPS
[Express + tRPC サーバー / Docker(app) on DS218play]
   │  genbaRouter (新規) ── 既存 authMiddleware を流用
   │  権限チェック: appRole + 担当/班の照合をサーバー側で実施
   ▼
[MariaDB 11 / Docker(db)]  ← genba_* テーブル群(新規)
[Cloudflare R2]            ← 図面画像・問題写真(署名付きURL)
```

- **フロント:** プロトタイプの `GenbaApp` を、本体の `client/src/features/genba/` 配下にコンポーネント分割して配置。`state` を握っていた最上位を、tRPC の `useQuery`/`useMutation` + 軽量クライアントストア(Zustand 等、既存にあればそれ)に置換。
- **バック:** `server/routers/genba.ts` に `genbaRouter` を新設し、既存 `appRouter` に merge。
- **ストレージ:** 既存 `storage.ts`(R2 presigned URL 実装済み)をそのまま利用。

---

## 2. データモデル(Drizzle スキーマ)

プロトタイプの各配列 → テーブル対応。すべて `genba_` プレフィックスで既存と衝突回避。

| プロトタイプの state | テーブル | 備考 |
|---|---|---|
| `workers` | (既存 `users` を利用) | 新設しない。`appRole` で管理者/一般を表現 |
| `sites` | `genba_sites` | 現場 |
| `floors` | `genba_floors` | フロア(図面) |
| `zones` | `genba_zones` | エリア(自己参照で階層) |
| `tasks` | `genba_tasks` | 作業(自己参照で階層) |
| `teams` / メンバー | `genba_teams` / `genba_team_members` | 班と所属(多対多) |
| タスク担当 | `genba_task_assignees` | 作業↔ユーザー(多対多) |
| タスク班割当 | `genba_task_teams` | 作業↔班(多対多) |
| `instructions` | `genba_instructions` + `genba_instruction_reads` | 指示と既読 |
| `materialPresets` | `genba_material_presets` | 材料プリセット(内蔵カタログはコード定数のまま) |
| `materialRequests` | `genba_material_requests` + `genba_material_request_items` | 発注依頼と明細 |
| `shares` | `genba_shares` | 外部共有ビュー(トークン付き) |
| `template` | `genba_task_templates` | 作業テンプレート(自己参照) |
| `logs` | `genba_activity_logs` | 利用ログ(1000件相当をDB側で保持・集計) |
| 進捗履歴/返信 | `genba_task_events` | 履歴・問題返信を1テーブルに集約 |

### 2.1 Drizzle 定義(抜粋・要点)

```ts
// server/db/schema/genba.ts
import { mysqlTable, varchar, int, boolean, timestamp, text, json, index } from "drizzle-orm/mysql-core";
import { users } from "../schema"; // 既存

export const genbaSites = mysqlTable("genba_sites", {
  id: varchar("id", { length: 24 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const genbaFloors = mysqlTable("genba_floors", {
  id: varchar("id", { length: 24 }).primaryKey(),
  siteId: varchar("site_id", { length: 24 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  // 画像は R2 のキーだけ持つ(base64をDBに入れない ← RAM/容量対策)
  imageKey: varchar("image_key", { length: 200 }),
  w: int("w").notNull(),
  h: int("h").notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
}, (t) => ({ siteIdx: index("floor_site_idx").on(t.siteId) }));

export const genbaZones = mysqlTable("genba_zones", {
  id: varchar("id", { length: 24 }).primaryKey(),
  floorId: varchar("floor_id", { length: 24 }).notNull(),
  parentZoneId: varchar("parent_zone_id", { length: 24 }), // 自己参照(nullでトップ)
  name: varchar("name", { length: 80 }).notNull(),
  polygon: json("polygon").notNull(), // [{x,y}] 正規化0-1でも実座標でも可(プロトタイプは実座標)
  priority: int("priority"), // 1-4 or null
  workStatus: varchar("work_status", { length: 16 }), // 'paused' or null
}, (t) => ({ floorIdx: index("zone_floor_idx").on(t.floorId), parentIdx: index("zone_parent_idx").on(t.parentZoneId) }));

export const genbaTasks = mysqlTable("genba_tasks", {
  id: varchar("id", { length: 24 }).primaryKey(),
  zoneId: varchar("zone_id", { length: 24 }).notNull(),
  parentTaskId: varchar("parent_task_id", { length: 24 }), // 自己参照
  name: varchar("name", { length: 160 }).notNull(),
  romaji: varchar("romaji", { length: 200 }).default("").notNull(), // PT表示用
  priority: int("priority"),
  status: varchar("status", { length: 16 }).default("todo").notNull(), // todo|progress|done|issue
  percent: int("percent"), // 25/50/75 等
  issueText: text("issue_text"),
  dueDate: varchar("due_date", { length: 10 }),   // YYYY-MM-DD
  startDate: varchar("start_date", { length: 10 }),
  memo: text("memo"),
  memoVisibleToWorkers: boolean("memo_visible").default(false).notNull(),
  linkUrl: varchar("link_url", { length: 500 }).default("").notNull(), // Google Drive等
  sortOrder: int("sort_order").default(0).notNull(),
}, (t) => ({ zoneIdx: index("task_zone_idx").on(t.zoneId), parentIdx: index("task_parent_idx").on(t.parentTaskId) }));

// 多対多(担当・班)
export const genbaTaskAssignees = mysqlTable("genba_task_assignees", {
  taskId: varchar("task_id", { length: 24 }).notNull(),
  userId: int("user_id").notNull(), // 既存 users.id を参照
}, (t) => ({ taskIdx: index("ta_task_idx").on(t.taskId), userIdx: index("ta_user_idx").on(t.userId) }));

// 問題写真は R2 キーを配列で持つ(genba_task_events に紐付け)
export const genbaTaskEvents = mysqlTable("genba_task_events", {
  id: varchar("id", { length: 24 }).primaryKey(),
  taskId: varchar("task_id", { length: 24 }).notNull(),
  kind: varchar("kind", { length: 16 }).notNull(), // status|issue|reply|handover
  byUserId: int("by_user_id").notNull(),
  text: text("text"),
  photoKeys: json("photo_keys"), // R2キー配列
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ taskIdx: index("ev_task_idx").on(t.taskId) }));

export const genbaActivityLogs = mysqlTable("genba_activity_logs", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 24 }).notNull(), // material|status|issue
  byUserId: int("by_user_id"),
  payload: json("payload").notNull(), // {name, qty, unit, freeInput...}
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({ typeIdx: index("log_type_idx").on(t.type), createdIdx: index("log_created_idx").on(t.createdAt) }));
```

> **改善提案:** プロトタイプはフロア画像を base64 で `state` に持っていたが、**DBには R2 のキー(`imageKey`)だけを保存**する。画像実体は R2。これで (a) MariaDB の行が肥大化せず 1GB RAM を守れる、(b) 署名付きURLでアクセス制御できる。移植時の最重要変更点。

### 2.2 内蔵カタログ・翻訳辞書の扱い

`MATERIAL_MASTER`(電材約110品目)、`ROMAJI_DICT`、`PT`(UI翻訳)、かなローマ字エンジンは **DBに入れずコード定数のまま** `shared/genba/catalog.ts` に置く。理由: バージョン管理でき、全端末で一貫し、DB負荷ゼロ。ユーザーが追加する材料プリセットだけ `genba_material_presets` に保存する。

---

## 3. tRPC ルーター設計

`server/routers/genba.ts` に `genbaRouter` を新設。既存の認証済み手続き(`protectedProcedure` 等)を土台にする。

### 3.1 権限プロシージャの定義

```ts
// 既存の protectedProcedure(JWT検証済み)を拡張
const genbaAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isGenbaAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

// 閲覧専用(共有トークン)用: 別ルートで扱う(3.4)
```

`isGenbaAdmin(user)` は既存 `appRole`(super_admin / admin 等)を見て判定。プロトタイプの `isAdmin` フラグに相当。

### 3.2 主要エンドポイント一覧

読み取りは原則 `query`、変更は `mutation`。**すべてのmutationはサーバー側で権限を再チェック**(UIのボタン非表示だけに頼らない)。

**サイト/フロア**
- `genba.sites.list` / `genba.sites.create*` / `genba.sites.rename*` / `genba.sites.archive*`
- `genba.floors.listBySite` / `genba.floors.create*`(R2アップロード後にキー登録) / `genba.floors.remove*`

**エリア**
- `genba.zones.listByFloor` → ポリゴン・優先度・進捗集計を含む
- `genba.zones.create*` / `genba.zones.update*`(名前・優先度・workStatus・**polygon編集**) / `genba.zones.remove*`

**作業**
- `genba.tasks.listByZone`(階層で返す)
- `genba.tasks.updateStatus`(担当 or 管理者のみ / percent・issueText・写真キー) ← 権限照合の要
- `genba.tasks.create* / rename* / remove*`(管理者) / `genba.tasks.setMeta*`(期限・開始日・メモ・リンク・romaji)
- `genba.tasks.assign*`(担当・班) / `genba.tasks.handover*`(引き継ぎ+指示自動生成)

**指示**
- `genba.instructions.listForMe` / `genba.instructions.create*`(管理者) / `genba.instructions.markRead`

**材料**
- `genba.materials.presets.*`(管理者) / `genba.materials.requests.listBySite`
- `genba.materials.requests.create`(誰でも) / `genba.materials.requests.setStatus`(管理者) / `genba.materials.requests.cancel`(本人 or 管理者)
- `genba.materials.aggregate`(管理者・期間別集計 ← DB側で GROUP BY)

**テンプレート / 共有 / ログ**
- `genba.templates.get / mutateTree`(管理者)
- `genba.shares.list / create / remove`(管理者)
- `genba.logs.append`(内部利用・材料/ステータス) / `genba.logs.insights`(管理者・提案生成)

### 3.3 進捗集計はどこで計算するか

プロトタイプはクライアントで全再帰計算していた。本体では **1GB RAM を考慮し、ゾーン進捗をDB側の再帰CTE(MariaDB 11 対応)で計算**、または `genba_tasks` に集計キャッシュ列を持ち更新時に再計算する。フロア表示で全タスクをフロントに流し込むのは避ける(電波弱いと重い)。

```sql
-- 例: ゾーン配下の葉タスクの進捗平均(再帰CTE)
WITH RECURSIVE zone_tree AS (
  SELECT id FROM genba_zones WHERE id = ?
  UNION ALL SELECT z.id FROM genba_zones z JOIN zone_tree zt ON z.parent_zone_id = zt.id
)
SELECT AVG(CASE t.status WHEN 'done' THEN 100 WHEN 'progress' THEN COALESCE(t.percent,50) ELSE 0 END)
FROM genba_tasks t WHERE t.zone_id IN (SELECT id FROM zone_tree)
  AND t.id NOT IN (SELECT parent_task_id FROM genba_tasks WHERE parent_task_id IS NOT NULL);
```

### 3.4 共有ビュー(外部・閲覧専用)

- `genba_shares` に `token`(推測不能なランダム) `scopes`(map/tasks/board/dash) `expiresAt` を持たせる。
- 専用の**非認証ルート** `genba.public.view`(トークン必須)を用意。トークン→scope に含まれるデータ**だけ**を返す。社内メモ・指示・材料・図面リンク・ログは絶対に返さない(サーバー側で除外)。
- URL 例: `https://<domain>/g/share/<token>`。期限切れは 410 を返す。

---

## 4. フロントエンド移植

### 4.1 コンポーネント分割方針

プロトタイプの1ファイル `GenbaApp` を機能単位で分割:

```
client/src/features/genba/
  GenbaRoot.tsx            # タブ制御・言語/テーマ context
  api/genbaClient.ts       # tRPC hooks ラッパ
  store/uiStore.ts         # 言語・テーマ・選択中ゾーン等のUI状態(サーバー非依存)
  map/FloorMap.tsx         # SVGオーバーレイ・ポリゴン描画/編集
  map/ZoneSheet.tsx
  tasks/TaskTree.tsx  tasks/TaskDetailModal.tsx  tasks/StatusModal.tsx
  instructions/InstructionsTab.tsx
  materials/MaterialSection.tsx
  board/BoardTab.tsx  dashboard/DashTab.tsx
  settings/SettingsTab.tsx  settings/InsightsCard.tsx
  shared/catalog.ts        # 電材マスター・翻訳辞書・ローマ字エンジン
  shared/i18n.ts  shared/theme.ts
```

### 4.2 状態管理の置換

- **サーバー状態**(sites/floors/zones/tasks/…): tRPC `useQuery` + `invalidate` で同期。楽観的更新(`onMutate`)でタップ即反映 → 失敗時ロールバック。
- **UI状態**(選択ゾーン・タブ・言語・テーマ): クライアントのみ。言語/テーマは `localStorage` に保存(本体は通常のWebなので使える。プロトタイプで使えなかった制約は解消)。
- CUD配色(優先度・進捗)は `theme.ts` で不変ロックを継続。

### 4.3 画像アップロードのフロー(R2直PUT)

1. クライアントで画像を選択 → **クライアント側でリサイズ**(プロトタイプの `fileToResizedDataUrl` を Blob 出力に変更、RAM対策)
2. `genba.floors.requestUpload` で presigned PUT URL を取得
3. ブラウザから R2 へ直接 PUT(サーバーを経由しない = app コンテナのメモリを使わない)
4. 成功後 `genba.floors.create` にキーを登録

> **改善提案:** PDF→画像化(pdf.js)も**クライアント側で実行**し、各ページを R2 に直PUT。サーバーで pdf を展開すると 1GB RAM を圧迫するため。プロトタイプの実装がそのまま活きる。

---

## 5. PWA(スマホインストール・自動更新・オフライン同期)

### 5.1 インストール可能にする

- `manifest.webmanifest` を追加(name「現場ビジョン」、icons 192/512、`display: standalone`、`theme_color`、`start_url`)。
- スマホの「ホーム画面に追加」でアプリとして全画面起動。iOS/Android 両対応。
- **App Store配布は不要**(社内利用のため)。将来必要なら Capacitor でラップ可能だが、まずは PWA が最速・審査なし・更新が楽。

### 5.2 自動更新

- Service Worker を **Workbox** で生成。`skipWaiting` + `clientsClaim` で、NASのイメージを更新して再デプロイ → 次回起動時に全端末が自動で新版に。
- 「新しいバージョンがあります。更新しますか?」トーストを出す実装を推奨(職人が作業中に勝手にリロードされないよう配慮)。

### 5.3 オフライン & 同期(現場の弱電波対策)

- **読み取りキャッシュ:** tRPC の GETレスポンスを Service Worker/IndexedDB にキャッシュ。圏外でも直近の図面・作業一覧が見える。
- **書き込みキュー:** 進捗登録・問題報告を**オフライン時は IndexedDB のアウトボックスに積み**、オンライン復帰時に順次送信(Background Sync)。楽観的更新でその場では反映済みに見せる。
- **競合解決:** last-write-wins を基本(プロトタイプの `storage` 設計と同じ思想)。ステータスは単純上書きで実害が小さい。写真は追加のみなので競合しない。

> **改善提案:** 完全なオフライン編集は複雑化を招くので、**フェーズ分け**を推奨。第1弾は「読み取りオフライン + 進捗登録のアウトボックス送信」まで。エリア作成・図面アップロードはオンライン必須にする(これらは事務所で行う作業なので実害なし)。

---

## 6. セキュリティ・コピー対策

正直な前提: ブラウザに配信される JS を完全に秘匿することは不可能。だが**実効的な保護**は多層で作れる。

1. **リポジトリを非公開(private)化** ← 最優先・今すぐ。ソースが公開されている状態が最大の漏洩リスク。
2. **全 mutation でサーバー権限チェック** — UIを真似ても、担当外の作業更新・管理操作はサーバーが 403。ロジックとデータはサーバーにあり、UIコピーだけでは動かない。
3. **R2 は署名付きURL(期限付き)** — 図面・写真の直リンクを防止。TTL は既存実装(既定7日)を短めに調整可能。
4. **外部共有はトークン+有効期限+scope制限** — 施主に渡すURLから社内情報へ到達不可。
5. **監査ログ** — `genba_activity_logs` で誰が何をしたか追跡可能(不正利用の検知)。
6. **フロントの難読化** — Vite 本番ビルドで minify(標準)。ソースマップは本番で無効化。
7. **レート制限** — ログイン試行・共有トークンアクセスに既存のミドルウェアがあれば適用。

---

## 7. 実装ロードマップ(フェーズ分割)

各フェーズは独立してデプロイ可能。既存システムを壊さず加算していく。

### フェーズ M1 — 基盤(スキーマ + 骨組み)
- `genba_*` テーブルの Drizzle 定義 + マイグレーション(既存 `scripts/migrate.mjs` に乗る)
- `genbaRouter` の空実装を `appRouter` に merge、`genba.sites.list` だけ通す
- フロントに `/genba` ルートと空の `GenbaRoot` を追加、既存ナビに導線
- **完了条件:** 既存機能に影響なくビルド・デプロイでき、空の現場ビジョン画面が開く

### フェーズ M2 — コア(図面・エリア・作業・進捗)
- フロア画像の R2 直PUT アップロード + 表示
- ゾーンのポリゴン描画/**後編集**、階層、優先度、workStatus
- 作業ツリー、ステータス登録(担当/管理権限チェック)、進捗集計(再帰CTE)
- **完了条件:** プロトタイプの「図面・作業・全体」タブ相当が実データで動く

### フェーズ M3 — 協働(班・指示・引き継ぎ・配置)
- `users` ベースの担当割当・班・班割当
- 指示 + 既読、引き継ぎ + 指示自動生成、配置ボード
- **完了条件:** 複数ユーザーで割当・指示・引き継ぎが回る

### フェーズ M4 — 材料・共有・学習
- 材料発注(カタログ定数 + プリセットDB)、期間集計、ステータス進行
- 外部共有ビュー(トークン/scope/期限)
- 利用ログ + 学習・提案(InsightsCard)
- 多言語(日/pt)・テーマ7種+カスタム
- **完了条件:** プロトタイプ v13 の全機能が本体で再現

### フェーズ M5 — PWA・オフライン・仕上げ
- manifest + Service Worker(Workbox)、インストール対応、自動更新トースト
- 読み取りキャッシュ + 進捗登録アウトボックス同期
- セキュリティ最終確認(権限テスト・共有トークン・R2 TTL)、負荷/メモリ確認
- **完了条件:** スマホにインストールでき、弱電波でも進捗登録できる

---

## 8. テスト方針(既存READMEのBeta方針を踏襲)

- テストは固定Betaデータのみ(Beta_Worker_01 / Beta_Client_01 / 2024-01)。本番データに触れない。
- テスト中の新規レコード作成は禁止、Betaデータの編集は許可 — この方針を `genba_*` にも適用し READMEに追記。
- tRPC手続きごとに権限テスト(担当外の更新が403になること、共有トークンが社内データを返さないこと)を最優先で書く。

---

## 9. リスクと対策(まとめ)

| リスク | 対策 |
|---|---|
| 1GB RAM 枯渇 | 画像はR2キーのみDB保存 / 画像処理はクライアント / ログ集計はDB / 全件フロント流し込み禁止 |
| 既存機能への影響 | `genba_` 名前空間で完全分離 / 既存テーブル・ルーター不変更 / merge のみ |
| 弱電波での使用不能 | PWAオフラインキャッシュ + 進捗登録アウトボックス |
| ソース・データ漏洩 | リポジトリprivate化 / 全mutationサーバー権限 / R2署名URL / 共有トークン期限 |
| 二重ユーザー管理 | 作業員を新設せず既存 `users` に一本化 |
| ポリゴン/写真の肥大化 | polygonはjsonで軽量 / 写真はR2 / DBには実体を置かない |

---

## 10. 次のアクション(このドキュメント承認後)

1. **リポジトリの private 化**(先行実施可)
2. フェーズ M1 の具体タスクを Claude Code 用の実装指示書に落とす(スキーマ確定 → マイグレーション → 骨組み)
3. 既存 `users` テーブルの実列と `appRole` の値を確認し、`isGenbaAdmin` の判定条件を確定
4. `shared/genba/catalog.ts`(電材・翻訳・ローマ字)をプロトタイプから切り出してPR

---

*本設計書は現場ビジョン プロトタイプ v13 を基準に作成。プロトタイプ側で仕様変更があった場合は本書も追随して更新する。*

---

# 変更履歴 v1.1(2026-07-06)

**リポジトリ実地調査の反映(clone確認済み)** — 以下は推測でなく実コードに基づく確定事項。

1. **⚠ リポジトリは依然 public。private化が未了(最優先)**
2. **権限3段階の実現方法を確定** — `users.appRole` に leader/worker/guest が既に存在。新カラムは作らず `genbaRoleOf()` マッピングで導出(super_admin/admin→管理者、manager/leader→リーダー、worker/guest→作業員)。アプリ内の権限変更UIは appRole の更新に接続。
3. **出面表連携の設計を簡素化** — 既存 `attendance` テーブルは projectId×workDate×hoursWorked(int×10, 80=1人工)で記録済み。`genba_budget_links` は廃止し、`genba_sites.projectId` + `genba_budgets.attendanceSource("manual"|"project")` に変更。project連携時は `SUM(hoursWorked)/80.0` で人工を自動集計。手入力分は `genba_budget_attendance`、導入前補正は `preManDays`。
4. **工期の自動提案** — `projects.startDate/endDate` が存在するため、projectId連携時に予算トラッカーの工期初期値を自動セット(M4)。
5. **常駐現場** — 予算トラッカーは genba_budgets.enabled による現場ごとオプトイン(プロトタイプv15準拠)。
6. **個人設定の永続化** — `genba_user_settings`(userId PK: theme/lang/color/guideSeen)を新設。テーマ・言語が端末をまたいで同期し、初回ガイド(オンボーディング)の既読管理に使用。
7. **サーバー資源前提の更新** — NAS RAMは8GB以上へ増設予定のため、進捗集計キャッシュ列は必須から任意へ格下げ(再帰CTE直計算で開始し、実測で判断)。画像のR2直PUT・base64禁止方針は据え置き(帯域・保守性のため)。
8. **現場単位のGoogle Drive図面リンク** — `genba_sites.driveUrl` を追加(v16実装反映)。外部共有ビューには返さない。
9. **監査** — genbaの全mutationは既存 `auditLogs`(safeAuditLog)に記録し、新設の `genba_activity_logs` は学習・提案用の軽量ログに限定して役割を分離。
