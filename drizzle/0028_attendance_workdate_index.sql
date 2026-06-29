CREATE INDEX `attendance_workdate_idx` ON `attendance` (`workDate`);
--> statement-breakpoint
CREATE INDEX `attendance_proj_workdate_idx` ON `attendance` (`projectId`,`workDate`);
