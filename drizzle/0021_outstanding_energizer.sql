ALTER TABLE `company_profile` ADD `logoSettings` json;--> statement-breakpoint
ALTER TABLE `worker_invoice_items` ADD `workerInvoiceItemCategory` enum('labor','transport','expense','materials','misc') DEFAULT 'labor' NOT NULL;--> statement-breakpoint
ALTER TABLE `worker_invoice_items` ADD `unit` varchar(32) DEFAULT '式' NOT NULL;--> statement-breakpoint
ALTER TABLE `worker_invoices` ADD CONSTRAINT `worker_invoice_number_unique` UNIQUE(`invoiceNumber`);