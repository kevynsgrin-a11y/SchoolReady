# HANDOFF 10 — monetization-engineer — Phase 9

## 1. Inputs consumed

- `CLAUDE.md` §1.1 (commission never ranks), §1.2 (nothing commercial before
  protected content), §1.6 (banned claims), §0 launch posture and brand
  isolation; §5-of-brief dark-pattern prohibition.
- `docs/handoffs/08-frontend-engineer-7.md` §8 (binding: code against
  `src/ui/slots.ts` — `AD_SLOT_REGISTRY`, `CRITICAL_SECTION_KINDS`,
  `assertSlotPlacement`/`assertSafetyFirst`, the `class="ad-slot"` marker;
  entitlements gate `adFreeExtras` ONLY; MUST NOT mount a slot on any
  current screen or bypass `renderDocument`/`renderSections`).
- `docs/handoffs/09-seo-architect-8.md` §8 (editorial-surfaces-only; every
  currently indexable route is a TOOL surface, not monetizable; no
  Offer/Product markup ever; route-metadata co-update rule).
- `docs/handoffs/gates/phase-7-gate.md` P7-3 (constants-only algorithm
  imports are the actual UI contract) and `phase-8-gate.md` P8-3 (route
  lists are manually pinned — co-update on new routes; none added).
- `src/ui/slots.ts`, `src/ui/components/chrome.ts`, `src/ui/screens/*`,
  `src/api/contracts.ts` (EntitlementsData, CORE_ACCESS_NOTICE,
  SeasonPassWebhookBody), `src/api/stripe.ts` (fixture verifier + throwing
  live stub), `src/api/routes.ts` (entitlements/webhook handlers),
  `src/contracts/offer.ts` (neutral `deepLinkUrl`),
  `fixtures/product-feeds/offers.fixture.json` (retailer slugs),
  `tests/algorithms-independence.test.ts` (sanctioned extension point),
  `docs/seo/editorial-cluster-plan.md`, `docs/handoffs/TEMPLATE.md`.

## 2. Decisions made

1. **Monetization is a leaf package.** `src/monetization/` imports only
   `src/ui/{html,slots,copy}` (and transitively icons); it deliberately does
   NOT import `src/api/contracts.ts` — that module pulls `src/algorithms/*`
   type files into any importer's closure and would muddy the §1.1 boundary
   proof. Entitlement/season-pass inputs are STRUCTURAL type slices
   (`AdFreeGates`, `EntitlementsLike`) that the real Phase 5 shapes satisfy.
   Alternative (import the contracts) rejected: the reverse-closure test
   would need carve-outs, and carve-outs rot.
2. **Disclosure is atomic, not adjacent-by-convention.**
   `renderMonetizedLink` is the ONLY renderer that can produce the
   `affiliate-link` marker, and it emits anchor + disclosure as one unit
   (`monetized-link` wrapper, `rel="sponsored noopener"`). 100% coverage is
   therefore structural; `checkDisclosureCoverage` re-proves it from
   rendered bytes (counts, interleaving, same-section adjacency — footnote
   placement fails). Alternative (separate disclosure component callers must
   remember) rejected: that is how footnote-only disclosure happens.
3. **Fixture-only affiliate networks.** Two synthetic networks with
   `fixture-tag-*` publisher tags map the three fixture retailers;
   `decorateOutboundLink` returns `none` for null URLs (never fabricates),
   `plain` for unmapped retailers/unparseable/non-http URLs (never guesses),
   `monetized` otherwise. No real affiliate ID exists anywhere in the repo.
4. **§1.2 scan = independent outside checker over rendered bytes.**
   `scanRenderedPage` does NOT reuse the composer's assertions; it re-parses
   section markers and enforces five rules: (A) no commercial section
   (`ad_slot`, `disclosure`) opens before the last protected section —
   strictly stronger than `assertSlotPlacement`; (B) no commercial unit
   marker (`class="ad-slot"`, `class="affiliate-link"`, `data-upsell=`)
   inside a protected section or above the last one in the byte stream;
   (C) no interstitial/dialog markup on any page carrying protected
   content; (D) disclosure coverage; (E) dark-pattern markers
   (countdowns, fabricated scarcity, urgency, pre-checked consent,
   confirm-shaming — `src/monetization/dark-patterns.ts`). Node half runs
   it over hand-built recalled/stale/corrected/entitled screen states plus
   seeded violations for every rule; workers half runs it over EVERY server
   route on real D1/KV/R2 across anonymous/session/recalled/entitled/stale
   states.
5. **Ad mounts are structurally impossible in the beta.** `MOUNTED_SLOTS`
   is empty; `assertMountAllowed` requires an editorial surface from the
   registry AND a route under the reserved `EDITORIAL_ROUTE_PREFIX`
   (`/guides/` — no such route exists), so no mount can name a servable
   surface today. `slotsForSurface` is the only spec source for renderers
   and returns `[]` for any non-editorial surface and for any session with
   `adFreeExtras` (Season Pass suppresses even editorial slots). Rules are
   proven against a synthetic editorial article in test, including the
   composer throwing when protected content follows a slot.
6. **Season Pass checkout is honest-by-construction.** The account screen
   gains a commercial (`disclosure`-kind, always-last) Season Pass block:
   active passes render their expiry through the §1.4 render guard; without
   a pass, the entry point (`data-upsell="season-pass"`) explains plainly
   that checkout is OFF in this beta — no payment can be taken.
   `beginSeasonPassCheckout()` throws in every mode, mirroring
   `src/api/stripe.ts`'s live-stub posture, so a payment path cannot be
   wired accidentally. Purchases flow ONLY through the Phase 5
   fixture-verified webhook (exercised end to end in the workers suite).
   Alternative (UI-triggered fixture "purchase" button) rejected: it would
   grant entitlements without the webhook contract and normalize a fake
   checkout UI.
7. **No new routes, no new section kinds, no slots.ts edits** — so the P8-3
   co-update rule is discharged trivially and every Phase 7/8 test stands
   unmodified except the sanctioned independence-test extension.

## 3. Artifacts produced

Created — `src/monetization/`:
- `networks.ts` (fixture network registry + retailer map), `links.ts`
  (`decorateOutboundLink`), `disclosure.ts` (`renderMonetizedLink`,
  `checkDisclosureCoverage`, marker constants), `ad-rules.ts`
  (`slotsForSurface`, `editorialAdSections`, `assertMountAllowed`,
  `MOUNTED_SLOTS = []`, `EDITORIAL_ROUTE_PREFIX`, `AdPlacementError`),
  `season-pass.ts` (`seasonPassSurface`, throwing
  `beginSeasonPassCheckout`), `dark-patterns.ts` (`DARK_PATTERN_MARKERS`,
  `findDarkPatterns`), `route-scan.ts` (`scanRenderedPage`,
  `COMMERCIAL_UNIT_MARKERS`, `INTERSTITIAL_MARKERS`), `index.ts`.

Created — tests: `tests/monetization.test.ts` (27),
`tests/monetization-route-scan.test.ts` (31),
`tests-workers/monetization-routes.test.ts` (9).

Modified (each sanctioned):
- `src/ui/copy/en.ts` — new `MONETIZATION` block, explicitly marked
  PROVISIONAL for Phase 10 review (disclosure line, paid-link suffix, pass
  explainer, checkout-off notice, active/ad-free strings).
- `src/ui/screens/account.ts` — Season Pass block rewritten as the last
  (commercial) section with the checkout entry point; `renderAccount` gains
  a `{ fixtureMode }` option.
- `src/ui/server.ts` — passes `deps.flags.fixtureMode` to `renderAccount`
  at both call sites (marked `[Monetization — Phase 9]`).
- `tests/algorithms-independence.test.ts` — EXTENDED (sanctioned): closure
  helper generalized; new reverse-boundary describe (4 tests). No existing
  assertion weakened.

Untouched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
prior handoffs, migrations, `src/algorithms/` (READ-ONLY — zero reads
needed), `src/api/`, `src/seo/`, `src/parsing/`, `src/ingestion/`,
`src/contracts/`, `src/ui/slots.ts`, all Phase 0-8 tests except the
sanctioned extension above, `.github/`, `wrangler.jsonc`, `public/`.

## 4. Contracts exported

```ts
// src/monetization/links.ts
decorateOutboundLink({ deepLinkUrl: string|null, retailerSlug: string })
  -> { kind:"monetized", url, networkId, retailerSlug, fixture:true }
   | { kind:"plain", url, retailerSlug }        // unmapped/unparseable: untouched
   | { kind:"none", retailerSlug }              // null input: no link, ever

// src/monetization/disclosure.ts
renderMonetizedLink(link: MonetizedLink, label: string) -> Html
  // <span class="monetized-link"><a class="affiliate-link" data-network=…
  //   rel="sponsored noopener" href=…>label (paid link)</a>
  //   <span class="affiliate-disclosure">…</span></span>
checkDisclosureCoverage(page) -> { links, disclosures, violations[] }

// src/monetization/ad-rules.ts
slotsForSurface(surface, gates: {adFreeExtras}|null) -> AdSlotSpec[]  // [] unless editorial AND not ad-free
editorialAdSections(surface, gates) -> PageSection[]   // kind:"ad_slot", renderAdSlot bodies
assertMountAllowed({slotId, surface, route}) -> AdSlotSpec | throws AdPlacementError
MOUNTED_SLOTS: SlotMount[] = []; EDITORIAL_ROUTE_PREFIX = "/guides/"

// src/monetization/season-pass.ts
seasonPassSurface(entitlements, fixtureMode)
  -> { kind:"active", validUntil, provenanceIds, adFree }
   | { kind:"checkout_unavailable", mode:"fixture"|"live" }
beginSeasonPassCheckout(): never   // SeasonPassCheckoutDisabledError, both modes

// src/monetization/route-scan.ts
scanRenderedPage(page: string) -> ScanFinding[]   // [] = §1.2-compliant
  // rules: commercial_section_order | commercial_unit_position |
  //        interstitial | disclosure_coverage | dark_pattern
```

Markers other agents may rely on: `class="affiliate-link"`,
`class="affiliate-disclosure"`, `class="monetized-link"`,
`data-upsell="season-pass"`, plus the Phase 7 `class="ad-slot"` /
`section-<kind>` markers (unchanged).

## 5. Invariants touched

- **§1.1 — both directions now structurally proven.**
  `tests/algorithms-independence.test.ts`: algorithms closure still clean
  (unchanged tests), PLUS the full `src/api/*` closure (incl. `plan.ts`)
  reaches no `src/monetization/` module, PLUS the monetization closure
  reaches no `src/algorithms/` or `src/api/` module, stays inside `src/`,
  and uses zero bare imports. Link decoration cannot feed ranking because
  ranking cannot see it and it cannot see ranking.
- **§1.2 — NOW FULLY ENFORCED (scan half delivered).** Render-time
  composer throw (Phase 7, unchanged) + the outside scan over rendered
  routes: `tests/monetization-route-scan.test.ts` (every rule seeded with a
  failing counterexample; real screens across recalled/stale/corrected/
  entitled states; synthetic editorial surface) and
  `tests-workers/monetization-routes.test.ts` (every server route over real
  bindings across anonymous/session/recalled/entitled/stale states — zero
  findings, zero mounted slots). Paywall half: protected surfaces
  (`/plan`, `/plan/checklist`, `/plan/basket`, `/safety`, `/budget`,
  `/deals`) proven BYTE-IDENTICAL before/after a real fixture-webhook
  Season Pass purchase. The CLAUDE.md invariant-2 row can flip to ENFORCED
  at gate time (orchestrator owns the table).
- **§1.4** — the pass expiry date renders only through `renderFact` with
  the entitlement row's provenance.
- **§1.6/§1.8** — all new copy in `src/ui/copy/en.ts` under both lint
  roots; lints green; no emoji, no banned claim, no urgency/scarcity copy
  (dark-pattern sweep additionally enforces §5 phrasing in rendered pages).
- **§0 brand isolation** — no brand literal anywhere in the new files;
  repo-wide scan green.
- **§1.7** — nothing new is logged or stored; the webhook body remains the
  Phase 5 shape (opaque refs, no amounts, no card data).

## 6. Acceptance evidence

Commands run 2026-08-04, all exit 0:

```
npm run verify
  eslint .                          clean
  lint-banned-claims: OK (7 claims checked across 2 root(s))
  lint-no-emoji: OK (2 root(s) scanned)
  tsc x3                            clean
  Test Files  52 passed (52)
       Tests  761 passed (761)
npm run build                       3 pages + assets to dist/
npx wrangler deploy --dry-run       Total Upload: 383.14 KiB / gzip: 94.95 KiB
```

761 = 690 Phase 8+micro-fix baseline (none weakened) + 71 new: monetization
units 27, node route-scan 31, workers route sweep 9, independence
reverse-boundary 4. Acceptance criteria mapped:

- **Route-tree scan across all routes/states**: workers suite renders 30+
  captured documents (every GET route anonymous + with session, POST
  paste/manual review renders, POST capsule dress-code result, recalled
  `/safety?upc=FIXTURE-UPC-0007`, entitled re-renders, stale-clock renders,
  404) — `scanRenderedPage` returns `[]` for every one; node suite covers
  recalled/stale/correction data states the fixture API cannot produce.
- **Disclosure coverage 100%**: structural (atomic renderer) + checker
  proves the seeded failures (bare link, footnote-only, one-disclosure-
  two-links) and passes every rendered route and the synthetic editorial
  page; stripping a disclosure from a rendered page flips it to failing.
- **Import boundary**: both directions green (see §5); `npm run verify`
  green end to end.
- **No paywall on §1.2 content**: byte-equality test above; account page
  additionally renders `CORE_ACCESS_NOTICE` verbatim in both states.
- **No dark patterns**: rule-E sweep over every captured page; each marker
  proven catchable by its seed; honest copy trips nothing.

## 7. Known gaps and risks

- **Zero live monetization exists.** No real affiliate network, tag, or
  payment path ships: networks are labeled fixtures, checkout throws, live
  Stripe remains the Phase 5 throwing stub. This is deliberate — turning
  any of it on requires Phase 10 compliance sign-off plus credentials.
- **No monetized link renders on any shipped route.** The link service and
  disclosure component are proven in tests and on a synthetic editorial
  surface only. First real mount candidate: basket/item retailer links —
  which additionally require compliance-officer's reviewed disclosure copy
  and a §1.5 check that decorated links never replace the neutral URL in
  provenance-bearing data (decoration happens at render, never at rest).
- **`MONETIZATION` copy is provisional** (marked in-file): FTC wording is
  Phase 10's to finalize; the affiliate disclosure line, paid-link suffix,
  and pass explainer must be reviewed before any live link.
- **`EDITORIAL_ROUTE_PREFIX = "/guides/"` is a reservation, not a route.**
  If seo-architect names editorial routes differently, change the one
  constant in `ad-rules.ts`; the mount rule follows it.
- **Route lists remain manually pinned** (P8-3 carried): the workers suite
  mirrors the server switch; a new route must be added there and in the SEO
  coverage test. A new route missed by both still fails safe (noindex, no
  slot surface) but escapes the sweep until added.
- **Scanner parses markers, not a DOM.** It keys on the composer's
  `section-<kind>` classes and unit marker classes. Markup produced outside
  `renderDocument`/`renderSections` with different class names would evade
  it — acceptable because the composer is the only shipping render path
  (Phase 7 contract) and the composer itself throws on ordering violations.
- **`/account` fixture copy says checkout is off** — when payments launch,
  the entry point, the `season-pass.ts` state machine, and the workers
  assertions ("Checkout is switched off…") change together (grep
  `data-upsell="season-pass"`).

## 8. Instructions to next agent

**compliance-officer (Phase 10):**

- **Complete monetized-surface inventory (today):**
  1. Ad slots: registry of two fixed-size editorial-only slots
     (`src/ui/slots.ts`), ZERO mounted anywhere (`MOUNTED_SLOTS = []`,
     enforced + swept). No ad renders on any route in this beta.
  2. Affiliate links: ZERO rendered on any shipped route. The pipeline
     (fixture networks -> `decorateOutboundLink` -> `renderMonetizedLink`)
     exists and is test-proven only.
  3. Upsell: exactly one — the Season Pass block at the BOTTOM of
     `/account` (`data-upsell="season-pass"`), checkout disabled with
     honest copy, `CORE_ACCESS_NOTICE` rendered beside it.
  4. Truthful no-payment disclosure on `/item/:slug`
     (`ITEM.disclosureNone`, Phase 7) — still accurate; update it in the
     same change that ever mounts a real paid link.
- **Disclosure placement contract you are inheriting:** adjacent, same
  section, atomic with the anchor, `rel="sponsored noopener"`, marker
  classes in §4. Footnote-only disclosure is test-failing. Your Phase 10
  wording lands in `src/ui/copy/en.ts` `MONETIZATION` (both lints cover
  it); the strings to review are `affiliateDisclosure`,
  `affiliateLinkSuffix`, `passExplainer`, `passCheckoutUnavailable`,
  `passActiveThrough`, `passAdFree`, plus Phase 7's `ITEM.disclosure*`.
- **Licensing/network posture:** no affiliate agreement, no network
  membership, no payment processor account exists or is claimed. All tags
  are `fixture-tag-*`; the Stripe integration is the Phase 5 fixture
  verifier + throwing live stub; `beginSeasonPassCheckout` throws. Nothing
  needs a takedown to stay truthful — verify and record that in your
  handoff.
- **MUST NOT:** weaken `scanRenderedPage` or its seeded-violation tests;
  add copy with urgency/scarcity phrasing (rule-E fails the build); route
  a purchase around POST /api/webhooks/stripe; put any §1.2 content
  behind `adFreeExtras` (byte-equality test will fail); hardcode the brand.
- **MUST NOT ASSUME:** that "indexable" means "monetizable" (handoff 09
  §8 — tool surfaces stay ad-free forever); that the empty mount table is
  convention — it is enforced, extend `assertMountAllowed` rules rather
  than bypassing them if editorial pages arrive in your scope.
- Baseline for `npm run verify` is now **761 tests / 52 files**. Extend,
  never weaken.

**orchestrator (gate):** invariant-2 row in CLAUDE.md can flip to ENFORCED
(route-tree scan + layout throw + paywall byte-equality all green); the
enforcement-status table is yours to edit, not mine.
