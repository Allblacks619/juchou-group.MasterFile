# 月締めV2・交通費・領収書・権限 監査レポート（引き継ぎメモ準拠）

作成: 2026-06-27 ／ 範囲: 既存実装の健全性確認（修正はしていません。ズレのみ報告）

## 総評

引き継ぎメモの重点項目に対し、既存実装は**おおむね準拠**。重大な違反は無し。軽微な改善点が3つ。

| # | メモの要点 | 判定 | 根拠 |
|---|---|---|---|
| A | 月締めV2は 対象月×現場 主軸（worker-first禁止） | ✅ | `AppMonthlyCloseV2.tsx:3`（現場カード＋参加者テーブル）、`routers.ts:3106`（現場内に参加者をネスト） |
| B | 交通費の支払元と取引先請求可否を別項目で持つ | ✅ | `routers.ts:3209-3210`（`payerType` と `clientBillable` が別入力）、読取側 `routers.ts:3187` |
| C | 交通費0円でも保存できる | ✅ | `amount: z.number().int().min(0).default(0)`（`routers.ts:3210`周辺） |
| D | 0円でも領収書アップロードできる | ✅ | 明細が無ければ `amount:0, clientBillable:false` で作成し領収書添付（`routers.ts:3248-3258`） |
| E | 領収書 PDF/JPEG/JPG/PNG | ✅ | `mimeType` enum＝pdf/jpeg/jpg/png（`routers.ts:3234`）＋`validateFile`（`shared/uploadValidation.ts`） |
| F | 客先直接支払の二重請求を防ぐ | ✅✅ | 集計で `isClientBillable=true AND paymentMethod<>'paid_by_client'`（`db.ts getMonthlyClosingV2ClientTransportationBillingSummary`、`routers.ts:3302`も同条件） |
| G | 取引先には作業員別・日別内訳を標準表示しない | ✅ | 集計は client/project 単位の合計のみ（worker/day を出さない） |
| H | 交通費内部情報の権限をAPI側で制御 | ✅ | 全交通費系が `monthlyClosingV2TransportationManagementProcedure`（admin/manager以上、worker/guest不可）`routers.ts:85-91` |
| I | 用語「出勤日数/〇日」（出面件数・人日を使わない） | ✅ | `AppMonthlyCloseV2.tsx:5`（出面件数 廃止）。人日/出面件数の使用なし |
| J | ゲストは表示するが集計対象外 | ⚠️ 概ねOK・要スポット確認 | `isGuest` フラグで表示、removed-guest マーカー除外機構あり（`routers.ts:76`）。交通費請求は workerId キーでゲストは自然に客先集計外 |

## 軽微な改善点（今すぐ直さなくてよい）

1. **ロールチェックの二重定義**：交通費の権限は `canManageMonthlyClosingV2Transportation`（手書きのロール文字列配列、`routers.ts:81`）で判定。別途 `isManagerLike`（正規化ベース、`_core/trpc.ts:54`）もある。現状は両者の挙動が一致するが、ロール追加時にズレる恐れ。**`isManagerLike` に統一**を推奨。
2. **webp の扱い**：`ALLOWED_MIME_TYPES` は webp を含む（`shared/uploadValidation.ts`）が、交通費領収書 endpoint の enum は pdf/jpeg/jpg/png に限定（メモ通り✅）。作業員請求書側の領収書（`routers.ts:1430`）は `validateFile` 経由で webp 許容。交通費はメモ準拠だが、**領収書全体の許容形式を方針として揃えるか**は要確認。
3. **ゲストの集計除外**：表示は `isGuest` で区別済み。**参加人数カウント・警告・バリデーションが `isGuest` を除外しているか**を画面/集計側でスポット確認推奨（客先交通費集計は workerId キーのため問題なし）。

## 結論

土台は健全でメモ準拠。**作業員請求書スレッド（Phase A-2）に進んで問題なし**。上記の軽微点は、必要なら別の小さいPRでフォロー可能。
