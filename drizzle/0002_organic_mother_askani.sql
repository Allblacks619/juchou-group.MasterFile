ALTER TABLE `users` ADD `passwordHash` varchar(256);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_loginId_unique` UNIQUE(`loginId`);