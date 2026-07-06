CREATE TABLE `genba_activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(24) NOT NULL,
	`byUserId` int,
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `genba_activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_budget_attendance` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`date` varchar(10) NOT NULL,
	`manDays` decimal(6,1) NOT NULL DEFAULT '0.0',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_budget_attendance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_budgets` (
	`siteId` varchar(24) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`contractAmount` int NOT NULL DEFAULT 0,
	`genbaBudgetTargetType` enum('percent','amount') NOT NULL DEFAULT 'percent',
	`targetValue` int NOT NULL DEFAULT 0,
	`costPerManDay` int NOT NULL DEFAULT 0,
	`monthlyExpense` int NOT NULL DEFAULT 0,
	`periodStart` varchar(10),
	`periodEnd` varchar(10),
	`preManDays` decimal(8,1) NOT NULL DEFAULT '0.0',
	`genbaBudgetAttendanceSource` enum('manual','project') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_budgets_siteId` PRIMARY KEY(`siteId`)
);
--> statement-breakpoint
CREATE TABLE `genba_floors` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`imageKey` varchar(200),
	`w` int,
	`h` int,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_floors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_instruction_reads` (
	`id` varchar(24) NOT NULL,
	`instructionId` varchar(24) NOT NULL,
	`userId` int NOT NULL,
	`readAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_instruction_reads_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_instruction_reads_inst_user` UNIQUE(`instructionId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `genba_instructions` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`text` text NOT NULL,
	`genbaInstructionTargetKind` enum('all','team','worker') NOT NULL DEFAULT 'all',
	`targetId` varchar(24),
	`zoneId` varchar(24),
	`byUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_instructions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_material_presets` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24),
	`workName` varchar(120) NOT NULL,
	`parts` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_material_presets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_material_request_items` (
	`id` varchar(24) NOT NULL,
	`requestId` varchar(24) NOT NULL,
	`name` varchar(200) NOT NULL,
	`qty` int NOT NULL DEFAULT 1,
	`unit` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_material_request_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_material_requests` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`byUserId` int,
	`genbaMaterialRequestStatus` enum('pending','ordered','delivered') NOT NULL DEFAULT 'pending',
	`note` text,
	`orderedAt` timestamp,
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_material_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_shares` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`token` varchar(64) NOT NULL,
	`scopes` json,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_shares_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_shares_token` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `genba_sites` (
	`id` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`projectId` int,
	`driveUrl` varchar(500),
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_sites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_task_assignees` (
	`id` varchar(24) NOT NULL,
	`taskId` varchar(24) NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_task_assignees_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_task_assignees_task_user` UNIQUE(`taskId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `genba_task_events` (
	`id` varchar(24) NOT NULL,
	`taskId` varchar(24) NOT NULL,
	`genbaTaskEventKind` enum('status','issue','reply','handover') NOT NULL,
	`byUserId` int,
	`text` text,
	`photoKeys` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_task_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_task_teams` (
	`id` varchar(24) NOT NULL,
	`taskId` varchar(24) NOT NULL,
	`teamId` varchar(24) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_task_teams_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_task_teams_task_team` UNIQUE(`taskId`,`teamId`)
);
--> statement-breakpoint
CREATE TABLE `genba_task_templates` (
	`id` varchar(24) NOT NULL,
	`parentId` varchar(24),
	`name` varchar(200) NOT NULL,
	`romaji` varchar(200),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_task_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_tasks` (
	`id` varchar(24) NOT NULL,
	`zoneId` varchar(24) NOT NULL,
	`parentTaskId` varchar(24),
	`name` varchar(200) NOT NULL,
	`romaji` varchar(200),
	`genbaTaskStatus` enum('todo','progress','done','issue') NOT NULL DEFAULT 'todo',
	`percent` int,
	`priority` int,
	`issueText` text,
	`startDate` varchar(10),
	`dueDate` varchar(10),
	`memo` text,
	`memoVisible` boolean NOT NULL DEFAULT false,
	`linkUrl` varchar(500),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_team_members` (
	`id` varchar(24) NOT NULL,
	`teamId` varchar(24) NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_team_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `genba_team_members_team_user` UNIQUE(`teamId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `genba_teams` (
	`id` varchar(24) NOT NULL,
	`siteId` varchar(24) NOT NULL,
	`name` varchar(120) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `genba_user_settings` (
	`userId` int NOT NULL,
	`color` varchar(9),
	`theme` varchar(24),
	`lang` varchar(4),
	`guideSeen` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_user_settings_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `genba_zones` (
	`id` varchar(24) NOT NULL,
	`floorId` varchar(24) NOT NULL,
	`parentZoneId` varchar(24),
	`name` varchar(120) NOT NULL,
	`polygon` json,
	`priority` int,
	`workStatus` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_zones_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `genba_activity_logs_type_created_idx` ON `genba_activity_logs` (`type`,`createdAt`);--> statement-breakpoint
CREATE INDEX `genba_budget_attendance_site_date_idx` ON `genba_budget_attendance` (`siteId`,`date`);--> statement-breakpoint
CREATE INDEX `genba_floors_site_idx` ON `genba_floors` (`siteId`);--> statement-breakpoint
CREATE INDEX `genba_instructions_site_idx` ON `genba_instructions` (`siteId`);--> statement-breakpoint
CREATE INDEX `genba_material_presets_site_idx` ON `genba_material_presets` (`siteId`);--> statement-breakpoint
CREATE INDEX `genba_material_request_items_req_idx` ON `genba_material_request_items` (`requestId`);--> statement-breakpoint
CREATE INDEX `genba_material_requests_site_idx` ON `genba_material_requests` (`siteId`);--> statement-breakpoint
CREATE INDEX `genba_shares_site_idx` ON `genba_shares` (`siteId`);--> statement-breakpoint
CREATE INDEX `genba_sites_project_idx` ON `genba_sites` (`projectId`);--> statement-breakpoint
CREATE INDEX `genba_sites_archived_idx` ON `genba_sites` (`archived`);--> statement-breakpoint
CREATE INDEX `genba_task_assignees_user_idx` ON `genba_task_assignees` (`userId`);--> statement-breakpoint
CREATE INDEX `genba_task_events_task_idx` ON `genba_task_events` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `genba_task_teams_team_idx` ON `genba_task_teams` (`teamId`);--> statement-breakpoint
CREATE INDEX `genba_task_templates_parent_idx` ON `genba_task_templates` (`parentId`);--> statement-breakpoint
CREATE INDEX `genba_tasks_zone_idx` ON `genba_tasks` (`zoneId`);--> statement-breakpoint
CREATE INDEX `genba_tasks_parent_idx` ON `genba_tasks` (`parentTaskId`);--> statement-breakpoint
CREATE INDEX `genba_team_members_user_idx` ON `genba_team_members` (`userId`);--> statement-breakpoint
CREATE INDEX `genba_teams_site_idx` ON `genba_teams` (`siteId`);--> statement-breakpoint
CREATE INDEX `genba_zones_floor_idx` ON `genba_zones` (`floorId`);--> statement-breakpoint
CREATE INDEX `genba_zones_parent_idx` ON `genba_zones` (`parentZoneId`);