CREATE TABLE `project_closings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `projectId` int NOT NULL,
  `closingMonth` varchar(7) NOT NULL,
  `status` enum('open','ready','closed','locked') NOT NULL DEFAULT 'open',
  `notes` text,
  `closedAt` timestamp NULL,
  `closedBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `project_closings_id` PRIMARY KEY(`id`),
  CONSTRAINT `project_closing_unique` UNIQUE(`projectId`,`closingMonth`)
);

CREATE TABLE `closing_submissions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `closingId` int NOT NULL,
  `employeeId` int NOT NULL,
  `status` enum('not_required','pending','submitted','approved','rejected') NOT NULL DEFAULT 'pending',
  `transportAmount` int NOT NULL DEFAULT 0,
  `expenseAmount` int NOT NULL DEFAULT 0,
  `receiptRequired` boolean NOT NULL DEFAULT false,
  `receiptUploaded` boolean NOT NULL DEFAULT false,
  `submittedAt` timestamp NULL,
  `approvedAt` timestamp NULL,
  `reviewedBy` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `closing_submissions_id` PRIMARY KEY(`id`),
  CONSTRAINT `closing_submission_unique` UNIQUE(`closingId`,`employeeId`)
);
