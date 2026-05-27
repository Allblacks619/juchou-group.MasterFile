# Worker Invoice System Analysis (Monthly Closing Based)

## 1) Current system analysis
- The product already has two major domains:
  - **Closing submission domain** (`project_closings`, `closing_submissions`) for worker-side monthly transport/expense/receipt submission and reopen/edit recovery.
  - **Client invoice domain** (`invoices`, `invoice_items`) for Juchou→client billing.
- Current invoice pages and router methods are built around client invoices and leader/admin operations (`invoice.*`), including editable line items and PDF generation.
- Existing worker monthly submission (`AppMyClosing`) does not yet contain full editable invoice content (title, line item table, bank info, optional fields), only transport/expense/receipt/notes.
- Existing rate resolver explicitly separates client billing and worker payment rates; worker payment rate logic already exists (`resolveWorkerPaymentRate`) and must be reused.
- Employee profile already includes bank fields and stamp URL, so profile extension is partially present and can be tightened with required validation for worker invoice submission.

## 2) Gap against requested requirements
1. Editable invoice data model for workers is missing (structured worker-invoice header + detail rows + versioning/lifecycle).
2. Worker cannot currently open/download previously submitted worker invoices as first-class objects.
3. Lifecycle currently exists for submission status, but not for invoice document states with immutable snapshots per submission/approval.
4. Separation with client invoice is partly present but needs stricter bounded-context separation in API/UI/table names to avoid accidental coupling.
5. Mobile-first section-based editor for worker invoice composition is not present.

## 3) Target architecture
### Bounded contexts (hard separation)
- **Worker Invoice Context** (new)
  - Purpose: worker→Juchou monthly invoice submission.
  - Uses worker payment rates and employee bank/stamp data.
- **Client Invoice Context** (existing)
  - Purpose: Juchou→client billing invoice.
  - No shared mutable tables with worker invoice context.
- **Closing Context** (existing)
  - Keeps month/project open/ready/closed/reopen governance.
  - Worker Invoice context references closing entities but does not replace them.

### Recommended service layering
- `WorkerInvoiceDraftService`
  - create/rebuild draft from closing + attendance + worker rate resolver.
  - apply edits section-by-section.
- `WorkerInvoiceLifecycleService`
  - submit/return/resubmit/approve/lock transitions.
  - validation gates (required profile fields, line item totals consistency, etc.).
- `WorkerInvoiceRenderService`
  - render snapshot to PDF/preview HTML from structured data.

## 4) Proposed DB structure
### New tables (separate from client invoices)
1. `worker_invoices`
   - `id`
   - `closingId` (FK project_closings)
   - `employeeId`
   - `invoiceNumber` (separate sequence namespace, e.g., `WINV-YYYYMM-####`)
   - `status` enum: `draft | submitted | returned | approved | locked`
   - header fields: `subject`, `title`, `issueDate`, `paymentDueDate`, `note`
   - denormalized payer/payee display blocks (to preserve historical accuracy)
   - totals: `subtotal`, `taxAmount`, `totalAmount`
   - `version` (optimistic lock)
   - timestamps (`submittedAt`, `approvedAt`, `lockedAt`), actor IDs
   - index unique `(closingId, employeeId)` for current active document

2. `worker_invoice_items`
   - `id`, `workerInvoiceId`
   - `sortOrder`
   - `itemType` (`normal|text`)
   - `description`, `quantity`, `unit`, `unitPrice`, `amount`, `taxRate`
   - optional metadata: `sourceType` (`attendance_auto|manual`), `sourceRef`

3. `worker_invoice_bank_overrides`
   - optional per-invoice override of bank data (when worker edits bank block for this invoice only)
   - otherwise inherited from employee profile snapshot

4. `worker_invoice_snapshots`
   - immutable JSON snapshots at each transition (`submitted`,`returned`,`approved`,`locked`)
   - includes header, line items, profile snapshot (bank/stamp), computed totals, renderer template version

5. `worker_invoice_files`
   - rendered PDF metadata (storage key/url, hash, generatedAt, snapshotId)

6. `worker_invoice_events`
   - event log for lifecycle and audit (`edit`, `submit`, `return`, `resubmit`, `approve`, `lock`, `pdf_regenerate`)

### Existing table adjustments
- Keep `closing_submissions` for transport/expense/receipt compatibility.
- Add nullable `workerInvoiceId` reference in `closing_submissions` OR map via `(closingId, employeeId)` (preferred: no hard FK initially to reduce migration risk).

## 5) API design (TRPC style)
### Worker endpoints (new namespace `workerInvoice.*`)
- `initDraft({projectId, closingMonth})`
- `getMy({projectId, closingMonth})`
- `updateSection({invoiceId, section, payload, version})`
- `upsertItem({invoiceId, item, version})`
- `deleteItem({invoiceId, itemId, version})`
- `reorderItems({invoiceId, itemIds, version})`
- `preview({invoiceId})` (HTML/JSON view model)
- `submit({invoiceId, version})`
- `downloadPdf({invoiceId})`
- `listMyHistory({fromMonth,toMonth,status?,projectId?})`

### Admin/leader endpoints
- `listForReview({closingMonth, projectId?, status?})`
- `getForReview({invoiceId})`
- `return({invoiceId, reason})`
- `approve({invoiceId})`
- `lock({invoiceId})`
- `regeneratePdf({invoiceId, snapshotId?})`

### Authorization rules
- Worker can access only own invoices.
- Leader/admin can review project-scoped invoices.
- Returned invoices editable only by owner worker.
- Approved/locked invoices read-only for all non-admin edits, but downloadable/viewable.

## 6) UI flow (mobile-first)
1. **Worker Invoice List**
   - month filter + status chips + cards (no wide table).
   - each card: subject, amount, status, actions `Open`, `Preview`, `PDF`.
2. **Worker Invoice Editor** (section-based accordion)
   - Section A: Header (subject/title/dates)
   - Section B: Line items (vertical card rows, add/remove/reorder)
   - Section C: Bank info (profile default + per-invoice override toggle)
   - Section D: Notes/optional fields
   - Section E: Summary + tax + validation warnings
3. **Preview Screen**
   - same renderer as PDF, scaled for mobile viewport.
4. **Submit Confirmation**
   - freeze a submitted snapshot.
5. **Returned State UX**
   - highlight return reason + “edit and resubmit”.
6. **Approved/Locked UX**
   - read-only detail with always-available PDF download.

## 7) PDF generation strategy (data-first)
- Source of truth = structured invoice + snapshot JSON.
- PDF generated from immutable snapshot, not from live mutable draft.
- Keep renderer template versioned (e.g., `worker-invoice-v1`) so old invoices re-render identically.
- Generate on submit and on approval (optional), cache file metadata in `worker_invoice_files`.
- Allow re-generation only from snapshot to avoid drift.
- Reuse current infrastructure patterns from existing `generateInvoicePdf`, but in a separate module (`generateWorkerInvoicePdf`).

## 8) Rate usage strategy
- Auto-fill line items from attendance using `resolveWorkerPaymentRate` only.
- Never call client-rate resolver in worker-invoice builder.
- Persist rate source in item metadata for traceability.
- If worker edits quantity/description manually, retain source flags so admins can audit deviations.

## 9) Integration constraints and compatibility
- Preserve existing `closing.saveMySubmission` reopen/edit recovery behavior.
- Do not modify existing client invoice tables/endpoints except shared utilities.
- Keep AppRates unchanged; only consume rate resolver APIs.
- Introduce feature flag `workerInvoiceV1` for gradual rollout by project/company.

## 10) Risks and mitigations
1. **Domain coupling risk**: accidental reuse of `invoices` table.
   - Mitigation: new tables + new router namespace + code owners.
2. **Lifecycle mismatch with current closing states**.
   - Mitigation: explicit state-transition matrix and guard tests.
3. **Historical inconsistency when profile/bank changes later**.
   - Mitigation: snapshot payer/payee/bank/stamp on submit.
4. **Mobile usability issues in line-item editing**.
   - Mitigation: card-based row editor with progressive disclosure.
5. **Concurrent edits (multiple devices)**.
   - Mitigation: optimistic locking (`version`) + conflict dialog.
6. **PDF/layout drift**.
   - Mitigation: render from snapshot + template version pinning.

## 11) Phased implementation plan
### Phase 0: Discovery & contract freeze
- Confirm exact worker invoice fields (required/optional), tax behavior, numbering, approval actors.
- Define lifecycle transition matrix and return reasons.

### Phase 1: Data model & migrations
- Add worker invoice tables and indexes.
- Add seed/backfill script to initialize drafts for active closings if needed.

### Phase 2: Backend core
- Implement `workerInvoice` service + router endpoints.
- Implement lifecycle guards and audit events.
- Add validation for required profile fields (bank + stamp before submit).

### Phase 3: UI worker flow
- New mobile-first list/editor/preview/detail pages.
- Add read-only history/detail/PDF access.

### Phase 4: Admin review flow
- Review queue, return/approve/lock actions, reason management.

### Phase 5: PDF renderer
- Implement separate worker invoice renderer from snapshot.
- Add regression snapshot tests for layout and totals.

### Phase 6: Compatibility and rollout
- Feature flag rollout project-by-project.
- Verify no regression in:
  - closing reopen/edit recovery
  - AppRates
  - existing client invoice flows

### Phase 7: Hardening
- Add monitoring, audit dashboards, and data-quality checks.
- Load test PDF generation and list/history queries.
