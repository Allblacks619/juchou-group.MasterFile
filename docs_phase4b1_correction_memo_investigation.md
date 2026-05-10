# Phase 4B-1 correction memo investigation

Date: 2026-05-07
Scope: smartphone UI cleanup in `AppMyClosing` / `AppClosings` plus current-code investigation only. Large behavior changes are intentionally deferred.

## Small fixes included in this PR

| Area | Status | Notes |
| --- | --- | --- |
| `AppMyClosing` header controls | Fixed | Month and project controls now use mobile full-width wrappers and only keep fixed widths on `sm` and up. |
| `AppMyClosing` invoice list actions | Fixed | Invoice action buttons now wrap with `flex flex-wrap gap-2`. |
| `AppMyClosing` worker invoice status display | Fixed | List display maps backend statuses to Japanese labels without changing stored status values. |
| `AppMyClosing` transport/expense numeric keyboard | Fixed | Transport and expense inputs keep `type="number"` and add `inputMode="numeric"`. |
| `AppMyClosing` receipt upload at zero amount | Fixed | Upload is enabled even when transport and expense are both zero. Existing endpoint and validation are unchanged. |
| `AppClosings` old worker-invoice review block | Fixed | Removed the older duplicate inline review block and kept `WorkerInvoiceReviewSection`, which preserves PDF, approve, and return actions. |

## Correction memo analysis

| # | Item | Current status | Risk | Evidence | Exact next-PR files/functions |
| --- | --- | --- | --- | --- | --- |
| 1 | Employee attendance updates not reflected in admin dashboard | High-risk bug | Worker-side save can fail before records ever reach admin/admin-like views. This likely affects named workers such as 大木 テリキ if they use the worker dashboard autosave path. | `AppDashboard` uses `trpc.attendance.upsert.useMutation()` for autosave, but `attendance.upsert` is guarded by `leaderOrAdminProcedure`. Admin pages and team display read from the same `attendance` / attendance-records source via `attendance.list` and `projectTeamData`, so the main mismatch is the worker write path, not a separate table. Dates use the same `startDate` / `endDate` month range; no small timezone-only fix was identified. | `client/src/pages/AppDashboard.tsx` (`upsertMutation`, `autoSave`); `server/routers.ts` (`attendance.upsert`, `attendance.myBatchUpsert`, `attendance.projectTeamData`, `attendance.list`); focused tests for worker save -> admin read. |
| 2 | Same client + same month + multiple project consolidated invoice | Partially implemented | Billing omission risk if same-client eligible projects are not selected. | Backend accepts `projectIds` in `closing.generateForClosing` and `buildInvoiceDraftFromProjects` groups selected projects by project/rate bucket. However, `AppClosings` initializes `invoiceProjectIds` to only the current project, and candidate UI expects `projectId` / `projectName` while the current candidate API returns `{ project, closing }`. Other ready/closed/locked same-client projects can therefore be missed unless UI/API shape and selection are corrected. | `client/src/pages/AppClosings.tsx` (`sameClientCandidatesQuery`, `invoiceProjectIds`, `toggleInvoiceProject`, draft-create button); `server/routers.ts` (`closing.sameClientInvoiceCandidates`, `closing.generateForClosing`); `server/invoiceBuilder.ts` (`buildInvoiceDraftFromProjects`). |
| 3 | Do not expose worker-specific rate mapping in client invoice remarks | High-risk leak if notes are exposed externally later | Client-facing invoices must not show which worker belongs to which rate bucket. | `invoiceBuilder` currently stores item notes like rate source plus target employee names. The current client PDF renderer does not print `invoice_items.notes`, but the invoice editor displays them and any future export/PDF change could leak worker-rate mapping. This should be separated into an internal-only memo field or removed from client invoice item notes. | `server/invoiceBuilder.ts` (`BuiltInvoiceItem.notes`, notes assignment); `server/routers.ts` (`createInvoiceItem({ notes })` in closing/client invoice creation); `client/src/pages/AppInvoices.tsx` item-note display; `server/pdfInvoice.ts` to keep external PDF free of item notes. |
| 4 | Receipt upload when transport/expense amount is zero | Fixed for single file | Multi-file proof submission is not supported yet. | UI upload is now enabled regardless of amount. Server upload paths already validate file type/size and store one receipt file without requiring a positive amount. The schema has only one `receiptFileUrl` / `receiptFileName` / `receiptFileKey`, so company-card/ETC multiple proof files need a separate schema/API PR. | Current PR: `client/src/pages/AppMyClosing.tsx`. Future multi-file PR: `drizzle/schema.ts` (`closingSubmissions` receipt columns), `server/routers.ts` (`closing.uploadMyReceipt`, `closing.uploadReceipt`), UI receipt list. |
| 5 | Same client + same day + multiple project attendance export rule | Not implemented | Export correctness gap for client-level summaries. | Attendance PDF/Excel generation is project-scoped and requires a single `projectId`. It reads records only for that project and renders a project-level attendance grid. There is no client-level same-day aggregation such as A-project rest + B-project worked => client overall worked, memo `B現場出勤`, and highlighted affected cell. | `server/routers.ts` (`attendance.generatePdf`, `attendance.generateExcel`); `server/pdfAttendance.ts`; `server/excelAttendance.ts`; likely new client/month aggregation service and tests. |

## Off-scope files intentionally not changed

- `client/src/pages/AppEmployees.tsx`
- `client/src/pages/AppEmployeeDetail.tsx`
- Employee deletion, bulk role change, and super-admin protection logic

## Recommended next PR order

1. Fix worker attendance save authorization/refetch path and add tests for worker save -> admin read consistency.
2. Fix same-client consolidated invoice candidate response/UI shape, default selection, and missed-project warning.
3. Remove worker names from client-invoice item notes or introduce internal-only item memo storage.
4. Add multi-file receipt/supporting document support for closing submissions.
5. Design client-level attendance export aggregation and highlighting.

## Final readiness note

- Final intended changed files are limited to `AppMyClosing`, `AppClosings`, and this investigation memo.
- No server logic, endpoint names, save/submit behavior, or PDF behavior is changed in this PR.
