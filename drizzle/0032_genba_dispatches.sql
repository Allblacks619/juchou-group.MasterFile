CREATE TABLE `genba_dispatches` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`zoneId` varchar(24) NOT NULL,
	`taskId` varchar(24) NOT NULL,
	`date` varchar(10) NOT NULL,
	`memo` text,
	`byUserId` int,
	`done` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_dispatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_dispatch_assignees` (
	`id` varchar(24) NOT NULL,
	`dispatchId` varchar(24) NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_dispatch_assignees_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_dispatch_assignees_dispatch_user` UNIQUE(`dispatchId`,`userId`)
);
--> statement-breakpoint
CREATE INDEX `genba_dispatches_site_date_idx` ON `genba_dispatches` (`siteId`,`date`);--> statement-breakpoint
CREATE INDEX `genba_dispatch_assignees_user_idx` ON `genba_dispatch_assignees` (`userId`);
