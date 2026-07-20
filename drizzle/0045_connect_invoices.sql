-- コネクト層 Phase 3: 会社間 請求書提出 + 出面確認 + 買掛 (docs/multitenant/PLAN_v1.md §2.4)
-- 新テーブルのみ。既存データ・既存動作への影響なし。全機能 MULTI_TENANT フラグ(既定off)配下。
CREATE TABLE `partner_invoice_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`partnerLinkId` int NOT NULL,
	`fromCompanyId` int NOT NULL,
	`toCompanyId` int NOT NULL,
	`invoiceRef` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`supersedesId` int,
	`billingPeriodFrom` varchar(10),
	`billingPeriodTo` varchar(10),
	`invoiceSubmissionStatus` enum('submitted','received','under_review','approved','returned','superseded') NOT NULL DEFAULT 'submitted',
	`snapshotJson` json NOT NULL,
	`submittedAmount` int NOT NULL,
	`approvedAmount` int,
	`adjustmentsJson` json,
	`pdfKeysJson` json,
	`returnReason` text,
	`submittedBy` int,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partner_invoice_submissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `partner_invoice_submissions_link_idx` ON `partner_invoice_submissions` (`partnerLinkId`);
--> statement-breakpoint
CREATE INDEX `partner_invoice_submissions_from_idx` ON `partner_invoice_submissions` (`fromCompanyId`,`invoiceSubmissionStatus`);
--> statement-breakpoint
CREATE INDEX `partner_invoice_submissions_to_idx` ON `partner_invoice_submissions` (`toCompanyId`,`invoiceSubmissionStatus`);
--> statement-breakpoint
CREATE TABLE `partner_payables` (
	`id` int AUTO_INCREMENT NOT NULL,
	`submissionId` int NOT NULL,
	`companyId` int NOT NULL,
	`counterpartyCompanyId` int NOT NULL,
	`amount` int NOT NULL,
	`partnerPayableStatus` enum('unpaid','scheduled','paid') NOT NULL DEFAULT 'unpaid',
	`scheduledDate` varchar(10),
	`paidAt` timestamp,
	`paidBy` int,
	`memo` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partner_payables_id` PRIMARY KEY(`id`),
	CONSTRAINT `partner_payables_submission_unique` UNIQUE(`submissionId`)
);
--> statement-breakpoint
CREATE INDEX `partner_payables_company_idx` ON `partner_payables` (`companyId`,`partnerPayableStatus`);
