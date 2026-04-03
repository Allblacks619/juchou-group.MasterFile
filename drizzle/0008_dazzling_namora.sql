CREATE TABLE `project_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`employeeId` int NOT NULL,
	`projectRole` varchar(64),
	`isActive` boolean NOT NULL DEFAULT true,
	`addedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_profile` MODIFY COLUMN `invoiceIssuerNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `documentType` enum('drivers_license','residence_card','passport','health_check','qualification_cert','id_document','stamp','invoice','receipt','other','residence_card_front','residence_card_back','drivers_license_front','drivers_license_back','insurance_card','pension_book','ccus_card') NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` MODIFY COLUMN `createdBy` int;--> statement-breakpoint
ALTER TABLE `employees` ADD `insuranceNumberType` enum('workers_comp','employment');--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `itemType` enum('normal','text') DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `itemTaxRate` int DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_items` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `internalMemo` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `honorific` varchar(16) DEFAULT '御中';--> statement-breakpoint
ALTER TABLE `invoices` ADD `subNumber` varchar(32);--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentMethod` varchar(64) DEFAULT '口座振込';--> statement-breakpoint
ALTER TABLE `invoices` ADD `showSeal` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `showLogo` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `withholding` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `withholdingAmount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `qualifications` ADD `certificateFileUrl` text;--> statement-breakpoint
ALTER TABLE `qualifications` ADD `certificateFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `company_profile` DROP COLUMN `representativeName`;