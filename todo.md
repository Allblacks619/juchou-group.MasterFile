# 第1段階 TODO

## Phase 1: アップグレードとDB設計
- [x] web-db-userへのアップグレード
- [x] データベーススキーマ設計（users, invitations, company_profile, employees, qualifications, documents）
- [x] マイグレーション実行

## Phase 2: 招待制ログイン・権限管理
- [x] 3階層権限（admin, leader, worker）
- [x] 招待リンク生成（1時間有効、1回使用で無効化）
- [x] 招待時設定（ローマ字ID、仮パスワード、権限、メール）
- [x] 招待管理UI（作成フォーム、履歴一覧）
- [x] 権限チェック（admin/leader/worker）
- [x] ワンクリックコピー（招待リンク・ID・パスワード）
- [x] 初回ログイン時パスワード変更必須
- [x] パスワード変更機能（サイドバーから）

## Phase 3: 会社プロフィール設定
- [x] 会社基本情報（名前、住所、電話、メール、登録番号、適格請求事業者番号）
- [x] 振込先情報
- [x] ロゴ画像アップロード
- [x] 社印画像アップロード
- [x] ウォーターマーク画像アップロード
- [ ] 印影位置・サイズ調整設定

## Phase 4: 従業員プロフィール管理
- [x] 従業員CRUD API
- [x] 従業員一覧UI（検索・フィルタ）
- [x] 従業員詳細・編集UI（基本情報、在留、住所、保険、緊急連絡先、振込先）
- [x] 資格管理CRUD
- [x] 書類アップロード・管理
- [x] /app以下のルーティング設定
- [x] サイドバーナビゲーション
- [x] 認証チェック（ログイン必須）

## Phase 5: 作業員名簿PDF生成
- [ ] A4レイアウト（添付サンプル準拠）
- [ ] ウォーターマーク対応
- [ ] ロゴ・社印配置
- [ ] 資格一覧表示

## テスト
- [x] vitestテスト作成（認証・権限チェック14テスト全パス）

## バグ修正
- [x] /appページにアクセスしてもホームページが表示される問題を修正
- [x] ログインが正しく動作するようにする

## 独自認証システム（Manus OAuth廃止）
- [x] パスワードハッシュ（bcrypt）導入
- [x] DBスキーマにloginId/passwordHash/mustChangePasswordカラム追加
- [x] 独自ログインAPI（/api/auth/login）
- [x] 独自ログアウトAPI（/api/auth/logout）
- [x] 招待受諾API（/api/auth/accept-invite）- トークン検証、アカウント作成
- [x] パスワード変更API
- [x] セッション管理（JWT）
- [x] 管理者初期アカウント作成（ID: Mitsuro Oki / Pass: Paulodetarso7663）
- [x] カスタムログインページ（/app/login）
- [x] 招待受諾ページ（/app/invite/:token）
- [x] パスワード変更ページ（/app/change-password）
- [x] AppLayoutの認証ガードを独自認証に切り替え
- [x] Manus OAuthのログインボタンを削除
- [x] vitestテスト更新（29テスト全パス）
- [x] バグ: ログイン後にページ読み込みでログインページに戻される（リダイレクトループ）→ App.tsxルーティング修正、window.location.hrefでフルリロード
