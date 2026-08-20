# AI Bridge Operating Protocol

Purpose: reduce owner bridge work, token waste, and stop/go churn while preventing Claude/ChatGPT/Codex from overreaching.

This protocol applies to the business/operations system by default unless the Owner explicitly overrides it.

## Operating standard
1. One bridge message should carry a long, dependency-ordered work packet.
2. Safe work should continue sequentially without stopping after every PR or phase.
3. Do not ask the Owner “continue?” after each PR when safe dependent work remains.
4. Codex P0/P1 findings must be addressed; P2 findings affecting truth, data integrity, permissions, security, concurrency, payroll/attendance calculations, owner-facing correctness, or irreversible business records should normally also be addressed.
5. Do not merge until required CI/checks are green, unless the repository has no applicable CI and that limitation is explicitly recorded.
6. Return to the Owner only for credentials/OAuth/permissions, destructive migration/deletion, irreversible business-record changes, external production actions, paid-service changes, or other owner-only approvals.
7. UNKNOWN must not be silently converted to success, failure, zero, healthy, approved, paid, attended, or verified.
8. Owner-confirmed facts must not be erased by transient API/runtime errors unless stronger contradictory evidence exists.
9. Every new gate/guard must have consumer-level tests proving rejected/invalid records are actually excluded at the point where payroll, attendance, scheduling, reporting, billing, or workflow decisions consume them.
10. End each work session with one compact CHECKPOINT block.
11. Results and the next handoff prompt must be delivered as a single copy-ready block when Owner bridging is needed.
12. Minimize Owner effort and token consumption by referencing PRs, SHAs, file paths, checkpoints, and durable docs instead of repeating project history.

## Roles
- Owner: bridge only when unavoidable; approves irreversible, credential, permission, financial, or externally consequential production actions.
- Claude: implementation agent. Executes long work packets, creates/updates PRs, runs tests/CI, fixes review findings, and leaves a checkpoint when session/context ends.
- ChatGPT: review/strategy agent. Reviews PR state, Codex findings, tests and evidence, then produces the next long work packet without re-explaining already recorded history.
- Codex: automated PR reviewer. Findings are evidence to investigate, not an authority to obey blindly.

## Business-system anti-runaway rules
- No mass deletion, employee/worker record removal, payroll rewrite, attendance rewrite, billing rewrite, permission expansion, production cutover, or destructive migration without explicit Owner approval when irreversible or materially risky.
- Do not fabricate attendance, overtime, travel cost, project assignment, worker identity, approval state, invoice value, payment state, or audit evidence.
- unknown != zero; missing != absent; draft != approved; scheduled != worked; measured != billed.
- A dashboard or automation recommendation must not silently mutate authoritative business records.
- Derived totals must remain traceable to source rows and calculation rules.
- External/guest worker links, user roles, and admin permissions must fail closed when identity or authorization is ambiguous.
- New automation/readiness does not grant approval authority by itself.
- State, provenance, identity and approval records must survive restart/sync without silently changing meaning.

## Work packet format
Each bridge prompt should contain only what is needed to resume safely:
- CURRENT CHECKPOINT: PRs/SHA/current verified facts.
- OBJECTIVE: one large milestone.
- DEPENDENCY ORDER: safe execution order.
- REQUIRED TESTS / CODEX LOOP.
- STOP CONDITIONS: owner-only actions.
- CONTINUATION RULE: merge -> next safe task; do not ask “continue?”.
- FINAL REPORT ONLY: one compact result plus checkpoint.

## Checkpoint format
```text
CHECKPOINT
project: BUSINESS_SYSTEM
last_merged_pr:
last_merge_sha:
open_pr:
open_pr_head_sha:
completed:
verified_real_data:
remaining_queue:
known_blockers:
owner_action_required:
next_actor: CLAUDE | CHATGPT | OWNER | NONE
safe_next_step:
external_production_effect: NO/YES
financial_or_business_record_mutation: NO/YES
irreversible_change: NO/YES
```

The next agent must use this checkpoint instead of reconstructing history from chat unless evidence is missing or contradictory.

## Owner-facing output contract
When Owner bridging is required:
1. Give a short RESULT section.
2. Give exactly one copy-ready PROMPT block for the next agent when a handoff is needed.
3. Do not split the prompt into fragments the Owner must assemble.
4. Do not repeat history already captured in repository docs/checkpoints unless it changes the decision.

## Token discipline
- Prefer PR number, SHA, file path, checkpoint and concise evidence over narrative repetition.
- Reuse durable repository docs as the source of truth.
- Review changed code and current evidence rather than re-auditing already merged foundations without a reason.
- Prefer one large bridge packet over many micro-prompts.

## Default mode
The Owner manually bridges Claude <-> ChatGPT for now. Both agents must actively minimize how often that bridge is needed while preserving the stop conditions above.