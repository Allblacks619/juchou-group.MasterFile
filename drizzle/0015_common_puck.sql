ALTER TABLE `employee_rates` MODIFY COLUMN `projectId` int;--> statement-breakpoint
ALTER TABLE `employee_rates` ADD `rateScopeType` enum('project','client') DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_rates` ADD `clientId` int;