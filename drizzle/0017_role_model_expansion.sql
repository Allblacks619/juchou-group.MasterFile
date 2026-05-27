-- Expand role model and migrate legacy leader -> manager
ALTER TABLE `users` MODIFY COLUMN `appRole` enum('super_admin','admin','manager','worker','guest','leader') NOT NULL DEFAULT 'worker';
UPDATE `users` SET `appRole` = 'manager' WHERE `appRole` = 'leader';
ALTER TABLE `users` MODIFY COLUMN `appRole` enum('super_admin','admin','manager','worker','guest') NOT NULL DEFAULT 'worker';

ALTER TABLE `invitations` MODIFY COLUMN `assignedRole` enum('super_admin','admin','manager','worker','guest','leader') NOT NULL DEFAULT 'worker';
UPDATE `invitations` SET `assignedRole` = 'manager' WHERE `assignedRole` = 'leader';
ALTER TABLE `invitations` MODIFY COLUMN `assignedRole` enum('super_admin','admin','manager','worker','guest') NOT NULL DEFAULT 'worker';
