# HANDOFF 06 — backend-api — Phase 5

## 1. Inputs consumed

- `CLAUDE.md` §0 (anonymous-first, launch posture, NOT list), §1 invariants
  1, 2 (precursor), 3, 4, 5, 7; §2 stack rules (Queues justification, DO
  restraint, Turnstile surface, Stripe Season Pass).
- `docs/handoffs/05-algorithm-engineer-4.md` §4 + §8 (binding pipeline order,
  P4-2/P4-3 entry conditions, matchScore wiring, full-Pareto serving,
  suppression on every algorithm output, fixture tax caveat survival).
- `docs/handoffs/gates/phase-3-gate.md` (P3-2, P3-3) and `phase-4-gate.md`
  (P4-2, P4-3) — all four discharged this phase (§5, §6).
- Contracts: `src/contracts/` (all), `src/algorithms/index.ts`,
  `src/parsing/index.ts`, `src/ingestion/index.ts`, `config/flags.ts`.
- Fixtures: all six Phase 2-4 sets (consumed); three new sets created (§3).

## 2. Decisions made

1. **Sessions are D1 rows keyed by a token HASH; the token lives only in the
   cookie.** `api_sessions` (migration 0007) stores sha-256(token) +
   anonymous household link + timestamps — nothing else, structurally
   (§1.7). Alternative (KV sessions) rejected: §2 sanctions KV for bounded
   caches/config; a session->household link is relational state. There is
   deliberately NO accounts table and no route knows the concept
   (`tests/api-policy.test.ts` asserts patterns and session modes).
2. **The confirm step re-validates through the Phase 3 manual-entry
   validator, and the request contract has no text field.**
   `POST /api/lists/confirm` allowlist-maps items into `ManualEntryItem`,
   runs `parseManualIntake` (controlled vocabularies; sanitizer throws), and
   persists draft fields only. originalText/ReviewPayload text has NO path
   into any INSERT (P3-2); smuggled extra fields are structurally dropped
   (tested against a full-table scan). Alternative (server-side draft
   storage between parse and confirm) rejected: nothing unconfirmed should
   persist, and stateless parse means nothing unconfirmed CAN persist.
   **Correction (gate round 1, P5-1):** round 1 of this handoff overclaimed —
   `requiredBrandSlug` was checked for PRESENCE only, not membership in
   `BRAND_LEXICON`, leaving one free-text channel into the global `brands`
   table via `ensureBrand`. Fixed in two independent layers (orchestrator
   sanction for the Phase 3 file): `parseManualIntake` now vocabulary-checks
   the brand slug via `getBrandEntry` exactly like color/material (rejects
   without echoing the value), and `store.ensureBrand` independently refuses
   non-lexicon slugs before any INSERT, so a future parsing change cannot
   reopen the channel. Tested at both layers plus the full-table scan.
3. **Basket derivation is an exported pure function so byte-identity is
   provable.** Route = `computeMergePlan` -> `deriveBasketInputs`
   (rankCandidates feeds matchScore; `filterRecalledOffers` runs BEFORE
   optimization; `evaluatePriceStockAge` suppresses/downgrades per offer) ->
   `optimizeBasket`, serialized VERBATIM. The workers test re-runs the same
   derivation and asserts `JSON.stringify` equality with the response
   (P4-3). No API code path sorts or filters basket options after
   `optimizeBasket` returns.
4. **Candidate attributes come from a synthetic entity-resolution fixture,
   not from feed titles.** `fixtures/catalog/variants.fixture.json` maps
   (retailerSlug, sku) -> attributes/packCount/taxCategory; offers without a
   RESOLVED mapping are excluded with `unresolved_product_variant` notes
   (§1.5) — attribute-guessing from titles rejected as invented data.
   Retailer delivery estimates live in `fixtures/retailers/logistics...`
   as labeled `fixture_assumption`s (fixture-supply-co is deliberately
   unknown, priced as uncertainty). Sales-tax rates are labeled placeholder
   fixtures (`fixtures/tax-rates/...`); an unknown state yields rate 0 plus
   a VISIBLE "tax NOT estimated" assumption, never a guessed rate.
5. **§1.4 as a response gate, not a convention.** Every response is an
   `ApiOk` envelope with a `provenance` dictionary; `okEnvelope()` walks
   `data` and THROWS on any fact node with empty/unresolvable/incomplete
   `provenanceIds` — the router converts that into a 500 with NO data
   (suppression beats shipping). `filterProvenanced()` drops list entries
   upstream so the gate is a tripwire, not the mechanism. Both halves are
   tested (unit + a walker over every envelope the workers suite produced).
6. **Route POLICY is data.** Each route declares category / session mode /
   turnstile / rate-limit / entitlementGated; `assertRoutePolicies` REFUSES
   a table that gates a protected category (required data, safety, deadline)
   behind an entitlement, and tests pin the shipped table (§1.2 precursor:
   nothing at all is gated in this beta; a purchased pass changes ZERO bytes
   of core responses — byte-equality tested).
7. **Turnstile + Stripe are interfaces with fixture implementations; live
   stubs THROW.** Same pattern as Phase 2/3 live stubs: no siteverify call,
   no signature crypto, no SDK exists to misconfigure. Turnstile sits on
   upload + alert subscription; account creation does not exist to protect
   (documented as N/A, §7). Rate limiting is a KV token bucket keyed by
   session-token hash (never IP, never identity), injected clock, tested
   for burst/deny/refill.
8. **Sources are served cache-first through the Phase 2 pipelines.**
   `serveSource` = SWR read, refresh only when nothing is cached, circuit
   breaker gating the refresh; envelope staleness/circuit state ships on
   `meta.sources` for the frontend badge. Offer-level staleness additionally
   runs through `evaluatePriceStockAge` (downgrade at 6h, suppress at 7d),
   so a stale cache degrades honestly instead of erroring (tested: 8-day-old
   offers -> basket infeasible with visible reasons, plus stale source badge).
9. **Logging is allowlist-based** (`LOG_FIELD_ALLOWLIST`): the logger drops
   any non-allowlisted key and any non-primitive value, surfacing only a
   content-free `droppedFieldCount`. There is no API to log a request body.
   Parse-pipeline events pass through the same allowlist.
10. **Queues binding justified and wired** (§2): `ingestion-refresh`
    producer + consumer in wrangler.jsonc carrying exactly the Phase 2
    `RefreshJobMessage` contract; the consumer re-seeds SWR caches through
    the same adapters/breakers (fixture-only; `nces_ccd` skipped VISIBLY
    until a serving pipeline exists). No Durable Objects: §2 reserves DO for
    live family collaboration, which does not exist in this beta.
11. **Alert subscriptions are in-app and channel-less.** The
    `alert_subscriptions` table has no email/phone/push column AT ALL
    (§1.7); alerts surface when the household returns. Delivery channels
    are a later phase with compliance review.

## 3. Artifacts produced

Created:
- `src/api/`: `contracts.ts` (frontend-facing request/response types),
  `errors.ts`, `logging.ts`, `provenance-gate.ts`, `rate-limit.ts`,
  `turnstile.ts`, `stripe.ts`, `deps.ts`, `catalog.ts`, `sources.ts`,
  `plan.ts`, `session.ts`, `store.ts`, `http.ts`, `routes.ts`, `index.ts`
- `migrations/0007_sessions_alerts.sql` + `migrations/down/0007_...` —
  `api_sessions`, `alert_subscriptions` (provenance FK, STRICT, §1.7-clean;
  auto-covered by the Phase 1 schema discovery suites)
- `fixtures/catalog/variants.fixture.json`,
  `fixtures/retailers/logistics.fixture.json`,
  `fixtures/tax-rates/rates.fixture.json` (all wrapper-labeled; +12
  auto-discovered fixture-guard tests)
- `tests/helpers/api.ts`, `tests/api-modules.test.ts` (21),
  `tests/api-plan.test.ts` (9), `tests/api-policy.test.ts` (22)
- `tests-workers/api-helpers.ts`, `tests-workers/api-endpoints.test.ts`
  (25), `tests-workers/api-journey.test.ts` (1),
  `tests-workers/api-queue.test.ts` (2)

Correction round (gate finding P5-1 + minor P5-2):
- `src/parsing/pipeline.ts` — SANCTIONED Phase 3 touch: `parseManualIntake`
  vocabulary-checks `requiredBrandSlug` against `BRAND_LEXICON` (rejects via
  `ManualEntryValidationError`, offending value never echoed)
- `src/api/store.ts` — `ensureBrand` independently refuses non-lexicon brand
  slugs (422) before any INSERT; module header claim corrected
- `src/api/contracts.ts` — `IntakeData` now types `itemProvenance` (the
  routes already shipped it; typing it lets P5-2 classify it as a carrier)
- New tests: `tests/parsing-review.test.ts` "rejects a requiredBrandSlug
  outside the brand lexicon WITHOUT echoing it (P5-1)";
  `tests-workers/api-endpoints.test.ts` "refuses a free-text
  requiredBrandSlug: 422, never echoed, no brands row, nothing in D1 (P5-1)"
  and "store.ensureBrand independently refuses non-lexicon slugs (P5-1
  defense in depth)"; `tests/api-policy.test.ts` P5-2 contract-classification
  suite (3 tests: every exported contract type explicitly classified,
  carriers literally declare `provenanceIds`, composites reference checked
  carriers incl. the algorithm-side ones); zero-PII journey cycle extended
  with a PII-shaped `requiredBrandSlug` attempt (422 + end-of-cycle scan)

Modified (each at a sanctioned point):
- `src/index.ts` — /api/* routing, `buildApiDeps` composition root (the ONE
  place real clock/ids/bindings are injected), queue consumer, fixture
  library JSON imports, `Env.INGESTION_QUEUE`
- `wrangler.jsonc` — queues producer/consumer with §2 justification comment
- `tsconfig.json` — `resolveJsonModule` (fixture JSON bundling)
- `tests/algorithms-independence.test.ts` — P4-2: economics scan now covers
  the FULL import closure (sanctioned by phase-4-gate)
- `tests-workers/parsing-upload-r2.test.ts` — P3-2/P3-3: seeded set aligned
  with the node suite (all 13 values, all 8 categories) and the cycle
  extended over the API's D1 writes (sanctioned by phase-3-gate)
- `tests-workers/env.d.ts` — INGESTION_QUEUE mirror

Untouched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
prior handoffs, migrations 0001-0006, `src/algorithms/`, `src/parsing/`,
`src/ingestion/`, `src/contracts/`, and every other Phase 0-4 test.

## 4. Contracts exported

All request/response types in `src/api/contracts.ts`; envelope:

```ts
ApiOk<T>  = { ok: true; data: T; provenance: Record<string, ProvenanceRecord>;
              suppressions: SuppressionNote[]; assumptions: Assumption[];
              meta: { generatedAt; fixtureMode; sources: SourceStatus[] } }
ApiErr    = { ok: false; error: { code: ApiErrorCode; message; retryAfterSeconds? }; meta }
SuppressionNote = { subject: string; decision: SuppressionDecision }   // §1.5 badge input
SourceStatus    = { sourceId; stale; ageSeconds; storedAt; circuitState; degraded }
SESSION_COOKIE = "k8p_sid"; TURNSTILE_HEADER = "x-turnstile-token";
STRIPE_SIGNATURE_HEADER = "x-webhook-signature"; ALERT_KINDS; CORE_ACCESS_NOTICE
```

Endpoints (19; session modes: none | read | ensure — "ensure" mints the
anonymous cookie, nothing ever needs more):

| Endpoint | Session | Req -> Resp (data) |
|---|---|---|
| GET /api/session | ensure | -> `SessionData` |
| POST /api/intake/paste | ensure | `PasteIntakeBody` -> `IntakeData` (+itemProvenance) |
| POST /api/intake/manual | ensure | `ManualIntakeBody` -> `IntakeData` |
| POST /api/intake/upload | ensure, Turnstile, rate-limited | raw image/PDF bytes -> `IntakeData` |
| POST /api/lists/confirm | ensure | `ConfirmListBody` -> `ConfirmListData` (201) |
| GET /api/lists | read | -> `ListsData` |
| POST /api/inventory | ensure | `InventoryBody` -> `InventoryData` (201) |
| GET /api/inventory | read | -> `InventoryData` |
| GET /api/plan/merge | read | -> `MergeData` (NetRequiredLine[] verbatim) |
| POST /api/plan/basket | read | `BasketBody` -> `BasketData` (`basket: BasketParetoResult \| null`) |
| GET /api/plan/checklist | read | -> `ChecklistData` (printable payload) |
| POST /api/capsule | none | `CapsuleBody` -> `CapsuleData` |
| GET /api/trend/:slug | none | -> `TrendData` (label+confidence+evidence together) |
| GET /api/recalls | none | -> `RecallsData` |
| POST /api/recalls/check | none | `RecallCheckBody` -> `RecallCheckData` |
| POST /api/alerts/subscribe | ensure, Turnstile, rate-limited | `AlertSubscribeBody` -> `AlertSubscribeData` (201) |
| GET /api/alerts | read | -> `AlertsData` |
| GET /api/entitlements | read | -> `EntitlementsData` |
| POST /api/webhooks/stripe | none | `SeasonPassWebhookBody` (fixture-signed) -> `WebhookAckData` |

Error codes: `API_ERROR_CODES` (404 not_found, 405, 400 invalid_request,
422 validation_failed, 403 turnstile_required/turnstile_failed, 429
rate_limited (+Retry-After header), 400 session_required, 410
upload_unavailable, 422 basket_search_space_exceeded, 400
webhook_verification_failed, 503 live_integration_disabled, 500
provenance_gate_failure / internal_error).

Pipeline surface for tests/tooling: `computeMergePlan(rows, inventory)`,
`deriveBasketInputs(args)`, `deriveCandidates(...)`, `lookupSalesTax(...)`,
`createSourcePipelines(deps)/serveSource`, `checkRateLimit`,
`assertResponseProvenance/filterProvenanced`, `createAllowlistLogger`,
`buildApiDeps(env)` and `FIXTURE_LIBRARY` (src/index.ts).

## 5. Invariants touched

- **§1.4 (API half) — ENFORCED.** Provenance gate on every ok-envelope
  (throw -> suppressed 500, no data); walker tests over unit cases AND every
  envelope the workers suite produced (30+ fact nodes, all resolvable and
  ten-field-complete). Render-guard half remains Phase 7. P5-2 addition:
  because the walker keys on the presence of `provenanceIds`, a
  contract-classification test now enumerates EVERY exported type in
  `src/api/contracts.ts` and forces it into carrier / composite / non-fact
  (with stated reason) — a future contract cannot silently opt out.
- **§1.2 precursor — ENFORCED (structural).** Route policy table + refusing
  router + shipped-table tests + byte-equality of core responses with and
  without a Season Pass. Full layout-level ad-slot rule remains Phase 9.
- **§1.7 — coverage EXTENDED per P3-2/P3-3; P5-1 free-text channel CLOSED.**
  Workers cycle now seeds the full node-suite PII set PLUS a PII-shaped
  `requiredBrandSlug` attempt, drives the API confirm path, and scans every
  D1 row (including the new Phase 5 tables), the API envelopes, and the
  allowlist logs. Error messages redact quoted request content. Round 1 of
  this handoff wrongly claimed no free text could reach persistence:
  `requiredBrandSlug` was presence-checked only and flowed into the global
  `brands` table. Now vocabulary-checked in `parseManualIntake` AND refused
  independently in `store.ensureBrand` (defense in depth), both layers
  tested against real D1 with full-table scans.
- **§1.1 — P4-2 closed.** Economics-identifier scan now covers the full
  transitive closure of src/algorithms (which remains free of any API
  import; the API imports algorithms, never the reverse).
- **§1.5** — every basket/merge/trend/recall response runs the relevant
  evaluators; suppressed facts are omitted, downgraded facts ship WITH
  findings (`suppressions[]`); recall filtering precedes optimization on
  every basket; §1.3 defense guard on the trend route.
- **P4-3 closed** — matchScore from rankCandidates (asserted equal), basket
  response byte-identical to `optimizeBasket` output.

## 6. Acceptance evidence

All commands run 2026-08-04, Node v22, exit 0. `npm run verify` tail
(correction round included):

```
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.workers-tests.json --noEmit
> vitest run
 Test Files  36 passed (36)
      Tests  505 passed (505)
```

505 = 412 inherited (Phase 0-4 baseline; the two sanctioned extensions kept
their counts) + 80 API tests (node: modules 21, plan 9, policy 22; workers:
endpoints 25, journey 1, queue 2) + 12 auto-discovered fixture-guard tests
+ 1 sanctioned P5-1 extension in tests/parsing-review.test.ts (now 19 in
that file). Round-1 baseline was 499/36; the correction round added 6 tests
in existing files and weakened none.
`npx wrangler deploy --dry-run` bundles clean with all five bindings.

Hand-computed values asserted by named tests (fixture data, never invented):
- Merge: glue 12+6=18 gross; inventory 4x1.0+3x0.5=5.5; net 12.5 -> buy 13.
- Match: 13 glue units into 6-packs -> purchased 18 -> pack_fit 13/18 ->
  score **0.7222** on every glue offer (only applicable dimension).
- Basket (TX, purchase 2026-08-08 inside the fixture holiday window,
  daysUntilNeeded 4): 18 options, frontier {984, 994, 1004}; lowestCost 984
  (costComplete FALSE — supply-co shipping unknown); fewestStops 1004
  (all-mart); highestConfidence lowConfidenceCount 2; tax 0 on every option
  WITH the "UNVERIFIED fixture calendar" caveat; depot crayons excluded
  "out of stock"; response byte-identical to optimizeBasket.
- Staleness: cache aged 8 days -> 9 suppress notes, basket infeasible,
  `meta.sources` stale badge; 7h -> 9 downgrade notes, offers retained.
- E2E journey: paste + PII-laced upload -> confirm x2 -> inventory -> merge
  (13/2/24) -> basket (feasible, frontier >= 2) -> checklist (2 members, 3
  lines) with ZERO account surface and zero PII in envelopes/logs/D1/R2.
- Zero-PII cycle (P3-2/P3-3 + P5-1): 13 seeded values, 8 categories, full-
  table D1 scan over live API writes (>= 3 persisted requirements incl.
  constraint codes `no_bluetooth`,`wired_required`) — no surface leaks. The
  journey cycle additionally attempts a PII-shaped `requiredBrandSlug`
  ("Zephyrine Quatermain") through /api/lists/confirm: 422, value in no
  response, no log, no D1 row, and the `brands` table gains nothing (also
  asserted by row count in the endpoints suite and by a direct
  `ensureBrand` refusal test that bypasses the parse pipeline).

## 7. Known gaps and risks

- **Correction round (Phase 5 gate round 1).** The gate FAILED round 1 on
  blocker P5-1: `requiredBrandSlug` was presence-checked only, so free text
  (including PII) could persist into the cross-household `brands` table and
  read back via GET /api/lists — falsifying this handoff's round-1 §2
  decision 2 and the store.ts header claim. Fixed 2026-08-04 with a
  two-layer vocabulary check (parse pipeline + store; see §2 decision 2 and
  §3), three new tests plus the extended zero-PII cycle, and the minor P5-2
  contract-classification tripwire. The corrected claims above are the
  binding ones. Residual risk: the `brands` table still has no CHECK/length
  cap at the schema level (migrations are data-architect territory); the
  application layers are now the enforcement, both tested.
- **Account creation does not exist**, so the §2 "Turnstile on account"
  surface is N/A by construction. If optional accounts ever land (they are
  never required), they take Turnstile + rate limiting via the existing
  middleware flags.
- **Upload OCR works only where a labeled fixture replay exists** (tests).
  The production `FIXTURE_LIBRARY` OCR set is empty, so real uploads fail
  closed with a descriptive 422 — correct for the beta, not a product yet.
- **Merged lines drop `material` and assume `shareable: false`** —
  conservative (§1.5): material never dilutes a score; nothing is presumed
  household-shareable (over-buying is visible, a guessed pool is not). A
  user-facing "shareable" toggle would need a requirements column
  (data-architect) — deliberately not smuggled in this phase.
- **Inventory offsets at product-type granularity only** (no dims/color
  columns on inventory_items), so variant-specific lines are never offset
  by generic stock — conservative, never wrong, sometimes over-buys.
- **ER thresholds still uncalibrated** (Phase 4 gap): the catalog fixture
  hand-labels resolutions; live ER scoring returns to algorithm-engineer
  when real feed data exists.
- **Basket for very large households** can throw
  `BasketSearchSpaceError` -> 422 with a split-the-list message; automatic
  chunking is future work.
- **Rate-limit buckets are KV-eventually-consistent** — burst limits are
  approximate across colos; acceptable for abuse damping, not billing.
- **workers-pool storage is SHARED across tests in a file** (and KV caches
  across suites): tests must clear `cache:*` keys when overriding fixture
  docs (`clearSourceCaches`) and resolve households via their own cookie.

## 8. Instructions to next agent

**frontend-engineer (Phase 7)** — code against `src/api/contracts.ts` only:

- **Envelope discipline:** render facts ONLY from `data` nodes whose
  `provenanceIds` resolve in `envelope.provenance` — that record carries the
  ten §1.4 fields your render guard (§1.4's other half) must enforce,
  including `freshness`, `limitations`, and `correctionStatus`. Render
  `suppressions[]` as badges on the named `subject`; a downgraded fact
  without its badge is a §1.5 violation. `assumptions[]` (basis:
  model_constant | fixture_assumption | user_input) must render as labeled
  assumptions, NEVER as facts — especially `sales_tax_rate` and
  `delivery_days_*`. `meta.sources[].stale` drives the stale badge.
- **Basket:** `data.basket` is the FULL Pareto result — show the frontier
  and the four labeled views; never present one option as "the answer",
  never re-sort by anything but the user's explicit choice of view; the
  words optimal/best/recommended do not exist (§0 cap 3; lint will catch
  copy). `taxCaveats` (unverified fixture calendars) MUST render with tax
  numbers. `itemMatches[].excluded` disqualifiers are user-visible ("why
  isn't X shown"). `basket: null` means "nothing to buy" — say that.
- **Journeys:** the anonymous cookie is set by your first intake call —
  never show an account wall, never block required-list rendering on
  anything (§1.2: the route table already refuses gating; your layout must
  match — Phase 9's slot-scan test will check). The review payload
  (`requiresUserConfirmation: true`) is a MANDATORY screen; confirm by
  POSTing controlled-vocabulary items only (send back `proposed` fields —
  never `originalText`, which the API ignores and must keep ignoring).
- **Turnstile:** render the widget on upload + alert subscription only; in
  fixture mode submit `FIXTURE_TURNSTILE_PASS_TOKEN` via
  `x-turnstile-token`. Handle 429 with `retryAfterSeconds`/Retry-After.
- **Trend/worth-it:** render `label` + `confidence` + `familyEvaluations`
  together — never a label alone (§1.3). `insufficient_evidence` is a
  first-class, honest state, not an error.
- **MUST NOT:** call any algorithm module directly from UI code paths that
  bypass the API's suppression handling; invent copy containing §1.6 banned
  claims; log anything (use the API's allowlist logger if you must); store
  PII client-side beyond the opaque cookie; use emoji as iconography (§1.8).
- **Do not assume:** entitlements change core data (they never do — tested
  byte-identical); offers are fresh (check `meta.sources` + suppressions);
  a basket exists for every plan (`feasible: false` and `basket: null` are
  normal states needing honest empty-states); capsule numbers are single
  values (they are ALWAYS ranges).
- `npm run verify` baseline is now **505 tests / 36 files** (post-correction
  round) — extend, never weaken. Phase 5 gate conditions
  P3-2/P3-3/P4-2/P4-3 are discharged and P5-1/P5-2 corrected; the
  orchestrator flips the §1.4 API-half row at gate time.
