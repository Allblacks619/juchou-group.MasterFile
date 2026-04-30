# IMPLEMENTATION REPORT

## Critical fix: AppRates edit/delete restoration
- Restored **edit** and **delete** actions for every rate record in both desktop table and mobile card list.
- Mobile cards now include clear, tappable action buttons labeled:
  - `編集`
  - `削除`
- Mobile edit mode is inline and stacked to prevent clipping/overflow on smartphone screens.
- Delete action uses existing `trpc.rate.delete` mutation with confirmation before execution.
- Edit save action uses existing `trpc.rate.update` mutation.

## Data-safety and validation behavior
- Added safe numeric parsing for edit values so blank values are treated as missing (`undefined`) instead of coerced `0`.
- Enforced validation for edits:
  - both empty (売上単価 and 支払単価) is rejected,
  - billing-only is allowed,
  - payment-only is allowed,
  - both present is allowed.
- Existing rate-scope logic was preserved (project/client scope behavior unchanged).
- Billing/payment separation was preserved (no forced dual entry).
- No 0-yen fallback is used as a valid missing rate in update payloads.

## Explicit non-changes
- No rollback/revert of scope architecture.
- No rollback/revert of billing/payment separation.
- No API endpoint replacement; existing trpc mutations are reused.
