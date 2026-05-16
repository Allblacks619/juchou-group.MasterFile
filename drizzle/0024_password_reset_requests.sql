CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int,
  `employeeId` int,
  `loginId` varchar(128) NOT NULL,
  `status` enum('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
  `verificationMatched` boolean NOT NULL DEFAULT false,
  `tokenHash` varchar(128),
  `tokenExpiresAt` timestamp,
  `tokenUsedAt` timestamp,
  `approvedByUserId` int,
  `rejectedByUserId` int,
  `requestedAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `password_reset_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `password_reset_requests_token_hash_idx` ON `password_reset_requests` (`tokenHash`);
--> statement-breakpoint
CREATE INDEX `password_reset_requests_status_idx` ON `password_reset_requests` (`status`);
