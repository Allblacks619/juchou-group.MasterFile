# Priority 2 Draft Flow Prompt

Proceed with Priority 2 only for repository `Allblacks619/juchou-group`.

Do not replace the entire `server/routers.ts` file.
Do not redesign the invoice editor UI.
Do not remove existing features.
Do not touch unrelated files.

Current confirmed state:
- GitHub sync works.
- `server/routers.ts` already imports `resolveProjectMemberRatesForMonth` and `resolveWorkerPaymentRate`.
- Priority 1 router endpoints were implemented in Manus.
- Payment calculation still appears to contain the old `findBestWorkerRate` flow, so Priority 2 must update it.

## Priority 2 scope

1. Update payment calculation to use `resolveWorkerPaymentRate`.
2. Update `closing.generateForClosing` so it creates an editable invoice draft, not a final PDF.
3. Do not generate/download/open PDF from `AppClosings`.
4. After invoice draft creation, return `invoiceId` and `editUrl`: `/app/invoices?invoiceId=<id>`.
5. `AppClosings` must redirect to that `editUrl` after successful draft creation.
6. `AppInvoices` must open the invoice detail/edit dialog when `invoiceId` exists in the URL.
7. PDF output must happen only from the invoice edit/detail page.
8. Worker-side Monthly Closing must use: save draft values -> review/confirm -> submit to company.
9. Do not create blank or zero-yen invoice drafts.
10. If billable data or required rates are missing, show a clear validation error.

## Use these repository files

- `MANUS_PATCHES/priority2/01_server_routers_payment_rate_patch.ts`
- `MANUS_PATCHES/priority2/02_server_routers_generateForClosing_draft_patch.ts`
- `MANUS_PATCHES/priority2/03_client_AppClosings_draft_redirect_patch.tsx`
- `MANUS_PATCHES/priority2/04_client_AppInvoices_invoiceId_pdf_patch.tsx`
- `MANUS_PATCHES/priority2/05_client_AppMyClosing_review_submit_patch.tsx`

## Implementation order

1. Apply `01_server_routers_payment_rate_patch.ts`.
2. Run `pnpm check`.
3. Apply `02_server_routers_generateForClosing_draft_patch.ts`.
4. Run `pnpm check`.
5. Apply client patches 03, 04, 05.
6. Run:
   - `pnpm check`
   - `pnpm build`
   - `pnpm test`

## Reply only with

- changed files
- payment calculation updated / not updated
- generateForClosing draft-only / not fixed
- AppClosings redirects to invoice edit / not fixed
- AppInvoices invoiceId deep-link fixed / not fixed
- PDF delayed until edit page / not fixed
- worker review flow fixed / not fixed
- pnpm check result
- pnpm build result
- pnpm test result
- preview ok / preview issue
