ALTER TABLE `attendance` MODIFY COLUMN `employeeId` int;--> statement-breakpoint
ALTER TABLE `employee_rates` MODIFY COLUMN `employeeId` int;--> statement-breakpoint
ALTER TABLE `attendance` ADD `guestName` varchar(128);--> statement-breakpoint
ALTER TABLE `attendance` ADD `attendanceShiftType` enum('day','night') DEFAULT 'day' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_rates` ADD `shiftType` enum('day','night') DEFAULT 'day' NOT NULL;