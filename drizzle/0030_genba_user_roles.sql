CREATE TABLE `genba_user_roles` (
	`userId` int NOT NULL,
	`role` varchar(16) NOT NULL,
	`updatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `genba_user_roles_userId` PRIMARY KEY(`userId`)
);
