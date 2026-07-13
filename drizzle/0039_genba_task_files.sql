CREATE TABLE `genba_task_files` (
	`id` varchar(24) NOT NULL,
	`taskId` varchar(24) NOT NULL,
	`genbaTaskFileKind` enum('link','upload') NOT NULL,
	`title` varchar(200),
	`fileName` varchar(200),
	`storageKey` varchar(500),
	`url` varchar(1000),
	`mimeType` varchar(100),
	`sizeBytes` int,
	`createdByUserId` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_task_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `genba_task_files_task_idx` ON `genba_task_files` (`taskId`,`sortOrder`);
