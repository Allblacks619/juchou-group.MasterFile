-- コネクト層 Phase 4 PR2: 入金/支払の対称表示 (docs/multitenant/PLAN_v1.md §2.6-5)
-- 提出側の入金状況を submission に反映し、受領側の受領箱に表示する（強制同期はしない）。
-- 列追加のみ。既存データ・既存動作への影響なし。全機能 MULTI_TENANT フラグ(既定off)配下。
ALTER TABLE `partner_invoice_submissions` ADD COLUMN `submitterPaymentStatus` enum('partial','paid') DEFAULT NULL;
--> statement-breakpoint
ALTER TABLE `partner_invoice_submissions` ADD COLUMN `submitterPaidAt` timestamp NULL DEFAULT NULL;
