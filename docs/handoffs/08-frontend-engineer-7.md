# HANDOFF 08 — frontend-engineer — Phase 7

## 1. Inputs consumed

- `docs/design/direction.md` — ENTIRE document, §14 token export contract
  binding (palette, status colors, type trio, layout, Sum Rule /
  Net-Required Stack spec, 11-badge table, iconography, motion, voice).
- `docs/handoffs/06-backend-api-5.md` §8 (endpoint contracts, envelope
  discipline, MUST NOTs), §4 (endpoint table), §7 (gaps inherited).
- `docs/handoffs/gates/phase-5-gate.md` (P5-4 note carried; §1.4
  render-guard obligation discharged this phase) and
  `phase-6-gate.md` (direction is binding).
- `docs/handoffs/07-design-director-6.md` §8 (MUSTs: self-host fonts,
  vendor Lucide, render guard, badge icon+text, reduced-motion, lint roots,
  brand from config, no invented numerals, Sum Rule never decorative).
- `src/api/contracts.ts` (coded against exclusively), `src/parsing/types.ts`
  (ReviewPayload/ReviewItem), `src/parsing/lexicon.ts` (controlled
  vocabularies for form options), `src/algorithms/*` types (render shapes
  only — never called from UI code), `config/brand.ts`, `config/flags.ts`,
  `CLAUDE.md` §0/§1/§2, `docs/handoffs/TEMPLATE.md`,
  `.github/workflows/ci.yml` (LHCI activation contract),
  `lighthouserc.json` (budgets).

## 2. Decisions made

1. **Architecture: Worker-rendered HTML over the Phase 5 envelope +
   progressive enhancement. No framework, no hydration.** Every screen is a
   pure function `(state) -> Screen` returning escaped-by-default HTML
   strings, rendered by the same Worker via IN-PROCESS calls to
   `handleApiRequest` — so the UI inherits the API's provenance gate,
   suppression handling, rate limiting, and anonymous-session model with
   zero opportunity to bypass them (handoff 06 §8 MUST NOT). Mutations are
   plain HTML forms (POST -> redirect/render): the full journey works with
   JavaScript disabled. Client JS is one 3 KB enhancement file plus a
   service worker. Alternatives rejected: a hydrated SPA framework (bundle
   cost against the LCP<2.5s budget, a second rendering path to guard, and
   §2's static-first posture argues against it); client-side fetching of
   /api (would duplicate the component library client-side and put
   skeletons in the critical path — SSR makes first paint the data).
2. **Static Assets for static files only** (`wrangler.jsonc "assets":
   {"directory": "public"}`): self-hosted OFL font binaries + licenses, the
   enhancement script, and `sw.js`. HTML never ships from the assets layer;
   the stylesheet is GENERATED at runtime from the typed token source
   (`/assets/ui.css` route) so CSS cannot drift from tokens.ts. Alternative
   (committed CSS file) rejected: two sources of truth for §14.
3. **Fonts vendored from the npm registry Fontsource mirrors** (SIL OFL 1.1
   preserved: Bricolage Grotesque 600/700/800, Atkinson Hyperlegible Next
   400/700, Spline Sans Mono 400/500, latin subsets, woff2). License texts
   ship at `public/assets/licenses/OFL-*.txt`. **Lucide vendored** from
   `lucide-static@1.28.0` (ISC; `public/assets/licenses/ISC-lucide.txt`):
   34 glyphs extracted verbatim into `src/ui/icons.ts` as inline SVG — no
   icon CDN, no font-icon hack, `aria-hidden` always (labels are text).
4. **§1.2 as data + a render-time throw.** Screens emit ordered, typed
   sections; `assertSlotPlacement`/`assertSafetyFirst` run inside the page
   composer on EVERY render — a violating layout throws instead of
   shipping. The slot registry carries fixed dimensions and editorial-only
   surfaces; zero slots are mounted in this beta (§4 below is Phase 9's
   contract).
5. **§1.4 render guard refuses, then explains.** `renderFact()` is the only
   path to fact markup; refusal renders the suppression REASON (per §1.5
   voice) — missing/unresolved/incomplete citation, expired freshness,
   retracted, or under-review. A passing fact renders WITH its visible
   provenance line (direction §7 pattern). Alternative (log-and-render)
   rejected: that is exactly what invariant 4 forbids.
6. **States are two-layer.** loading/rate-limited/error are screen states
   (skeletons with fixed dimensions — no spinners anywhere); empty, stale,
   partial, conflicting-source, expired, sold-out, recalled are DATA
   conditions rendered by shared components from the envelope
   (meta.sources -> stale badge; suppressions[] -> reason notices; guard ->
   expired/partial; availability -> out-of-stock badge; recall findings ->
   red banner above everything). This keeps honesty machinery identical on
   every screen instead of per-screen re-implementations.
7. **Numerals discipline:** no literal number ships in copy; counts, money,
   dates, thresholds interpolate from envelope data or imported engine
   constants (`DEFAULT_SUPPRESSION_THRESHOLDS`, `SIGNAL_FAMILIES`). The one
   mirrored spec constant (`MIN_ORGANIC_FAMILIES_FOR_TREND = 3`, §1.3) is
   pinned by test to the invariant. The school-year form default derives
   from the injected clock.
8. **Offline = checklist only, deliberately.** The service worker precaches
   the app shell and serves `/plan/checklist` network-first with cache
   fallback; check-offs persist in localStorage under opaque line keys (no
   PII, §1.7). Prices/safety pages are never cache-served by the SW —
   silent staleness belongs to the envelope's badges, not a cache layer.
9. **`npm run build`** renders the bindingless static-first pages (home,
   methodology, intake shell) plus assets into `dist/` using the esbuild
   already in node_modules, satisfying the CI lighthouse job's build step
   and `lighthouserc.json staticDistDir`.

## 3. Artifacts produced

Created — `src/ui/`:
- `html.ts` (escaped tagged-template engine), `tokens.ts` (§14 typed
  source + CSS generation), `styles.ts` (full stylesheet from tokens),
  `icons.ts` (vendored Lucide, ISC), `copy/en.ts` (ALL user-facing
  strings, voice §10), `render-guard.ts` (§1.4 UI half),
  `slots.ts` (§1.2 registry + rules), `state.ts`, `pwa.ts` (runtime
  manifest), `server.ts` (UI router + in-process API client),
  `static-site.ts` (LHCI build entry)
- `components/`: `badges.ts` (all 11), `ledger.ts` (Sum Rule,
  Net-Required Stack, pack chip, budget bar, money), `banners.ts`,
  `forms.ts`, `skeleton.ts`, `status.ts` (stale/suppression/assumption
  chrome), `chrome.ts` (document composer, § rule enforcement)
- `screens/`: `home.ts`, `intake.ts` (paste/manual/upload + review),
  `household.ts`, `plan.ts`, `checklist.ts`, `basket.ts`, `capsule.ts`,
  `trends.ts`, `item.ts`, `safety.ts`, `budget.ts`, `deals.ts`,
  `methodology.ts`, `account.ts`, `status.ts`, `shared.ts`

Created — `public/`: `assets/app.js` (enhancement), `sw.js` (offline
checklist), `assets/fonts/*.woff2` (7 files), `assets/licenses/{OFL-*,ISC-lucide}.txt`.

Created — tests: `tests/helpers/ui.ts`, `tests/ui-tokens.test.ts` (13),
`tests/ui-render-guard.test.ts` (12), `tests/ui-components.test.ts` (27),
`tests/ui-slots.test.ts` (9), `tests/ui-screens.test.ts` (35),
`tests/ui-lint-roots.test.ts` (4), `tests-workers/ui-pages.test.ts` (16).
Created — `scripts/build-static.mjs`.

Modified (each sanctioned): `src/index.ts` (UI dispatch before 404),
`wrangler.jsonc` (assets directory + justification comment),
`eslint.config.js` (browser/serviceworker globals for public/),
`package.json` (lint roots `src public` for BOTH lints; `build` script).

Untouched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
prior handoffs, migrations, `src/{api,algorithms,parsing,ingestion,contracts}`,
all Phase 0-5 tests, `.github/`, `lighthouserc.json`.

## 4. Contracts exported

Tokens (from `src/ui/tokens.ts`, pinned to direction §14 by
`tests/ui-tokens.test.ts`):

```ts
COLOR_TOKENS  = { ink:"#25302A", paper:"#F7F8F2", surface:"#FFFFFF", action:"#1B6B54",
                  rule:"#A7C4DE", graphite:"#5C6660", accent:"#E5A49B" }
STATUS_TOKENS = { recall:"#B3261E", restricted:"#5B4B8A", stale:"#8A5B00",
                  staleTint:"#FBEFD2", stock:"#5C6660", signal:"#2C5F9E",
                  sponsored:"#6E5527", sponsoredTint:"#F2E8D8" }
SPACE_SCALE = [4,8,12,16,24,32,48,64,96]; RADII = [0,4,8,16]
BREAKPOINTS = { sm:480, md:768, lg:1024, xl:1280 }
CONTAINERS  = { flow:640, plan:880, compare:1120, page:1200 }
TYPE_SCALE  = { "display-xl":40/44/800 ... "data-s":12/16/400 }   // §3 table verbatim
MIN_TOUCH_TARGET_PX = 44; FOCUS_RING = { widthPx:2, offsetPx:2 }
```

CSS custom properties served at `/assets/ui.css`: `--color-*`,
`--status-*` (incl. `-tint`), `--space-1..9`, `--radius-0..3`,
`--font-{display,body,data}`, `--text-<step>-{size,line,weight,tracking}`,
`--container-*`, `--touch-target`, `--focus-ring-*`, `--motion-*`.

Render guard (`src/ui/render-guard.ts`):

```ts
guardFact(provenanceIds, provenanceDict) -> { ok:true, records } |
  { ok:false, code: "missing_provenance"|"unresolved_provenance"|"incomplete_record"
              |"expired"|"retracted"|"under_review", reason: string }
renderFact({ provenanceIds, provenance, render, withLine? }) -> Html  // refusal renders reason
provenanceLine(records) -> Html   // source · type · observed · retrieved · confidence
suppressionNotice(reason) -> Html
```

§1.2 layout contract (`src/ui/slots.ts`) — **monetization-engineer codes
against this**:

```ts
SECTION_KINDS; CRITICAL_SECTION_KINDS = ["safety_warning","required_items",
  "dress_code_restriction","correction","price_change","assistance_resource","deadline"]
COMMERCIAL_SECTION_KINDS = ["ad_slot","disclosure"]
assertSlotPlacement(sections)  // throws SlotPlacementError: no ad_slot before ANY critical section
assertSafetyFirst(sections)    // throws: no commercial section above a safety_warning
AD_SLOT_REGISTRY: AdSlotSpec[] = [
  { id:"editorial-inline-rect",        widthPx:300, heightPx:250, surfaces:["editorial_article"] },
  { id:"editorial-footer-leaderboard", widthPx:728, heightPx:90,  surfaces:["editorial_guide_footer"] },
]  // fixed reserved dimensions (CLS 0); surfaces are editorial-ONLY; zero mounted in beta
renderAdSlot(spec, creative?) -> Html  // ticket-notch "Sponsored" label, reservation never resizes
```

Badges (`src/ui/components/badges.ts`): `badgeFor(kind, data)` for all 11
direction-§6 kinds; `trendingBadge(passing,total)` and
`staleBadge(dateISO)` REFUSE to render without their data. Screens:
`render<Name>(state[, options]) -> Screen`; `renderDocument(screen,
{fixtureMode}) -> string`. UI routes: `/`, `/intake(?tab=)`, POST
`/intake/{paste,manual,upload,confirm}`, `/household` (+POST
`/household/inventory`), `/plan`, `/plan/checklist(?mode=store)`,
`/plan/basket(?view=&days=&state=)`, `/capsule` (GET+POST), `/trends`,
`/item/:slug`, `/safety(?upc=)`, `/budget`, `/deals`, `/methodology`,
`/account` (+POST `/account/alerts`), `/admin/status`, branded 404.

## 5. Invariants touched

- **§1.4 — NOW FULLY ENFORCED (both halves).** API half: Phase 5 envelope
  gate (unchanged). UI half (this phase): `renderFact` refuses any fact
  without complete, resolvable, current provenance and renders the
  suppression reason instead — `tests/ui-render-guard.test.ts` feeds a
  provenance-less fact and asserts the fact renderer is NEVER invoked and
  the reason renders; expired/retracted/under-review likewise. Passing
  facts render with the visible provenance line (asserted). The workers
  journey asserts provenance lines on real rendered pages. Invariant 4's
  enforcement-status row can flip to ENFORCED at gate time (orchestrator
  owns the CLAUDE.md table).
- **§1.2 — layout half ENFORCED at render time** (`SlotPlacementError`
  from the composer; `tests/ui-slots.test.ts` proves the rule for every
  protected kind and that the shipped registry is editorial-only with zero
  mounted slots; workers hygiene test proves no planner page contains a
  slot). Phase 9's route-tree scan closes the loop externally.
- **§1.3** — trending badge cannot render without its family count
  (throws); trend screens render label + confidence + family evaluations
  together; insufficient-evidence is the designed default state (tested).
- **§1.5** — suppressions[] render as reason notices on every screen
  (stale list, conflicting source, recalled offer tested); assumptions
  render as labeled assumptions, never facts; `basket:null`/infeasible are
  honest states.
- **§1.6/§1.8** — lint roots extended to `src public` in package.json
  (pinned by `tests/ui-lint-roots.test.ts`); all copy centralized in
  `src/ui/copy/en.ts`; icons are vendored Lucide only; emoji regex swept
  across every rendered page in tests.
- **§1.7** — UI stores nothing client-side but the opaque cookie and
  opaque checklist line keys; uploads go through the API's ephemeral
  buffer; no logging API exists in the UI layer.
- **§0 brand isolation** — wordmark/name/title render from `BRAND` at
  runtime; repo-wide literal scan (tests/config.test.ts) stays green.
- **§1.1** — untouched; UI imports no algorithm module (server.ts imports
  types only), so the economics-identifier closure is unchanged.

## 6. Acceptance evidence

Commands run 2026-08-04, Node v22, all exit 0:

```
lint-banned-claims: OK (7 claims checked across 2 root(s))
lint-no-emoji: OK (2 root(s) scanned)
> tsc --noEmit && tsc -p tsconfig.tests.json --noEmit && tsc -p tsconfig.workers-tests.json --noEmit
> vitest run
 Test Files  43 passed (43)
      Tests  621 passed (621)
```

621 = 505 inherited (Phase 0-5 baseline, none weakened) + 116 new
(node: tokens 13, render-guard 12, components 27, slots 9, screens 35,
lint-roots 4; workers: ui-pages 16). `npx wrangler deploy --dry-run`
bundles clean (Total Upload 362.13 KiB / gzip 89.28 KiB; 16 static assets
read from public/). `npm run build` writes 3 static pages + assets to
`dist/` for LHCI.

Workers journey (real D1/KV/R2, real router): home -> manual intake ->
mandatory review (cookie minted, provenance lines on proposals) ->
confirm (303) -> plan (Net-Required Stack + provenance) -> inventory add
-> subtraction visible -> checklist (+store mode) -> basket (four views,
no single-answer vocabulary — asserted) -> budget/deals -> safety (CPSC
credit + provenance) -> item detail (evidence + disclosure) -> trends
(honest insufficiency) -> account -> status -> branded 404; every page
swept for emoji/slots/skip-links.

**Screen × state matrix.** Legend: **T** = rendered + spot-tested by a
named test; **C** = rendered by the shared envelope machinery on this
screen (stale badges from meta.sources, suppression notices from
suppressions[], guard refusals per fact — mechanism itself is T in
ui-render-guard/ui-components/ui-screens); **s** = designed/rendered, not
individually spot-tested; **—** = state cannot occur on this surface
(reason).

| Screen | loading | empty | stale | partial | conflicting | expired | sold-out | recalled | rate-ltd | error |
|---|---|---|---|---|---|---|---|---|---|---|
| Homepage | — static | — static | — | — | — | — | — | — | — | — |
| Intake forms | T | — (form) | — | — | — | — | — | — | T (429 upload) | T |
| Review confirm | T | T (no parse) | C | T (guard refusal per line) | C | C | — | — | T | T |
| Household | s | T (no inventory) | C | C | C | C | — | — | s | T (via failureState) |
| Plan (merged) | T | T | T (list findings) | T | C | C | — | — | T | T |
| Checklist (+store) | T | T | C | C | C | C | — | — | s | s |
| Basket (Pareto) | T | T (null basket) | T (meta.sources) | T (excluded+disqualifiers) | T | C | T (badge) | T (banner above all) | T | T (search-space) |
| Capsule | s | T (form) | C | C (guard) | C | C | — | — | s | s (422 range errors) |
| Trend radar | s | T | C | C | C | C | — | — | s | s |
| Item detail | s | T (unknown slug) | C | C | C | C | — | T (banner first) | s | s |
| Safety center | s | T (no recalls) | C+T (badge) | C | C | C | — | T (banner) | s | s |
| Budget | T (skeleton+ledger) | T | C | C | C | C | — | — | s | s |
| Deals/tax-holiday | s | T (no state / no window) | C | C | C | C | — | — | s | s |
| Methodology | — static | — | — | — | — | — | — | — | — | — |
| Account | s | T (no alerts) | C | C | C | C | — | — | T (alerts 429) | s |
| Provider status | s | T (no sources) | T | — meta-only | — | — | — | — | s | s |

Sold-out is basket-only because availability exists only on offers;
recalled surfaces exist wherever recall data flows (basket, safety, item).

**Screenshots: not deliverable from this environment** — no browser
binary is installed and the egress policy blocks browser downloads
(Playwright lands with accessibility-qa/release-qa). In lieu, every
critical state above is asserted against fully rendered HTML documents
(the same bytes a browser would receive), and `npm run build` produces
inspectable static pages in `dist/`.

## 7. Known gaps and risks

- **Lighthouse CI: wired but not executed here.** Budgets
  (CLS<0.1, LCP<2.5s mobile) are in `lighthouserc.json`; the CI job needs
  the `LHCI_ENABLED=true` repository variable, which requires repo-admin
  credentials this environment does not have (gh CLI absent, API
  unauthenticated). CLS-by-construction arguments: server-rendered
  complete HTML, fixed-dimension skeletons and ad reservations, no layout
  driven by JS. Residual risk: `font-display: swap` can cause a metric
  swap shift; if LHCI flags it, add `size-adjust` fallback metrics.
- **Screenshots deferred** (§6 above) — first browser run belongs to
  Phase 11/12; expect visual polish findings (ticket-notch geometry in
  forced-colors mode is flagged for Phase 11 per design handoff §7).
- **Latin-only font subsets** vendored; extended-latin falls back to
  system-ui. Additive fix if non-latin list content lands.
- **Turnstile in fixture mode is a header injection** (`ui/server.ts`); the
  real widget render is a live-mode task gated on credentials — live mode
  currently throws by construction (Phase 5 stubs), so nothing false ships.
- **Account export/delete are honest placeholders**: no API endpoints
  exist for server-side purge or full JSON export; the page says exactly
  that (compliance-officer Phase 10 + backend-api follow-up).
- **No standalone tax-holiday endpoint** — /deals surfaces windows only
  through basket caveats/assumptions; a verified-calendar endpoint is a
  backend-api follow-up. Capsule buy-now-vs-wait timing has no UI form yet
  (API supports it; renders when present).
- **/admin/status is public read-only meta** (no secrets, no admin
  actions). If admin-only actions ever land there, they need an auth story
  that does not exist by design in the anonymous beta.
- **Manifest ships without icons** (installability reduced) — icon assets
  are brand-coupled; deliberately deferred while the name is disposable.
- **Checklist check-offs are device-local only** (localStorage) — they do
  not sync to inventory; a "mark bought -> inventory" endpoint is future
  work with backend-api.
- **P5-4 (brands table CHECK) unchanged** — still queued for
  data-architect; UI sends only lexicon slugs through selects either way.

## 8. Instructions to next agent

**seo-architect (Phase 8):**
- Pages are server-rendered, crawlable HTML with per-screen `<title>` +
  `meta description` (brand appended at runtime — never hardcode the
  name). Add canonicals/robots/sitemap/structured data via
  `src/ui/components/chrome.ts` `renderDocument` — one composition point.
- Static-first surfaces for indexing: `/`, `/methodology`, `/intake`
  (`src/ui/static-site.ts` renders them bindingless; extend `staticPages()`
  for new editorial templates and they flow into `npm run build`/LHCI).
- Editorial templates you create MUST render through the section
  composer (`PageSection[]`) — that is what keeps §1.2 enforceable; use
  `kind:"ad_slot"` sections only on `editorial_*` surfaces per the
  registry. Do NOT invent new section kinds without extending the tests.
- Copy you add goes in `src/ui/copy/` (already under both lint roots). No
  numerals in copy that are not data-derived. Do not touch the no-single-
  answer basket vocabulary (tests assert absence of optimal/recommended/best).

**monetization-engineer (Phase 9):**
- Your §1.2 route-tree scan test codes against `src/ui/slots.ts`:
  `AD_SLOT_REGISTRY` (fixed dimensions — never resize a reservation),
  `CRITICAL_SECTION_KINDS`, `assertSlotPlacement`, `assertSafetyFirst`,
  and the rendered marker `class="ad-slot" data-slot-id="..."`. The
  composer already throws on violations at render time; your test proves
  it from the route tree outward. Current truth: ZERO slots mounted;
  planner/safety surfaces define no slot surface at all — keep it that way
  structurally, not by convention.
- Sponsored units must use `renderAdSlot` (ticket-notch chip, kraft
  palette) — never the evidence chip styles; a sponsored item may never
  inherit trend chrome (direction §6). The disclosure slot on item detail
  (`ITEM.disclosure*` copy) is where affiliate labeling lands; §1.1 stays
  provable because UI imports no ranking code.
- Entitlements: `EntitlementsData.gates.adFreeExtras` is the ONLY thing a
  Season Pass may change — core responses are byte-identical (Phase 5
  tested); your ad-suppression logic keys on that gate alone.
- MUST NOT: mount a slot on any current screen; add a slot spec with
  non-editorial surfaces; bypass `renderDocument`/`renderSections`; write
  copy outside the linted roots.
- Do not assume screenshots or LHCI runs exist yet (§7); re-run
  `npm run verify` (baseline now **621 tests / 43 files**) and extend,
  never weaken.
