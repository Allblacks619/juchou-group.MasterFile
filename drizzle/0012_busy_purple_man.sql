CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` int,
	`projectId` int,
	`closingId` int,
	`invoiceId` int,
	`employeeId` int,
	`performedBy` int,
	`note` text,
	`payload` text,
	`performedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `closing_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closingId` int NOT NULL,
	`employeeId` int NOT NULL,
	`submissionStatus` enum('not_required','pending','submitted','approved','rejected') NOT NULL DEFAULT 'pending',
	`transportAmount` int NOT NULL DEFAULT 0,
	`expenseAmount` int NOT NULL DEFAULT 0,
	`receiptRequired` boolean NOT NULL DEFAULT false,
	`receiptUploaded` boolean NOT NULL DEFAULT false,
	`receiptFileUrl` text,
	`receiptFileName` varchar(512),
	`receiptFileKey` varchar(512),
	`receiptMimeType` varchar(128),
	`submittedAt` timestamp,
	`approvedAt` timestamp,
	`reviewedBy` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `closing_submissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `closing_submission_unique` UNIQUE(`closingId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `employee_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closingId` int NOT NULL,
	`employeeId` int NOT NULL,
	`paymentStatus` enum('pending','confirmed','paid') NOT NULL DEFAULT 'pending',
	`baseDaysTimes10` int NOT NULL DEFAULT 0,
	`baseAmount` int NOT NULL DEFAULT 0,
	`transportAmount` int NOT NULL DEFAULT 0,
	`expenseAmount` int NOT NULL DEFAULT 0,
	`adjustmentAmount` int NOT NULL DEFAULT 0,
	`totalAmount` int NOT NULL DEFAULT 0,
	`paidAt` timestamp,
	`paidBy` int,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_payment_unique` UNIQUE(`closingId`,`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `project_closings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`closingMonth` varchar(7) NOT NULL,
	`closingStatus` enum('open','ready','closed','locked') NOT NULL DEFAULT 'open',
	`notes` text,
	`closedAt` timestamp,
	`closedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_closings_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_closing_unique` UNIQUE(`projectId`,`closingMonth`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `receivedAmount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `receivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `invoices` ADD `receivedBy` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentMemo` text;