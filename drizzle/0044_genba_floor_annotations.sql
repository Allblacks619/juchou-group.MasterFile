CREATE TABLE `genba_floor_annotations` (
	`id` varchar(24) NOT NULL,
	`floorId` varchar(24) NOT NULL,
	`genbaFloorAnnotationKind` enum('freehand','line','arrow','polyline','polygon','text') NOT NULL,
	`points` json NOT NULL,
	`color` varchar(16),
	`strokeWidth` int NOT NULL DEFAULT 3,
	`text` varchar(200),
	`byUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_floor_annotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `genba_floor_annotations_floor_idx` ON `genba_floor_annotations` (`floorId`,`createdAt`);
