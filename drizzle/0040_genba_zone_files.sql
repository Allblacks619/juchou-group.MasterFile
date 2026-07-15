CREATE TABLE `genba_zone_files` (
	`id` varchar(24) NOT NULL,
	`zoneId` varchar(24) NOT NULL,
	`genbaZoneFileKind` enum('link','upload') NOT NULL,
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
	CONSTRAINT `genba_zone_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `genba_zone_files_zone_idx` ON `genba_zone_files` (`zoneId`,`sortOrder`);
