CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`invoiceIssuerNumber` varchar(14),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `companies` (`id`, `name`, `notes`) VALUES (1, '既定会社（自社）', 'マルチテナント化 Phase 1a: 既存データはすべて本テナントに属する');
--> statement-breakpoint
ALTER TABLE `users` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `users_company_idx` ON `users` (`companyId`);
--> statement-breakpoint
ALTER TABLE `invitations` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `invitations_company_idx` ON `invitations` (`companyId`);
--> statement-breakpoint
ALTER TABLE `employees` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `employees_company_idx` ON `employees` (`companyId`);
--> statement-breakpoint
ALTER TABLE `clients` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `clients_company_idx` ON `clients` (`companyId`);
--> statement-breakpoint
ALTER TABLE `projects` ADD `companyId` int NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE INDEX `projects_company_idx` ON `projects` (`companyId`);
