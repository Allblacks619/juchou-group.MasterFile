-- コネクト層 (会社間連携) Phase 2 基盤 (docs/multitenant/PLAN_v1.md §2.3-§2.6)
-- 新テーブルのみ + genba_site_workers への名寄せ列加算。既存データ・既存動作への影響なし。
-- 全機能は MULTI_TENANT フラグ(既定off)配下。
CREATE TABLE `partner_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterCompanyId` int NOT NULL,
	`addresseeCompanyId` int,
	`pairMinCompanyId` int,
	`pairMaxCompanyId` int,
	`partnerLinkStatus` enum('invited','accepted','rejected','suspended') NOT NULL DEFAULT 'invited',
	`token` varchar(64) NOT NULL,
	`invitedBy` int,
	`acceptedBy` int,
	`acceptedAt` timestamp,
	`suspendedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partner_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `partner_links_token` UNIQUE(`token`),
	CONSTRAINT `partner_links_pair_unique` UNIQUE(`pairMinCompanyId`,`pairMaxCompanyId`)
);
--> statement-breakpoint
CREATE INDEX `partner_links_requester_idx` ON `partner_links` (`requesterCompanyId`);
--> statement-breakpoint
CREATE INDEX `partner_links_addressee_idx` ON `partner_links` (`addresseeCompanyId`);
--> statement-breakpoint
CREATE TABLE `partner_link_client_maps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerLinkId` int NOT NULL,
	`companyId` int NOT NULL,
	`clientId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partner_link_client_maps_id` PRIMARY KEY(`id`),
	CONSTRAINT `partner_link_client_maps_unique` UNIQUE(`partnerLinkId`,`companyId`,`clientId`)
);
--> statement-breakpoint
CREATE INDEX `partner_link_client_maps_company_idx` ON `partner_link_client_maps` (`companyId`,`clientId`);
--> statement-breakpoint
CREATE TABLE `partner_roster_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerLinkId` int NOT NULL,
	`fromCompanyId` int NOT NULL,
	`toCompanyId` int NOT NULL,
	`projectRef` varchar(256),
	`toGenbaSiteId` varchar(24),
	`version` int NOT NULL DEFAULT 1,
	`supersedesId` int,
	`rosterSubmissionStatus` enum('submitted','received','registered','returned','superseded') NOT NULL DEFAULT 'submitted',
	`workerSetJson` json NOT NULL,
	`pdfKeysJson` json,
	`returnReason` text,
	`submittedBy` int,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partner_roster_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `partner_roster_submissions_link_idx` ON `partner_roster_submissions` (`partnerLinkId`);
--> statement-breakpoint
CREATE INDEX `partner_roster_submissions_from_idx` ON `partner_roster_submissions` (`fromCompanyId`,`rosterSubmissionStatus`);
--> statement-breakpoint
CREATE INDEX `partner_roster_submissions_to_idx` ON `partner_roster_submissions` (`toCompanyId`,`rosterSubmissionStatus`);
--> statement-breakpoint
CREATE TABLE `partner_roster_workers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`employeeRef` int NOT NULL,
	`displayName` varchar(128) NOT NULL,
	`ccusNumber` varchar(64),
	`rosterWorkerStatus` enum('pending','registered','returned') NOT NULL DEFAULT 'pending',
	`returnReason` text,
	`matchedSiteWorkerId` varchar(24),
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partner_roster_workers_id` PRIMARY KEY(`id`),
	CONSTRAINT `partner_roster_workers_unique` UNIQUE(`submissionId`,`employeeRef`)
);
--> statement-breakpoint
CREATE INDEX `partner_roster_workers_submission_idx` ON `partner_roster_workers` (`submissionId`,`rosterWorkerStatus`);
--> statement-breakpoint
ALTER TABLE `genba_site_workers` ADD `externalCompanyId` int;
--> statement-breakpoint
ALTER TABLE `genba_site_workers` ADD `externalEmployeeRef` int;
--> statement-breakpoint
ALTER TABLE `genba_site_workers` ADD `ccusNumber` varchar(64);
