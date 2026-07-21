# マルチテナント検証環境 と 本番ロールアウト手順（正本）

- 対象: docs/multitenant/PLAN_v1.md の Phase 5（有効化判断）前の実操作確認と、本番で `MULTI_TENANT=true` にする際の手順。
- 大原則: **本番は現状のまま**。検証は必ず別DB・別インスタンスで行う。

---

## 1. 検証インスタンスの立て方

### A. ローカル（推奨・最速）
```bash
# 1) 検証用DBを用意（本番と別のDB名にする）
mysql -e "CREATE DATABASE juchou_mtsim_verify"

# 2) マイグレーション適用
DATABASE_URL="mysql://user:pass@127.0.0.1:3306/juchou_mtsim_verify" node scripts/migrate.mjs

# 3) 検証シード（架空3社 + 両社の管理者アカウント + 突合デモ出面）
DATABASE_URL="mysql://user:pass@127.0.0.1:3306/juchou_mtsim_verify" npx tsx scripts/seedMtSimVerify.ts

# 4) フラグ on で起動
DATABASE_URL="mysql://user:pass@127.0.0.1:3306/juchou_mtsim_verify" MULTI_TENANT=true pnpm dev
```

### B. VPS 別ポート（実機で触りたい場合）
`/opt/juchou` の compose を**コピーした別ディレクトリ**（例 `/opt/juchou-verify`）で、以下だけ変えて起動する:
- `app` の公開ポートを別番号（例 3100）に
- `DATABASE_URL` を検証用DB（別スキーマ or 別コンテナ）に
- 環境変数 `MULTI_TENANT=true` を追加
- Watchtower ラベルは**外す**（勝手に更新させない）

> 注意: 本番 compose・本番DBには一切触れない。検証が終わったらディレクトリごと停止・削除してよい。

### ログイン情報（シード後）
| 役 | 会社 | loginId | password |
|---|---|---|---|
| 乙島電業（自社役） | 1 | `mtsim-otsu-admin` | `Mtsim#2025` |
| 甲野電設（元請役） | 2 | `mtsim-kono-admin` | `Mtsim#2025` |

---

## 2. ウォークスルー台本（一連の流れを両社の視点で）

1. **乙島でログイン** → メニューに「会社間連携」が出ることを確認（フラグonの証）。現場・取引先・従業員一覧に MTSIM データが見える。
2. 連携管理タブ → 取引先「MTSIM 甲野電設株式会社」を選んで**招待URLを発行**しコピー。
3. **別ブラウザ/シークレットで甲野でログイン** → 連携管理タブの「招待を受け取った場合」にURLを貼って**承諾** → 双方の一覧が「連携中」になる。
4. 乙島: 名簿提出タブ → 連携先=甲野、従業員2名（乙島一郎/二郎）を選んで**名簿を提出**。
5. 甲野: 名簿受領タブ → 着信を確認 →「受領して確認開始」→ 一郎を**受理**、二郎を**差戻し**（理由入力）。
6. 乙島: 名簿提出タブで差戻し理由を確認 →「修正して再提出」（第2版になる）→ 甲野で受理 → 全員登録完了。
7. 乙島: 請求書画面で 2025-02 の取引先請求書を作成（既存フローのまま）→ 請求提出タブから**甲野へ提出**。
8. 甲野: 請求受領タブ → 明細を確認 →「自社の現場と突合」で **MTSIM 甲野側受入現場** を選択 → 2/3=一致・**2/10=時間不一致（申告6.0h vs 自社4.0h）**・2/17=相手側に無し、が色付きで出ることを確認。
9. 甲野: **査定して承認** → 控除に「協力会費 5,000」を入れて承認額プレビューを確認 → 承認 → 下部の**買掛**に承認額で起票される →「支払済みにする」。
10. 乙島: 請求提出タブ → 承認額・控除内訳・**相手の支払: 支払済み** が見えることを確認。
11. **境界確認**: 甲野ログインのまま乙島の現場ID・従業員IDを直接URL/操作で参照 → NOT_FOUND/FORBIDDEN になること。乙島の一覧に甲野側受入現場が**混ざらない**こと。

問題（実務との違和感・不足）は docs/multitenant/PLAN_v1.md の該当フェーズに追記して潰す。

---

## 3. 本番ロールアウト手順（MULTI_TENANT=true にする日）

> **最重要（オーナー指摘）**: 会社フィルタは users.companyId を起点に効く。**既存ユーザー＝会社1（および既存の現場・案件・出面＝会社1）が揃っていない状態でフラグを on にすると、既存の現場が“消えたように”見える**。必ず事前整合チェックを通してから on にすること。

### 3-1. 事前整合チェック（フラグ on の前に必ず実行）
```sql
-- (1) 会社1以外に属する行が「意図したものだけ」であることを確認（検証で作った会社2/3のデータが本番に無いこと）
SELECT 'users' t, companyId, COUNT(*) FROM users GROUP BY companyId
UNION ALL SELECT 'employees', companyId, COUNT(*) FROM employees GROUP BY companyId
UNION ALL SELECT 'clients', companyId, COUNT(*) FROM clients GROUP BY companyId
UNION ALL SELECT 'projects', companyId, COUNT(*) FROM projects GROUP BY companyId
UNION ALL SELECT 'attendance', companyId, COUNT(*) FROM attendance GROUP BY companyId
UNION ALL SELECT 'invoices', companyId, COUNT(*) FROM invoices GROUP BY companyId
UNION ALL SELECT 'genba_sites', companyId, COUNT(*) FROM genba_sites GROUP BY companyId;
-- 期待: 本番はすべて companyId=1 のみ（1以外が出たら原因を特定してから進む）

-- (2) ユーザーと現場の所属ズレ（“現場が消える”の直接原因）ゼロ確認
SELECT COUNT(*) FROM users WHERE companyId <> 1;
SELECT COUNT(*) FROM genba_sites gs LEFT JOIN projects p ON p.id = gs.projectId
 WHERE p.id IS NOT NULL AND gs.companyId <> p.companyId;  -- site↔project の会社不一致 = 0 のこと
```

### 3-2. 既存現場を他社テナントへ移す場合（任意・該当時のみ）
「この現場は実は相手会社のもの」として移行するときは、**片方だけ動かさない**。
- 移すもの一式: `genba_sites.companyId` と、紐づく `projects.companyId`・その現場の `attendance.companyId`・関係する `clients` 行。
- 見る人も一緒に: その現場を見るべきユーザーの `users.companyId` を移行先へ（移さないユーザーからは現場が見えなくなるのが正しい挙動）。
- 移行SQLは対象を id 指定で明示し、実行前に SELECT で件数確認 → バックアップ取得 → 実行。

### 3-3. 有効化手順
1. DBバックアップを取得（通常の日次に加えて直前スナップショット）。
2. `/opt/juchou` の環境変数に `MULTI_TENANT=true` を追加し `docker compose up -d`。
3. スモークテスト: オーナーでログイン → ダッシュボード・現場一覧・出面・請求書一覧・genba が**従来どおり全件見える**こと（全データ会社1・オーナー会社1なので変化ゼロが正）。
4. 「会社間連携」メニューが表示されることを確認（機能はまだ相手不在で空）。

### 3-4. 2社目テナントを作る時（審議#5 の時限措置解除）
- 2社目の companies 行を作成する**その時**に: 全セッション失効（全ユーザー再ログイン）を告知のうえ実施し、companyId 未設定トークンの既定会社フォールバックを廃止する（コード変更・別PR）。
- 相手会社の管理者は招待経由で作成し、`users.companyId` が相手会社になっていることを確認。

### 3-5. ロールバック
- 環境変数 `MULTI_TENANT` を外して `docker compose up -d` するだけ（データ変更はないため即時・無損失で従来動作に戻る）。
