CREATE TABLE `invoice_supporting_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`closingId` int,
	`submissionId` int,
	`employeeId` int,
	`workerInvoiceId` int,
	`closingMonth` varchar(7) NOT NULL,
	`category` varchar(64),
	`fileUrl` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`originalFileName` varchar(512) NOT NULL,
	`mimeType` varchar(128),
	`uploadedByEmployeeId` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_supporting_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerInvoiceId` int NOT NULL,
	`workerInvoiceItemType` enum('normal','text') NOT NULL DEFAULT 'normal',
	`label` text NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` int NOT NULL DEFAULT 0,
	`amount` int NOT NULL DEFAULT 0,
	`taxRate` int NOT NULL DEFAULT 10,
	`sortOrder` int NOT NULL DEFAULT 0,
	`metadataJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_invoice_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workerInvoiceId` int NOT NULL,
	`snapshotVersion` int NOT NULL DEFAULT 1,
	`snapshotJson` text NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `worker_invoice_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `worker_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`closingId` int NOT NULL,
	`submissionId` int NOT NULL,
	`projectId` int NOT NULL,
	`employeeId` int NOT NULL,
	`closingMonth` varchar(7) NOT NULL,
	`workerInvoiceStatus` enum('draft','submitted','returned','approved','locked') NOT NULL DEFAULT 'draft',
	`invoiceNumber` varchar(64),
	`issueDate` timestamp,
	`subject` text,
	`notes` text,
	`subtotalAmount` int NOT NULL DEFAULT 0,
	`taxAmount` int NOT NULL DEFAULT 0,
	`totalAmount` int NOT NULL DEFAULT 0,
	`submittedAt` timestamp,
	`approvedAt` timestamp,
	`approvedBy` int,
	`returnedAt` timestamp,
	`returnedBy` int,
	`returnReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_invoice_unique` UNIQUE(`closingId`,`employeeId`)
);
