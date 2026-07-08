CREATE TABLE `worker_advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`entryType` enum('advance','repayment','adjustment') NOT NULL,
	`amount` int NOT NULL,
	`reason` varchar(255),
	`relatedPaymentId` int,
	`closingMonth` varchar(7),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `worker_advances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `worker_advance_employee_idx` ON `worker_advances` (`employeeId`);
--> statement-breakpoint
CREATE INDEX `worker_advance_payment_idx` ON `worker_advances` (`relatedPaymentId`);
