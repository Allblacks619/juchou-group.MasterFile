# CI Cost Policy

Goal: minimize GitHub Actions minutes without weakening correctness, security, financial/business-record integrity, or required review gates.

## Rules
1. Use PR concurrency cancellation where safe so superseded commits do not keep consuming minutes.
2. Use path-aware CI when safe: docs-only avoids unrelated application suites; frontend-only avoids unrelated backend work; backend-only avoids unrelated frontend work; shared schemas, permissions, migrations, payroll/attendance/billing logic, build config, dependency locks, or uncertain changes run all relevant checks.
3. Cache dependencies with lockfile-aware keys.
4. Audit matrices: primary supported environment on PRs; extended compatibility may run scheduled/nightly when release safety is preserved.
5. For stacked PRs, avoid repeatedly testing identical parent code while preserving every required check before merge.
6. Infrastructure failures before runner assignment (`runner_id=0`, `steps=0`) get one confirming rerun, then become an external blocker rather than a retry loop.
7. Keep an authoritative GitHub CI path for production-relevant changes even when local tests are green.
8. Measure before/after where practical: PR minutes, job time, cache hit/miss, duplicate runs, and stack cost.

## Never save minutes by
- deleting or weakening meaningful tests;
- hiding failures with skip/xfail merely to get green;
- bypassing permission/security/migration/payroll/attendance/billing integrity checks;
- merging before required CI is green;
- fabricating successful checks;
- ignoring Codex/review findings because retesting costs minutes.

## Project inheritance
This repository inherits the universal AIOS/Claude/ChatGPT CI-cost policy. New workflows and future PR strategies must follow it unless a stricter business-system safety requirement applies.

## CHECKPOINT
```text
CI_COST
policy_present: YES
concurrency_cancel: YES/NO/N_A
path_filters: YES/NO/N_A
dependency_cache: YES/NO/N_A
matrix_policy:
rerun_policy: ONE_CONFIRM_THEN_BLOCKER
stack_policy:
known_waste:
estimated_saving:
```
