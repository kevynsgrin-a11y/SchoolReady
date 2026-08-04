# PHASE 6 GATE — Design direction (design-director)

- Date: 2026-08-04
- Handoff: `docs/handoffs/07-design-director-6.md`
- Reviewers: scope-guardian + orchestrator (both required by the Phase 6
  acceptance criterion to confirm brief-specificity)

## Result: PASS

## Specificity confirmation (the acceptance criterion)

Both reviewers independently confirm `docs/design/direction.md` is specific
to this brief and could not be swapped onto an unrelated product as a system:

- The signature element (Sum Rule + Net-Required Stack, §5) renders
  capability 2's required-minus-owned subtraction and capability 3's
  per-retailer landed cost literally — a product without that math has
  nothing to hang it on. Orchestrator read §5 directly and confirms it is
  buildable without interpretation.
- Trend badges embed the §1.3 signal-family count in their labels; the
  provenance line is a designed element; suppression states are designed
  copy; red is reserved exclusively for recalls.
- scope-guardian notes the palette axis alone is the most transplantable
  ("school-ish") but is tied down by its object derivation and the
  mono-for-computed-facts rationale; accepted.

## Checks

- Badge system: all ten mandated badges + additive stale badge, each with
  Lucide icon + mandatory text + color + chip style; icon-only/color-only
  rendering forbidden in the spec.
- Self-critique present with three named revisions (cream+terracotta draft
  discarded; type trio replaces serif-over-Inter; decorative red margin line
  cut) and one accepted risk (pink/red hue proximity) flagged for Phase 11
  CVD testing.
- §1.8: zero emoji codepoints in both new docs (reviewer re-ran the range
  greps); Lucide named with ISC license.
- Zero banned-claim strings; zero brand-name literals; no UI code; nothing
  touched outside docs/design/ + own handoff.
- Orchestrator ran `npm run verify` (agent had no shell): green, 100 tests.

## Findings

None beyond the shared verify note (resolved above).

## Gate decision

Phase 6 complete. Direction is binding input for frontend-engineer (Phase 7),
including the token export contract in direction.md §14.
