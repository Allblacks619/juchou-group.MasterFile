-- Superseded by 0018_nosy_celestials.sql (journal idx 18), which creates
-- worker_invoices / worker_invoice_items / worker_invoice_snapshots /
-- invoice_supporting_documents with the column names used by drizzle/schema.ts.
-- Re-creating them here fails on a fresh database (ER_TABLE_EXISTS_ERROR),
-- so this migration is intentionally a no-op. The journal entry must stay.
SELECT 1;
