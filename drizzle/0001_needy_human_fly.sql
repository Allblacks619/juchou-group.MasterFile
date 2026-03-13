CREATE TABLE `company_profile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(256) NOT NULL,
	`postalCode` varchar(16),
	`address` text,
	`phone` varchar(32),
	`email` varchar(320),
	`registrationNumber` varchar(64),
	`invoiceIssuerNumber` varchar(32),
	`representativeName` varchar(128),
	`bankName` varchar(128),
	`branchName` varchar(128),
	`accountType` enum('ordinary','checking') DEFAULT 'ordinary',
	`accountNumber` varchar(32),
	`accountHolder` varchar(128),
	`logoUrl` text,
	`sealUrl` text,
	`watermarkUrl` text,
	`sealSettings` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_profile_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`documentType` enum('residence_card','passport','health_check','qualification_cert','id_document','stamp','invoice','receipt','other') NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`expiryDate` timestamp,
	`docStatus` enum('valid','renewing','renewed','expired') NOT NULL DEFAULT 'valid',
	`notes` text,
	`uploadedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`nameKana` varchar(128),
	`nameKanji` varchar(128) NOT NULL,
	`nameRomaji` varchar(128),
	`experienceYears` int,
	`dateOfBirth` timestamp,
	`bloodType` enum('A','B','AB','O'),
	`gender` enum('male','female'),
	`photoUrl` text,
	`nationality` varchar(64) NOT NULL DEFAULT '日本',
	`residenceStatus` varchar(128),
	`residenceCardNumber` varchar(32),
	`residenceCardExpiry` timestamp,
	`passportNumber` varchar(32),
	`passportExpiry` timestamp,
	`postalCode` varchar(16),
	`address` text,
	`phone` varchar(32),
	`email` varchar(320),
	`healthCheckDate` timestamp,
	`healthInsuranceNumber` varchar(64),
	`insuranceType` enum('national','social','construction'),
	`workersCompNumber` varchar(64),
	`pensionNumber` varchar(64),
	`careerUpNumber` varchar(64),
	`employmentType` enum('sole_proprietor','employee','other'),
	`emergencyNameKana` varchar(128),
	`emergencyNameKanji` varchar(128),
	`emergencyRelationship` varchar(64),
	`emergencyPostalCode` varchar(16),
	`emergencyAddress` text,
	`emergencyPhone` varchar(32),
	`bankName` varchar(128),
	`branchName` varchar(128),
	`empAccountType` enum('ordinary','checking') DEFAULT 'ordinary',
	`accountNumber` varchar(32),
	`accountHolder` varchar(128),
	`isInvoiceIssuer` boolean NOT NULL DEFAULT false,
	`invoiceIssuerNumber` varchar(32),
	`stampUrl` text,
	`height` int,
	`weight` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(128) NOT NULL,
	`loginId` varchar(128) NOT NULL,
	`tempPassword` varchar(256) NOT NULL,
	`assignedRole` enum('admin','leader','worker') NOT NULL DEFAULT 'worker',
	`recipientEmail` varchar(320),
	`status` enum('pending','used','expired') NOT NULL DEFAULT 'pending',
	`emailSent` boolean NOT NULL DEFAULT false,
	`createdBy` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`usedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitations_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `qualifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`name` varchar(256) NOT NULL,
	`obtainedDate` timestamp,
	`certificateNumber` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qualifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `appRole` enum('admin','leader','worker') DEFAULT 'worker' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `loginId` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD `mustChangePassword` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `employeeId` int;