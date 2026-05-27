# IMPLEMENTATION REPORT (2026-04-30)

<<<<<<< Updated upstream
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
=======
## Pre-flight / repository sync
- Attempted to pull latest `main` before changes as requested.
- `git pull origin main` failed because this checkout has no configured remote (`origin` is missing in this environment), so no upstream sync could be performed here.

## Current implementation status in this repository
This workspace already contains a substantial part of the requested closing/invoice behavior (including reopen logic and invoice candidate UI sections), but the **full 4-phase update requested in this task is not yet fully implemented in a single integrated patch**.

### Observed implemented areas
- Closing reopen mutation and audit call path exist in server closing router.
- AppClosings has invoice candidate section label ("請求書に含める案件").
- Worker-side closed-state message handling exists in AppMyClosing.

### Remaining work to complete the full request
1. End-to-end super_admin-only employee role management + bulk hard-delete UX/API with impact preview and safe deletion ordering.
2. Full reopen/edit state consistency across worker/admin flows (including all return/reject/resubmit/reclose transitions and audit coverage).
3. Same-client multi-project invoice merge completion with warning labels, forced draft-first flow, and deterministic line grouping/splitting.
4. Mobile-first layout refinements across all listed screens.
5. Dedicated tests for all 12 requested scenarios.

## Non-regression constraints kept
- No endpoint move of closing back into invoice router.
- No direct PDF generation from closing flow (draft-first remains required behavior target).
- No rollback of AppRates fixes.
- No rollback of billing/payment separated rate model.
>>>>>>> Stashed changes
