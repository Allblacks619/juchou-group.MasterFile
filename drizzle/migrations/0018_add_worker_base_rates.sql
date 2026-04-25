CREATE TABLE `worker_base_rates` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `employeeId` int NOT NULL,
  `shiftType` enum('day','night') NOT NULL DEFAULT 'day',
  `workerRate` int NOT NULL,
  `effectiveFrom` timestamp NULL,
  `effectiveUntil` timestamp NULL,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
