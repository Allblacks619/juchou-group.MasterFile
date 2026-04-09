ALTER TABLE `attendance` ADD CONSTRAINT `attendance_emp_proj_date` UNIQUE(`employeeId`,`projectId`,`workDate`);--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_guest_proj_date` UNIQUE(`guestName`,`projectId`,`workDate`);--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoice_number_unique` UNIQUE(`invoiceNumber`);