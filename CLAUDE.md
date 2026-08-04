# Project memory — single source of truth

This file governs every agent and every phase. §0 and §1 below are LOCKED —
reproduced verbatim from the founding brief. Scope changes route through
scope-guardian before any code is written. tests/claude-md.test.ts asserts this
file continues to restate the invariants.

## §0 PRODUCT DEFINITION (LOCKED — DO NOT EXPAND)

What we are building: A free, anonymous-first, US K–8 back-to-school planning
utility that completes a real task: turn a school supply list into a verified,
deduplicated, budgeted shopping plan across multiple retailers, plus a
dress-code-aware clothing capsule, plus an evidence-graded "worth it vs.
overhyped" layer, plus a CPSC recall safety check.

Five capabilities that define the MVP:

1. List intake + normalization — paste, manual entry, or photo/PDF upload with
   privacy-preserving parsing into a structured requirement schema.
2. Multi-child merge + existing-inventory audit — net-required math across
   siblings and what the household already owns.
3. True basket comparison — landed cost across ≥3 retailers including
   pack-size conversion, tax (with state sales-tax-holiday eligibility),
   shipping, membership, and stop count. Returns a Pareto set, never one false
   "optimal."
4. Worth-it / trend evidence layer — separates popular from worth buying;
   refuses to label anything viral without ≥3 independent signal families.
5. Safety + deadline layer — CPSC recall matching and confidence-gated
   deadline feasibility.

What this is NOT — reject any drift toward these:

- Not a school-supply-list repository. We never scrape, cache, republish, or mirror
  TeacherLists, district PDFs, or school-hosted lists. We interoperate
  and deep-link only.
- Not a "50 best back-to-school products" affiliate listicle.
- Not a fashion magazine. Trend content is a filter, never the homepage
  promise.
- Not back-to-college / dorm. Out of scope entirely for this build.
- Not a children's account product. No child logins, no child-directed data
  collection, no targeted advertising to under-13 audiences.

Launch posture: This build ships as a fixture-mode validation beta first
(synthetic schools, sample lists, fixture product data), with every live-data
integration behind a feature flag and a source-health circuit breaker.
Production feed credentials and partnerships land later without a rewrite.

Brand: The working name is disposable. Put the brand name, wordmark, domain,
and legal entity strings in one config file (/config/brand.ts) referenced
everywhere. Nothing else in the codebase hardcodes the name. Assume it will
change once.

## §1 NON-NEGOTIABLE INVARIANTS (ENFORCE AS CODE, NOT AS POLICY DOCS)

Each of these must be enforced by a passing automated test. If a test cannot
exist for one, an agent must say so explicitly in its handoff.

1. Affiliate commission is never an input to a match score, worth-it score,
   viral score, school-appropriateness result, or default basket optimization.
   Write a test that injects a 40% commission on an inferior product and
   asserts ranking is byte-identical.
2. No ad slot, sponsored unit, upsell, or interstitial may render between a
   user and: a required list item, a safety/recall warning, a dress-code
   restriction, a list correction, a price change, an assistance resource, or
   a shopping deadline. Encode this as a layout-level rule with a test that
   scans rendered route trees for forbidden slot placements.
3. Nothing is labeled "viral" without ≥3 independent signal families passing
   minimum evidence thresholds. Permitted alternative outputs:
   insufficient_evidence, paid_campaign_driven, locally_popular, cooling.
   Default is insufficient_evidence.
4. Every user-facing fact carries provenance: source, source type,
   observation/effective date, retrieval timestamp, geography, transform/model
   version, freshness, confidence, limitations, correction status. A fact
   without provenance does not render.
5. Suppression beats guessing. Suppress or downgrade output when: list is
   stale/unverified, product variant unresolved, price/stock older than
   threshold, single-signal-family trend, unconfirmable school policy, product
   recalled or under review, affiliate data conflicts with neutral source, or
   the deadline cannot be met with confidence.
6. Banned claims. A lint rule must fail the build on these strings in
   user-facing copy: "must-have," "guaranteed fit," "school approved,"
   "guaranteed savings," "guaranteed delivery," "safest," "best for every child,"
   and unsupported "viral." Maintain the list in /config/banned-claims.ts.
7. PII never persists. Uploaded list images are processed ephemerally and
   deleted; child names, teacher names, classroom IDs, addresses, exact sizes,
   household budgets, and gift recipients are never logged, never indexed,
   never sent to third parties.
8. No emoji is ever used as interface iconography. Use a licensed/OSS icon set
   with consistent stroke and grid. Emoji in UI is the single fastest
   credibility failure for this category. Lint for it.

## Invariant enforcement status

| # | Invariant | Enforcement | Status |
|---|-----------|-------------|--------|
| 1 | Commission never ranks | Commission-injection byte-identical test — algorithm-engineer, Phase 4 | **ENFORCED (Phase 4)** — byte-identical injection test + BFS import-closure ban; Phase 5 wires match→basket (gate P4-3), Phase 9 re-verified by boundary test |
| 2 | No ads before critical content | Route-tree scan test — monetization-engineer, Phase 9 | **FULLY ENFORCED (Phases 7+9)** — slot registry + render-time errors (P7) and rendered-byte route scan across every route/state with per-rule counterexamples (P9); zero slots mounted |
| 3 | Viral needs ≥3 signal families | Trend-engine unit tests — algorithm-engineer, Phase 4 | **ENFORCED (Phase 4)** — single-family → insufficient_evidence, same-family dedupe, default insufficient_evidence |
| 4 | Provenance on every fact | Provenance FK on every user-facing table + render guard — data-architect Phase 1, frontend Phase 7 | **FULLY ENFORCED (Phases 1+5+7)** — FK-discovery on live schema, API provenance gate + contract classification, UI render guard (renderFact is the only path to fact markup; refusal renders the suppression reason) |
| 5 | Suppression beats guessing | Suppression-engine tests — algorithm-engineer, Phase 4 | **ENFORCED (Phase 4)** — all eight §1.5 triggers with reason codes; recalled offers excluded from every basket |
| 6 | Banned claims lint | scripts/lint-banned-claims.mjs in `npm run lint` + seeded-violation test | **ENFORCED (Phase 0)** — list additions since the founding brief: "risk-free" (Phase 10 legal review) |
| 7 | PII never persists | Upload-cycle zero-PII test — parser-engineer, Phase 3 | **ENFORCED (Phase 3)** — full-cycle seed+scan on node & real workerd (R2, D1, logs); Phase 5 must extend over its own writes (gate P3-2) |
| 8 | No emoji iconography | scripts/lint-no-emoji.mjs in `npm run lint` + seeded-violation test | **ENFORCED (Phase 0)** |

## Stack (§2 summary)

Cloudflare Workers + Static Assets. D1 (relational), KV (bounded caches,
config, trend snapshots, source-health). Queues + Workflows for jobs. R2 only
for transient upload buffers with hard TTL. Durable Objects only for live
family-collaboration sessions — any other use must be justified in a handoff.
Turnstile on upload/account/alerts. Stripe Season Pass (one-time) primary.
Vitest + @cloudflare/vitest-pool-workers, Playwright, axe-core, Lighthouse CI.

## Process

- Sub-agent definitions: `.claude/agents/*.md` (13 agents; roster in each file's header).
- Handoff contract: `/docs/handoffs/TEMPLATE.md` — every agent writes
  `/docs/handoffs/NN-<agent>-<phase>.md` on completion; the orchestrator
  refuses to advance until it exists and passes the gate.
- Gates: `/docs/handoffs/gates/phase-<n>-gate.md` — requires scope-guardian
  sign-off; failures re-dispatch the same agent with a correction brief.
- Never invent a number. Prices, stock, ratings, commissions, search volume,
  and engagement metrics come from a source or a clearly-labeled fixture.
  Fabricated data is a build failure.
- Fixture mode defaults ON (`config/flags.ts`); every live source is OFF until
  credentials + licensing land.
- `npm run verify` = lint (ESLint + banned-claims + no-emoji) + typecheck + tests.
  It must stay green at every gate.

## Phase state

| Phase | Owner | Status |
|-------|-------|--------|
| 0 Foundation | orchestrator | **Complete** — gate passed (docs/handoffs/gates/phase-0-gate.md) |
| 1 Data contracts | data-architect | **Complete** — gate passed (docs/handoffs/gates/phase-1-gate.md) |
| 2 Ingestion | ingestion-engineer | **Complete** — gate passed (docs/handoffs/gates/phase-2-gate.md) |
| 3 Parsing | parser-engineer | **Complete** — gate passed (docs/handoffs/gates/phase-3-gate.md) |
| 4 Algorithms | algorithm-engineer | **Complete** — gate passed (docs/handoffs/gates/phase-4-gate.md) |
| 5 API | backend-api | **Complete** — gate passed round 2 (docs/handoffs/gates/phase-5-gate.md) |
| 6 Design direction | design-director | **Complete** — gate passed (docs/handoffs/gates/phase-6-gate.md) |
| 7 Frontend | frontend-engineer | **Complete** — gate passed (docs/handoffs/gates/phase-7-gate.md) |
| 8 SEO | seo-architect | **Complete** — gate passed (docs/handoffs/gates/phase-8-gate.md) |
| 9 Monetization | monetization-engineer | **Complete** — gate passed (docs/handoffs/gates/phase-9-gate.md) |
| 10 Compliance | compliance-officer | **Complete** — gate passed (docs/handoffs/gates/phase-10-gate.md) |
| 11 Accessibility | accessibility-qa | **Complete** — gate passed (docs/handoffs/gates/phase-11-gate.md) |
| 12 Release | release-qa | **Complete** — final gate passed (docs/handoffs/gates/phase-12-gate.md); release BLOCKED on 8 human-owned launch items (docs/release/launch-checklist.md) |
