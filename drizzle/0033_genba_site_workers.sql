CREATE TABLE `genba_site_workers` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`userId` int,
	`employeeId` int,
	`guestName` varchar(128),
	`genbaSiteWorkerKind` enum('registered','guest') NOT NULL DEFAULT 'registered',
	`displayName` varchar(128) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_site_workers_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_site_workers_site_user` UNIQUE(`siteId`,`userId`),
	CONSTRAINT `genba_site_workers_site_guest` UNIQUE(`siteId`,`guestName`)
);
--> statement-breakpoint
CREATE TABLE `genba_guest_assignees` (
	`id` varchar(24) NOT NULL,
	`taskId` varchar(24) NOT NULL,
	`siteWorkerId` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_guest_assignees_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_guest_assignees_task_worker` UNIQUE(`taskId`,`siteWorkerId`)
);
--> statement-breakpoint
CREATE INDEX `genba_site_workers_site_idx` ON `genba_site_workers` (`siteId`);
--> statement-breakpoint
CREATE INDEX `genba_guest_assignees_worker_idx` ON `genba_guest_assignees` (`siteWorkerId`);
