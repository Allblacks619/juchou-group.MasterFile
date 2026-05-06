-- Phase 4A: Add unit and category columns to worker_invoice_items
ALTER TABLE `worker_invoice_items` ADD COLUMN `unit` VARCHAR(32) DEFAULT '式' AFTER `quantity`;
ALTER TABLE `worker_invoice_items` ADD COLUMN `category` ENUM('labor','transport','expense','materials','misc') DEFAULT 'labor' AFTER `itemType`;
