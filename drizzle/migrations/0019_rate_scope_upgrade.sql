ALTER TABLE `employee_rates`
  ADD COLUMN `scopeType` enum('project','client') NOT NULL DEFAULT 'project' AFTER `id`,
  ADD COLUMN `clientId` int AFTER `projectId`;

ALTER TABLE `employee_rates`
  MODIFY COLUMN `projectId` int;

UPDATE `employee_rates`
SET `scopeType` = 'project'
WHERE `scopeType` IS NULL;

CREATE INDEX `employee_rates_scope_lookup`
  ON `employee_rates` (`scopeType`, `projectId`, `clientId`, `employeeId`, `shiftType`, `effectiveFrom`);
