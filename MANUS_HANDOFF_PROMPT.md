# MANUS HANDOFF PROMPT

Please validate the rate-scope release with the following checklist:

1) Create billing rates for same employee/shift/effective windows in all four tiers and verify `resolveClientBillingRate` priority:
   - project+employee > project+uniform > client+employee > client+uniform.
2) Create payment rates and verify `resolveWorkerPaymentRate` priority:
   - project+employee payment > client+employee payment > employee base/fixed payment.
3) Confirm client-scoped billing/payment rates are ignored whenever matching project-scoped employee rates exist.
4) Confirm overlapping records can be saved and warnings are visible in rate list.
5) Confirm red-loss warning appears when 支払単価 > 売上単価 (do not block save).
6) Confirm legacy records still behave as project-scope rates.
7) On mobile widths, verify no horizontal overflow in rate list/create dialog and dropdowns/buttons remain usable.
8) Run regression flows:
   - Closing preview
   - Invoice draft generation (must use billing rate)
   - Employee payment calculation (must use payment rate)
   - Profit preview comparison (billing vs payment)
