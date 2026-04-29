# TEST REPORT

## Commands run
- `pnpm check`
- `pnpm build`
- `pnpm test`

## Results
- check: pass
- build: pass (with non-blocking Vite/env/chunk warnings)
- test: pass

## Focus validation
- Verified split-rate resolution logic:
  - Client invoice billing resolution (`resolveClientBillingRate`) remains isolated from worker payment logic.
  - Worker payment resolution (`resolveWorkerPaymentRate`) now includes client+employee payment fallback before employee base rate.
- Verified UI now shows:
  - 売上単価 / 支払単価 as separate concepts.
  - 粗利/日 value.
  - Red warning state when 支払単価 > 売上単価 (no save-block behavior added).
