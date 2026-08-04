# PHASE 5 GATE — API (backend-api)

- Date: 2026-08-04
- Handoff: `docs/handoffs/06-backend-api-5.md`
- Reviewers: scope-guardian (two rounds, read-only dispatch) + orchestrator
  (§3.3 re-verification each round)

## Result: PASS (round 2, after one correction round)

## Round 1: FAIL — blocker P5-1

scope-guardian verified nearly every claim (anonymous E2E journey with zero
account creation and full D1/R2/log scans; no entitlement gating of protected
categories with a negative test; §1.2-precursor byte-equality with/without
Season Pass; entry conditions P3-2/P3-3/P4-2/P4-3 all genuinely discharged;
§1.4 provenance gate with envelope walker; fixture-posture Turnstile/Stripe
with throwing live stubs; token-hash-only sessions; §2-justified queue
binding) — but found one blocker:

**P5-1 (§1.7)**: `requiredBrandSlug` was validated for presence only, never
against the brand lexicon. An anonymous client could POST free text (including
a child's name) through /api/lists/confirm into the GLOBAL `brands` table and
read it back — a PII-persistence channel that also falsified the handoff's
own §1.7 discharge claims. Per §3.3, the phase was re-dispatched with a
correction brief; "proceed anyway" was not an option.

## Correction round (backend-api re-dispatch, orchestrator-sanctioned Phase 3 touch)

- Vocabulary check in `parseManualIntake` (exact-match lexicon lookup; error
  carries only the item index, never the value; runs regardless of
  brandRequirement level).
- Independent refusal in `store.ensureBrand` before the codebase's only
  `INSERT INTO brands`.
- +6 tests: node rejection/non-echo/smuggle/positive-case; workers 422 +
  no-echo + row-count + full-D1-dump + direct-bypass refusal; zero-PII cycle
  extended with a PII-shaped brand-field attempt.
- P5-2 fixed alongside: contract-classification suite — every exported
  contract type must be classified carrier/composite/non-fact and carriers
  must literally declare `provenanceIds`, making silent opt-out from the
  §1.4 walker structurally impossible.
- Handoff corrected (§2/§5 falsified claims replaced; §7 records the round).

## Round 2: PASS

scope-guardian re-verified the fix adversarially: check is unconditional and
byte-exact; every intake path (manual, paste, upload, review-confirm) is
governed; no path reaches the brands INSERT unchecked; tests assert what they
claim against real D1 with sqlite_master-discovered table dumps; only the
sanctioned file set changed; no prior test weakened.

## Orchestrator verification

`npm run verify` re-run after each round: round 2 green — 36 test files,
**505 tests** (499 round 1 + 6 correction); both lints OK; triple typecheck
clean; `wrangler deploy --dry-run` bundles clean (handoff §6).

## Findings ledger

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| P5-1 | blocker | Free-text persistence channel via requiredBrandSlug (§1.7) | Fixed in correction round, two independent layers + 6 tests — **closed** |
| P5-2 | minor | Provenance-gate walker keyed on provenanceIds presence; new types could silently opt out | Fixed in correction round (classification suite) — **closed** |
| P5-3 | minor | contracts.ts touched beyond the correction claim list (IntakeData.itemProvenance typing) | Declared in handoff §3, required by P5-2, no scope expansion — recorded as sanctioned |
| P5-4 | info | `brands` table has no schema-level CHECK/length cap (enforcement is application-layer, two tested layers) | Queued: data-architect adds a schema-hardening migration at its next migration round |

## Gate decision

Phase 5 complete. Anonymous full-plan journey proven end-to-end with zero
account creation (Phase 5 acceptance). Next: frontend-engineer (Phase 7),
inputs = design direction (Phase 6) + endpoint contracts (handoff 06 §8),
carrying P5-4 note and the §1.4 render-guard obligation.
