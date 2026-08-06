# K–8 back-to-school planning utility

A free, anonymous-first, US K–8 back-to-school planning utility: turn a school
supply list into a verified, deduplicated, budgeted shopping plan across
multiple retailers — plus a dress-code-aware clothing capsule, an
evidence-graded "worth it vs. overhyped" layer, and a CPSC recall safety check.

Currently a fixture-mode validation beta: synthetic schools, sample lists,
fixture product data. Every live-data integration is behind a feature flag and
a source-health circuit breaker (`config/flags.ts`).

Live fixture beta: <https://backtoacademy.com>. Deployment and rollback details
are in `docs/release/backtoacademy-launch-runbook.md`.

The working brand name is deliberately isolated in `config/brand.ts` and
appears nowhere else in the codebase.

## Development

```sh
npm install
npm run verify   # lint (ESLint + banned-claims + no-emoji) + typecheck + tests
```

## Project governance

- `CLAUDE.md` — locked product definition (§0) and non-negotiable invariants
  (§1), enforced as code.
- `.claude/agents/` — the 13 specialist sub-agent definitions.
- `docs/handoffs/` — the handoff contract and per-phase gate logs.
