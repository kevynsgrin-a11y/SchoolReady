# PHASE 3 GATE — Parsing (parser-engineer)

- Date: 2026-08-04
- Handoff: `docs/handoffs/04-parser-engineer-3.md`
- Reviewers: scope-guardian (read-only dispatch) + orchestrator (§3.3 re-verification)
- Process note: the phase was interrupted by a harness restart mid-build and
  resumed by a second parser-engineer dispatch that absorbed, repaired, and
  finished the on-disk work (documented in handoff §2).

## Result: PASS

## scope-guardian sign-off (summary; verdicts verified against files)

- **§1.7 (PII never persists) — genuinely enforced, the decisive check.**
  The zero-PII suite seeds all six CLAUDE.md PII categories (plus contact and
  gift recipient) through a full upload cycle, then scans every persistence
  surface that exists this phase: R2 buffer (verified empty via list, with
  key-prefix write enforcement), every D1 table row on real workerd, all
  captured log events, the full serialized outcome, and the redaction report
  itself (structurally categories/counts only). Buffer deletion runs in a
  `finally` block and is proven even on OCR failure.
- **§1.5 (never guess)**: bare "glue", either/or products, conflicting
  quantities, cross-line underspecified binder size, and multiple brands all
  route to review with `needsReview`; `requiresUserConfirmation` is
  literal-type `true`.
- **Hard constraints**: the three canonical phrasings survive
  parse→render→parse with pinned constraint codes plus 10 adversarial cases;
  free prose is rejected from the constraint vocabulary.
- **§0 NOT #1**: corpus is invented, fixture-labeled synthetic content;
  zero network code in src/parsing (fetch-poisoned suite); live OCR is a
  throwing stub.
- **§2**: R2 `UPLOAD_BUFFER` binding justified as transient-buffer-with-TTL
  only; TTL proven with injected clocks on memory, fake-R2, and real R2.
- **§1.4**: intake-method sourceType with full ten-field provenance, gated by
  `provenanceDefect`.
- Locked files intact; brand literal confined to `config/brand.ts`.

## Orchestrator verification

`npm run verify` re-run independently: 21 test files, 291 tests passing
(172 inherited + 115 parsing + 4 auto-discovered fixture guards on the new
corpus); both lints OK; triple typecheck clean.

## Findings ledger

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| P3-1 | minor | Handoff claimed 11 adversarial round-trip cases; actual is 10 (≥5 required) | Handoff corrected by orchestrator at gate time |
| P3-2 | minor | `originalText`/review-payload non-persistence rests on structure + prose until a persistence path exists | **Phase 5 entry condition**: backend-api must extend the workerd zero-PII cycle test over its D1 writes and add no column fed from `originalText` or ReviewPayload text; the Phase 5 gate verifies this explicitly |
| P3-3 | minor | Workers zero-PII twin seeds a smaller value set than the node suite (nothing unscanned) | Assigned to backend-api in Phase 5 while extending that test (align SEEDED/PII_TEXT with the node suite) |

## Gate decision

Phase 3 complete. §1.7 flips to ENFORCED in CLAUDE.md (upload-cycle scope;
Phase 5 extends coverage over its own writes per P3-2). Next:
algorithm-engineer (Phase 4) per handoff §8.
