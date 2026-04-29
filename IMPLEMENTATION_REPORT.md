# IMPLEMENTATION REPORT

## This patch (AppRates client UI)
- Added **個別単価 適用範囲 selector** in `AppRates.tsx` so individual rates can now be created as:
  - 現場別 + 作業員 (`scopeType=project`)
  - 取引先別 + 作業員 (`scopeType=client`)
- Kept existing separated rate model intact (billing and payment are still independent fields; no model rollback).
- Updated create payload mapping for individual rates:
  - `scopeType` now follows individual selector.
  - `projectId` is sent only for project-scope.
  - `clientId` is sent only for client-scope.
- Updated required-field validation in create dialog:
  - individual: `employeeId` required + selected scope key (`projectId` or `clientId`) required.
  - uniform: unchanged scope-based key requirement.
  - still allows billing-only / payment-only, and blocks only when both are empty.
- Updated rate list profit display behavior:
  - Shows 売上単価 / 支払単価 independently.
  - Computes 粗利/日 **only when both are present**.
  - Shows `未設定` for 粗利/日 when one side is missing.
  - Red warning for negative profit:
    - `支払単価が売上単価を上回っています。赤字になります。`
- Mobile cards now explicitly show 粗利/日 and the same negative-profit warning logic without using zero fallback.

## Explicit non-changes
- No endpoint moves.
- No invoice draft flow reversion.
- No closing flow reversion.
- No rate model separation rollback.
- No forced dual-rate input requirement.
