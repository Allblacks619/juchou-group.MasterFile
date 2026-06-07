CREATE TABLE `monthly_closing_v2_project_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`projectId` int NOT NULL,
	`status` enum('未着手','確認中','情報不足','差し戻しあり','締め完了') NOT NULL DEFAULT '未着手',
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_closing_v2_project_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_closing_v2_project_review_unique` UNIQUE(`targetMonth`,`projectId`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_project_review_status_idx` ON `monthly_closing_v2_project_reviews` (`status`);
--> statement-breakpoint
CREATE TABLE `monthly_closing_v2_participant_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`targetMonth` varchar(7) NOT NULL,
	`projectId` int NOT NULL,
	`participantKey` varchar(255) NOT NULL,
	`workerId` int,
	`guestName` varchar(255),
	`individualStatus` enum('未確認','出面確認済み','交通費未入力','情報不足','差し戻し','確認済み','締め完了') NOT NULL DEFAULT '未確認',
	`transportationStatus` varchar(64) NOT NULL DEFAULT '未入力',
	`invoiceInfoStatus` varchar(64) NOT NULL DEFAULT '確認待ち',
	`sendBackReason` text,
	`missingInfo` text,
	`isAggregationExcluded` boolean NOT NULL DEFAULT false,
	`aggregationOverrideReason` text,
	`aggregationOverrideBy` int,
	`aggregationOverrideAt` timestamp,
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_closing_v2_participant_reviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `monthly_closing_v2_participant_review_unique` UNIQUE(`targetMonth`,`projectId`,`participantKey`)
);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_participant_review_worker_idx` ON `monthly_closing_v2_participant_reviews` (`workerId`,`targetMonth`);
--> statement-breakpoint
CREATE INDEX `monthly_closing_v2_participant_review_project_idx` ON `monthly_closing_v2_participant_reviews` (`projectId`,`targetMonth`);
