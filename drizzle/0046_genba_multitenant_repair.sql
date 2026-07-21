-- 修復マイグレーション: 0039_multitenant_genba が journal 上の when(=1785300000000) が
-- 既存の 0040/0041/0042(より新しい when) より古いため、本番の既存DBでは適用済み扱いでスキップされ、
-- genba_sites 等に companyId 列が追加されず、現場一覧/復元クエリが失敗していた(CIは新規DBのため検出不可)。
-- ここで最新 when + IF NOT EXISTS で冪等に追加する。新規DB(既に列あり)では no-op で安全。
ALTER TABLE `genba_sites` ADD COLUMN IF NOT EXISTS `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_material_presets` ADD COLUMN IF NOT EXISTS `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_task_templates` ADD COLUMN IF NOT EXISTS `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_activity_logs` ADD COLUMN IF NOT EXISTS `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_sites` ADD INDEX IF NOT EXISTS `genba_sites_company_idx` (`companyId`);
--> statement-breakpoint
ALTER TABLE `genba_activity_logs` ADD INDEX IF NOT EXISTS `genba_activity_logs_company_idx` (`companyId`);
