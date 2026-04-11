CREATE TABLE IF NOT EXISTS `employee_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `closingId` int NOT NULL,
  `employeeId` int NOT NULL,
  `paymentStatus` enum('pending','confirmed','paid') NOT NULL DEFAULT 'pending',
  `baseDaysTimes10` int NOT NULL DEFAULT 0,
  `baseAmount` int NOT NULL DEFAULT 0,
  `transportAmount` int NOT NULL DEFAULT 0,
  `expenseAmount` int NOT NULL DEFAULT 0,
  `adjustmentAmount` int NOT NULL DEFAULT 0,
  `totalAmount` int NOT NULL DEFAULT 0,
  `paidAt` timestamp NULL DEFAULT NULL,
  `paidBy` int DEFAULT NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_payment_unique` (`closingId`,`employeeId`)
);
