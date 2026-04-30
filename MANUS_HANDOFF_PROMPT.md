# MANUS HANDOFF PROMPT (2026-04-30)

Please continue implementation in phases and validate each stage with tests.

## 0) Environment prerequisite
1. Ensure repository has a valid remote configured.
2. Run:
   - `git remote -v`
   - `git fetch origin`
   - `git checkout main && git pull --ff-only origin main`
   - rebase/merge working branch on latest main safely.

## 1) Phase 1 — Employee roles & bulk hard delete
- Enforce super_admin-only role change and hard-delete (single/bulk).
- Prevent admin from changing/deleting super_admin.
- Add impact-preview API/UI with counts (attendance/project memberships/closing-payment-submission/invoice items/user link/audit logs).
- Add double-confirm dialog.
- Implement safe deletion order and explicit blocking errors when integrity risks exist.

## 2) Phase 2 — Closing reopen / edit recovery
- Reopen transitions must restore worker editability immediately.
- Returned/rejected submissions editable by target worker.
- Preserve close/reclose cycles.
- Add/verify audit logs for reopen/return-reject/resubmit/reclose.

## 3) Phase 3 — Same-client multi-project merge
- Show clear candidate project names and warning badges.
- Include already-invoiced/draft projects with warnings (not silent exclusion).
- Generate one editable invoice draft from selected projects.
- Return `invoiceId` + `editUrl` and redirect to `/app/invoices?invoiceId=<id>`.
- Split lines by project + unit price.
- Never generate PDF directly from closing.

## 4) Phase 4 — Mobile-first UI fixes
- Remove horizontal overflow.
- Ensure visible checkbox labels/action buttons/bulk action bar.
- Use cards instead of wide tables where needed.

## 5) Validation commands
- `pnpm install`
- `pnpm check`
- `pnpm build`
- `pnpm test`

## 6) Requested automated tests to add/update
1. super_admin role change allowed
2. non-super_admin role change denied
3. bulk role change
4. hard delete safety
5. closed closing blocks worker edit
6. reopened closing enables all worker edits
7. returned submission enables selected worker edit
8. same-client candidates include names and warnings
9. selected multiple projects generate one invoice draft
10. already invoiced project warning but selectable
11. guest excluded from closing/invoice gate
12. no direct PDF generation from closing
