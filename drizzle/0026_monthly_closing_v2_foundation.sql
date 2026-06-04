CREATE TABLE `monthly_closing_v2_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closingBatchId` varchar(64) NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`clientId` int,
	`projectId` int,
	`workerId` int,
	`status` enum('open','ready_to_close','closed','unlocked') NOT NULL DEFAULT 'open',
	`isLocked` boolean NOT NULL DEFAULT false,
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_closing_v2_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_closing_v2_batches_closingBatchId_unique` UNIQUE(`closingBatchId`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_batches_month_idx` ON `monthly_closing_v2_batches` (`targetMonth`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_batches_scope_idx` ON `monthly_closing_v2_batches` (`clientId`,`projectId`,`workerId`);
--> statement-breakpoint
CREATE TABLE `monthly_closing_v2_worker_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`status` enum('not_submitted','submitted','sent_back','accepted','ready_to_close','closed') NOT NULL DEFAULT 'not_submitted',
	`sendBackReason` text,
	`submittedAt` timestamp,
	`acceptedAt` timestamp,
	`acceptedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_closing_v2_worker_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_closing_v2_worker_month_unique` UNIQUE(`workerId`,`targetMonth`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_worker_submissions_status_idx` ON `monthly_closing_v2_worker_submissions` (`status`);
--> statement-breakpoint
CREATE TABLE `monthly_closing_v2_expense_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerId` int NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`projectId` int,
	`expenseDate` timestamp,
	`expenseType` enum('transportation','other') NOT NULL DEFAULT 'transportation',
	`amount` int NOT NULL DEFAULT 0,
	`paymentMethod` enum('paid_by_worker','company_card','etc','paid_by_client','other') NOT NULL DEFAULT 'paid_by_worker',
	`allocationMethod` enum('manual','daily','project_specific','monthly_attendance_allocation') NOT NULL DEFAULT 'manual',
	`isClientBillable` boolean NOT NULL DEFAULT true,
	`memo` text,
	`status` enum('draft','submitted','accepted','sent_back','locked') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_closing_v2_expense_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_expense_worker_month_idx` ON `monthly_closing_v2_expense_lines` (`workerId`,`targetMonth`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_expense_project_month_idx` ON `monthly_closing_v2_expense_lines` (`projectId`,`targetMonth`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_expense_status_idx` ON `monthly_closing_v2_expense_lines` (`status`);
--> statement-breakpoint
CREATE TABLE `monthly_closing_v2_expense_line_receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`expenseLineId` int NOT NULL,
	`workerId` int NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`projectId` int,
	`receiptFileKey` varchar(512) NOT NULL,
	`receiptFileUrl` text NOT NULL,
	`originalFileName` varchar(512) NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`uploadedBy` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthly_closing_v2_expense_line_receipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_closing_v2_receipt_file_key_unique` UNIQUE(`receiptFileKey`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_receipts_expense_idx` ON `monthly_closing_v2_expense_line_receipts` (`expenseLineId`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_receipts_worker_month_idx` ON `monthly_closing_v2_expense_line_receipts` (`workerId`,`targetMonth`);
--> statement-breakpoint
CREATE TABLE `monthly_closing_v2_generated_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`closingBatchId` varchar(64),
	`workerId` int,
	`clientId` int,
	`projectId` int,
	`documentType` enum('worker_invoice','monthly_work_report','client_invoice') NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`originalFileName` varchar(512),
	`generatedBy` int,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	`snapshotVersion` int NOT NULL DEFAULT 1,
	`snapshotJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthly_closing_v2_generated_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_documents_month_type_idx` ON `monthly_closing_v2_generated_documents` (`targetMonth`,`documentType`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_documents_batch_idx` ON `monthly_closing_v2_generated_documents` (`closingBatchId`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_documents_scope_idx` ON `monthly_closing_v2_generated_documents` (`workerId`,`clientId`,`projectId`);
