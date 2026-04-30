# KNOWN ISSUES (2026-04-30)

<<<<<<< Updated upstream
1. `pnpm build` emits existing non-blocking warnings for missing analytics env placeholders in `index.html`; this patch does not alter analytics configuration.
2. `pnpm build` still reports large chunk-size warnings in production bundle; this is pre-existing and out of scope.
3. `pnpm test` prints expected stderr lines in `customAuth` invitation tests about DB unavailability while tests still pass; this is pre-existing test behavior.
=======
1. This checkout cannot pull from `origin/main` because no git remote is configured in the current environment.
2. Full multi-phase feature completion (employee super_admin controls, bulk hard delete safety UX, full closing state recovery matrix, same-client merge hardening, and mobile refinements) still requires additional implementation and verification work.
3. Build produces existing non-blocking warnings for missing analytics env placeholders and large chunk size.
>>>>>>> Stashed changes
