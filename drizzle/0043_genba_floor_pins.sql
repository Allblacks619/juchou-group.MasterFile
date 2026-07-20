CREATE TABLE `genba_floor_pins` (
	`id` varchar(24) NOT NULL,
	`floorId` varchar(24) NOT NULL,
	`zoneId` varchar(24),
	`x` int NOT NULL,
	`y` int NOT NULL,
	`genbaFloorPinKind` enum('issue','note') NOT NULL DEFAULT 'issue',
	`text` text,
	`photoKeys` json,
	`genbaFloorPinStatus` enum('open','resolved') NOT NULL DEFAULT 'open',
	`byUserId` int,
	`resolvedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_floor_pins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `genba_floor_pins_floor_idx` ON `genba_floor_pins` (`floorId`,`createdAt`);
