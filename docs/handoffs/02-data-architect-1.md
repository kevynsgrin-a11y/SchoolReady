# HANDOFF 02 — data-architect — Phase 1

## 1. Inputs consumed

- `CLAUDE.md` §0/§1 (esp. invariants 1, 4, 5, 7), stack summary, process rules.
- `docs/handoffs/00-orchestrator-0.md` — §8 binding instructions, §4 exported
  contracts (`config/flags.ts`, `config/brand.ts`, `config/banned-claims.ts`),
  §7 known gaps (wrangler missing, pool-workers deferred to this phase).
- `docs/handoffs/TEMPLATE.md`, `.claude/agents/data-architect.md` (mandate,
  contractual requirement-schema field list, hard constraints).
- Existing scaffold: `wrangler.jsonc`, `src/index.ts`, `tsconfig*.json`,
  `vitest.config.ts`, `package.json`, `tests/*` (Phase 0 — read, not modified).

## 2. Decisions made

1. **Down migrations live in `migrations/down/<same filename>.sql`.** Wrangler
   has no native down support and reads only the top level of the migrations
   dir (proven: `wrangler d1 migrations list` shows exactly the four ups).
   Reversibility is proven by a node:sqlite harness
   (`tests/helpers/migrations.ts`) running up -> down -> up in Vitest.
   Alternative (single directory with `.up.sql`/`.down.sql` suffixes)
   rejected: wrangler would treat down files as migrations.
2. **Every table carries the provenance FK, not just a "user-facing subset."**
   The §1.4 rule is strongest with zero classification judgment: every
   application table (discovered from `sqlite_master`, never hardcoded)
   except `provenance` itself must have `provenance_id TEXT NOT NULL
   REFERENCES provenance(id)`. Infra bookkeeping (`d1_migrations`, `_cf_*`,
   `sqlite_*`) is excluded by pattern. Even ER edges and entitlements carry
   provenance — they are model inferences and purchase facts respectively.
3. **STRICT tables + CHECK-constrained closed vocabularies**, mirrored 1:1 by
   `as const` arrays in `src/contracts/`. A vocabulary-mirror test parses the
   actual SQL `IN (...)` lists and compares them to the contract arrays, so
   the two cannot drift silently.
4. **No free-text identity columns near household data (§1.7 by construction).**
   `household_members` has an `ordinal` ("Child 1"), deliberately no
   name/label column — a label column WOULD be filled with child names.
   `supply_lists` has no title column; lists are identified structurally
   (school + grade + year + child ordinal). `inventory_items` has no notes
   column. Alternative (nullable label + "please don't enter names" copy)
   rejected: §1.7 must be enforced as structure, not policy.
5. **Teacher/classroom scope = anonymous slot ordinals.** `requirements`
   carries `scope_type` (list|grade|subject|teacher|classroom) with
   `scope_grade`/`scope_subject` controlled vocabularies and `scope_slot`
   (INTEGER >= 1, "teacher slot 1"). No teacher-name or school-issued
   classroom-ID column exists anywhere; CHECKs force a slot when scope is
   teacher/classroom.
6. **Schools persist at state/city granularity — no street address, no zip.**
   Sales-tax-holiday eligibility is state-scoped; storing street addresses
   would blur the §1.7 address scan. If finer tax geography is ever needed it
   must be derived at request time, never persisted, and reviewed by
   compliance-officer.
7. **`requirements` carries `source_kind` + `source_confidence` columns in
   addition to its provenance FK.** The brief's requirement schema lists
   "source, source confidence" as requirement-level fields: `source_kind` is
   the intake channel (paste|manual|upload|fixture) and `source_confidence`
   is the per-row parser extraction confidence — distinct from the provenance
   record's fact-level confidence. Full source detail (transform version,
   retrieval time, freshness) stays on the provenance row.
8. **Identity graph = `product_identifiers` + `entity_resolution_edges` +
   `canonical_variant_id`.** GTIN-family identifiers are globally unique;
   retailer SKUs are unique per retailer (partial unique indexes, because
   SQLite UNIQUE treats NULLs as distinct). A CHECK ties
   `id_type='retailer_sku'` to `retailer_id IS NOT NULL` and vice versa.
   The ER model is documented in §4 below.
9. **`@cloudflare/vitest-pool-workers` 0.20.x wired via Vitest 4 `projects` +
   the `cloudflareTest()` plugin.** The 0.20 line dropped
   `defineWorkersConfig`/`defineWorkersProject` (verified against the
   package's exports map and its v3-to-v4 codemod); the plugin form is the
   supported vitest-4 API. Two projects: `node` (existing tests) and
   `workers` (tests-workers/, real workerd D1). A third tsconfig
   (`tsconfig.workers-tests.json`) provides the `cloudflare:test` ambient
   types; `npm run typecheck` now runs all three.
10. **No table stores or mirrors third-party school-hosted lists (§0 NOT #1).**
    `supply_lists.intake_method` is a closed vocabulary of user channels
    (paste|manual|upload); there is no source-URL column, no document/blob
    column, and no table for fetched list artifacts. Upload buffers are R2
    with TTL in Phase 3 — nothing lands in D1.
11. **Quantities are integers; pack math is `unit` + `pack_count`.**
    "2 packs of 12" = quantity 2, unit 'pack', pack_count 12. Pack-size
    conversion for basket comparison (Phase 4) normalizes via
    quantity x pack_count against variant pack_count.
12. **Deliberately NOT created in Phase 1**: offers/prices, recalls,
    tax-holiday, dress-code tables. They are Phase 2/4 shapes that depend on
    feed schemas ingestion-engineer defines; creating them now would be
    invented structure. They route back through data-architect as new
    migration pairs (see §8).

## 3. Artifacts produced

Created:
- `migrations/0001_provenance.sql`, `migrations/0002_catalog.sql`,
  `migrations/0003_schools_households.sql`,
  `migrations/0004_lists_requirements.sql` (ups)
- `migrations/down/0001_provenance.sql` … `migrations/down/0004_lists_requirements.sql`
  (paired downs, same filenames)
- `src/contracts/provenance.ts`, `src/contracts/product.ts`,
  `src/contracts/school.ts`, `src/contracts/requirement.ts`,
  `src/contracts/household.ts`, `src/contracts/index.ts`
- `tests/helpers/migrations.ts` (node:sqlite up/down harness)
- `tests/schema.test.ts` (24 tests)
- `tests-workers/env.d.ts`, `tests-workers/apply-migrations.ts`,
  `tests-workers/d1.test.ts` (4 tests on real workerd D1)
- `tsconfig.workers-tests.json`

Modified:
- `wrangler.jsonc` — D1 binding `DB`, database `k8-planner-fixture`,
  placeholder all-zeros `database_id` (fixture posture: local only, no real
  database provisioned), `migrations_dir: "migrations"`.
- `package.json` — devDeps `wrangler@4.118.0`,
  `@cloudflare/vitest-pool-workers@0.20.1`; `typecheck` extended with the
  third tsconfig (verify extended, not weakened). `package-lock.json` updated.
- `vitest.config.ts` — two-project layout (node + workers).
- `src/index.ts` — exported `Env` interface with the `DB: D1Database` binding.

Not touched: `CLAUDE.md`, `.claude/agents/`, `config/*`, Phase 0 tests,
other handoffs, `docs/design/` (concurrent Phase 6 work observed and avoided).

## 4. Contracts exported

### 4.1 D1 schema (14 tables)

```
provenance                the universal §1.4 record (see 4.3)
brands                    id, name, normalized_name (unique merge key)
product_types             canonical taxonomy: slug, name, category,
                          default_unit, default_durability
products                  product_type_id FK, brand_id FK (NULL = generic),
                          name, model_line
product_variants          product_id FK, canonical_variant_id self-FK,
                          resolution_status, size, color, pack_count,
                          dimensions, material, ruling_style, mpn
retailers                 slug, name — §1.1: no economics columns, ever
product_identifiers       variant_id FK, id_type (gtin14|upc_a|ean13|isbn13|
                          mpn|retailer_sku), id_value, retailer_id FK;
                          global vs retailer-scoped partial unique indexes
entity_resolution_edges   variant_a/b FKs, relation, method, score 0-1,
                          status (proposed|accepted|rejected)
schools                   nces_school_id (NULL = synthetic), name,
                          district_name, state, city, grade_low/high,
                          is_synthetic — no street address by design
households                opaque id + optional state — nothing else
household_members         household_id FK, ordinal ("Child 1"), grade_level,
                          school_id FK — no name column by design
entitlements              household_id FK, kind (season_pass), status,
                          valid_from/until, external_payment_ref (opaque)
supply_lists              household_id FK (NULL until claimed), school_id FK,
                          school_year, grade_level, intake_method
                          (paste|manual|upload), verification_status, status
list_assignments          list_id FK x household_member_id FK (sibling merge)
requirements              the full requirement schema (see 4.2)
inventory_items           household_id FK, product_type_id FK, variant_id FK,
                          quantity, condition
```

Every table above except `provenance` carries
`provenance_id TEXT NOT NULL REFERENCES provenance(id)`. All tables are
STRICT; enums are CHECK-constrained; timestamps are ISO-8601 UTC TEXT; IDs
are opaque TEXT (app-generated ULIDs recommended, Phase 5).

### 4.2 Requirement schema (contractual field -> column -> TS)

| Brief field | Column | Contract |
|---|---|---|
| canonical product type | `product_type_id` FK | `Requirement.productTypeId` |
| quantity | `quantity` INTEGER > 0 | `quantity` |
| unit / pack count | `unit`, `pack_count` | `unit`, `packCount` |
| dimensions | `dimensions` | `dimensions` |
| material | `material` | `material` |
| color | `color` | `color` |
| ruling/style | `ruling_style` | `rulingStyle` |
| brand-requirement | `brand_requirement` + `required_brand_id` | `brandRequirement`, `requiredBrandId` |
| scope | `scope_type`, `scope_grade`, `scope_subject`, `scope_slot` | `scope: RequirementScope` |
| consumable-vs-durable | `durability` | `durability` |
| optional-vs-required | `optionality` | `optionality` |
| prohibited substitutions | `prohibited_substitutions` (JSON array of controlled codes) | `prohibitedSubstitutions` |
| source | `source_kind` (+ provenance FK) | `sourceKind` |
| source confidence | `source_confidence` REAL 0-1 | `sourceConfidence` |

### 4.3 Universal provenance record (all ten §1.4 fields)

```ts
export interface ProvenanceRecord {
  id: string;
  source: string;               // 1  'user:manual-entry', 'fixture:catalog-2026-v1'
  sourceType: SourceType;       // 2  user_entry|user_upload|fixture|government_feed|
                                //    retailer_feed|licensed_api|model_inference|operator_curation
  observedAt: IsoTimestamp;     // 3  observation/effective date
  retrievedAt: IsoTimestamp;    // 4  retrieval timestamp
  geography: Geography;         // 5  'US' or ISO 3166-2 ('US-TX')
  transformVersion: string;     // 6  'none' = verbatim
  freshness: Freshness;         // 7  fresh|aging|stale|expired
  confidence: Confidence;       // 8  0.0-1.0 (CHECK-enforced)
  limitations: string;          // 9  '' = none declared
  correctionStatus: CorrectionStatus; // 10 none|corrected|retracted|under_review
  createdAt: IsoTimestamp;
}
export interface WithProvenance { provenanceId: string; }
```

Every persisted entity interface extends `WithProvenance`. Render guard
(refuse to display facts with missing/expired/retracted provenance) is
frontend-engineer, Phase 7 — the storage half is enforced now by FK.

### 4.4 Entity-resolution model

Strong keys first, scored candidates second, humans for ties, suppression
for everything unresolved:

1. `exact_identifier` — two variants sharing a GTIN-family identifier value
   produce a score-1.0 `same_item` edge; auto-acceptable.
2. `normalized_attributes` — same brand + product type + normalized
   size/pack/color produce a scored candidate edge.
3. `model_inference` — fuzzy title/attribute matching produces a scored
   candidate; never auto-accepted regardless of score.
4. `operator_review` — human decision; the only method allowed to resolve
   `resolution_status='ambiguous'`.

Accepted `same_item` edges assign `canonical_variant_id` (cluster
representative; representatives self-point) and flip `resolution_status` to
`resolved`. Acceptance thresholds are algorithm-engineer's (Phase 4).
§1.5 consequence, already structural: variants not `resolved` are suppressed
from user-facing comparison; `pack_variant_of` supports pack-size conversion;
`substitutable_for` feeds generic-vs-brand basket options.

### 4.5 Key exported vocabularies (src/contracts, mirrored by SQL CHECKs)

```ts
BRAND_REQUIREMENTS = ["required", "preferred", "generic_allowed"]
DURABILITIES       = ["consumable", "durable"]
OPTIONALITIES      = ["required", "optional"]
SCOPE_TYPES        = ["list", "grade", "subject", "teacher", "classroom"]
GRADE_LEVELS       = ["K", "1", "2", "3", "4", "5", "6", "7", "8"]
UNITS              = ["each","pack","box","set","pair","ream","dozen","roll","bottle","tube","stick"]
RULING_STYLES      = ["wide_ruled","college_ruled","graph","primary_ruled","dotted","unruled"]
IDENTIFIER_TYPES   = ["gtin14","upc_a","ean13","isbn13","mpn","retailer_sku"]
RESOLUTION_STATUSES= ["unresolved","resolved","ambiguous"]
INTAKE_METHODS     = ["paste","manual","upload"]
VERIFICATION_STATUSES = ["unverified","user_confirmed","stale"]
SOURCE_TYPES, FRESHNESS_LEVELS, CORRECTION_STATUSES  // §4.3
```

### 4.6 Worker environment

```ts
// src/index.ts
export interface Env {
  DB: D1Database;        // wrangler.jsonc d1_databases[0], fixture posture
  FIXTURE_MODE: string;
}
```

Wrangler binding: `DB` -> database `k8-planner-fixture`, placeholder
`database_id` `00000000-0000-0000-0000-000000000000` (no real database
exists; local state under `.wrangler/`, gitignored).

## 5. Invariants touched

- **§1.4 (provenance on every fact) — storage half ENFORCED.**
  `tests/schema.test.ts` "every user-facing table carries a NOT NULL
  provenance FK (discovered from live schema)" walks `sqlite_master` (never a
  hardcoded list) and asserts column + NOT NULL + FK target for all 13
  non-provenance tables; `tests-workers/d1.test.ts` repeats this on the real
  workerd D1 engine and proves inserts without provenance are rejected.
  Render half deferred to Phase 7 (per CLAUDE.md enforcement table).
- **§1.7 (PII never persists) — schema half ENFORCED.**
  "no table or column name matches a PII pattern" + "household-linked tables
  carry no size or free-text label columns" guard the §1.7 enumerated
  categories (child names, teacher names, classroom IDs, addresses, exact
  sizes, budgets, gift recipients, plus email/phone/birth). The upload-cycle
  zero-PII test remains parser-engineer's (Phase 3).
- **§1.1 (commission never ranks) — schema half ENFORCED.**
  "no table or column name matches a commission/affiliate-economics pattern"
  ensures no economics column exists on any table (all current tables feed or
  border ranking). The byte-identical ranking test remains
  algorithm-engineer's (Phase 4).
- **§1.5 (suppression beats guessing) — structural inputs provided**:
  `supply_lists.verification_status`, `product_variants.resolution_status`,
  `provenance.freshness`/`correction_status`. Suppression engine is Phase 4.
- **§0 NOT #1 (no list republishing) — structural**: no table/column can hold
  a third-party list document or its source URL (decision 10).
- §1.6/§1.8 untouched; `npm run lint` still green over the new files.

## 6. Acceptance evidence

Commands the gate can re-run verbatim (all exit 0, 2026-08-04, Node
v22.22.2, wrangler 4.118.0):

`npm run verify` (tail):

```
> eslint . && node scripts/lint-banned-claims.mjs && node scripts/lint-no-emoji.mjs
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.workers-tests.json --noEmit
> vitest run
 Test Files  6 passed (6)
      Tests  100 passed (100)
```

(100 = 72 Phase 0 + 24 schema + 4 workers-D1.)

`npx vitest run --reporter=verbose tests/schema.test.ts` (all 24 pass; the
up/down proof lines):

```
v |node| tests/schema.test.ts > migrations - reversibility > pairs every up migration with a same-named down migration
v |node| tests/schema.test.ts > migrations - reversibility > applies all up migrations cleanly on an empty database
v |node| tests/schema.test.ts > migrations - reversibility > rolls all the way down to a zero-table database
v |node| tests/schema.test.ts > migrations - reversibility > up-down-up reproduces a byte-identical schema
v |node| tests/schema.test.ts > migrations - reversibility > supports stepwise rollback of only the latest migration
v ... > provenance - §1.4 universal record > carries all ten §1.4 fields as columns
v ... > provenance - §1.4 universal record > every user-facing table carries a NOT NULL provenance FK (discovered from live schema)
v ... > PII - §1.7 (no PII columns anywhere) > no table or column name matches a PII pattern
v ... > ranking neutrality - §1.1 (no economics columns) > no table or column name matches a commission/affiliate-economics pattern
v ... > vocabulary mirror - SQL CHECK lists match src/contracts (4 tests)
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

("v" = the reporter's pass mark, transcribed to keep this file free of
symbol glyphs.)

`npx wrangler d1 migrations apply k8-planner-fixture --local` (fresh state;
statuses transcribed from glyphs to [ok]):

```
Migrations to be applied: 0001_provenance.sql, 0002_catalog.sql,
0003_schools_households.sql, 0004_lists_requirements.sql
0001_provenance.sql          [ok]
0002_catalog.sql             [ok]
0003_schools_households.sql  [ok]
0004_lists_requirements.sql  [ok]
```

(Re-running reports no pending migrations — wrangler's ledger persists in
`.wrangler/`, gitignored; delete `.wrangler/` to reproduce from scratch.)

`npx vitest run --project workers` (real workerd D1 engine):

```
v |workers| tests-workers/d1.test.ts > applies all wrangler-format up migrations
v |workers| tests-workers/d1.test.ts > every user-facing table carries a NOT NULL provenance FK (discovered, not hardcoded)
v |workers| tests-workers/d1.test.ts > rejects a fact whose provenance row does not exist (§1.4 at the storage layer)
v |workers| tests-workers/d1.test.ts > accepts a fact once its provenance row exists
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Constraint-battery evidence (all in `tests/schema.test.ts`, all passing):
missing-provenance insert rejected (FOREIGN KEY); confidence 1.5 rejected;
unknown source_type rejected; brand_requirement='required' without brand
rejected; teacher scope without slot rejected; quantity 0 rejected;
malformed school_year rejected; global identifier with retailer rejected;
retailer_sku without retailer rejected; duplicate GTIN rejected (partial
unique index); ER self-edge rejected.

## 7. Known gaps and risks

- **Deferred tables (by design, decision 12)**: offers/prices, CPSC recalls,
  state tax holidays, dress-code policies. Basket comparison (Phase 4) and
  the safety layer (Phase 5) cannot ship without them; they land as new
  migration pairs once Phase 2 defines feed shapes. This is the largest open
  schema surface.
- `prohibited_substitutions` is a JSON TEXT column whose controlled
  vocabulary cannot be CHECK-enforced in SQLite; parser-engineer (Phase 3)
  must enforce sanitization (no raw prose) and test it.
- `node:sqlite` is experimental in Node 22 (warning in test output). Usage is
  confined to the test harness; D1-engine parity is independently proven by
  the workers project. If Node changes the API, only
  `tests/helpers/migrations.ts` is affected.
- Provenance `freshness` is a stored classification; nothing recomputes it
  yet. Phase 2's circuit breaker/staleness job owns re-evaluation against
  `config/flags.ts` thresholds.
- The §1.4 render guard (facts without provenance do not RENDER) does not
  exist yet — Phase 7, per CLAUDE.md's enforcement table.
- No data-access layer exists; contracts are types only. Phase 5 owns query
  code (and ULID generation for the TEXT PKs).
- The PII/economics guards are column-NAME pattern tests; they cannot detect
  PII smuggled into a permitted column's VALUES. Value-level enforcement is
  the Phase 3 upload-cycle test and Phase 10 compliance review.
- `wrangler.jsonc` `database_id` is an all-zeros placeholder; any future
  remote provisioning must replace it and is gated on flags/licensing
  (release-qa blocker, unchanged from Phase 0).
- CLAUDE.md's invariant table and phase-state rows for Phase 1 still read
  "Deferred/Not started" — updating CLAUDE.md is outside my write set; the
  orchestrator owns flipping §1.4's row to partially-enforced and Phase 1 to
  complete at gate time.

## 8. Instructions to next agent

**ingestion-engineer (Phase 2):**

- MUST read `src/contracts/` and code against those types; do not redefine
  them. Every fact you ingest (fixture or live) MUST create a `provenance`
  row first and reference it — the FK will reject anything else.
- Fixture data MUST use `source_type='fixture'` and a namespaced `source`
  ('fixture:<set>-<version>'). Never invent a number: fixture prices/counts
  must be clearly-labeled fixture values in fixture files, not plausible
  fabrications sprinkled in code (CLAUDE.md process rule).
- Gate finding SG-4 (from handoff 00 §7): when you create `fixtures/`, the
  banned-claims lint excludes that path — you MUST add a test asserting
  fixture display strings contain no `BANNED_CLAIMS`.
- MUST NOT create or alter tables yourself. Schema changes (offers/prices,
  recalls, tax holidays, source-health persistence if D1-backed) route back
  through data-architect as new numbered migration pairs — one file in
  `migrations/`, its twin in `migrations/down/`, same filename. The pairing
  test fails otherwise. Never edit an applied migration.
- MUST NOT put non-migration SQL at the top level of `migrations/` — both
  wrangler and `readD1Migrations()` consume every top-level `.sql` file.
- Workers-runtime tests go in `tests-workers/` (typed by
  `tsconfig.workers-tests.json`; extend `tests-workers/env.d.ts` when you add
  bindings); node-side tests in `tests/`. Extend `wrangler.jsonc` for KV
  (config/source-health/trend snapshots) with justification in your handoff,
  and mirror new bindings in `src/index.ts` `Env` and `env.d.ts`.
- MUST NOT assume live sources: `DEFAULT_FLAGS.liveSources.*` are all false.
  Every live integration sits behind its flag AND the circuit breaker.
- §0 NOT #1 is structural now: there is deliberately nowhere to store a
  scraped school list or its URL. Do not add one. Interoperate/deep-link only.
- Do not weaken `npm run verify`; extend it if you add tooling. Do not touch
  `docs/design/` (Phase 6 in flight), other agents' handoffs, or Phase 0
  tests.
