# KNOWN ISSUES (2026-04-30)

1. This checkout cannot pull from `origin/main` because no git remote is configured in the current environment.
2. Full multi-phase feature completion (employee super_admin controls, bulk hard delete safety UX, full closing state recovery matrix, same-client merge hardening, and mobile refinements) still requires additional implementation and verification work.
3. Build produces existing non-blocking warnings for missing analytics env placeholders and large chunk size.
