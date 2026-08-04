# HANDOFF 05 — algorithm-engineer — Phase 4

## 1. Inputs consumed

- `CLAUDE.md` §0 (capabilities 2-5, launch posture, NOT list), §1 invariants
  1, 3, 4, 5 (owned as code this phase), 6, 8, process rules (never invent a
  number; injected clocks).
- `docs/handoffs/04-parser-engineer-3.md` §4 (ParsedRequirementDraft,
  constraint vocabulary) and §8 — binding: hard constraints are filters not
  preferences; needsReview/null-slug items never enter matching/merging;
  distinct dimensions never merge; optional items never inflate required
  spend; provenance via `src/ingestion/provenance.ts`.
- `docs/handoffs/02-data-architect-1.md` §2.11 (pack math), §4.4 (ER methods;
  acceptance thresholds assigned here), §5 (§1.1 schema half; §1.5
  structural inputs), `docs/handoffs/gates/phase-3-gate.md` (P3-2/P3-3).
- Contracts: `src/contracts/` requirement, constraint, offer, product,
  household, tax-holiday, recall, provenance. `config/flags.ts`
  (circuit-breaker staleness reused as the price/stock downgrade threshold).
- Fixtures: `fixtures/product-feeds/offers.fixture.json`,
  `fixtures/tax-holidays/2026.fixture.json`,
  `fixtures/cpsc-recalls/recalls.fixture.json` (consumed); two new fixture
  sets created (§3). Phase 2 infra: `provenanceFromFixture`, fixture
  adapters, `tests/helpers/fixtures.ts` (used, not modified).

## 2. Decisions made

1. **§1.1 is structural before it is behavioral.** No type in
   `src/algorithms/` has any economics field, so a commission cannot even be
   passed in. Two guards: (a) `tests/algorithms-independence.test.ts` walks
   the transitive import closure of `src/algorithms/` FROM DISK — no module
   path matching /monetization|commission|payout|referral/i, closure confined
   to `src/` + `config/`, zero bare package imports, plus a comment-stripped
   source scan for economics identifiers. This keeps holding automatically
   when `src/monetization/` appears in Phase 9. (b) The behavioral
   commission-injection test (§6). Alternative (lint rule) rejected: lints
   check text, not the import graph.
2. **Match is gate-then-score.** Violating any prohibited-substitution or
   required-attribute constraint disqualifies before soft scoring exists;
   soft score is the weighted mean over APPLICABLE dimensions only (an
   unspecified attribute never dilutes). Candidate attribute/class tokens
   derive mechanically from constraint codes (`presharpened_required` ->
   `presharpened`; `no_bluetooth` -> `bluetooth`), so new codes need no
   match-code change. Requirement-specified dimensions with unknown candidate
   dimensions DISQUALIFY (`dimensions_unverified`) — §1.5, never guessed.
   Tie-break is candidateKey — deterministic and non-monetary by type.
3. **Net-required merges on slug|dimensions|ruling|color; inventory offsets
   exact keys only.** Wildcard inventory matching (color-null stock against a
   red-folder requirement) would be guessing; the conservative cost is
   possible over-buying, which is visible, not invented. Shareable groups
   take max() across members; mixed shareability sums conservatively and
   flags it. Condition weights new=1.0 / usable=0.5 / worn_out=0.0 (the
   contract vocabulary; brief's good/fair/poor example mapped 1:1).
   Fractional net is preserved and `unitsToBuy = ceil(net)` is separate, so
   the arithmetic stays auditable.
4. **Basket enumerates and returns a frontier.** Exhaustive enumeration
   (capped at 50k combinations, descriptive error beyond) over
   per-item eligible offers; dominance on [landedCost, stops, deliveryDays,
   lowConfidenceCount]. `weightedObjectiveCents` (cost + λ·stops + λ·risk +
   λ·matchPenalty + λ·lowConfidence) exists as a labeled diagnostic sort aid
   only — the OUTPUT is the frontier plus four labeled views; no field is
   named optimal/best/recommended (tested). Unverified (fixture) tax-holiday
   calendars still compute tax 0 but cost one confidence point and attach a
   caveat + the holiday's provenance id (§1.5 on fixture tax data, per the
   Phase 2 limitation).
5. **Unknowns are priced as uncertainty, not resolved.** Unknown shipping →
   `costComplete: false` + confidence point (never silently 0); unknown
   delivery → excluded from "fastest" eligibility + confidence point;
   `limited`/`unknown` availability → confidence point; out_of_stock →
   excluded with a visible reason.
6. **Capsule outputs are ranges with visible assumptions.** rewears-per-unit
   is a (category x climate band) RANGE table of model constants; min units
   use max rewears, max units use min rewears; every number that produced a
   range is emitted as a labeled `Assumption`. Uniform dress codes add one
   reserve day (no substitutes) as a visible note. `buyNowVsWait` never
   forecasts: deadline pressure, observed-median comparison, or
   insufficient_data — every outcome carries a no-prediction disclaimer.
7. **Trend: winsorize into median ± 3·scaledMAD, z at the clamp, then decay.**
   Stats come from the raw window; the LATEST observation is winsorized so a
   single spike maxes at |z| = 3; freshness e^(-Δt/τ) multiplies z; families
   pass only on samples AND freshness AND decayed z. Same-family series are
   deduplicated before counting (repetition is not independence — tested).
   Sponsored-majority families can pass thresholds but never count as
   organic; label order: viral (>=3 organic) → paid_campaign_driven →
   locally_popular (organic evidence confined to one sub-national geography)
   → cooling (>=2 well-sampled families at decayed z <= -1) →
   insufficient_evidence (default). Confidence is a separate evidence-volume
   measure and is reported even when the label refuses.
8. **Worth-it matrix has no number anywhere.** Ratings are categorical,
   grades are categorical, and the assembled matrix contains zero numeric
   leaves (tested), so no caller can quietly average it. A rating with
   insufficient evidence or without provenance throws — 'unknown' is the only
   honest state (§1.4/§1.5).
9. **Deal integrity compares, never predicts.** Nearest-rank percentiles over
   UNIT prices (pack changes cannot hide unit-price increases); <5 window
   points → `insufficient_history`, no percentiles, no verdict. The
   inflated-reference rule is deliberately strict-and-simple: flag only when
   the reference exceeds EVERY observed window price (no false positives from
   a defensible high reference).
10. **Suppression: one evaluator per §1.5 trigger, explicit reason codes,
    merge rule suppress > downgrade > render.** Recall matching implemented
    UPC-exact only; fuzzy name/model matching is deferred to operator-review
    tooling because an ambiguous match must behave identically to a match
    (suppress) and pretending to a similarity score would be invented
    precision. `filterRecalledOffers` runs BEFORE basket optimization so a
    recalled product cannot appear in any option of any frontier; if the only
    offer is recalled the basket goes infeasible — safety beats completeness.
11. **Two new fixture sets** (trend signals, price history) rather than
    inline literals: they pass the Phase 0 fixture-guard suite automatically
    (labeling wrapper, banned claims, emoji, PII-shaped keys) and their
    series are constructed so the robust statistics are exactly
    hand-checkable (§6). ER acceptance thresholds (handoff 02 §4.4) are NOT
    burned into code this phase — no ER scoring data exists yet; see §7.

## 3. Artifacts produced

Created:
- `src/algorithms/`: `types.ts`, `match.ts`, `net-required.ts`, `basket.ts`,
  `capsule.ts`, `trend.ts`, `worth-it.ts`, `deal-integrity.ts`,
  `suppression.ts`, `index.ts`
- `fixtures/trend-signals/signals.fixture.json`
  (`fixture:trend-signals-2026-v1`, 11 series across 5 synthetic products)
- `fixtures/price-history/history.fixture.json`
  (`fixture:price-history-2026-v1`, 8-point glue window + 3-point sparse)
- `tests/algorithms-independence.test.ts` (5), `tests/algorithms-match.test.ts`
  (15), `tests/algorithms-net-required.test.ts` (11),
  `tests/algorithms-basket.test.ts` (13), `tests/algorithms-capsule.test.ts`
  (16), `tests/algorithms-trend.test.ts` (16),
  `tests/algorithms-worth-it.test.ts` (9),
  `tests/algorithms-deal-integrity.test.ts` (14),
  `tests/algorithms-suppression.test.ts` (14)

Modified: NOTHING. `git status` shows only additions; `CLAUDE.md`,
`.claude/agents/`, `config/*`, `docs/design/`, prior handoffs, migrations,
`src/parsing/`, `src/ingestion/`, `src/contracts/`, and every Phase 0-3 test
are untouched. The invariant-table flips for §1.1/§1.3/§1.5 are the
orchestrator's at gate time.

## 4. Contracts exported

All from `src/algorithms` (index re-exports). Key signatures:

```ts
// match.ts — §1.1: NO economics field exists in any input or output type
match(req: MatchRequirementInput, cand: MatchCandidateInput): MatchResult
rankCandidates(req, candidates): { eligible; excluded }   // tie-break: candidateKey
SOFT_WEIGHTS = { brand_preference:.30, color:.20, ruling:.20, material:.15, pack_fit:.15 }
// MatchCandidateInput: candidateKey, productTypeSlug, brandSlug, color,
//   material, rulingStyle, dimensions, packCount, attributeTokens,
//   classTokens, provenanceIds
// MatchResult: {eligible:false, disqualifiers[]} | {eligible:true, score, components[]}

// net-required.ts
CONDITION_FACTORS = { new:1.0, usable:0.5, worn_out:0.0 }
computeNetRequired(reqs: MemberRequirementInput[], inventory, reserves?): NetRequiredLine[]
partitionMergeInputs(items): { eligible, suppressed }     // §1.5 pre-merge gate
requiredSpendLines(lines): NetRequiredLine[]              // optional never inflates
// NetRequiredLine: key, gross/usable/reserve/netRequiredUnits (exact), unitsToBuy
//   (= ceil), shareable, mixedShareability, optionality, perMember[], provenanceIds

// basket.ts
optimizeBasket(items: BasketItemInput[], offers: BasketOfferInput[], ctx: BasketContext)
  : BasketParetoResult   // { feasible, unfulfillableItems, excludedOffers,
                         //   options, frontier, views: { lowestCost, fewestStops,
                         //   fastest, highestConfidence }, assumptions }
computeBasketLine(item, offer, ctx)   // pack ceil + holiday-aware tax, unit-testable
DEFAULT_BASKET_LAMBDAS = { perStopCents:500, perDeadlineRiskDayCents:300,
                           perMatchPointCents:1000, perLowConfidenceCents:200 }
// BasketContext: state, salesTaxRate + salesTaxBasis (labeled Assumption),
//   purchaseDate, holidays: TaxHolidayWindowInput[] (verified:false for fixture
//   calendars), daysUntilNeeded, lambdas

// capsule.ts
computeCapsuleCategory(input): CapsuleCategoryLine  // unitsRange {min,max} ALWAYS
REWEARS_PER_UNIT[category][climateBand]: { min, max }
costPerWearCents(priceCents, projectedWears); projectedWearsPerUnit(seasonDays, units)
buyNowVsWait(input): { timing: "buy_now"|"waiting_reasonable"|"insufficient_data",
                       reason, disclaimer }

// trend.ts
evaluateFamily(series: FamilySeriesInput, nowMs, config?): FamilyEvaluation
classifyTrend(evaluations, config?): TrendClassification
  // label in ["viral","insufficient_evidence","paid_campaign_driven",
  //           "locally_popular","cooling"]; confidence SEPARATE
DEFAULT_TREND_CONFIG = { tauDays:14, minSamples:5, zThreshold:2,
  freshnessFloor:0.3, sponsoredShareCeiling:0.5, coolingZ:-1 }; MAD_SCALE=1.4826

// worth-it.ts — WorthItMatrix has NO aggregate field (type-level test)
assembleWorthItMatrix(slug, entries, generatedAt): WorthItMatrix   // throws on
  // missing/dup dimension, rating w/o evidence, rating w/o provenance
WORTH_IT_DIMENSIONS = ["durability","cost_per_use","requirement_fit","safety",
                       "hype_vs_evidence"]

// deal-integrity.ts
evaluateDealIntegrity(history: PricePoint[], offer: CurrentOfferSnapshot,
  seasonal: SeasonalBaseline|null, nowMs, config?): DealIntegrityResult
  // verdict: below_typical|typical|above_typical|insufficient_history
  // flags: inflated_reference_price, pack_size_trap, membership_only_pricing,
  //        shipping_erases_discount, shipping_unknown, insufficient_price_history

// suppression.ts
SUPPRESSION_REASONS = ["stale_or_unverified_list","unresolved_product_variant",
  "price_stock_stale","single_signal_family_trend","unconfirmable_school_policy",
  "recalled_or_under_review","affiliate_neutral_conflict","deadline_unmeetable"]
evaluateListStatus / evaluateVariantResolution / evaluatePriceStockAge(_, nowMs,
  thresholds?) / evaluateTrendClaim / evaluateSchoolPolicy / evaluateRecallStatus /
  evaluateSourceConflict / evaluateDeadlineFeasibility  -> SuppressionFinding|null
combineFindings(findings): { action: "render"|"downgrade"|"suppress", findings }
DEFAULT_SUPPRESSION_THRESHOLDS = { priceStockDowngradeAfterSeconds: 21600,
                                   priceStockSuppressAfterSeconds: 604800 }
matchRecallsByUpc(upc, recallProducts); filterRecalledOffers(offers, recallProducts)
```

Every output type carries `provenanceIds` (§1.4) and/or labeled
`Assumption { name, value, basis: model_constant|fixture_assumption|user_input }`.
Injected time everywhere (`nowMs` / `purchaseDate` parameters); no module
calls `Date.now()`.

## 5. Invariants touched

- **§1.1 (commission never ranks) — behavioral half now ENFORCED.**
  `tests/algorithms-match.test.ts` "§1.1 commission-injection": 40%
  commission decorated onto the strictly-inferior candidate OUTSIDE the
  inputs; `JSON.stringify` of the ranking is asserted byte-identical, the
  inferior stays ranked below, and the output contains no /commission/i.
  Structural half: `tests/algorithms-independence.test.ts` (import-graph
  closure + source scan, future-proof against Phase 9).
- **§1.3 (viral needs >= 3 families) — ENFORCED.** Single-family series with
  a maximal z returns `insufficient_evidence`; repeated same-family series
  dedupe to one; sponsored-majority passing families yield
  `paid_campaign_driven`; label vocabulary is exactly the five permitted;
  default is `insufficient_evidence` (`tests/algorithms-trend.test.ts`).
- **§1.5 (suppression beats guessing) — ENFORCED.** All eight triggers have
  evaluator + test with explicit reason codes
  (`tests/algorithms-suppression.test.ts`); plus §1.5 behavior inside every
  module: dimensions_unverified disqualification, exact-key inventory,
  review-pending merge gate, out-of-stock/geography exclusions with visible
  reasons, insufficient_history verdict, insufficient_data buy-timing,
  recall filtering from every basket.
- **§1.4 (provenance)** — every output carries provenanceIds built from
  input lineage (fixture provenance via the Phase 2 helper); worth-it throws
  on rated-without-provenance. Render-guard half remains Phase 7.
- **§1.6/§1.8 on new fixtures** — auto-covered by `tests/fixtures.test.ts`
  discovery (+8 tests appeared with the two new files).
- **Never a single optimal** — frontier + four views, no
  optimal/best/recommended key anywhere (walked at runtime); worth-it has no
  aggregate (type-level + runtime + no-numeric-leaf tests).

## 6. Acceptance evidence

All commands run 2026-08-04, Node v22, exit 0. `npm run verify` tail:

```
> eslint . && node scripts/lint-banned-claims.mjs && node scripts/lint-no-emoji.mjs
lint-banned-claims: OK (7 claims checked across 1 root(s))
lint-no-emoji: OK (1 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.workers-tests.json --noEmit
> vitest run
 Test Files  30 passed (30)
      Tests  412 passed (412)
```

412 = 291 inherited (Phase 0-3 baseline, none modified, all passing)
+ 113 new algorithm tests (independence 5, match 15, net-required 11,
basket 13, capsule 16, trend 16, worth-it 9, deal-integrity 14,
suppression 14) + 8 auto-discovered fixture-guard tests for the two new
fixture files.

Hand-computed expected values (each is asserted exactly by a named test):

**match** — R: glue-stick, 12 units, brand preferred fixture-brand,
constraint washable_required.
- A (brand hit, pack 6): applicable = brand(.30)x1 + pack_fit(.15)x(12/12=1)
  -> .45/.45 = **1.0**
- B (brand miss, pack 5): purchased = ceil(12/5)x5 = 15; pack v = 12/15 = .8
  -> (.30x0 + .15x.8)/.45 = .12/.45 = **0.2667**
- folder (brand+color+material+pack applicable, material miss):
  (.30+.20+0+.15)/.80 = .65/.80 = **0.8125**
- ruling miss (ruling+pack applicable): .15/.35 = **0.4286**

**net-required** — glue: 12+8 = 20 gross (non-shareable sum); inventory
4x1.0 + 3x0.5 + 2x0 = 5.5; reserve 2 -> net = 20-5.5-2 = **12.5** -> buy
**13**. Shareable sharpener: max(1,1)=1 - 0.5 = **0.5** -> buy 1. Crayons:
max(0, 2-3) = **0**.

**basket** (offers fixture; glue 12u, notebooks 20u; TX holiday active
2026-08-08 -> tax 0; delivery mart 2/depot 5/supply 3 as labeled fixture
assumptions; supply shipping UNKNOWN):
- glue packs ceil(12/6)=2; notebook packs 20.
- all-mart: 2x199 + 20x129 = 398+2580 = **2978**, [2978,1,2,1], objective
  2978+500x1+200x1 = **3678**
- mart glue + depot notebooks: 398+20x99+599 = **2977**, [2977,2,5,1]
- mart glue + supply notebooks: 398+20x119 = **2778** (costComplete false),
  [2778,2,3,2]
- all-supply: 2x249+2380 = **2878**, [2878,1,3,2]
- frontier = {2778, 2878, 2977, 2978}; the other 5 of 9 options dominated.
  views: lowestCost 2778, fewestStops 2878, fastest 2978 (2 days),
  highestConfidence 2977.
- tax outside window: 20x99 = 1980 -> round(1980x.0825) = round(163.35) =
  **163**. FL cap: 5100 > 5000 cap -> taxed round(420.75) = **421**; 4900 ->
  0. Deadline: depot 5d vs 4d -> risk **1** -> objective 2579+500+300+200 =
  **3579**. Match penalty: Δobjective = 1000x0.5 = **500**.

**capsule** — tops, wash 7 + reserve 2 = 9 days: temperate rewears 1..2 ->
{ceil(9/2)-3, ceil(9/1)-3} = **{2, 6}**; hot 1..1 -> **{6, 6}**; cold 2..3 ->
**{0, 2}**; uniform +1 reserve -> 10 days -> **{2, 7}**. Cost/wear:
180/6 units = 30 wears; 1200c/30 = **40c**.

**trend** — series [4,5,6,5,4,5,20]: median **5**, MAD 1 -> scaled
**1.4826**; clamp 5+3x1.4826 = **9.4478**; z = 4.4478/1.4826 = **3.0**
exactly; Δt=0 -> decayed 3.0 -> passes. 14d age: e^-1 = **0.3679** ->
decayed **1.1037** (< 2, fails). 30d: e^(-30/14) = **0.1173** (< 0.3 floor).
Cooling series [10,11,9,10,11,10,5]: clamp up to 5.5522 -> z **-3.0**.
Confidence: 1 family x min(1,7/5) x 1 = 1 unit -> 1/3 = **0.3333**; 3
families -> **1.0**.

**deal** — glue unit prices (cents): sorted [31.5, 31.5, 33.1667, 33.1667,
33.1667, 34.8333, 36.5, 41.5]; nearest-rank p25 = 2nd = **31.5**, p50 = 4th
= **33.1667**, p75 = 6th = **34.8333**, max **41.5**. Current 179/6 =
**29.8333** <= p25 -> below_typical. Reference 299/6 = 49.8333 > 41.5 ->
inflated. Saving vs median = 199-179 = **20c**; shipping 599 >= 20 -> trap.
2-pack at 89c: unit **44.5** > p50, pack != modal 6 -> pack_size_trap.

**suppression** — 25200s (7h) > 21600 -> downgrade; 691200s (8d) > 604800 ->
suppress; delta 200c > 100c tolerance -> suppress; delivery 5 > 4 days ->
suppress; recall FIXTURE-UPC-0007 -> offer FIXTURE-990001-matched removed
from every basket option (serialized result contains no recalled offerKey);
sole-offer-recalled -> basket infeasible.

## 7. Known gaps and risks

- **ER acceptance thresholds** (handoff 02 §4.4) are not yet coded: no
  scored ER edge data exists to calibrate against. Unresolved variants are
  already suppressed structurally (trigger 2), so the safe default holds.
  Phase 5 should route ER threshold work back here once real candidate
  scoring inputs exist.
- **Recall matching is UPC-exact only.** Name/model fuzzy matching needs an
  operator-review queue (decision 10); until then a non-UPC recall can only
  be attached via a hand-labeled `candidate` status (which suppresses).
- **Model constants are unvalidated placeholders by design**: basket
  lambdas, rewears table, trend thresholds, deal window. They are all
  exported, labeled `model_constant`, and surfaced as assumptions — tuning
  them changes no contract. They must never be presented as facts.
- **Tax math is estimate-grade**: rate is caller-supplied and
  fixture-labeled; fixture holiday calendars apply with `verified:false`,
  which costs a confidence point and attaches a caveat. Phase 5/7 must
  render that caveat; nothing here may be shown as verified tax guidance.
- **Basket search is exhaustive with a 50k cap** — fine for real household
  lists (3 retailers x <=10 items). Larger spaces throw
  `BasketSearchSpaceError`; chunking/heuristics are future work, deliberately
  not invented now.
- **`matchScore` on BasketOfferInput is caller-supplied** (from
  `rankCandidates`); the basket module trusts it. Phase 5 must wire the two
  (match gate feeds basket candidacy) rather than passing 1.0 as the tests'
  cost-focused scenarios do.
- Trend "independence" is family-level (distinct family ids). Cross-family
  correlation (e.g. two families both downstream of one platform) is a
  modeling question for when live signal sources exist — with licensing and
  compliance review first.

## 8. Instructions to next agent

**backend-api (Phase 5):**

- **P3-2 (phase-3-gate.md) is your ENTRY CONDITION, restated:** when you add
  the D1 persistence path for confirmed requirements you MUST extend the
  workerd zero-PII cycle test (`tests-workers/parsing-upload-r2.test.ts`)
  over every table you write, and you MUST NOT add any column fed from
  `originalText` or any ReviewPayload text — requirement rows are built from
  controlled-vocabulary draft fields only, through
  `sanitizeProhibitedSubstitutions`. Also align the workers PII seed set
  with the node suite (P3-3). The Phase 5 gate verifies this explicitly.
- Wire the pipeline in this order and no other: parsed items ->
  `partitionMergeInputs` (suppressed items go to the review UI, never to
  math) -> user confirmation -> `computeNetRequired` -> `rankCandidates` per
  line (gate + score) -> `filterRecalledOffers` -> `optimizeBasket`.
  Recall filtering is BEFORE optimization, always, on every basket endpoint.
- Serve the FULL Pareto result (frontier + all four views + assumptions +
  excludedOffers/unfulfillableItems). Do not collapse to one option
  server-side; do not re-rank using anything outside `weightedObjectiveCents`;
  never let an API layer add an economics input to any function in
  `src/algorithms/` (the independence test will fail your build if a
  monetization import appears — that is intended).
- Every API response containing algorithm output must pass through
  suppression: run the relevant evaluators (`evaluatePriceStockAge` with the
  offer provenance `retrievedAt` and an injected clock; `evaluateListStatus`
  from `supply_lists.verification_status`; etc.) and attach
  `SuppressionDecision` per fact. A suppressed fact is omitted; a downgraded
  fact ships WITH its findings so Phase 7 can badge it. Facts without
  provenance ids must not be serialized at all (§1.4).
- Worth-it responses must serialize the matrix as-is: five dimensions,
  categorical, no derived number, no reordering.
- Trend endpoints must return `label` + `confidence` + `familyEvaluations`
  together; never expose a label without its evidence. Do not add any code
  path that sets "viral" other than `classifyTrend` (the
  `evaluateTrendClaim` guard exists for defense, not as permission).
- MUST NOT: modify `src/algorithms/` semantics or thresholds without routing
  back through algorithm-engineer; import monetization anything into the
  algorithms closure; persist review-payload text (P3-2); call `Date.now()`
  inside algorithm flows (inject clocks); present model constants or fixture
  assumptions as facts (render them as labeled assumptions).
- Do not assume: that offers are variant-resolved (unresolved candidates are
  suppressed, trigger 2); that fixture tax holidays are verified (they are
  not — `verified:false` must survive to the render layer); that
  `matchScore` defaults exist (you must compute it via `rankCandidates`);
  that the basket search space is unbounded (catch
  `BasketSearchSpaceError` and split by list).
- `npm run verify` baseline is now **412 tests / 30 files** — extend, never
  weaken.
