# Editorial cluster plan — Phase 8 (seo-architect)

Scope: which editorial/guide surfaces this product may ever build, in what
order, and under what code-enforced conditions. No editorial page ships in
this phase; this plan exists so Phases 9+ build only surfaces that survive
the programmatic quality gate (`src/seo/quality-gate.ts`) and the product
definition (CLAUDE.md §0).

## 1. Strategy: tools first, articles last

AI Overviews and answer engines compress click-through on purely
informational queries: a generic article that answers "what supplies does a
third grader need" is summarized in place and never clicked. Assets that
CANNOT be compressed into an answer box are the priority:

1. **Interactive tools** (basket comparison, budget, capsule calculator,
   tax-holiday calendar) — an answer engine cannot run the user's own list
   through Pareto math.
2. **Saved state** (plan, checklist, inventory) — the return visit is the
   product; it needs no ranking at all.
3. **Alerts** (recall, price change, deadline, list correction) — the
   re-engagement loop no summary can replace.
4. **Guides** — only where we add data a summary cannot carry (below), and
   only through the quality gate.

Thin articles are not a growth channel here; they are a credibility cost.
Anything whose entire value survives being summarized in two sentences does
not get built.

## 2. Hard preconditions for ANY editorial page (enforced in code)

- **Quality gate** (`evaluateQualityGate`, thresholds in
  `src/seo/config.ts`): at least one verified source (fixture data never
  qualifies), minimum populated data fields, evidence inside the freshness
  window, similarity below the near-duplicate ceiling. A page that fails
  does not generate — the gate is code, not editorial judgment.
- **§0 NOT #1**: no page republishes, mirrors, caches, or reconstructs a
  school's supply list, a district PDF, or a list-hosting service's
  content. Guides speak in requirement CATEGORIES from our own lexicon,
  never in "here is school X's list."
- **Not a listicle** (§0 NOT #2): no "N best products" page, ever. Guides
  explain math, constraints, and evidence frameworks; product mentions ride
  on the evidence layer with provenance or do not appear.
- **Section composer**: every editorial template renders through
  `PageSection[]` so the §1.2 slot rule stays enforceable at render time.
  Ad slots only on `editorial_article` / `editorial_guide_footer` surfaces
  per `AD_SLOT_REGISTRY`, always after all protected content.
- **Route metadata**: every new route gets an explicit entry in
  `src/seo/route-metadata.ts` or it resolves noindex by default.
- **Copy discipline**: all copy in `src/ui/copy/` (linted roots — banned
  claims, no emoji); no invented numerals; brand strings only from config.

## 3. Clusters with genuine information gain

Ordered by (information gain x feasibility). "Gain" names the data WE hold
that a generic article cannot.

### 3.1 Grade-band supply math (K-2, 3-5, 6-8) — 3 pages
- Gain: quantity math from our normalized requirement schema — pack-size
  conversion (list counts vs. retailer counts), per-subject replacement
  cadence across a school year, which requirement types are most often
  marked optional. All derived from our own lexicon + confirmed-list
  aggregates, presented as math, not as a shopping list.
- Data dependency: aggregate, anonymized confirmed-list statistics (live
  data; post-beta). Until then: fails the gate, does not generate.
- Deliberately NOT: a per-grade "what to buy" list (that is compressible
  and drifts toward §0 NOT #1).

### 3.2 Category evidence guides (backpack, water bottle, headphones, art supplies) — up to 4 pages
- Gain: CPSC recall history per category (government feed we already
  ingest), plus the evidence-graded worth-it framework applied to the
  category (what signal families exist, what "insufficient evidence" means
  for it). No ratings, no rankings, no offers — we do not hold them.
- Data dependency: live CPSC ingestion (exists behind the flag) + enough
  trend/evidence history to say something dated and sourced.

### 3.3 Uniform / dress-code capsule guides — 2 pages
- Gain: the capsule engine's real math (rewear ranges, wash cadence,
  reserve days) applied to the two dress-code postures the engine models
  (uniform-required, color-restricted). Uses the engine's controlled
  vocabulary (tops / bottoms / outer_layer / socks).
- Constraint: NEVER names a specific school's policy — unconfirmable school
  policy is a §1.5 suppression reason, and policy content would drift into
  list-repository territory. Guides stay generic; the tool handles the
  user's actual constraints.

### 3.4 Climate-band capsule guides (hot / temperate / cold) — 3 pages
- Gain: the same engine math keyed to the engine's climate bands: how the
  band changes layer counts and category mix, with worked examples straight
  from `computeCapsule` outputs (labeled as computed examples, not facts
  about any household).
- Data dependency: none beyond the engine — this is the FIRST cluster that
  can clear the gate once an operator-curated (verified) walkthrough source
  record exists for it.

### 3.5 State sales-tax-holiday pages — up to 51 pages, gated hardest
- Gain: eligibility rules applied to supply categories (which items on a
  typical requirement schema qualify, caps, dates) from verified state
  revenue-department sources with per-fact provenance.
- Data dependency: the verified tax-holiday calendar endpoint (recorded
  Phase 5 follow-up) and per-state source records. Programmatic: each page
  is a `ProgrammaticCandidate` through the gate; a state without a verified
  current-year source does not generate. Pages auto-expire with their
  window (freshness check) rather than showing last year's dates.

### 3.6 Annual data report — 1 page/year, post-beta only
- Gain: our own observed aggregates (price dispersion across retailers,
  pack-size mismatch rates, recall-match rates) — data literally nobody
  else holds. Requires live data + a season of history; fixture data must
  never appear in it (the gate enforces this via verified-source types).

### Rejected topics (do not build)
"Best of" listicles; celebrity/viral fashion articles (trend is a filter,
never the promise); school- or district-specific list pages (§0 NOT #1);
back-to-college/dorm anything (§0 NOT #4); generic advice indistinguishable
from the top answer-box result.

## 4. Trend pages

Trend surfaces carry their evidence timestamps (the §1.4 provenance lines
already rendered on every trend card) and auto-expire:
`TREND_PAGE_EXPIRY_DAYS` is derived from the trend engine's own decay
constants (`tauDays`, `freshnessFloor`) — past that age the engine itself
would refuse the evidence, so the page flips to noindex and routes into
editorial review (`src/seo/trend-expiry.ts`). An expired trend page is
never silently left in the index and never silently deleted.

## 5. No near-duplicate templates — the similarity rule

Two pages are near-duplicates when the Jaccard similarity of their word
3-gram shingle sets is at or above `maxTemplateSimilarity` (config:
`src/seo/config.ts`). The rule is enforced twice:

1. At generation: `evaluateQualityGate` rejects any candidate at or above
   the ceiling against every existing page (`duplication` failure).
2. At ship time: `tests/seo-quality-gate.test.ts` computes pairwise
   similarity across the shipped static templates' `<main>` text and fails
   the build if any pair reaches the ceiling.

Practical consequence: the state tax-holiday cluster (3.5) cannot ship as
one boilerplate with a swapped state name — each page must carry enough
state-specific verified data (differing caps, dates, category rules) to
clear the shingle check, or it does not generate.

## 6. Review workflow for expired/failed pages

- Gate failure at generation: page never exists; failure reasons are
  returned by the gate for logging.
- Expiry after publication (trend/seasonal): robots flips to noindex, the
  `review: true` flag routes the page into editorial review; the page is
  refreshed with new evidence (re-clearing the gate) or retired with a 410.
  Nothing stale is left indexable, and nothing is deleted without review.
