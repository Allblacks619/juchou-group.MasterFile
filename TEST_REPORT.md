# TEST REPORT

## Commands run
- `pnpm check`
- `pnpm build`
- `pnpm test`

## Results
- check: pass
- build: pass
- test: pass

## Scope checks validated in UI implementation
- 個別単価 supports both project-scope and client-scope selector paths.
- Form validation allows billing-only/payment-only and rejects both-empty.
- Profit display avoids fake 0-based calculation when one side is missing.
- Negative-profit warning text is shown only when both values exist and payment exceeds billing.
