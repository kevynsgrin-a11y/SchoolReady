# PHASE 0 GATE — Foundation (orchestrator)

- Date: 2026-08-01
- Branch: `claude/k8-back-to-school-utility-djw8tm` (repository's first
  history; this gate is committed together with the Phase 0 tree it certifies)
- Handoff under review: `docs/handoffs/00-orchestrator-0.md`
- Reviewers: scope-guardian (dispatched from its `.claude/agents/` definition,
  read-only), an independent evidence-reproducibility + invariant-coverage
  reviewer, and the orchestrator (personal re-verification per §3.3).

## Result: PASS (after one correction round)

## Round 1 verdicts

**scope-guardian: PASS, 4 minor findings.** Verdicts, each verified against
files: (a) scope drift — none; the scaffold contains only config, lint,
tests, a healthz Worker, and process files; flags' four SourceIds map to MVP
capabilities 3 and 5; agent-file screen/formula inventories stay inside the
five capabilities plus the clothing-capsule clause. Watch items flagged for
later gates (not violations): "first-day outfit builder" and "editorial
templates" (frontend-engineer), "annual data reports" (seo-architect).
(b) The five NOTs — all clear; the no-scrape/no-mirror rule is restated
verbatim in ingestion-engineer and seo-architect definitions, the
affiliate-listicle and ranking-isolation boundaries in monetization-engineer,
anonymous-first/no-child-accounts in backend-api and compliance-officer.
(c) Brand isolation — holds in code; repo-wide grep found the working name
(the literal in `config/brand.ts`) only in that file plus one handoff decision
log line (finding SG-2, fixed). (d) The 13 agent definitions carry the
brief's mandates without invented scope. (e) Artifact existence — 100% except
the gate file itself (finding SG-1, procedural, fixed).

**Evidence/invariant reviewer: FAIL, 1 blocker + 3 minor.** Reproduced
`npm run verify` byte-for-byte against the handoff's §6 claims (then 70
tests; per-file counts independently recomputed). Reproduced both
seeded-violation checks from scratch outside the repo (exit 1, violation
named) and clean passes on `src/`. Confirmed all seven §1.6 strings in
`config/banned-claims.ts`, the lints wired into `npm run lint`, and all six
deferred invariants carrying owner + phase + proving test in both CLAUDE.md's
table and handoff §5. Probed for bypasses and found two real ones (EV-3,
EV-4 below).

## Findings and resolutions

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| SG-1 / EV-1 | blocker | Handoff §3 claimed `docs/handoffs/gates/phase-0-gate.md` before the gate ran; file didn't exist | Handoff §3 amended (gate file is the gate's own deliverable); this file materialized — **fixed** |
| SG-2 | minor | Brand literal hardcoded in handoff decision log (docs not covered by the isolation test) | Decision reworded to reference `config/brand.ts`; see also SG-3/EV brand-scan fix — **fixed** |
| SG-3 | minor | Brand-isolation test scanned only src/, scripts/, config/ | Test now walks the entire repo (excluding node_modules/.git/.wrangler/coverage/dist) with `config/brand.ts` the sole allowlisted file — **fixed** |
| SG-4 | minor | Banned-claims lint excludes `/fixtures/` paths, but fixture data renders to users | Deferred to Phase 2 with explicit assignment: ingestion-engineer adds a fixture-display-strings test; recorded in handoff §7 — **deferred (owner: ingestion-engineer, Phase 2)** |
| EV-2 | minor | All Phase 0 work uncommitted; evidence unpinned to a revision | Resolved by the gate commit this file ships in — **fixed** |
| EV-3 | minor | `"must-haves"` (plural) empirically evaded the banned-claims regex | Regex extended with optional plural/possessive suffix + regression test — **fixed** |
| EV-4 | minor | Bare U+2139 (and sibling emoji-capable singletons U+203C, U+2049, U+3030, U+303D, U+3297, U+3299, keycap U+20E3) empirically evaded the emoji lint | Codepoints added (combining marks in their own alternation) + regression test — **fixed** |

## Round 2 — orchestrator re-verification (§3.3)

`npm run verify` re-run after corrections (Node v22.22.2):

```
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
tsc --noEmit && tsc -p tsconfig.tests.json --noEmit   (clean)
vitest run: Test Files 4 passed (4) / Tests 72 passed (72)
```

The two new regression tests directly cover EV-3 and EV-4. The broadened
brand scan passes over the amended handoff and this gate file. Phase 0
acceptance criteria: verify green — yes; every agent file loads — proven by
53 tests plus the harness registering all 13 as dispatchable agent types;
CLAUDE.md restates the invariants — proven by 4 tests.

## Process notes

- First gate-review attempt via the Workflow orchestration tool failed on a
  harness fault (the workflow runner's permission layer stripped parameters
  from every subagent tool call, including the reviewers' own structured
  output). No verdicts were lost — the review was re-dispatched through
  direct agent dispatch, which worked. Future gates use direct dispatch.
- The interactive `/agents` schema check is unavailable in this remote
  harness; agent-definition validity is enforced by test + observed
  registration instead.

## Gate decision

Phase 0 is **complete**. Next dispatch: data-architect (Phase 1 — data
contracts) with the instructions in handoff §8.
