# KNOWN ISSUES

最終更新: 2026-07-27

1. `pnpm build` は `index.html` の分析用環境変数プレースホルダ未設定による既存の非ブロッキング警告を出す（本リポジトリの設定変更対象外）。
2. `pnpm build` は本番バンドルで大きなチャンクサイズ警告を出すが、既存の事象であり本対応の範囲外。
3. `pnpm test` の `customAuth` 招待テストでは、DB利用不可に関する想定内の stderr が出力されるが、テスト自体はパスする（既存挙動）。
4. 未完了の機能フェーズ（2026-07-27 時点でコードを再確認して更新）:
   - **月締めV2 の領収書アップロード**: 実装済み・テスト済み（`AppMonthlyCloseV2.tsx` の `handleReceiptUpload` → `monthlyClosingV2.uploadTransportationReceipt` → `storagePut`、`server/monthlyClosingV2.dashboard.test.ts` でカバー）。プレースホルダではなくなったため解消。
   - **作業員請求書 Phase 4A**: 明細エディタ・単位/カテゴリ列・税率選択・PDFの社印は実装済み（`AppMyClosing.tsx` の `WorkerInvoiceSection`、`server/pdfWorkerInvoice.ts`）。ただし残課題あり:
     - ロゴは仕様上あえて未対応（`pdfWorkerInvoice.ts` 内の方針コメント: ロゴは取引先向け請求書のみに表示）。
     - 新PDF生成(`pdfWorkerInvoice.ts`)と旧PDF生成(`workerInvoicePdf.ts`)が併存し、`downloadMyInvoicePdf`/`exportMyInvoicePackage` は旧実装のまま（単位/カテゴリ/社印なし）。どちらかへの統一が未実施。
     - PDF生成自体の自動テストが無い。
   - **複数プロジェクト請求の選択ダイアログ**: UI実装済み（`AppInvoices.tsx` の「一括作成」ダイアログ、現場の複数選択 → `invoice.createFromAttendance`）。バックエンドも実装済み。ただしフロントエンドの自動テストがリポジトリに存在しない（`client/` 配下にテストファイル無し）。
