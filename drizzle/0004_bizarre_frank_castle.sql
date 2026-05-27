CREATE TABLE `attendance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`projectId` int NOT NULL,
	`workDate` timestamp NOT NULL,
	`hoursWorked` int NOT NULL DEFAULT 80,
	`overtimeHours` int NOT NULL DEFAULT 0,
	`workType` enum('normal','half_day','overtime','holiday','absence') NOT NULL DEFAULT 'normal',
	`notes` text,
	`enteredBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`)
);
