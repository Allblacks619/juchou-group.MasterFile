-- Superseded by 0026_monthly_closing_v2_foundation.sql (journal idx 26), which
-- creates the same five monthly_closing_v2_* tables and indexes with the column
-- names actually used by drizzle/schema.ts (`status`, `expenseType`,
-- `paymentMethod`, `allocationMethod`, `documentType` instead of the stale
-- `monthlyClosingV2*` names in this file). Creating them here first fails the
-- next migration on a fresh database (ER_TABLE_EXISTS_ERROR), so this migration
-- is intentionally a no-op. The journal entry must stay.
SELECT 1;
