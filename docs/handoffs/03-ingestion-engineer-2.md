# HANDOFF 03 — ingestion-engineer — Phase 2

## 1. Inputs consumed

- `CLAUDE.md` §0 (launch posture, NOT #1), §1 (esp. invariants 1, 4, 5, 6, 7),
  stack summary, process rules.
- `docs/handoffs/02-data-architect-1.md` — §4 contracts (coded against, not
  redefined) and §8 binding instructions (migration-pair conventions, fixture
  provenance namespacing, KV justification requirement, test placement).
- `docs/handoffs/gates/phase-1-gate.md` — inherited standing obligation P1-2
  (PII guard extension at the next schema migration).
- `docs/handoffs/gates/phase-0-gate.md` — inherited finding SG-4
  (fixture-display-strings banned-claims test).
- `config/flags.ts` (SourceId, CircuitBreakerConfig, DEFAULT_FLAGS),
  `src/contracts/*`, `migrations/0001–0004` (+downs), `tests/schema.test.ts`,
  `tests/helpers/migrations.ts`, `tests-workers/*`, `wrangler.jsonc`,
  `vitest.config.ts`, lint scripts.

## 2. Decisions made

1. **Migration pairs 0005/0006 authored here, in data-architect's exact
   conventions**, per the orchestrator's Phase 2 dispatch (which routes the
   deferred-table work of handoff 02 decision 12 through this phase): STRICT
   tables, CHECK-mirrored vocabularies, `provenance_id TEXT NOT NULL
   REFERENCES provenance(id)` on every table, same-named down files under
   `migrations/down/`, no edits to applied migrations. The Phase 1 discovery
   suites picked the new tables up automatically (provenance FK, PII guard,
   economics guard, reversibility — all still green at 24/24).
2. **Adapters emit; they do not persist.** No data-access layer exists
   (Phase 5), so adapters normalize raw feed shapes into contract records +
   provenance and hand them to the pipeline, which caches envelopes. D1
   persistence of batches is Phase 5; the FK repeats the §1.4 gate there.
3. **Raw feed shapes mirror the real sources** so the eventual live
   implementations reuse the fixture normalization path: NCES CCD column
   names (NCESSCH/SCH_NAME/LEA_NAME/LSTATE/GSLO/GSHI), CPSC REST fields
   (RecallID/RecallNumber/Products[]/Hazards[]/Remedies[]). CPSC
   ConsumerContact is deliberately not part of the consumed shape —
   contact-shaped strings (phone/email) never enter (§1.7 posture).
   Alternative (invent a house schema now, remap later) rejected: it would
   guarantee a Phase-later rewrite.
4. **Live implementations are throwing stubs, not flag-checked fetchers.**
   `createLiveStub()` rejects with `LiveSourceDisabledError` naming the flag
   and confirming no network request was made; there is no fetch code to
   accidentally enable. Factories return the fixture adapter whenever the
   source's flag is OFF (the default); even a hand-flipped flag yields the
   stub. Proven by tests with `fetch` poisoned globally.
5. **OfferCandidates, not offers, come out of the feed adapter.** A feed line
   has no variant identity until entity resolution (Phase 4); persisting it
   as an offer would be guessing (§1.5). The `offers` table (UNIQUE
   (variant_id, retailer_id), latest-only) is the post-resolution
   destination. Offer rows carry no observed_at column — price observation
   time lives on the provenance row (§1.4, single source of truth).
6. **Fixture labeling is enforced, not conventional.** Every fixture document
   must be `_fixture: true` with `fixture:`-namespaced set id equal to
   `provenance.source` and `sourceType: "fixture"`; `assertFixtureDocument`
   rejects anything else, and `assertBatchProvenance` additionally rejects
   non-fixture provenance while fixtureMode is ON — fixture data cannot
   masquerade as live, and unlabeled data cannot enter the fixture path.
7. **Tax-holiday fixture uses real states + statutory-shaped windows/caps,
   confidence 0.5, explicit "NOT verified" limitations, example.com info
   URLs.** The dispatch permits real 2026 structure only as fixture-labeled
   data; pointing info links at example.com (never state sites) keeps
   fixture rows from impersonating verified guidance. Tests assert the
   reduced confidence and limitations text.
8. **Circuit breaker: half_open is a derived state.** `open` + elapsed >=
   cooldownSeconds reads as `half_open`; a probe failure re-trips with a
   fresh cooldown; probe success resets. No timers anywhere — the clock is
   injected (epoch ms) in breaker, cache, tracker, pipeline, and every test.
9. **One KV namespace (`SOURCE_KV`) with key prefixes** (`health:<sourceId>`,
   `cache:<sourceId>`, `flags:overrides` — constants in
   src/ingestion/source-health.ts) instead of three namespaces. §2 sanctions
   KV for exactly these uses; one namespace with placeholder id matches the
   fixture posture (local-only, like D1). The SWR cache codes against a
   minimal `KvLike` (get/put of strings) so MemoryKv backs node tests and
   KVNamespace backs production without branching.
10. **Queues job definitions shipped as contracts, not bindings.**
    `src/ingestion/jobs.ts` defines the queue name, RefreshJobMessage shape,
    per-source cadences, and `planRefreshJobs()` (which cannot emit live work
    for a flagged-off source). Provisioning a queue consumer for a beta whose
    refreshes are all fixture re-seeds would be dead infrastructure; the
    binding lands with the API worker (Phase 5) against these types.
11. **P1-2 implemented as structural discovery**: the household-linked
    free-text guard now finds tables by FK reachability into
    households/household_members (catching supply_lists, list_assignments,
    inventory_items, and any future table regardless of name) and its
    pattern gained bare `name`. The general PII pattern list is unchanged —
    a global bare-`name` ban would falsely flag schools/brands/products.
12. **source_health carries the licensing flags as columns** (basis + four
    0/1 permissions) in addition to the code-level registry, so the Phase 10
    register can be built from either the live table or
    `src/ingestion/registry.ts`, and a health row can never exist without a
    licensing declaration (CHECK + NOT NULL).

## 3. Artifacts produced

Created:
- `migrations/0005_recalls_tax_holidays.sql`,
  `migrations/0006_offers_source_health.sql` + paired
  `migrations/down/0005_recalls_tax_holidays.sql`,
  `migrations/down/0006_offers_source_health.sql`
- `src/contracts/recall.ts`, `src/contracts/tax-holiday.ts`,
  `src/contracts/offer.ts`, `src/contracts/source.ts`
- `src/ingestion/`: `types.ts`, `provenance.ts`, `circuit-breaker.ts`,
  `swr-cache.ts`, `source-health.ts`, `pipeline.ts`, `registry.ts`,
  `jobs.ts`, `index.ts`, `adapters/live-stub.ts`, `adapters/nces-ccd.ts`,
  `adapters/cpsc-recalls.ts`, `adapters/tax-holidays.ts`,
  `adapters/product-feeds.ts`
- `fixtures/README.md`, `fixtures/nces-ccd/schools.fixture.json`,
  `fixtures/cpsc-recalls/recalls.fixture.json`,
  `fixtures/tax-holidays/2026.fixture.json`,
  `fixtures/product-feeds/offers.fixture.json`
- `tests/helpers/fixtures.ts`, `tests/circuit-breaker.test.ts`,
  `tests/swr-cache.test.ts`, `tests/ingestion-pipeline.test.ts`,
  `tests/ingestion-offline.test.ts`, `tests/fixtures.test.ts`,
  `tests/ingestion-registry.test.ts`, `tests/ingestion-schema.test.ts`,
  `tests-workers/ingestion-d1.test.ts`

Modified:
- `src/contracts/index.ts` (re-export the four new contract modules)
- `wrangler.jsonc` (SOURCE_KV namespace, placeholder id, justification in
  comment + decision 9)
- `src/index.ts` (`Env.SOURCE_KV`), `tests-workers/env.d.ts` (same)
- `tests/schema.test.ts` (P1-2 guard extension ONLY — see §5)

Not touched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
other handoffs, Phase 0 tests, existing migrations 0001–0004.

## 4. Contracts exported

### 4.1 New D1 tables (all STRICT, all with NOT NULL provenance FK)

```
recalls                  cpsc_recall_id (UNIQUE), recall_number, recall_date,
                         last_publish_date, title, description, cpsc_url,
                         hazard_description, remedy_description,
                         units_affected (NULL = not stated), is_synthetic
recall_products          recall_id FK, name, description, model, upc
tax_holidays             state (len-2 CHECK), year, starts_on <= ends_on,
                         info_url, is_synthetic; UNIQUE(state, year, starts_on)
tax_holiday_categories   holiday_id FK, holiday_category
                         (clothing|footwear|school_supplies|computers|
                         backpacks|other), price_cap_cents (NULL = no cap);
                         UNIQUE(holiday_id, holiday_category)
offers                   variant_id FK, retailer_id FK, price_cents >= 0,
                         currency ('USD'), availability (in_stock|
                         out_of_stock|limited|unknown), shipping_cents
                         (NULL = unknown), deep_link_url;
                         UNIQUE(variant_id, retailer_id) — latest-only
source_health            source_id PK (the four SourceIds), circuit_state
                         (closed|open|half_open), consecutive_failures,
                         opened_at, last_success_at, last_failure_at,
                         last_error, license_basis (synthetic_fixture|
                         us_government_open_data|state_public_records|
                         commercial_contract_required), license_allows_
                         {live_fetch,cache,persist,display} 0/1
```

### 4.2 Adapter surface (src/ingestion)

```ts
interface SourceAdapter<T> {
  readonly sourceId: SourceId;
  readonly mode: "fixture" | "live";
  fetchBatch(): Promise<IngestionBatch<T>>;   // live stubs always reject
}
interface IngestedRecord<T> { record: T; provenance: ProvenanceRecord; }
interface IngestionBatch<T> { sourceId; fetchedAt; records: IngestedRecord<T>[]; }
// Factories (fixture unless the source's live flag is ON — then the stub):
createNcesCcdAdapter(flags, doc, clock): SourceAdapter<School>
createCpscAdapter(flags, doc, clock): SourceAdapter<RecallBundle>      // {recall, products[]}
createTaxHolidayAdapter(flags, doc, clock): SourceAdapter<TaxHolidayBundle>
createProductFeedAdapter(flags, doc, clock): SourceAdapter<OfferCandidate>
```

### 4.3 The envelope the API layer (Phase 5) renders from

```ts
interface SourceEnvelope<T> {
  sourceId: SourceId;
  ok: boolean;                       // data present (fresh or cached)
  stale: boolean;                    // machine-readable stale badge signal
  ageSeconds: number | null;         // age of served data
  storedAt: IsoTimestamp | null;
  servedAt: IsoTimestamp;
  circuitState: "closed" | "open" | "half_open";
  degraded: "none" | "cache_fallback" | "unavailable";
  lastError: string | null;          // machine field; NEVER a thrown error
  records: IngestedRecord<T>[];
}
```

`stale === true` (age > staleAfterSeconds) MUST render the stale badge;
`degraded === "unavailable"` (ok:false, empty records) MUST render the §1.5
suppressed/unavailable state — never an error page.

### 4.4 Composition + registry

```ts
new IngestionPipeline({ adapter, breaker: new CircuitBreaker(cfg, clock),
  cache: new SwrCache(kvLike, cfg.staleAfterSeconds, clock),
  health: new SourceHealthTracker(registration, breaker, clock, provenanceId),
  flags, clock }).refresh(): Promise<SourceEnvelope<T>>
SOURCE_REGISTRATIONS: Record<SourceId, SourceRegistration>  // registry.ts
interface SourceLicensing { basis; allowLiveFetch; allowCache; allowPersist;
  allowDisplay; attributionRequired; notes }                // on every registration
```

KV keys: `health:<sourceId>`, `cache:<sourceId>`, `flags:overrides`
(constants in source-health.ts). Queue contract: `INGESTION_QUEUE_NAME`,
`RefreshJobMessage`, `REFRESH_INTERVALS_SECONDS`, `planRefreshJobs(flags, now)`
(jobs.ts). New contract vocabularies: `SOURCE_IDS` (compile-time `satisfies`
against flags' SourceId + runtime completeness test), `CIRCUIT_STATES`,
`LICENSE_BASES`, `TAX_HOLIDAY_CATEGORIES`, `AVAILABILITY_STATUSES`,
`CURRENCIES` — each CHECK-mirrored in SQL by tests.

### 4.5 Worker environment

```ts
export interface Env {
  DB: D1Database;
  SOURCE_KV: KVNamespace;   // wrangler.jsonc kv_namespaces[0], placeholder id
  FIXTURE_MODE: string;
}
```

## 5. Invariants touched

- **§1.4 (provenance) — extended to ingestion write time.** Every adapter
  builds a full ten-field record per fact; `assertBatchProvenance` rejects
  batches with missing/incomplete provenance BEFORE the cache write
  (tests/ingestion-pipeline.test.ts), and the discovery FK test now covers
  all six new tables on node:sqlite (tests/schema.test.ts) and real workerd
  D1 (tests-workers/ingestion-d1.test.ts: unprovenanced recall rejected).
- **§1.7 (PII) — P1-2 obligation discharged.** tests/schema.test.ts
  "household-linked tables (discovered via FKs) carry no size or free-text
  label columns": coverage broadened from name-matched tables to FK
  reachability (sanity-asserted to include supply_lists, list_assignments,
  inventory_items) and the pattern extended with bare `name`. The global PII
  name-pattern test extends automatically to all new tables. CPSC
  ConsumerContact excluded from the consumed feed shape (decision 3);
  fixture files carry no PII-shaped keys (tests/fixtures.test.ts).
- **§1.1 (commission never ranks) — schema half extended.** The economics
  column guard now scans offers/source_health/etc. automatically; the feed
  shape and OfferCandidate carry no economics field; affiliate_feeds
  licensing is deny-all until contracts (tests/ingestion-registry.test.ts).
- **§1.5 (suppression beats guessing).** Outage with empty cache yields
  ok:false suppression envelope, never a throw; OfferCandidates cannot reach
  the offers table pre-resolution (no table for them); tax-holiday fixtures
  ship confidence 0.5 + limitations, asserted in tests.
- **§1.6 (banned claims) — SG-4 obligation discharged.** The lint excludes
  fixtures/ by path, so tests/fixtures.test.ts re-applies the same
  word-boundary/plural matcher to every string and key of every discovered
  fixture file (17 tests, includes §1.8 emoji scan of fixture files).
- **§0 NOT #1 (no list republishing).** No adapter, table, fixture, or
  registry dataKind can hold supply-list content: SOURCE_DATA_KINDS is
  closed (asserted to contain no list/pdf/document member), source_health's
  CHECK rejects unknown source ids (a 'teacherlists' insert fails, proven),
  and fixture documents are scanned for supply-list-shaped keys.
- §1.8: no emoji anywhere in new files; fixture files additionally
  test-scanned. §1.2/§1.3 untouched (no rendering/trend code yet).

## 6. Acceptance evidence

All commands run 2026-08-04, Node v22.22.2, wrangler 4.118.0, exit 0.
(The verbose reporter's pass glyph is transcribed as "v" to keep this file
free of symbol codepoints, as in handoff 02.)

`npm run verify` (tail):

```
> eslint . && node scripts/lint-banned-claims.mjs && node scripts/lint-no-emoji.mjs
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.workers-tests.json --noEmit
> vitest run
 Test Files  14 passed (14)
      Tests  172 passed (172)
```

172 = 100 inherited (Phase 0/1, all still passing including the extended
schema suite at 24) + 72 new: fixtures 17, ingestion-schema 11,
ingestion-registry 11, circuit-breaker 9, ingestion-offline 8,
ingestion-pipeline 6, swr-cache 5, workers ingestion-d1 5.

Offline fixture-mode ingestion proof (`npx vitest run --reporter=verbose
tests/ingestion-offline.test.ts` — `globalThis.fetch` is stubbed to throw
for the whole suite):

```
v ingests the NCES CCD fixture directory (synthetic schools only)
v ingests the CPSC fixture recalls (synthetic, CPSC field shape)
v ingests the tax-holiday fixture calendar with reduced confidence + limitations
v ingests the retailer feed fixture across >=3 synthetic retailers
v every live stub throws the descriptive disabled-by-flag error (and never fetches)
v factories select the fixture path for every source under default flags
v a live-flagged source still cannot fetch: the factory hands back the throwing stub
v zero network attempts were made across the entire suite
 Tests  8 passed (8)
```

Simulated provider outage proof (tests/ingestion-pipeline.test.ts):

```
v outage degrades to cached data, opens the breaker at threshold, badges stale
  by age, and never throws
v with an empty cache an outage yields ok:false suppression - an envelope, never a throw
v tracks source health through failure and recovery
v rejects a batch containing a record without provenance before it reaches the cache
v rejects non-fixture provenance while fixture mode is ON (no plausible fabrications)
```

The outage test walks the exact configured thresholds: 3 consecutive
failures -> open; adapter call count frozen while open; cache served with
degraded:"cache_fallback" throughout; stale:true once age exceeds 21600s;
failed probe re-opens with fresh 300s cooldown; recovery probe closes and
clears the badge. Circuit-breaker unit tests (9) cover every transition with
injected clocks; no real timers exist in any Phase 2 test.

`npx wrangler d1 migrations apply k8-planner-fixture --local` on the
existing Phase 1 ledger (glyphs transcribed to [ok]):

```
Migrations to be applied: 0005_recalls_tax_holidays.sql, 0006_offers_source_health.sql
0005_recalls_tax_holidays.sql  [ok]
0006_offers_source_health.sql  [ok]
```

Constraint battery (tests/ingestion-schema.test.ts, all passing): duplicate
CPSC id rejected; negative units rejected; inverted holiday window rejected;
3-letter state rejected; unknown holiday category rejected; duplicate
category row rejected; duplicate (variant, retailer) offer rejected;
negative price rejected; unknown availability rejected; non-USD rejected;
unknown source_id ('teacherlists') rejected; unknown circuit state rejected;
unknown license basis rejected; non-0/1 license flag rejected. Vocabulary
mirrors for all six new CHECK lists pass. Reversibility (up-down-up
byte-identical) re-proven over all six migrations by the existing suite.

## 7. Known gaps and risks

- **Live fetching does not exist** — by design. When credentials + licensing
  land, each live adapter must be written against the raw shapes in
  adapters/*.ts, flip nothing in fixture code, and pass compliance review;
  the licensing registry currently says allowLiveFetch:false for all four.
- **Batches are cached, not persisted.** D1 rows for
  recalls/tax_holidays/offers get written by Phase 5's data-access layer
  (and only post-entity-resolution for offers, Phase 4). The tables,
  contracts, and constraint batteries are ready; no seeding code exists yet.
- **source_health/KV persistence is wired by contract only**:
  SourceHealthTracker.toRow(), kvKey(), and the SOURCE_KV prefixes are the
  interface; nothing writes to the real namespace outside tests yet.
  KV runtime flag overrides ('flags:overrides') are likewise a documented
  key with no reader — Phase 5 must implement read-through with
  DEFAULT_FLAGS as fallback.
- **Queues are types-only** (decision 10); the ingestion-refresh queue and
  consumer land in Phase 5. Cron triggers are similarly deferred.
- **provenance.freshness re-evaluation** (handoff 02 §7) is partially
  addressed: staleness is computed live from envelope age (stale badge), but
  nothing rewrites stored `freshness` columns on a cycle. Phase 5's refresh
  job should reconcile stored freshness with envelope age.
- **The stale badge is a signal, not UI.** Envelope fields are
  machine-readable; frontend (Phase 7) must render `stale`, and the §1.4
  render guard remains Phase 7 per CLAUDE.md.
- **Tax-holiday fixture windows/caps are placeholders** (confidence 0.5,
  limitations explicit). Anything that renders tax eligibility before a
  verified source lands must surface the fixture caveat or suppress.
- The fixture-labeling gate is enforced at adapter and pipeline level, not
  in the SQL schema (no is_fixture CHECK tying is_synthetic to provenance
  source_type across tables — SQLite cannot express the cross-table check).
  Phase 5 write code must set is_synthetic from provenance.sourceType.
- CLAUDE.md's phase-state row for Phase 2 still reads "Not started";
  updating CLAUDE.md is outside my write set (orchestrator flips it at gate
  time, as in Phase 1).

## 8. Instructions to next agent

**parser-engineer (Phase 3):**

- MUST code against `src/contracts/` (requirement schema, provenance) and
  reuse the §1.4 pattern established here: build the full ProvenanceRecord
  for every parsed fact BEFORE writing anything; use
  `src/ingestion/provenance.ts` helpers (`provenanceDefect`,
  `assertBatchProvenance`) rather than re-implementing the gate. Parsed
  requirements use `source_kind` paste|manual|upload and per-row
  `source_confidence` — never 1.0 for OCR/model extraction.
- MUST NOT touch the ingestion pipeline's fixture path or add any parser
  input that fetches a URL. §0 NOT #1 remains structural: paste/manual/
  upload are user channels; there is no table, adapter, or fixture slot for
  a fetched school list and you MUST NOT add one (no "paste a URL" feature).
- §1.7 upload cycle is yours: R2 transient buffer with hard TTL, ephemeral
  processing, the zero-PII test from CLAUDE.md's enforcement table. Extend
  `wrangler.jsonc` with the R2 binding (placeholder posture, justify in your
  handoff), mirror it in `src/index.ts` `Env` AND `tests-workers/env.d.ts`,
  exactly as done here for SOURCE_KV. Nothing from an upload may reach KV
  through the SOURCE_KV namespace — that namespace is for source
  health/cache/flags only.
- If you need new tables (e.g. upload-session bookkeeping), follow the
  migration conventions exactly: next number (0007), STRICT, provenance FK,
  paired same-named down file, vocabularies mirrored in src/contracts with a
  CHECK-mirror test. The discovery suites in tests/schema.test.ts will
  auto-cover your tables — including the FK-discovered household-linked
  free-text guard added this phase (no name/title/notes columns on anything
  household-linked).
- `prohibited_substitutions` sanitization (handoff 02 §7) is still open and
  is yours: controlled codes only, never raw list prose, with a test.
- Fixture sample lists you create MUST follow fixtures/ conventions: wrapper
  `_fixture: true`, `fixture:`-namespaced set matching provenance.source,
  sourceType 'fixture', obviously synthetic content — tests/fixtures.test.ts
  discovers and scans every JSON file under fixtures/ automatically (banned
  claims, emoji, PII-shaped keys, labeling), so your files are covered the
  moment they exist. Do not weaken that suite; extend the forbidden-key
  regex if your shapes introduce new risk surface.
- Do not modify: migrations 0001–0006 (append-only via new pairs),
  `config/*`, `docs/design/`, other agents' handoffs, Phase 0–2 tests
  (extend in new files). `npm run verify` must stay green — extend, never
  weaken.
