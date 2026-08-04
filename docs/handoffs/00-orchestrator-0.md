# HANDOFF 00 — orchestrator — Phase 0

## 1. Inputs consumed

- The founding brief (product definition §0, invariants §1, stack §2, agent
  system §3, phase pipeline §4, congruence gate §5, critical journeys §6,
  execution rules §7).
- Empty repository state: zero commits on `claude/k8-back-to-school-utility-djw8tm`,
  empty remote (`git ls-remote origin` returned nothing).
- Environment: Node v22.22.2, npm 10.9.7, Linux.

## 2. Decisions made

1. **Agent files named by agent name** (`scope-guardian.md`), not `NN-` prefix
   — the subagent loader keys on frontmatter `name`; roster numbers live in
   each file's description and header. Alternative (NN-prefix filenames)
   rejected: cosmetic, and would desync filename from agent name.
   The interactive `/agents` command is unavailable in this remote harness, so
   the frontmatter schema (`name`, `description`, `tools`, `model`) follows
   current Claude Code documentation and is validated by `tests/agents.test.ts`
   instead.
2. **Plain Vitest now; `@cloudflare/vitest-pool-workers` deferred to Phase 1**
   when D1 bindings exist to test against. Alternative (install now) rejected:
   nothing Worker-runtime-specific exists to test, and the pool requires
   wrangler config that Phase 1 owns.
3. **Split tsconfig** (`tsconfig.json` worker-side, `tsconfig.tests.json`
   node-side): `@cloudflare/workers-types` and `@types/node` declare
   incompatible `URL` globals. One shared config produced real type errors —
   two runtimes, two type environments. `npm run typecheck` runs both.
4. **Lighthouse budgets committed, CI job staged**: `lighthouserc.json` carries
   the §5 budgets from day 0, but the CI job is gated on the `LHCI_ENABLED`
   repository variable until Phase 7 lands a buildable app. Alternative (job
   active now) rejected: it would fail on an empty project or, worse, be
   configured to fake-pass.
5. **Banned-claims lint parses `config/banned-claims.ts`** rather than keeping
   a second list in the script — single source of truth (§1.6). Word-boundary,
   case-insensitive matching so "safest" doesn't false-positive on "unsafest".
6. **"Unsupported viral" excluded from string lint** — "viral" is a permitted
   label when ≥3 signal families pass (§1.3); a string match cannot decide
   supportedness. Enforcement lands as trend-engine tests (algorithm-engineer,
   Phase 4). Declared per §1's "if a test cannot exist… say so" rule: the test
   can exist, but not as a lint.
7. **Working brand name** (disposable; the literal lives ONLY in
   `config/brand.ts`, and per the gate review is not repeated even in docs)
   isolated with `.example` domain and UNSET legal entity — both are release
   blockers owned by release-qa/compliance-officer. Worker/package names are
   brand-neutral (`k8-planner`).
8. **Emoji lint regex**: VS16 (U+FE0F) and the keycap combiner (U+20E3) are
   combining characters, so they live in their own alternation
   (`COMBINING_RE`) — ESLint's `no-misleading-character-class` correctly
   rejects them inside a character class.
9. **Gate round 1 corrections** (from the Phase 0 gate review, logged in
   `docs/handoffs/gates/phase-0-gate.md`): banned-claims regex extended to
   catch trivial plural/possessive forms ("must-haves" was verified to evade
   the original); emoji lint extended with emoji-capable singletons outside
   the main blocks (U+2139 et al., verified to evade the original); brand
   isolation scan widened from three directories to the whole repo with
   `config/brand.ts` as the sole allowlisted file. Each fix carries a new
   regression test.

## 3. Artifacts produced

- `CLAUDE.md` — §0 and §1 verbatim, invariant enforcement table, stack summary, process rules, phase state.
- `.claude/agents/` — 13 files: scope-guardian, data-architect, ingestion-engineer, parser-engineer, algorithm-engineer, backend-api, design-director, frontend-engineer, seo-architect, monetization-engineer, compliance-officer, accessibility-qa, release-qa.
- `config/brand.ts`, `config/banned-claims.ts`, `config/flags.ts`.
- `src/index.ts` (minimal Worker: /healthz), `wrangler.jsonc`.
- `scripts/lint-banned-claims.mjs`, `scripts/lint-no-emoji.mjs`.
- `tests/config.test.ts`, `tests/claude-md.test.ts`, `tests/agents.test.ts`, `tests/lint-scripts.test.ts`.
- `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.tests.json`, `eslint.config.js`, `vitest.config.ts`.
- `lighthouserc.json`, `.github/workflows/ci.yml`, `.gitignore`, `README.md`.
- `docs/handoffs/TEMPLATE.md` and this file. (`docs/handoffs/gates/phase-0-gate.md`
  is produced at gate time by the gate review itself, not claimed here.)

## 4. Contracts exported

From `config/flags.ts` (all agents code against this for fixture/live gating):

```ts
export type SourceId = "nces_ccd" | "cpsc_recalls" | "state_tax_holidays" | "affiliate_feeds";
export interface CircuitBreakerConfig { failureThreshold: number; cooldownSeconds: number; staleAfterSeconds: number; }
export interface Flags { fixtureMode: boolean; liveSources: Record<SourceId, boolean>; circuitBreaker: CircuitBreakerConfig; }
export const DEFAULT_FLAGS: Flags; // fixtureMode: true, every liveSource: false
```

From `config/banned-claims.ts`:

```ts
export const BANNED_CLAIMS: readonly ["must-have", "guaranteed fit", "school approved", "guaranteed savings", "guaranteed delivery", "safest", "best for every child"];
```

From `config/brand.ts` (the ONLY place brand strings may live):

```ts
export const BRAND: { name: string; wordmark: string; domain: string; legalEntity: string; supportEmail: string };
```

Process contracts: `docs/handoffs/TEMPLATE.md` (8-section handoff),
`npm run verify` (= eslint + banned-claims lint + no-emoji lint + dual
typecheck + vitest) must stay green at every gate. Lint scan roots default to
`src/`; agents adding user-facing copy directories MUST extend the script
arguments in `package.json`.

## 5. Invariants touched

- **§1.6 (banned claims): ENFORCED.** `scripts/lint-banned-claims.mjs` in
  `npm run lint`; seeded-violation test `tests/lint-scripts.test.ts` proves a
  planted "must-have" fails the build (exit 1) and clean copy passes.
- **§1.8 (no emoji iconography): ENFORCED.** `scripts/lint-no-emoji.mjs` in
  `npm run lint`; seeded-violation test proves a planted U+1F4DA fails the build.
- **§0 brand isolation: ENFORCED.** `tests/config.test.ts` scans `src/`,
  `scripts/`, `config/` and fails if the brand literal appears outside
  `config/brand.ts`.
- **§0 fixture posture: ENFORCED.** Tests assert fixtureMode defaults ON and
  every live source defaults OFF.
- **§1.1, 1.2, 1.3, 1.4, 1.5, 1.7: DEFERRED** — no ranking, layout, trend,
  provenance, suppression, or intake code exists yet. Owners and proving tests
  are named in CLAUDE.md's "Invariant enforcement status" table; each lands
  with its phase (4, 9, 4, 1+7, 4, 3 respectively). No §1 invariant is
  currently violated because no code path those invariants govern exists yet.

## 6. Acceptance evidence

`npm run verify` (2026-08-01, Node v22.22.2, after gate round 1 corrections):

```
> eslint . && node scripts/lint-banned-claims.mjs && node scripts/lint-no-emoji.mjs
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit
> vitest run
 Test Files  4 passed (4)
      Tests  72 passed (72)
```

- "Every agent file loads": `tests/agents.test.ts` — 53 of the 72 tests
  (roster exactness, frontmatter parse, required keys non-empty, name/filename
  match, all five body sections present, per agent). Corroborated by the
  harness itself: all 13 definitions registered as dispatchable agent types
  in this session, and the scope-guardian gate review ran as a dispatched
  instance of the scope-guardian definition.
- "CLAUDE.md restates the invariants": `tests/claude-md.test.ts` — 4 tests
  asserting §0/§1 anchors and every banned claim verbatim.
- Seeded-violation proof: `tests/lint-scripts.test.ts` — 9 tests (violation →
  exit 1 with the claim/codepoint named on stderr; word-boundary negative
  case; plural/possessive forms; emoji-capable singletons outside the main
  blocks; clean pass; real `src/` pass for both scripts).
- Brand isolation: `tests/config.test.ts` walks the entire repository
  (excluding node_modules/.git/.wrangler/coverage/dist) and fails if the
  brand literal appears outside `config/brand.ts`.
- Independent reproduction: the Phase 0 gate's evidence reviewer re-ran
  `npm run verify` and both seeded-violation checks from a clean prompt and
  confirmed byte-for-byte consistency (see gate log).

## 7. Known gaps and risks

- `wrangler` not yet a dependency; `wrangler.jsonc` is scaffold-only and
  unvalidated by `wrangler`. Phase 1 (data-architect) adds it with D1.
- Lighthouse CI job inert until `LHCI_ENABLED=true` (Phase 7). Budgets file is
  live but nothing runs against it yet.
- `@cloudflare/vitest-pool-workers` and Playwright not yet installed (Phases 1
  and 7/12 respectively, per decision 2).
- `config/brand.ts` carries `.example` domain and UNSET legal entity — release
  blockers by design (release-qa hard constraint).
- Repository had no default branch; this branch's first push creates it, so no
  PR base exists until the owner creates one.
- Lint scan roots are `src/` only; risk that a future agent adds copy outside
  `src/` and forgets to extend roots — called out in frontend-engineer's
  outputs and this handoff's §4.
- `scripts/lint-banned-claims.mjs` excludes paths matching `/fixtures/`, but
  the fixture-mode beta renders fixture data to users. When Phase 2 creates
  `fixtures/`, ingestion-engineer must add a test that fixture display strings
  are free of BANNED_CLAIMS (gate finding SG-4, assigned to Phase 2).
- The `/agents` interactive schema check could not be run in this harness
  (decision 1); frontmatter follows documented schema, validated by test only.

## 8. Instructions to next agent

**data-architect (Phase 1):**

- MUST read CLAUDE.md §0/§1 and this handoff before writing anything.
- MUST implement the full requirement schema fields listed in your agent file
  (they are contractual, from brief §4 Phase 1), the product/variant identity
  graph, and the universal provenance record with ALL ten §1.4 fields.
- MUST give every user-facing table a provenance FK and write the automated
  test proving it. MUST produce reversible migrations and paste up/down run
  output into your handoff.
- MUST add `wrangler` + `@cloudflare/vitest-pool-workers` as devDependencies
  and keep `npm run verify` green (extend it if you add test tooling).
- MUST NOT add PII columns (§1.7 enumerates them), commission/affiliate
  economics columns on ranking-feeding tables (§1.1), or any table that
  stores/mirrors third-party school lists (§0 NOT #1 — we store user-entered
  and user-uploaded requirements only, never republished school lists).
- MUST NOT hardcode brand strings anywhere (test will catch it).
- MUST NOT assume live data exists: everything runs in fixture mode.
- Write `/docs/handoffs/02-data-architect-1.md` per TEMPLATE.md; the gate will
  re-run your stated commands verbatim.
