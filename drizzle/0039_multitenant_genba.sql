-- マルチテナント化 Phase 1c (docs/multitenant/PLAN_v1.md)
-- genba にテナント境界を追加。genba 階層は genba_sites をルートに siteId で辿るため、
-- 会社境界の正本は genba_sites.companyId のみ。子テーブル(floor/zone/task 等)は siteId 経由で会社に属する。
-- site を持たない全社横断テーブル(task_templates / material_presets の null-site / activity_logs)にのみ
-- companyId を直付けする。加算のみ・既定会社=1。MULTI_TENANT フラグ(既定off)の間は無稼働で現行動作と完全互換。
ALTER TABLE `genba_sites` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_material_presets` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_task_templates` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `genba_activity_logs` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `genba_sites_company_idx` ON `genba_sites` (`companyId`);
--> statement-breakpoint
CREATE INDEX `genba_activity_logs_company_idx` ON `genba_activity_logs` (`companyId`);
