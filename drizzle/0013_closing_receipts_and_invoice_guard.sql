ALTER TABLE closing_submissions
  ADD COLUMN receiptFileUrl text NULL,
  ADD COLUMN receiptFileName varchar(512) NULL,
  ADD COLUMN receiptFileKey varchar(512) NULL,
  ADD COLUMN receiptMimeType varchar(128) NULL;
