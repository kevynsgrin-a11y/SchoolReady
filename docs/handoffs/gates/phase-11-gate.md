# PHASE 11 GATE — Accessibility (accessibility-qa)

- Date: 2026-08-04
- Handoff: `docs/handoffs/12-accessibility-qa-11.md` (+ gate errata block)
- Audit: `docs/a11y/audit-phase-11.md`
- Reviewers: scope-guardian (read-only dispatch) + orchestrator (§3.3
  re-verification, including independent re-execution of both suites)

## Result: PASS

## scope-guardian sign-off (summary; verdicts verified against files)

- **Acceptance bar met without waivers**: the helper hard-fails on any
  serious/critical axe violation with no disableRules/exclude path; coverage
  spans live wrangler-dev journeys (including the recalled-UPC safety
  intercept) and 16 real-renderer snapshots covering recalled, entitled,
  stale, and guard-refusal states. Deferred heading-order advisory is
  genuinely moderate/best-practice with a written design rationale routed to
  design-director.
- **Fixes real and minimal**: D1 (renderFact list-children), D2 (banner
  focus ring, tokens untouched, deviation flagged), D3 (provenance-on-red
  contrast) spot-checked in code; tokens byte-consistent with the pinned
  design direction; zero edits in Phase 0–10 test files.
- **Honest screen-reader posture**: journey analysis labeled as
  semantic/ARIA analysis, not an AT pass; 8-item human-AT checklist flagged
  as a launch gate for release-qa.
- **Contrast/CVD scripted**: Machado 2009 severity-1.0 matrices reproduced
  exactly (all 27 constants verified); every badge pair + focus indicator
  computed; pink/red conclusion rests on structural WCAG 1.4.1 CSS
  assertions, numeric floors as regression tripwires.
- **Lighthouse (P7-4 discharged)**: committed LHCI artifacts corroborate the
  scores (assertion-results.json empty = all budgets green); /plan SEO 0.63
  independently explained by the default-deny noindex map; the lighthouserc
  fix that made LHCI runnable is documented in-file.

## Orchestrator verification

`npm run verify`: 56 files / **804 tests** green (baseline intact).
`npm run test:a11y`: **65/65** green in 53s against live wrangler dev on the
preinstalled Chromium. Both re-executed independently at gate time.

## Findings ledger

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| P11-1 | minor | Handoff §6 test-count arithmetic understated (30/44 vs actual 41/49; 14 vs 16) | Errata appended by orchestrator |
| P11-2 | minor | Contrast-pair count off by one (34 entries / 33 printed rows vs "35") | Same errata |
| P11-3 | minor | LHCI artifact paths uncited; live-mode Lighthouse pair unarchived | Errata cites paths; release-qa re-runs the live pair in the congruence gate |
| P11-4 | minor | Stale deltaE comment in contrast.spec.ts | Corrected at gate (~30 → ~42) |
| P11-5 | minor | Reviewer claimed CLAUDE.md rows 3–10 stale | Stale read (third occurrence across gates) — rows verified correct on disk; only the Phase 11 flip was due |

## Gate decision

Phase 11 complete. Remaining launch conditions carried to Phase 12:
human-AT checklist, live-mode Lighthouse pair, P9-1 upload-path capture,
P9-2 browser-level overlay check, P10-3 KvLike hardening, brand
domain/legalEntity blockers. Next: release-qa (Phase 12).
