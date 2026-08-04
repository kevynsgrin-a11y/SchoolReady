# HANDOFF 04 — parser-engineer — Phase 3

## 1. Inputs consumed

- `CLAUDE.md` §0 (launch posture, NOT #1, no child-directed collection),
  §1 invariants 4, 5, 6, 7, 8, stack summary (§2: R2 only for transient
  upload buffers with hard TTL), process rules.
- `docs/handoffs/03-ingestion-engineer-2.md` §8 — binding instructions:
  reuse `provenanceDefect`/§1.4 pattern, source_kind + per-row
  source_confidence (never 1.0 for OCR/model extraction), R2 binding mirrored
  in wrangler.jsonc + `src/index.ts` Env + `tests-workers/env.d.ts`, the open
  `prohibited_substitutions` sanitization obligation (handoff 02 §7), fixture
  conventions, no URL-fetch intake ever.
- `docs/handoffs/02-data-architect-1.md` §4 (requirement schema),
  `src/contracts/requirement.ts`, `src/contracts/provenance.ts`,
  `src/contracts/product.ts`, `src/contracts/school.ts`.
- Phase 2 infrastructure: `src/ingestion/types.ts` (Clock, isoFromMs,
  FixtureDocument), `src/ingestion/provenance.ts`, `tests/helpers/fixtures.ts`,
  `tests/fixtures.test.ts` (auto-discovery of fixture files).

## 2. Decisions made

0. **This phase was resumed after a harness restart.** A prior parser-engineer
   run completed most of `src/parsing/` and `src/contracts/constraint.ts`,
   then died before any test, fixture, binding, or handoff existed. The
   source was absorbed, verified, and repaired (decisions 8–10 below are the
   repairs); everything in §3 is owned by this handoff regardless of which
   run first typed it.
1. **Hard constraints are a controlled vocabulary, not prose**
   (`src/contracts/constraint.ts`): 23 codes in two kinds
   (`required_attribute` like `presharpened_required`,
   `prohibited_substitution` like `no_bluetooth`), each with a canonical
   render phrase so parse -> render -> parse is the identity on meaning.
   `sanitizeProhibitedSubstitutions()` throws on anything that is not a known
   code — raw list prose can never reach the `requirements`
   `prohibited_substitutions` JSON column. This discharges handoff 02 §7 /
   handoff 03 §8's open obligation. Alternative (free-text constraint column
   with lint) rejected: it cannot round-trip and invites PII.
2. **The parser proposes; the user confirms.** Every intake channel emits a
   `ReviewPayload` whose `requiresUserConfirmation` is the LITERAL type
   `true` — no code path can emit false. Ambiguity flags split into
   review-forcing (`ambiguous_product`, `unrecognized_product`,
   `conflicting_quantities`, `multi_color_split_needed`, `multiple_brands`,
   `multiple_products`, `underspecified_variant_size`, `low_ocr_confidence`,
   `unparsed_detail`) and informational (`quantity_implicit_one`,
   `color_choice`). Bare "glue" yields candidates
   `[glue-stick, liquid-glue]` and a null proposal — never a pick (§1.5).
3. **Leftover-token analysis guarantees nothing is silently dropped**: after
   every extraction pass, surviving non-stopword tokens flag
   `unparsed_detail` and force review with the (redacted) original text
   alongside the proposal.
4. **PII defense in depth, three layers** (§1.7): (a) pattern redaction at
   the intake boundary before anything else sees the text — categories:
   child_name, teacher_name, classroom_id, address, exact_size,
   budget_amount, gift_recipient, contact; the report carries category
   counts, never values; (b) STRUCTURAL persistence — drafts contain only
   controlled-vocabulary fields, and the manual channel has no free-text
   field at all (free-text dimensions are rejected with an error), so a
   missed name has nowhere to persist; (c) upload bytes exist only in the
   hard-TTL buffer and are deleted in `finally`. Chosen over "smarter" NER
   because patterns are auditable and the structural layer catches what
   patterns miss.
5. **R2 binding in fixture posture** (`UPLOAD_BUFFER`, placeholder bucket,
   local-only, §2 justification in wrangler.jsonc comment): §2 sanctions R2
   ONLY as a transient upload buffer with hard TTL, and this bucket is
   exactly that. R2 lifecycle rules have day granularity, so the 900-second
   TTL is enforced in code: an expired object is unreadable (get() deletes
   it and returns null) and `sweepExpired()` removes stragglers. Deletion is
   verified by `list()` in tests, never assumed.
6. **OCR is fixture-replay only.** `createFixtureOcrEngine` refuses documents
   not labeled `_fixture: true` with `fixture:`-namespaced set ==
   provenance.source (same gate as Phase 2 adapters); `createLiveOcrStub`
   rejects with a descriptive error and contains no fetch code. No OCR
   feature flag exists yet in config/flags.ts (adding one is the live
   integration's job, with compliance review).
7. **No new D1 tables.** Parsed output is a `ParsedRequirementDraft` (slug
   keyed, not FK keyed) because nothing may persist before the user confirms
   in review and Phase 5's data-access layer assigns ids. Upload-session
   bookkeeping lives entirely in the R2 buffer contract. Alternative
   (0007 upload-sessions table) rejected as dead bookkeeping that would
   only exist to hold PII-adjacent state.
8. **Repair: TS narrowing bug in optionality extraction** (assignment inside
   a replace callback is invisible to CFA) — rewritten as test-then-mask;
   this was the only compile error in the inherited source.
9. **Repair: upload confidence was double-scaled** (profile factor x
   per-line page factor, both the OCR mean). Fixed to scale exactly once,
   per line, by that line's own page confidence. A single-page 0.9-confidence
   scan now yields sourceConfidence 0.86 (0.95 extraction x 0.9 page), not
   0.77.
10. **Additions to the inherited parser**: `multiple_brands` review-forcing
    flag ("Clorox or Lysol" is a choice — proposing the first silently
    dropped the alternative); "pk" unit word; hyphenated "N-pack" as
    packCount (unhyphenated "4 pack" deliberately falls to leftover ->
    review rather than guessing).
11. **Corpus methodology — generated, then verified, then frozen.** The 45
    phrasings were written first; the parser ran once; every output was
    hand-checked against the phrasing's plain meaning (two behaviors were
    fixed as a result — decisions 9/10); the verified outputs were frozen
    into the fixture as regression anchors. The corpus asserts full
    structural equality including per-field confidences, so it is not a
    tautology: any future behavior drift fails 45 named tests.

## 3. Artifacts produced

Created:
- `src/contracts/constraint.ts` (constraint vocabulary + write gate)
- `src/parsing/`: `types.ts`, `pii.ts`, `lexicon.ts`, `parse-line.ts`,
  `render.ts`, `review.ts`, `ocr.ts`, `upload-buffer.ts`, `pipeline.ts`,
  `index.ts`
- `fixtures/list-phrasings/phrasings.fixture.json` (45 labeled synthetic
  phrasings + expected parses)
- `tests/parsing-corpus.test.ts`, `tests/parsing-roundtrip.test.ts`,
  `tests/parsing-review.test.ts`, `tests/parsing-pii.test.ts`,
  `tests/parsing-upload-buffer.test.ts`, `tests/parsing-pipeline.test.ts`
- `tests-workers/parsing-upload-r2.test.ts`

Modified:
- `src/contracts/index.ts` (re-export constraint module)
- `wrangler.jsonc` (`r2_buckets`: UPLOAD_BUFFER, placeholder bucket name,
  §2 justification comment)
- `src/index.ts` (`Env.UPLOAD_BUFFER: R2Bucket`),
  `tests-workers/env.d.ts` (same)

Not touched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
prior handoffs, migrations 0001–0006, all Phase 0–2 test files. The
CLAUDE.md invariant-table row for §1.7 and the Phase 3 state row are the
orchestrator's to flip at gate time, as in prior phases.

## 4. Contracts exported

### 4.1 Parsed requirement draft (what Phase 4/5 consume)

```ts
interface ParsedRequirementDraft {
  productTypeSlug: string | null;      // null = unresolved, CANNOT persist pre-review
  quantity: number;
  unit: Unit;
  packCount: number | null;
  dimensions: string | null;           // product descriptor: '1.5 in', '9x12 in', '8 oz', 'gallon'
  material: string | null;             // controlled MATERIAL_WORDS
  color: string | null;                // controlled COLOR_WORDS
  rulingStyle: RulingStyle | null;
  brandRequirement: BrandRequirement;  // required | preferred | generic_allowed
  requiredBrandSlug: string | null;
  scope: RequirementScope;             // structural: list/grade/subject (§1.7)
  durability: Durability | null;
  optionality: Optionality;
  prohibitedSubstitutions: readonly ConstraintCode[];  // controlled codes ONLY
  sourceKind: RequirementSourceKind;   // paste | manual | upload | fixture
  sourceConfidence: Confidence;        // < 1.0 for any extraction; 1.0 only manual
}
interface ParsedItem {
  lineNumber: number;
  originalText: string;                // PII-REDACTED, always
  draft: ParsedRequirementDraft;
  fieldConfidences: Readonly<Record<string, Confidence>>;
  productCandidates: readonly string[];
  ambiguityFlags: readonly AmbiguityFlag[];
  needsReview: boolean;
  provenance: ProvenanceRecord;        // full §1.4 record, inseparable
}
```

### 4.2 Review UX contract (what Phase 7 renders)

```ts
interface ReviewPayload {
  intakeId: string;
  intakeMethod: IntakeMethod;
  parserVersion: string;               // 'list-parser@0.3.0' (+ '+fixture-ocr@1.0.0' on upload)
  parsedAt: IsoTimestamp;
  requiresUserConfirmation: true;      // literal type — no bypass exists
  redaction: PiiRedactionReport;       // { categoriesHit, counts, redactionCount } — NEVER values
  items: readonly ReviewItem[];        // originalText + proposed + interpretation
                                       // + fieldConfidences + candidates + flags + needsReview
  itemsNeedingReview: number;
  skippedLineCount: number;
  overallConfidence: Confidence;       // MINIMUM item confidence (conservative)
}
```

### 4.3 Intake functions (src/parsing/pipeline.ts)

```ts
parsePasteIntake({ intakeId, text }, { clock, logger?, fixtureSet? }): ParseOutcome
parseManualIntake({ intakeId, items: ManualEntryItem[] }, opts): ParseOutcome   // throws ManualEntryValidationError
parseUploadIntake({ intakeId, objectKey, buffer: UploadBuffer, ocr: OcrEngine }, opts): Promise<ParseOutcome>
// ParseOutcome = { intakeId, intakeMethod, items: ParsedItem[], review, redaction }
// Loggers receive counts/categories/opaque ids ONLY (ParseLogEvent).
```

### 4.4 Upload buffer + OCR

```ts
UPLOAD_BUFFER_TTL_SECONDS = 900; UPLOAD_KEY_PREFIX = "uploads/";
interface UploadBuffer { put; get /* null past TTL */; delete; list; sweepExpired }
class MemoryUploadBuffer(clock, ttl?);  class R2UploadBuffer(bucket: R2Like, clock, ttl?);
interface OcrEngine { mode: "fixture" | "live"; engineVersion; recognize(req): Promise<OcrResult> }
createFixtureOcrEngine(doc: FixtureDocument<OcrFixtureRow>); createLiveOcrStub();
```

### 4.5 Constraint vocabulary (src/contracts/constraint.ts)

```ts
CONSTRAINT_DEFS: 23 codes — presharpened_required, heavy_duty_required,
wired_required, washable_required, low_odor_required, unscented_required,
solid_colors_required, blunt_tip_required, pointed_tip_required,
prongs_required, pockets_required, over_ear_required, no_bluetooth,
no_wireless, no_earbuds, no_rolling_backpacks, no_character_prints,
no_liquid_glue, no_mechanical_pencils, no_spiral_notebooks,
no_trapper_keepers, no_gel_pens, no_permanent_markers
sanitizeProhibitedSubstitutions(values): ConstraintCode[]  // throws on prose
constraintPhrase(code): string                             // render anchor
```

### 4.6 Worker environment

```ts
export interface Env {
  DB: D1Database;
  SOURCE_KV: KVNamespace;
  UPLOAD_BUFFER: R2Bucket;   // wrangler.jsonc r2_buckets[0], placeholder bucket
  FIXTURE_MODE: string;
}
```

## 5. Invariants touched

- **§1.7 (PII never persists) — the enforcement row this phase owns.**
  `tests/parsing-pii.test.ts` runs a FULL upload cycle with seeded PII of
  every CLAUDE.md category (child name, teacher name, classroom ID, address,
  exact size, budget — plus contact and gift recipient), then scans every
  surface that outlives the cycle: buffer contents (empty, verified via
  list()), all captured log events, the entire serialized ParseOutcome, and
  the redaction report (categories/counts only). The workers twin
  (`tests-workers/parsing-upload-r2.test.ts`) repeats the cycle on REAL R2
  and additionally serializes every row of every D1 table and scans it.
  Manual channel is PII-immune by construction (no free-text field; proven
  by rejection tests).
- **§1.5 (suppression beats guessing).** `tests/parsing-review.test.ts`:
  ambiguous product -> null proposal + candidates + needsReview; unrecognized
  product flagged, never invented; conflicting quantities and cross-line
  underspecified sizes force review; low-OCR pages force review; the review
  payload is mandatory on every channel (literal-true type).
- **§1.4 (provenance).** Every ParsedItem carries a full ten-field record
  built BEFORE anything downstream, gated by the Phase 2 `provenanceDefect`
  helper; sourceType follows the intake method (paste/manual -> user_entry,
  upload -> user_upload, corpus -> fixture); provenance.confidence equals the
  draft's sourceConfidence (`tests/parsing-pipeline.test.ts`,
  `tests/parsing-corpus.test.ts`).
- **§0 NOT #1 + no-network.** No URL intake exists; the parsing suite runs
  with `globalThis.fetch` poisoned and asserts zero attempts; the live OCR
  stub contains no fetch code.
- **§4 Phase 3 hard-constraint guarantee.** `tests/parsing-roundtrip.test.ts`
  proves parse -> render -> parse identity on all meaning-bearing fields for
  the three canonical phrasings + 10 adversarial ones, with pinned constraint
  codes.
- **§1.6/§1.8 on the new fixture file** — covered automatically by the
  pre-existing `tests/fixtures.test.ts` discovery suite (+4 tests appeared
  the moment the file existed: banned claims, emoji, labeling wrapper,
  forbidden PII/list-shaped keys).

## 6. Acceptance evidence

All commands run 2026-08-04, Node v22, exit 0. Pass glyphs transcribed as
"v" (as in handoffs 02/03) to keep this file free of symbol codepoints.

`npm run verify` (tail):

```
> eslint . && node scripts/lint-banned-claims.mjs && node scripts/lint-no-emoji.mjs
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.workers-tests.json --noEmit
> vitest run
 Test Files  21 passed (21)
      Tests  291 passed (291)
```

291 = 172 inherited (Phase 0–2 baseline, all still passing, none modified)
+ 115 new parsing tests + 4 auto-discovered fixture-guard tests for the new
corpus file. New-file breakdown: parsing-corpus 50, parsing-roundtrip 19,
parsing-review 18, parsing-upload-buffer 11, parsing-pipeline 8,
parsing-pii 6, workers parsing-upload-r2 3.

Zero-PII cycle on the real workerd runtime (verbose, transcribed):

```
v |workers| UPLOAD_BUFFER binding (real R2) - round-trips bytes and metadata under the uploads/ prefix
v |workers| UPLOAD_BUFFER binding (real R2) - enforces the hard TTL in code even though R2 lifecycle is day-granular
v |workers| zero-PII upload cycle on workerd (SS1.7) - leaves no seeded value in R2, in D1, in logs, or in the outcome
```

The D1 half of that test serializes every row of every table (asserted > 10
tables scanned) after the cycle and scans for all seeded values; the node
twin additionally proves the redaction report equals exactly the seeded
category list and that OCR-failure paths still delete the buffer
(finally-block, verified via list()).

Corpus: expected vs. actual. The corpus test asserts DEEP EQUALITY of the
full projected structure (all draft fields + scope + candidates + flags +
review routing + every per-field confidence) against the fixture; the 46
item rows below are therefore both expected and actual — any divergence
fails a named test. `conf` is the item's sourceConfidence; per-field
confidences (product/quantity/unit/optionality/... in 0-1) are asserted
per item and recorded in the fixture.

| id | phrasing | expected structure | review / flags | conf |
|---|---|---|---|---|
| canonical-pencils | 2 boxes #2 pencils, sharpened | no2-pencil x2 box; constraints=[presharpened_required] | ok / - | 0.95 |
| canonical-binder | one 1.5-inch heavy-duty binder | binder x1 each; dims=1.5 in; constraints=[heavy_duty_required] | ok / - | 0.95 |
| canonical-earbuds | wired earbuds, no Bluetooth | earbuds x1 each; constraints=[no_bluetooth,wired_required] | ok / quantity_implicit_one | 0.55 |
| brand-preferred-pencils | 24 Ticonderoga #2 pencils, pre-sharpened | no2-pencil x24 each; brand=ticonderoga(preferred); constraints=[presharpened_required] | ok / - | 0.95 |
| brand-required-pencils | 12 Ticonderoga #2 pencils only | no2-pencil x12 each; brand=ticonderoga(required) | ok / - | 0.95 |
| pack-count-crayons | Crayola crayons, 24 count | crayons x1 pack; pack=24; brand=crayola(preferred) | ok / quantity_implicit_one | 0.55 |
| box-of-crayons | 3 boxes of 24 crayons | crayons x3 box; pack=24 | ok / - | 0.95 |
| bare-glue | glue | UNRESOLVED x1 each; candidates=[glue-stick,liquid-glue] | REVIEW / ambiguous_product,quantity_implicit_one | 0.20 |
| glue-sticks | 4 glue sticks | glue-stick x4 each | ok / - | 0.95 |
| liquid-glue-oz | 1 bottle Elmer's white glue, 8 oz | liquid-glue x1 bottle; dims=8 oz; brand=elmers(preferred) | ok / - | 0.93 |
| filler-paper | 2 packs wide-ruled filler paper | filler-paper x2 pack; ruling=wide_ruled | ok / - | 0.93 |
| comp-books | 5 composition notebooks, wide ruled | composition-notebook x5 each; ruling=wide_ruled | ok / - | 0.95 |
| scissors-blunt | 1 pair blunt-tip scissors (Fiskars preferred) | scissors x1 pair; brand=fiskars(preferred); constraints=[blunt_tip_required] | ok / - | 0.95 |
| highlighters-yellow | 2 yellow highlighters | highlighter x2 each; color=yellow | ok / - | 0.95 |
| folder-prongs | 1 red plastic pocket folder with prongs | folder x1 each; mat=plastic; color=red; constraints=[prongs_required] | ok / - | 0.90 |
| folders-two-colors | folders - 1 red, 1 blue | folder x1 each | REVIEW / multi_color_split_needed,quantity_implicit_one | 0.55 |
| box-or-pouch | Pencil box or zipper pouch | UNRESOLVED x1 each; candidates=[pencil-box,pencil-pouch] | REVIEW / ambiguous_product,quantity_implicit_one | 0.20 |
| backpack-no-wheels | 1 backpack, no wheels | backpack x1 each; constraints=[no_rolling_backpacks] | ok / - | 0.95 |
| headphones-no-earbuds | headphones (no earbuds) | headphones x1 each; constraints=[no_earbuds] | ok / quantity_implicit_one | 0.55 |
| tissues-boxes | 2 boxes of tissues | facial-tissue x2 box | ok / - | 0.93 |
| wipes-two-brands | 3 containers of disinfecting wipes (Clorox or Lysol) | disinfecting-wipes x3 each; brand=clorox(preferred) | REVIEW / multiple_brands | 0.93 |
| pk-pencils | 12 pk pencils | pencil x12 pack | ok / - | 0.80 |
| ream-paper | 1 ream white copy paper | copy-paper x1 ream; color=white | ok / - | 0.95 |
| expo-4pack | 1 4-pack Expo dry erase markers, low odor | dry-erase-marker x1 pack; pack=4; brand=expo(preferred); constraints=[low_odor_required] | ok / - | 0.95 |
| kleenex-boxes | 2 boxes Kleenex | facial-tissue x2 box; brand=kleenex(preferred) | ok / - | 0.93 |
| ziploc-gallon | 1 box gallon-size Ziploc bags | storage-bags x1 box; dims=gallon | ok / - | 0.90 |
| budget-line | $15 donation to the class fund | no item (skipped=1, redacted=budget_amount) | - | - |
| grade-heading | 3rd Grade \ 2 glue sticks | glue-stick x2 each; scope=grade:3 | ok / - | 0.95 |
| subject-heading | Art: \ 1 art smock | art-smock x1 each; scope=subject:art | ok / - | 0.90 |
| conflicting-qty | 2 folders (3) | folder x2 each | REVIEW / conflicting_quantities | 0.40 |
| spiral-college | 1 college ruled spiral notebook | spiral-notebook x1 each; ruling=college_ruled | ok / - | 0.95 |
| sticky-notes | Post-it notes | sticky-notes x1 pack | ok / quantity_implicit_one | 0.55 |
| unrecognized | 2 robotics kits | UNRESOLVED x2 each | REVIEW / unrecognized_product | 0.20 |
| earbuds-or-headphones | earbuds or headphones - wired | UNRESOLVED x1 each; constraints=[wired_required]; candidates=[earbuds,headphones] | REVIEW / ambiguous_product,quantity_implicit_one | 0.20 |
| markers-black-lowodor | 6 black dry erase markers, low odor | dry-erase-marker x6 pack; color=black; constraints=[low_odor_required] | ok / - | 0.95 |
| pouch-mesh | 1 zipper pouch, mesh | pencil-pouch x1 each; mat=mesh | ok / - | 0.95 |
| bare-scissors | scissors | scissors x1 pair | ok / quantity_implicit_one | 0.55 |
| optional-sanitizer | Optional: hand sanitizer, 8 oz | hand-sanitizer x1 bottle; dims=8 oz; optional | ok / quantity_implicit_one | 0.55 |
| erasers-pink | 2 pink erasers | eraser x2 each; color=pink | ok / - | 0.90 |
| color-choice-folder | 1 blue or green plastic folder | folder x1 each; mat=plastic (color NOT merged/picked) | ok / color_choice | 0.90 |
| cross-line-binder (line 1) | 1 one-inch binder \ 1 binder | binder x1 each; dims=1 in | ok / - | 0.95 |
| cross-line-binder (line 2) | (same intake) | binder x1 each; dims=null | REVIEW / underspecified_variant_size | 0.95 |
| over-ear | wired over-ear headphones (no earbuds, no bluetooth) | headphones x1 each; constraints=[no_bluetooth,no_earbuds,over_ear_required,wired_required] | ok / quantity_implicit_one | 0.55 |
| washable-crayons | 3 boxes of 24 Crayola crayons, washable | crayons x3 box; pack=24; brand=crayola(preferred); constraints=[washable_required] | ok / - | 0.95 |
| solid-backpack | backpack - no wheels, no character prints, solid colors only | backpack x1 each; constraints=[no_character_prints,no_rolling_backpacks,solid_colors_required] | ok / quantity_implicit_one | 0.55 |
| glue-lowodor | 12 glue sticks, washable, low-odor | glue-stick x12 each; constraints=[low_odor_required,washable_required] | ok / - | 0.95 |

Round-trip acceptance: 3 canonical + 10 adversarial phrasings (>= 5
required) each assert (a) the pinned constraint codes were captured, (b) the
rendering contains every code's canonical phrase, (c) re-parsing the
rendering reproduces the identical draft on every meaning-bearing field.
The `sanitizeProhibitedSubstitutions` gate rejects raw prose
("sharpened", "no bluetooth please") with `ConstraintSanitizationError`.

## 7. Known gaps and risks

- **Pattern redaction is not exhaustive by nature** (an unlabeled bare name
  in prose survives redaction into `originalText`). The §1.7 guarantee rests
  on the structural layer: nothing free-text is persistable — drafts are
  controlled-vocabulary only, review payloads are transient, and Phase 5
  MUST NOT add persistence for `originalText` or any review-payload text.
- **No D1 write path for requirements exists yet** (by design, Phase 5). The
  workers zero-PII test proves the cycle leaves D1 untouched; when Phase 5
  adds real persistence of confirmed requirements it must EXTEND the cycle
  test to include its writes, and set requirements columns only from draft
  fields (the sanitizer + controlled vocabularies make that safe).
- **Lexicon coverage is 45 product types / 13 brands** — enough for the
  fixture beta; unknown products correctly route to review rather than
  failing, so coverage growth is additive (extend PRODUCT_LEXICON +
  corpus records together).
- **`sweepExpired()` has no scheduled caller yet.** Expired objects are
  unreadable and deleted on access; a cron/queue sweep belongs to Phase 5's
  worker wiring. A production R2 lifecycle rule (1-day floor) should also be
  provisioned then as belt-and-suspenders; the code-level TTL is the
  enforced contract and is tested.
- **No real OCR exists** — the live stub throws; fixture engine replays
  labeled documents only. A future OCR integration needs a feature flag in
  config/flags.ts, licensing/compliance review, and MUST feed its output
  through this same redaction -> parse -> review path unchanged.
- **Turnstile on upload** (§2) is not wired — there is no HTTP surface yet;
  it lands with the Phase 5 upload endpoint in front of `parseUploadIntake`.
- Heading detection covers grade/subject headings; teacher/classroom scope
  (anonymous slot ordinals) is deliberately NOT parsed from text — a
  teacher-name heading is redacted as PII, and slot assignment is a review
  UX decision (Phase 7) so names never map to persisted scopes.
- The renderer omits the unit word for `each`, so a phrasing whose parsed
  unit is `each` but whose product default differs would not round-trip
  unit; no such phrasing exists in the corpus and the round-trip suite pins
  the cases that must hold. Extend both when extending the lexicon.

## 8. Instructions to next agent

**algorithm-engineer (Phase 4):**

- Consume `ParsedRequirementDraft` / `ParsedItem` from `src/parsing` (§4.1)
  for merge, inventory-audit, and basket math. Key semantics you MUST honor:
  - `prohibitedSubstitutions` are HARD filters, never soft preferences: a
    variant violating any code (e.g. `wired_required`, `no_bluetooth`) is
    EXCLUDED from match/basket candidacy, not down-ranked. Use
    `CONSTRAINT_DEFS[].kind` to interpret: `required_attribute` excludes
    variants lacking the attribute; `prohibited_substitution` excludes the
    named class. Write the exclusion as a test per code family.
  - `needsReview: true` items and null `productTypeSlug` items MUST NOT
    enter matching, merging, or basket optimization (§1.5) — they are
    suppressed until the user resolves them. `productCandidates` exist for
    the review UI, not for you to auto-pick from.
  - `brandRequirement: "required"` restricts candidacy to
    `requiredBrandSlug`; `"preferred"` is a ranking preference (which must
    still never see commission — §1.1); `multiple_brands`-flagged items are
    review-gated anyway.
  - `quantity` x `unit`/`packCount` is the net-required input for pack-size
    conversion. `dimensions` is a product variant discriminator ('1.5 in'
    binder vs '1 in') — treat distinct dimensions as distinct requirements
    when merging across children; never collapse them.
  - `sourceConfidence` < 1 marks extraction-derived rows; your suppression
    thresholds (§1.5) should treat low-confidence unconfirmed requirements
    as suppress-or-downgrade inputs, and `optionality: "optional"` items
    must never inflate a "required spend" number.
- Only user-CONFIRMED requirements (post-review, Phase 5 persistence) are
  merge inputs in production flows; for Phase 4 development, build against
  the corpus fixture via `parsePasteIntake(..., { fixtureSet })` — its
  provenance is fixture-labeled, and your outputs must carry §1.4 provenance
  the same way (reuse `src/ingestion/provenance.ts`).
- MUST NOT: modify `src/parsing/` internals or the constraint vocabulary
  semantics (adding NEW codes with phrase + matcher + round-trip test is
  fine); persist or log review-payload text; add any intake that fetches a
  URL; touch the R2 buffer for anything but transient uploads; weaken any
  Phase 0–3 test. `npm run verify` (291 passing) must stay green — extend,
  never weaken.
- Do not assume: that a parsed item is confirmed (check the review
  contract); that slugs resolve to product_type ids yet (Phase 5 does FK
  resolution); that OCR confidence semantics apply to your scores (yours
  come from your own evidence rules, §1.3/§1.5).
