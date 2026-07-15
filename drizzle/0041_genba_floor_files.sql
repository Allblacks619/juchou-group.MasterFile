CREATE TABLE `genba_floor_files` (
	`id` varchar(24) NOT NULL,
	`floorId` varchar(24) NOT NULL,
	`genbaFloorFileKind` enum('link','upload') NOT NULL,
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
	CONSTRAINT `genba_floor_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `genba_floor_files_floor_idx` ON `genba_floor_files` (`floorId`,`sortOrder`);
