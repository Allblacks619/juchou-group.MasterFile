CREATE TABLE `genba_worker_links` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`siteWorkerId` varchar(24) NOT NULL,
	`token` varchar(64) NOT NULL,
	`genbaWorkerLinkRole` enum('worker','leader') NOT NULL DEFAULT 'worker',
	`active` boolean NOT NULL DEFAULT true,
	`expiresAt` timestamp NULL,
	`lastAccessAt` timestamp NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_worker_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_worker_links_token` UNIQUE(`token`),
	CONSTRAINT `genba_worker_links_worker` UNIQUE(`siteWorkerId`)
);
--> statement-breakpoint
CREATE INDEX `genba_worker_links_site_idx` ON `genba_worker_links` (`siteId`);
