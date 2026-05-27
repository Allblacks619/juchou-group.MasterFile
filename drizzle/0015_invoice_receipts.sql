ALTER TABLE `invoices`
  ADD COLUMN IF NOT EXISTS `receivedAmount` int NOT NULL DEFAULT 0 AFTER `pdfUrl`,
  ADD COLUMN IF NOT EXISTS `receivedAt` timestamp NULL DEFAULT NULL AFTER `receivedAmount`,
  ADD COLUMN IF NOT EXISTS `receivedBy` int DEFAULT NULL AFTER `receivedAt`,
  ADD COLUMN IF NOT EXISTS `paymentMemo` text AFTER `receivedBy`;
