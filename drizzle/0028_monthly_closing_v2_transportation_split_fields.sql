ALTER TABLE `monthly_closing_v2_expense_lines`
  ADD `payerType` enum('none','worker_paid','company_card_etc','company_paid','client_paid_direct') NOT NULL DEFAULT 'none',
  ADD `workerReimbursementRequired` boolean NOT NULL DEFAULT false,
  ADD `clientBillable` boolean NOT NULL DEFAULT false,
  ADD `workerReimbursementAmount` int NOT NULL DEFAULT 0,
  ADD `clientBillableAmount` int NOT NULL DEFAULT 0,
  ADD `internalMemo` text;
--> statement-breakpoint
UPDATE `monthly_closing_v2_expense_lines`
SET
  `payerType` = CASE
    WHEN `expenseType` = 'transportation' AND `paymentMethod` = 'paid_by_worker' THEN 'worker_paid'
    WHEN `expenseType` = 'transportation' AND `paymentMethod` IN ('company_card', 'etc') THEN 'company_card_etc'
    WHEN `expenseType` = 'transportation' AND `paymentMethod` = 'paid_by_client' THEN 'client_paid_direct'
    WHEN `expenseType` = 'transportation' AND `paymentMethod` = 'other' AND `amount` = 0 THEN 'none'
    WHEN `expenseType` = 'transportation' THEN 'company_paid'
    ELSE `payerType`
  END,
  `workerReimbursementRequired` = CASE
    WHEN `expenseType` = 'transportation' AND `paymentMethod` = 'paid_by_worker' AND `amount` > 0 THEN true
    ELSE false
  END,
  `clientBillable` = CASE
    WHEN `expenseType` = 'transportation' AND `isClientBillable` = true THEN true
    ELSE false
  END,
  `workerReimbursementAmount` = CASE
    WHEN `expenseType` = 'transportation' AND `paymentMethod` = 'paid_by_worker' THEN `amount`
    ELSE 0
  END,
  `clientBillableAmount` = CASE
    WHEN `expenseType` = 'transportation' AND `isClientBillable` = true THEN `amount`
    ELSE 0
  END,
  `internalMemo` = `memo`
WHERE `expenseType` = 'transportation';
