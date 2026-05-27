# TEST REPORT (2026-04-30)

## Commands run
- `pnpm check`
- `pnpm build`
- `pnpm test`

## Results
- check: pass
<<<<<<< Updated upstream
- build: pass (with existing non-blocking Vite env/chunk warnings)
- test: pass (85/85)

## Behavior validation completed
- Desktop table:
  - all rows expose edit/delete,
  - delete uses confirmation + `trpc.rate.delete`,
  - edit saves via `trpc.rate.update`.
- Mobile card list:
  - all cards expose visible `編集` / `削除` buttons,
  - inline edit UI is stacked and tappable,
  - no horizontal action overflow introduced.
- Validation:
  - both empty rejected,
  - billing-only accepted,
  - payment-only accepted,
  - both accepted.
=======
- build: pass (with existing non-blocking Vite warnings)
- test: pass (85/85)

## Notes
- Build warnings seen were existing environment/build warnings (analytics env placeholders and bundle-size warning), not hard failures.
>>>>>>> Stashed changes
