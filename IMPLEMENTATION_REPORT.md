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
- Extended rate APIs to accept scoped create for project/client uniform rates.
- Added overlap warning flag in list API.
- Updated rates UI:
  - 一律単価 now supports 適用範囲 selector:
    - 現場別
    - 取引先別
  - Conditional required selector behavior for project/client.
  - Mobile card layout and warning visibility.

## Notes
- 個別単価 behavior remains project + employee (unchanged).
