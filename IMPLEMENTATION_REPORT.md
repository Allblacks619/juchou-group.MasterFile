# IMPLEMENTATION REPORT

## Locked Rule Compliance
- Implemented deterministic priority for client billing rates:
  1) project + employee
  2) project + uniform
  3) client + employee
  4) client + uniform
- Client scope is only considered after no project-scope match is found.
- Overlaps are allowed; no save blocking was added.
- Existing records are backward-compatible via schema default/backfill to `project` scope.

## What changed
- Added `scopeType` (`project`/`client`) and `clientId` to `employee_rates`.
- Added migration `0019_rate_scope_upgrade.sql` with scope backfill and lookup index.
- Updated resolver logic to enforce fixed deterministic priority and tie-break.
  - `resolveClientBillingRate` now resolves **billing only** with strict order:
    1) project + employee
    2) project + uniform
    3) client + employee
    4) client + uniform
  - `resolveWorkerPaymentRate` now resolves **payment only** with strict order:
    1) project + employee payment
    2) client + employee payment
    3) employee base/fixed payment
  - Removed implicit fallback branches that could mask unresolved billing/payment.
- Extended rate APIs to accept scoped create for project/client uniform rates.
- Added overlap warning flag in list API.
- Updated rates UI:
  - 一律単価 now supports 適用範囲 selector:
    - 現場別
    - 取引先別
  - Conditional required selector behavior for project/client.
  - Explicit wording split:
    - 売上単価（請求側）
    - 支払単価（支払側）
  - Gross profit (粗利/日) coloring and red-loss warnings when `支払単価 > 売上単価`.
  - Mobile card layout and warning visibility.

## Notes
- 個別単価 behavior remains project + employee (unchanged).
