-- マルチテナント化 Phase 1b (docs/multitenant/PLAN_v1.md)
-- 業務テーブルへ companyId を加算（NOT NULL DEFAULT 1）。既存データは既定会社=1 に属する。
-- 加算のみ・バックフィル不要。MULTI_TENANT フラグ(既定off)の間は無稼働で現行動作と完全互換。
ALTER TABLE `employee_rates` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `worker_base_rates` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `attendance` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `project_closings` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `closing_submissions` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `employee_payments` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `worker_invoices` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `monthly_closing_v2_worker_submissions` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `monthly_closing_v2_project_reviews` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `monthly_closing_v2_participant_reviews` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `monthly_closing_v2_expense_lines` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `worker_advances` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `attendance_company_idx` ON `attendance` (`companyId`);
--> statement-breakpoint
CREATE INDEX `invoices_company_idx` ON `invoices` (`companyId`);
--> statement-breakpoint
CREATE INDEX `audit_logs_company_idx` ON `audit_logs` (`companyId`);
