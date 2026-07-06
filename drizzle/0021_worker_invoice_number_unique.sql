-- Superseded by 0021_outstanding_energizer.sql (journal idx 21), which adds the
-- same worker_invoice_number_unique constraint. Adding it twice fails on a fresh
-- database (ER_DUP_KEYNAME 1061), so this migration is intentionally a no-op.
-- The journal entry must stay.
SELECT 1;
