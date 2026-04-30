# MANUS HANDOFF PROMPT

Please verify the **AppRates critical fix** with this checklist.

## 1) Edit/delete availability
- Confirm every rate record has edit/delete actions on desktop table.
- Confirm every rate record has visible `編集` and `削除` buttons on mobile cards.

## 2) Mutation wiring
- Confirm delete path calls existing `trpc.rate.delete` mutation.
- Confirm edit save calls existing `trpc.rate.update` mutation.

## 3) Delete behavior
- Confirm delete prompts user confirmation first.
- Confirm only the selected record is deleted.

## 4) Edit behavior (billing/payment separation)
- Confirm existing records can be edited regardless of current shape:
  - billing-only record can be edited without forcing payment,
  - payment-only record can be edited without forcing billing,
  - both present can edit both.
- Confirm no 0-yen fallback is auto-submitted for missing side.

## 5) Validation
- Confirm both empty is rejected.
- Confirm billing-only is accepted.
- Confirm payment-only is accepted.
- Confirm both is accepted.

## 6) Mobile layout
- Confirm action buttons are tappable and not clipped.
- Confirm no horizontal overflow in card actions/edit area.
- Confirm stacked actions layout remains visible without horizontal scroll.
