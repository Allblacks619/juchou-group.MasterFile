# MANUS HANDOFF PROMPT

Please validate the rate-scope release with the following checklist:

1) Create rates for same employee/shift/effective windows in all four tiers and verify resolver priority:
   - project+employee > project+uniform > client+employee > client+uniform.
2) Confirm client-scoped rates are ignored whenever any matching project-scoped rate exists.
3) Confirm overlapping records can be saved and warnings are visible in rate list.
4) Confirm legacy records still behave as project-scope rates.
5) On mobile widths, verify no horizontal overflow in rate list/create dialog and dropdowns/buttons remain usable.
6) Run regression flows: closing preview, invoice draft generation, and payments to ensure expected totals.
