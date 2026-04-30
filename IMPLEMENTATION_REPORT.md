# IMPLEMENTATION REPORT (2026-04-30)

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
