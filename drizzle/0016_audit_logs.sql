CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `action` varchar(128) NOT NULL,
  `entityType` varchar(64) NOT NULL,
  `entityId` int DEFAULT NULL,
  `projectId` int DEFAULT NULL,
  `closingId` int DEFAULT NULL,
  `invoiceId` int DEFAULT NULL,
  `employeeId` int DEFAULT NULL,
  `performedBy` int DEFAULT NULL,
  `note` text DEFAULT NULL,
  `payload` text DEFAULT NULL,
  `performedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
