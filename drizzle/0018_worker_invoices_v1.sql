CREATE TABLE `worker_invoices` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `closingId` int NOT NULL,
  `submissionId` int NOT NULL,
  `projectId` int NOT NULL,
  `employeeId` int NOT NULL,
  `closingMonth` varchar(7) NOT NULL,
  `status` enum('draft','submitted','returned','approved','locked') NOT NULL DEFAULT 'draft',
  `invoiceNumber` varchar(64),
  `issueDate` timestamp NULL,
  `subject` text,
  `notes` text,
  `subtotalAmount` int NOT NULL DEFAULT 0,
  `taxAmount` int NOT NULL DEFAULT 0,
  `totalAmount` int NOT NULL DEFAULT 0,
  `submittedAt` timestamp NULL,
  `approvedAt` timestamp NULL,
  `approvedBy` int NULL,
  `returnedAt` timestamp NULL,
  `returnedBy` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `worker_invoice_unique` (`closingId`,`employeeId`)
);

CREATE TABLE `worker_invoice_items` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `workerInvoiceId` int NOT NULL,
  `itemType` enum('normal','text') NOT NULL DEFAULT 'normal',
  `label` text NOT NULL,
  `quantity` int NOT NULL DEFAULT 1,
  `unitPrice` int NOT NULL DEFAULT 0,
  `amount` int NOT NULL DEFAULT 0,
  `taxRate` int NOT NULL DEFAULT 10,
  `sortOrder` int NOT NULL DEFAULT 0,
  `metadataJson` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `worker_invoice_snapshots` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `workerInvoiceId` int NOT NULL,
  `snapshotVersion` int NOT NULL DEFAULT 1,
  `snapshotJson` text NOT NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `invoice_supporting_documents` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
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
  `uploadedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
