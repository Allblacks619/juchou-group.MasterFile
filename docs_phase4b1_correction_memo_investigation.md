# Phase 4B-1 correction memo investigation

Date: 2026-05-06
Scope: smartphone UI cleanup plus current-code investigation only. Large behavior changes are intentionally deferred.

## Small fixes included in this PR

| Area | Status | Notes |
| --- | --- | --- |
| `AppMyClosing` header controls | Fixed | Month and project controls now use mobile full-width wrappers and only keep fixed widths on `sm` and up. |
| `AppMyClosing` invoice list actions | Fixed | Invoice action buttons now wrap with `flex flex-wrap gap-2`. |
| `AppMyClosing` worker invoice status display | Fixed | List display maps backend statuses to Japanese labels without changing stored status values. |
| `AppMyClosing` transport/expense numeric keyboard | Fixed | Transport and expense inputs keep `type="number"` and add `inputMode="numeric"`. |
| `AppMyClosing` receipt upload at zero amount | Fixed | Upload is enabled even when transport and expense are both zero; submit validation still requires a receipt only when the saved submission marks it required. |
| `AppClosings` old worker-invoice review block | Fixed | Removed the older duplicate inline review block and kept `WorkerInvoiceReviewSection`, which preserves PDF, approve, and return actions. |

## Correction memo analysis

| # | Item | Current status | Risk | Evidence / next action |
| --- | --- | --- | --- | --- |
| 1 | Employee attendance updates not reflected in admin dashboard | High-risk bug | Worker-side save can fail before records ever reach admin views. | `AppDashboard` calls `attendance.upsert`, but `attendance.upsert` is currently protected by `leaderOrAdminProcedure`. The router already has `myBatchUpsert`, but the dashboard autosave path does not use it. Next PR should add a worker-safe attendance mutation path, verify project membership/permissions, and add tests for a worker such as 大木 テリキ saving a day and an admin immediately reading it from `attendance.list` / `projectTeamData`. |
| 2 | Same client + same month + multiple project consolidated invoice | Partially implemented | Billing omission risk if same-client eligible projects are not selected. | Backend supports `projectIds` in `closing.generateForClosing` and groups via `buildInvoiceDraftFromProjects`. Candidate lookup exists, but the UI initializes selection to only the current project and the candidate UI expects `projectId` / `projectName` while the current API returns `{ project, closing }`. Next PR should normalize the response/UI shape and either auto-select all eligible same-client projects or show a stronger warning before creating only one project. |
| 3 | Do not expose worker-specific rate mapping in client invoice remarks | High-risk leak if item notes are exported later | Generated draft item notes include worker names. | `invoiceBuilder` sets item notes to rate source plus target employee names. The current client PDF renderer does not print item notes, but the invoice editor displays them and future export/PDF changes could leak worker-rate grouping. Next PR should split internal item memo from external item notes, or stop storing worker names in `invoice_items.notes` for client invoices. |
| 4 | Receipt upload when transport/expense amount is zero | Fixed for single file | Multi-file support not implemented. | UI upload is now enabled regardless of amount. The server upload endpoint already validates and stores a file without requiring a positive amount. The current closing submission schema has only one `receiptFileUrl` / `receiptFileName` / `receiptFileKey`, so multiple proofs need a separate schema/API PR. |
| 5 | Same client + same day + multiple project attendance export rule | Not implemented | Export correctness gap for client-level summaries. | Current PDF/Excel export is project-scoped (`projectId`) and reads attendance for one project. There is no client-level same-day aggregation that converts A-project absent/rest + B-project worked into client-overall worked with memo/highlight. Next PR should add a client/month export model and regression tests before changing PDF/Excel rendering. |

## Recommended next PR order

1. Fix worker attendance save authorization/refetch path and add tests for worker save → admin read consistency.
2. Fix same-client consolidated invoice candidate shape/default selection and warn about missed eligible projects.
3. Remove worker names from client-invoice item notes or introduce separate internal-only item memo storage.
4. Add multi-file receipt/supporting document support for closing submissions.
5. Design client-level attendance export aggregation and highlighting.
