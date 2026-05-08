CREATE TABLE `closing_submission_documents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `submissionId` int NOT NULL,
  `projectId` int NOT NULL,
  `employeeId` int NOT NULL,
  `closingMonth` varchar(7) NOT NULL,
  `fileName` varchar(512) NOT NULL,
  `fileUrl` text NOT NULL,
  `fileKey` varchar(512) NOT NULL,
  `mimeType` varchar(128) NOT NULL,
  `fileSize` int NOT NULL,
  `documentType` enum('receipt','company_card','etc','other') NOT NULL DEFAULT 'receipt',
  `uploadedByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `closing_submission_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `closing_submission_documents_submission_idx` ON `closing_submission_documents` (`submissionId`);
--> statement-breakpoint
CREATE INDEX `closing_submission_documents_project_month_idx` ON `closing_submission_documents` (`projectId`,`closingMonth`);
--> statement-breakpoint
CREATE INDEX `closing_submission_documents_employee_idx` ON `closing_submission_documents` (`employeeId`);
