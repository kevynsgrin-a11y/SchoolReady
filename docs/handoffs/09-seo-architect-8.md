# HANDOFF 09 — seo-architect — Phase 8

## 1. Inputs consumed

- `CLAUDE.md` §0 (product definition, NOT-list, launch posture, brand
  isolation), §1 (invariants 4, 5, 6, 8 touch this phase), §2 stack,
  process rules ("never invent a number", fixture-mode default).
- `docs/handoffs/08-frontend-engineer-7.md` §8 (binding: head changes via
  `renderDocument` in `src/ui/components/chrome.ts` as the one composition
  point; static-first surfaces; copy in linted roots; section composer
  discipline), §4 (screen/route inventory), §2 (server architecture).
- `src/ui/server.ts` (router + `htmlResponse` render path),
  `src/ui/static-site.ts` + `scripts/build-static.mjs` (static build),
  `src/ui/slots.ts` (editorial-only ad surfaces).
- `src/contracts/provenance.ts` (§1.4 record: sourceType, observedAt,
  freshness, correctionStatus — the gate's raw material),
  `src/api/contracts.ts` (SourceStatus freshness signals, SESSION_COOKIE),
  `src/algorithms/trend.ts` (`DEFAULT_TREND_CONFIG` decay constants — the
  expiry window derives from these), `config/brand.ts` (origin/name at
  call time only).
- `docs/handoffs/TEMPLATE.md`; Phase 2 handoff §freshness (staleness
  semantics mirrored by SourceStatus).

## 2. Decisions made

1. **Default deny.** Any path without a route-metadata entry, any non-GET
   render, and any programmatic route without supplied gate evidence
   resolves `noindex`. `renderDocument` itself defaults to noindex when no
   resolved head is passed. Alternative (index-by-default with a noindex
   list) rejected: one forgotten route would leak personalized content
   into the index.
2. **`index_anonymous_only` as a first-class policy.** `/plan/basket`,
   `/budget`, `/deals` are tool pages to a cookieless crawler and
   personalized results to a session. The SAME path resolves per request:
   session cookie present -> noindex. This satisfies both "index the tool
   pages" and "noindex personalized results" without separate routes.
3. **Fixture is not a verified source type.** The quality gate's verified
   list excludes `fixture`, so in the fixture-mode beta NO programmatic
   page can become indexable — by construction, not by flag. Alternative
   (fixtureMode parameter that waives the check) rejected: synthetic data
   in the index is exactly the failure the gate exists to prevent.
4. **Trend expiry is derived, not invented:** `TREND_PAGE_EXPIRY_DAYS =
   ceil(tauDays * ln(1/freshnessFloor))` from the trend engine's own decay
   config — the age past which the engine itself would refuse the
   evidence. Expired pages resolve noindex + `review: true`.
5. **Sitemap emits `<loc>` only** — no lastmod/changefreq/priority (we
   will not stamp modification times we did not observe). robots.txt
   disallows ONLY `/api/`; noindexed HTML routes stay crawlable on purpose
   so their noindex directive is visible (a Disallow would hide it and
   leave bare URLs indexable).
6. **Canonical + JSON-LD are index-only signals**; noindex renders carry
   neither. Canonicals strip query state to the route pattern.
7. **Structured data: WebSite (homepage) + BreadcrumbList (tool pages)
   only.** No FAQPage (no real Q&A content exists), no
   Product/Offer/Review/Rating ever: `assertNoInventedMarkup` throws on
   forbidden keys/types and every emitter serializes through it.
8. **`/safety` is noindex** with rationale `source_republication_no_gain`:
   in the beta it lists CPSC feed content with no information gain over
   the source (§0 non-repository posture). Revisit when list-matching
   ships as a distinct verified surface. `/trends` is noindex: it is built
   from the session's own checklist (personalized) and trend evidence
   expires.
9. **Integration kept to one surface**: `src/ui/server.ts` imports exactly
   one SEO module (`src/seo/integration.ts`); every in-file touch is
   marked `[SEO — Phase 8]` (resolved-head stash on the per-request
   session, X-Robots-Tag + head pass-through in `htmlResponse`, crawl-asset
   early return). All policy lives in `src/seo/`.

## 3. Artifacts produced

Created — `src/seo/`:
- `config.ts` (ALL thresholds + `canonicalOrigin()` from config/brand.ts),
- `route-metadata.ts` (map of every server-rendered HTML route with
  policy + rationale-as-data; `resolveRobots`, `matchRoute`,
  `resolveProgrammaticPolicy`, `indexablePaths`, `nonIndexablePaths`),
- `quality-gate.ts` (`evaluateQualityGate` + shingle similarity),
- `trend-expiry.ts` (`trendPageStatus`, `evidenceTimestamps`),
- `structured-data.ts` (WebSite/Breadcrumb builders + invented-markup
  guard + safe serializer),
- `sitemap.ts` (`generateSitemapXml`, `generateRobotsTxt`,
  `sitemapUrls`, `ProgrammaticCandidate` gate path),
- `integration.ts` (`resolveSeoForRequest/Path`, `seoAssetResponse`).

Created — docs/tests:
- `docs/seo/editorial-cluster-plan.md`,
- `tests/seo-route-metadata.test.ts` (14), `tests/seo-quality-gate.test.ts`
  (11), `tests/seo-trend-expiry.test.ts` (9), `tests/seo-sitemap.test.ts`
  (10), `tests/seo-structured-data.test.ts` (7),
  `tests-workers/seo-pages.test.ts` (11).

Modified (each sanctioned):
- `src/ui/components/chrome.ts` — `SeoHead` option on `RenderOptions`;
  head emits robots meta (default noindex), canonical, JSON-LD (the one
  composition point per handoff 08 §8).
- `src/ui/server.ts` — marked `[SEO — Phase 8]` hooks only (see §2.9).
- `src/ui/static-site.ts` — static pages carry the same resolved heads;
  exports `staticSitemap`/`staticRobots`.
- `scripts/build-static.mjs` — writes `sitemap.xml` + `robots.txt` to dist.

Untouched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
prior handoffs, migrations, `src/{api,algorithms,parsing,ingestion,contracts}`,
**`src/ui/screens/plan.ts`** (concurrent fix in flight — not touched),
all Phase 0-7 tests, `.github/`, `lighthouserc.json`, `wrangler.jsonc`.

## 4. Contracts exported

```ts
// src/seo/route-metadata.ts
type RoutePolicy = "index" | "index_anonymous_only" | "noindex" | "programmatic";
interface RouteSeoEntry { pattern; policy; rationale: {code, detail};
                          breadcrumbLabel; jsonLd: ("website"|"breadcrumb")[] }
ROUTE_SEO: RouteSeoEntry[]           // 15 entries = every server HTML route
resolveRobots(path, { method, hasSession, programmatic? })
  -> { robots: "index,follow"|"noindex", entry, review }
resolveProgrammaticPolicy({ gate: QualityGateResult, trend: TrendPageStatus|null })
  -> { robots, review }              // expired trend => noindex + review:true

// src/seo/quality-gate.ts — thresholds in src/seo/config.ts SEO_QUALITY_GATE
evaluateQualityGate(candidate: ProgrammaticPageEvidence,
                    existingPages: {route,bodyText}[], nowMs, config?)
  -> { pass:true } | { pass:false, failures: {check:"verified_source"|
       "min_fields"|"freshness"|"duplication", detail}[] }
contentSimilarity(a, b) -> number    // word 3-gram Jaccard, ceiling 0.6

// src/seo/trend-expiry.ts
trendPageStatus(provenance, nowMs) -> { newestEvidenceAt, expiresAt, expired, review }
TREND_PAGE_EXPIRY_DAYS               // derived from DEFAULT_TREND_CONFIG

// src/seo/integration.ts (the ONLY module server.ts imports)
resolveSeoForRequest(request) -> { robots, canonicalUrl, jsonLd: string[] }
seoAssetResponse(url) -> Response | null   // /sitemap.xml, /robots.txt

// src/ui/components/chrome.ts
interface SeoHead { robots; canonicalUrl; jsonLd }   // RenderOptions.seo?;
                                                     // absent => noindex
```

Indexable set (also the sitemap): `/`, `/intake`, `/methodology`,
`/capsule`, and (anonymous renders only) `/plan/basket`, `/budget`,
`/deals`. Everything else — `/plan`, `/plan/checklist`, `/household`,
`/trends`, `/safety`, `/account`, `/admin/status`, `/item/:slug`, all
POST renders, all unknown paths — is noindex.

## 5. Invariants touched

- **§0 NOT #1** — no indexable route carries list content: the only
  list-bearing surfaces are session-scoped and noindex under every
  context (`tests/seo-route-metadata.test.ts` "noindex in EVERY context";
  workers suite proves it on real renders). Rationale encoded on each
  entry.
- **§1.4/§1.5 adjacency** — the gate consumes provenance records
  (verified type, observedAt, freshness, correctionStatus); retracted or
  expired sources cannot back an indexable page; suppression-over-guessing
  extends to the index (default deny, expiry into review).
- **"Never invent a number"** — sitemap has no lastmod/changefreq/priority
  (tested); trend expiry derives from engine constants (tested); JSON-LD
  cannot carry rating/review/offer numerals (`assertNoInventedMarkup`,
  tested in node + swept across all rendered pages in workers).
- **§1.6** — meta descriptions/titles reuse the screens' existing linted
  copy; `src/seo` sits under the lint roots; `npm run lint` green.
- **§0 brand isolation** — origin/name always from `config/brand.ts`;
  repo-wide literal scan (tests/config.test.ts) stays green including the
  new docs.
- **§1.2** — untouched: no new section kinds, no slots mounted, no change
  to `slots.ts`; existing slot tests unweakened.

## 6. Acceptance evidence

Commands run 2026-08-04, all exit 0:

```
npm run verify
  lint-banned-claims: OK (7 claims checked across 2 root(s))
  lint-no-emoji: OK (2 root(s) scanned)
  tsc x3: clean
  Test Files  49 passed (49)
       Tests  685 passed (685)
npm run build   ->  build-static: wrote 3 page(s) + assets to dist/
                    (dist/ now includes sitemap.xml + robots.txt;
                     robots meta "index,follow" on all 3 static pages)
```

685 = 621 Phase 7 baseline + 62 new SEO tests (node 51: route-metadata 14,
quality-gate 11, trend-expiry 9, sitemap 10, structured-data 7; workers
11) + 2 from the concurrent plan.ts ledger fix (not this phase's work; its
files untouched here).

Acceptance criteria mapped to tests:
- **Thin page rejected by the gate**: `tests/seo-quality-gate.test.ts`
  "rejects the thin page with every failed check named" (plus per-check
  rejections: unverified, stale, retracted, duplicate).
- **Sitemap excludes 100% of noindex routes**: `tests/seo-sitemap.test.ts`
  "excludes 100% of noindex/programmatic-mapped routes" + "every <loc>
  resolves to index,follow"; served-surface proof in
  `tests-workers/seo-pages.test.ts` "sitemap.xml is served and excludes
  100% of noindex routes".
- **No near-duplicate templates**: pairwise `<main>`-text similarity of
  every shipped static template asserted below the 0.6 ceiling
  (`tests/seo-quality-gate.test.ts`); rule documented in
  `docs/seo/editorial-cluster-plan.md` §5.
- **No invented structured data**: guard throws on every forbidden
  key/@type (node); every rendered page swept for
  aggregateRating/Review/Offer/Product markers (workers).
- Trend expiry: boundary + past-expiry -> noindex + review
  (`tests/seo-trend-expiry.test.ts`).

## 7. Known gaps and risks

- **No editorial page ships in this phase.** The gate, the map, and the
  cluster plan exist; every cluster is blocked on verified (non-fixture)
  data by design. First buildable cluster post-beta: climate-band capsule
  guides (needs only an operator-curated verified source record).
- **Route coverage test pins the server's route list manually** (the
  router is a switch statement, not data). A new server route without a
  map entry renders noindex (safe) but the coverage test must be updated
  with it — drift shows up as a failing equality, only once someone
  updates either side. Making the router table-driven would close this
  fully; deliberately not done to keep this phase out of routing logic.
- **`/item/:slug` and `/trends` pass no live gate evidence at render
  time** — they resolve noindex via default deny, which is correct for
  the beta. When live trend data lands, the item loader should compute
  `trendPageStatus` + gate evidence and pass `programmatic` context so
  passing pages can index; the resolver already supports it (tested).
- **Canonical origin is the placeholder domain** from config
  (`.example`); release-qa already blocks launch while it remains so.
  Sitemap/canonicals will be correct the moment config changes — nothing
  else references the domain.
- **No og:/twitter: social meta and no hreflang** — single locale, no
  brand-coupled social imagery while the name is disposable (same
  reasoning as the deferred manifest icons). Additive later.
- **The static dist/ sitemap equals the worker's** only while there are
  zero programmatic pages; once programmatic candidates exist, the worker
  route is authoritative and build-static should pass the same candidate
  set (one-line change flagged in `static-site.ts`).
- **X-Robots-Tag rides only on HTML responses** composed by
  `htmlResponse`; generated non-HTML assets (css/manifest/sitemap/robots)
  intentionally carry none.

## 8. Instructions to next agent

**monetization-engineer (Phase 9):**
- **Ad surfaces = editorial/guide surfaces ONLY, and none exist yet.**
  The only registered surfaces remain `editorial_article` and
  `editorial_guide_footer` (`src/ui/slots.ts` — untouched this phase);
  Phase 8 shipped ZERO editorial pages, so there is currently NOWHERE an
  ad slot may mount. Every currently indexable route (`/`, `/intake`,
  `/methodology`, `/capsule`, `/plan/basket`, `/budget`, `/deals`) is a
  TOOL surface, not editorial — indexable does NOT mean monetizable. Do
  not add slot surfaces to them.
- When editorial templates do land (per `docs/seo/editorial-cluster-plan.md`):
  they must (a) pass `evaluateQualityGate` before generating, (b) render
  through the `PageSection` composer with `ad_slot` only after ALL
  protected content, (c) get an explicit `ROUTE_SEO` entry (else they ship
  noindex), and (d) enter the sitemap only as `ProgrammaticCandidate`s
  through the gate. Update the coverage list in
  `tests/seo-route-metadata.test.ts` alongside the map.
- Your §1.2 route-tree scan can additionally assert: no page whose head
  contains `content="index,follow"` renders an `ad-slot` marker (true
  today because zero slots are mounted; keeps tool surfaces clean
  structurally).
- MUST NOT: emit structured data through any path other than
  `serializeJsonLd` (the invented-markup guard is the point); add
  Offer/Product/Review markup for sponsored units — the workers sweep in
  `tests-workers/seo-pages.test.ts` will fail the build; weaken default
  deny in `resolveRobots`; write meta/title copy outside the linted
  roots; hardcode the brand or domain (compose from config at render).
- MUST NOT ASSUME: that a route is noindex because it "looks" personal —
  the map is the truth; that the sitemap updates itself for new routes
  (it emits only `indexablePaths()` + gated candidates).
- Baseline for `npm run verify` is now **685 tests / 49 files** (includes
  the concurrent plan.ts fix). Extend, never weaken.
