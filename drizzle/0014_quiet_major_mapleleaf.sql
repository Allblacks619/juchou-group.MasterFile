CREATE TABLE `worker_base_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`workerBaseRateShiftType` enum('day','night') NOT NULL DEFAULT 'day',
	`workerRate` int NOT NULL,
	`effectiveFrom` timestamp,
	`effectiveUntil` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `worker_base_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `worker_base_rate_lookup` UNIQUE(`employeeId`,`workerBaseRateShiftType`,`effectiveFrom`)
);
