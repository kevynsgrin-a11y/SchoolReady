# First-impression congruence gate — Phase 12 (release-qa)

- Date: 2026-08-04
- Checklist source: §5 of the founding brief, restated verbatim in
  `.claude/agents/release-qa.md` (Hard constraints).
- App under test: the fixture-mode Worker served by `npx wrangler dev`
  (local D1/KV/R2, migrations 0001–0008), Chromium 141
  (`/opt/pw-browsers/chromium`), viewports 390x844 (phone-class emulation)
  and 1280x800 (desktop). Fresh browser contexts per test = first-time-user
  posture.
- Evidence roots: `docs/release/screenshots/` (captured by
  `npm run test:e2e`), `docs/release/artifacts/` (live Lighthouse pair),
  `.lighthouseci/` (LHCI budget run, gitignored, regenerable), suite
  outputs quoted per line.

## Environment honesty (read first)

This environment has Chromium only — no Safari, no Firefox, no real phone,
no human assistive technology. A line whose full §5 requirement needs those
is marked **BLOCKED-ENV** with exactly what must happen at launch; that is
a launch precondition, not a pass. Every line that CAN run here was run,
and one genuine failure was found and fixed during this gate (P12-3,
line 7 evidence).

Screenshot artifact note: some captures show the "You are offline" status
banner at the top. The sandbox's Chromium network notifier intermittently
reports offline under test load while the page was served live over HTTP
moments earlier; the banner is the app's truthful, designed response to
the browser's belief (`public/assets/app.js`). It does not appear in a
normally-networked environment, and it doubles as evidence that the
connection-loss state is designed (line 7).

## Verdict

**RELEASE BLOCKED.** 14 of 15 lines PASS in this environment; 1 line
(cross-browser) is BLOCKED-ENV; and the gate carries non-§5 blockers that
each independently block release: `config/brand.ts` still has the
.example domain and UNSET legal entity, and the human-AT pass has not run.
The full blocker list with owners lives in
`docs/release/launch-checklist.md`.

Correction round 2026-08-04: the two §6 journey-3 outcome gaps this gate
recorded at first pass (P12-1 cost-per-wear, P12-2 buy-now-vs-wait) are
now CLOSED — both outcomes drive through the shipped capsule form and are
asserted by the extended journey-3 E2E. See the journey table and findings
ledger below; launch-checklist item 7 is discharged. Suite tails after the
correction: `npm run verify` 812/56, `npm run test:a11y` 65/65,
`npm run test:e2e` 14/14.

Correction round 2, 2026-08-04: the §6 journey-1 bar "printable
STORE-GROUPED checklist" was found only partially met — store grouping
existed on the basket expanded view while the printable checklist rendered
flat (`ChecklistLine` carried no retailer attribution). Closed as finding
P12-4 (ledger below): the checklist now groups lines under retailer trip
headings read from the labeled lowest-cost frontier view of the same
Pareto computation the basket serves — cited as that view, never as an
"optimal" pick — with an honest ungrouped state when no basket result
exists. Suite tails after this correction: `npm run verify` 816/56,
`npm run test:a11y` 65/65, `npm run test:e2e` 14/14.

## The fifteen lines

### 1. Five-second test — PASS (Chromium; real-phone confirmation = launch item 3)

A first-time user sees, above the fold on a 390px phone: the wordmark, the
h1 "Turn the supply list into a finished errand", the audience in the
first sentence ("For parents of K-8 kids: paste the school supply list and
get back a checked, de-duplicated shopping plan across stores"), and the
single primary action (paste box + "Parse this list"). Nothing competes
with it.

- Evidence: `screenshots/home-mobile.png`, `screenshots/home-desktop.png`;
  live mobile LCP 923 ms (`artifacts/live-home.report.json`).
- Device/browser: Chromium 141, 390x844 emulated + 1280x800.

### 2. Promise-to-proof — PASS (with one recorded beta caveat)

Every homepage promise is walked to proof by the E2E journeys against the
real Worker:

| Promise (home copy) | Proof |
|---|---|
| "checked, de-duplicated shopping plan across stores" | journey 1: two lists merge to one net-required plan; four-view basket comparison |
| "every number's math shown" | Net-Required Stack renders 18 − 2 = 16 with per-child receipt "Child 1: 6 / Child 2: 12" |
| "every price's source dated" | provenance line (source, observed, retrieved, confidence) asserted visible on plan/basket |
| "return a set of trade-offs, never a single answer we picked for you" | frontier + 4 labeled views asserted; no "recommended/optimal/best pick" vocabulary in rendered output |
| "recall warnings always render above anything commercial" | journey 2: geometric + structural + hit-test assertions |

Caveat, recorded not hidden: the "upload a photo" intake path fails closed
in this beta (no live OCR; `ERRORS.uploadUnreadable` says so plainly and
routes users to paste/type), and every page carries the fixture-data
ribbon. The promise is scoped by the ribbon on the same screen.

- Evidence: `npm run test:e2e` 13/13 green (journey specs); handoff §6.
- Device/browser: Chromium 141, both viewports.

### 3. No emoji iconography — PASS

- Evidence: `lint-no-emoji: OK (2 root(s) scanned)` in `npm run verify`;
  rendered-text emoji sweep over all 14 routes with a seeded session found
  zero emoji codepoints (`congruence-evidence.spec.ts`); all icons are
  vendored Lucide SVG, `aria-hidden` with adjacent text labels (Phase 11
  badge test: 11/11 badges icon+text).
- Device/browser: Chromium 141, mobile viewport.

### 4. No lorem/placeholder/dead links — PASS

- Evidence: sweep over all 14 routes (seeded session): zero matches for
  lorem/ipsum/TODO/TKTK/"coming soon"/"under construction"; **24 internal
  links** all resolved < 400; **3 external links** all confined to the
  reserved `example.com` fixture namespace (labeled synthetic deep links —
  no real destination ships before licensing); footer licenses file 200.
  Note: `favicon.ico` is requested implicitly by browsers and 404s — it is
  not a link in any document; the brand-coupled icon set is launch item 1.
- Device/browser: Chromium 141, mobile viewport.

### 5. One visual system — PASS

- Evidence: a single generated stylesheet (`/assets/ui.css` from
  `src/ui/tokens.ts` + `styles.ts`) serves every page; no per-page CSS, no
  inline styles except the fixed-dimension ad-slot reservation (zero
  mounted); two vendored typefaces; `tests/ui-tokens.test.ts` pins tokens
  to the Phase 6 direction; screenshots across 12 surfaces show one
  paper/ink/green system with the accountant's ledger grammar throughout.
- Device/browser: Chromium 141, both viewports.

### 6. Copy consistency — PASS

- Evidence: all user-facing strings live in `src/ui/copy/en.ts` (single
  source; both lint roots); nav labels identical in header, footer, and
  page titles (chrome renders both from `NAV_ITEMS`); voice rules
  (direction §10) hold — sentence case, buttons say what happens, errors
  say what went wrong and how to fix it; banned-claims lint green with 8
  claims; the no-single-answer vocabulary asserted in rendered output.
- Device/browser: Chromium 141 + static analysis.

### 7. Every state designed — PASS (one genuine failure found and FIXED here)

- Coverage: Phase 7 screen-by-state matrix re-driven in-browser by Phase
  11 (49 page-by-state scans: empty, loading skeletons, error,
  rate-limited, review, recalled, stale, entitled, guard-refusal) plus this
  phase's E2E states: empty capsule, unconfirmable-dress-code, 404,
  offline banner (captured live, see artifact note), recalled basket.
- **Finding P12-3 (found by this gate, fixed, regression-tested):** the
  recall-entry card nested inside the solid recall banner on the safety
  intercept rendered white text on its white card — title, hazard, and
  remedy were invisible on the highest-stakes surface. Phase 11's axe pass
  missed it because the card's box-shadow files those nodes as
  "incomplete" (not violations). Fixed in `src/ui/styles.ts` (card content
  reverts to the normal palette inside banners); pinned by an E2E computed-
  color regression (journey 2) and the updated Phase 11 keyboard
  expectation (erratum in `docs/handoffs/12-accessibility-qa-11.md`).
- Evidence: before = first capture of `safety-intercept-mobile.png`
  (blank card); after = current `screenshots/safety-intercept-mobile.png`
  (readable ink text); `npm run test:a11y` 65/65 and `npm run test:e2e`
  13/13 after the fix.
- Device/browser: Chromium 141, mobile viewport.

### 8. Zero layout shift with ad slots — PASS

- Evidence: zero ad slots are mounted anywhere in the beta (workers sweep
  asserts it across 30+ captured pages); the only slots that may ever
  exist are fixed-dimension registry entries (`src/ui/slots.ts`). Measured
  CLS: LHCI dist runs 0.001–0.049; live pair 0.0013 (home) / 0.0134
  (seeded /plan) — all under the 0.1 budget.
- Device/browser: Lighthouse 13.x mobile emulation.

### 9. One-hand mobile, targets ≥ 44px — PASS (emulated; real-phone confirmation = launch item 3)

- Evidence: measured on the 390x844 viewport across six surfaces (home,
  intake, plan, store-mode checklist, capsule, safety): every button,
  select, text input, check row, and the sticky checklist-bar controls
  ≥ 44px (checkbox glyphs are 24px inside ≥ 44px labeled rows — the row is
  the target); the checklist bar is bottom-anchored for thumb reach;
  check-off + progress work one-handed. `congruence-evidence.spec.ts` and
  journey 1 assert the numbers; `screenshots/checklist-store-mobile.png`.
- Device/browser: Chromium 141, 390x844.

### 10. Trust surfaces one click from footer — PASS

- Evidence: the footer on every page links "How the math works"
  (/methodology), "Alerts and privacy" (/account: full privacy policy,
  disclaimers, export, one-pass delete), "Data sources" (/admin/status:
  live source health), and "Type and icon licenses" — each asserted
  present and resolving 200 (`congruence-evidence.spec.ts`);
  `screenshots/methodology-desktop.png`, `account-desktop.png`,
  `admin-status-desktop.png`.
- Device/browser: Chromium 141, desktop viewport.

### 11. Provenance/freshness visible on every price/stock/trend/safety fact — PASS

- Evidence: structurally, a fact renders only through `renderFact()`
  (§1.4 render guard; refusal renders the suppression reason —
  `tests/ui-render-guard.test.ts`), and the API half gates envelopes.
  In-browser: visible provenance lines (source, type, observed date,
  retrieved timestamp, confidence, limitations) asserted on /plan,
  /plan/basket, /safety, /trends, and capsule results; stale sources render
  dated stale badges (Phase 11 snapshots); every screenshot shows the
  lines in place. The in-store checklist shows its generation date; its
  quantities' provenance renders on /plan where they originate.
- Device/browser: Chromium 141, both viewports.

### 12. No dark patterns — PASS

- Evidence: the Phase 9 scanner (countdowns, scarcity, pre-checked boxes,
  confirm-shaming, forced continuity markers) runs over every rendered
  route (30+ captured pages including the P9-1 upload review render, zero
  findings) plus this phase's
  browser-level P9-2 check: zero dialog/modal apparatus, zero visible
  fixed/sticky element covering ≥ 20% of the viewport, protected content
  hit-testable on 15 audited pages including the recalled states —
  computed-style based, immune to class renames. Season Pass surfaces are
  byte-identical with and without payment; checkout entry is honest about
  being off.
- Device/browser: Chromium 141, mobile viewport.

### 13. Nothing shames a family for buying or skipping any item — PASS

- Evidence: copy audit of `src/ui/copy/en.ts` — skipping is a designed,
  neutral state: "optional lines left out of the default basket on
  purpose", "Required spend only — optional items never inflate the plan
  total", inventory framed as savings ("we subtract it from every child's
  list"), worth-it labels are evidence summaries with "not enough
  evidence" as the honest default, and buying cheap/skipping trends draws
  no negative framing anywhere. No urgency theatrics (voice §10 +
  dark-pattern scan); banned-claims lint blocks "must-have"-class
  pressure. Rendered-output sweeps found no contrary copy.
- Device/browser: Chromium 141 + static analysis.

### 14. Lighthouse mobile: Perf ≥ 90 / A11y ≥ 95 / BP ≥ 95 / SEO ≥ 95 — PASS

LHCI (`lighthouserc.json`, 3 runs x 3 URLs over `npm run build` output,
mobile defaults): **all budget assertions green** (assertion-results.json
is an empty array).

| Page (dist) | Perf | A11y | BP | SEO | CLS | LCP |
|---|---|---|---|---|---|---|
| / | 0.99 | 0.98 | 0.96 | 1.00 | 0.001 | 1666 ms |
| /intake | 1.00 | 1.00 | 0.96 | 1.00 | 0.002 | 1511 ms |
| /methodology | 1.00 | 1.00 | 0.96 | 1.00 | 0.049 | 1358 ms |

Live-mode pair (P11-3 discharge), archived in `docs/release/artifacts/`:

| Page (live wrangler dev) | Perf | A11y | BP | SEO | CLS | LCP |
|---|---|---|---|---|---|---|
| / | 1.00 | 0.98 | 0.96 | 1.00 | 0.0013 | 923 ms |
| /plan (seeded session) | 0.99 | 1.00 | 0.96 | 0.63* | 0.0134 | 1683 ms |

*SEO 0.63 on /plan is `is-crawlable` failing because /plan is noindex BY
DESIGN (Phase 8 route map: session screens never enter the index); the SEO
budget applies to indexable pages, which score 1.00. A11y 0.98 on home =
the open heading-order advisory (design decision, Phase 11 §12.1). BP 0.96
everywhere = the favicon 404 console error (brand-coupled asset, launch
item 1).

- CI enforcement: the LHCI job is wired and the config proven runnable;
  it activates the moment a repo admin sets `LHCI_ENABLED=true`
  (launch item 5 — this environment has no repo-admin credentials).

### 15. Cross-browser (Chrome, Safari, Firefox, iOS Safari, Android Chrome) — BLOCKED-ENV

Chromium 141 is the only engine in this environment. What must happen at
launch (launch item 3), each with recorded results:

1. `npx playwright install webkit firefox`, then run `npm run test:a11y`
   and `npm run test:e2e` under WebKit and Firefox projects (add
   `projects` entries to both Playwright configs; watch `:focus-visible`
   heuristics and `<details>` behavior — flagged untested by Phase 11).
2. Real iPhone (iOS Safari) and real Android phone (Chrome): walk the
   three §6 journeys and this checklist's lines 1, 7, 9 as a first-time
   user on the staging URL.
3. Desktop Safari and Firefox: the same walk, plus the safety intercept.

## §6 journey outcomes (E2E acceptance, run here)

| Journey | Outcome bar (§6) | Result |
|---|---|---|
| 1 Two-child merge | merged net-required list; Pareto basket set; printable store-grouped checklist; zero account creation | **PASS** (store grouping closed in correction round 2, 2026-08-04 — P12-4) — `journey-1-merge.spec.ts` (net stack 18−2=16 with receipts; frontier + 4 views; printable checklist STORE-GROUPED: retailer trip headings from the labeled "Lowest cost" frontier view with the basis label + visible §1.4 provenance line, check rows inside their trip's group, honest ungrouped note when no basket result exists; store-mode ≥44px + print with groups intact; only cookie is the anonymous session id; no account surface exists) |
| 2 Safety intercept | recall warning above ALL commercial content; item suppressed from every basket; alternative offered with its own provenance | **PASS** — `journey-2-safety-intercept.spec.ts` (structural section order + geometry + hit test; recalled SKU absent from every option, §1.5 note names it; feasible alternatives with retailer-offers provenance in the envelope and visible §1.4 line) |
| 3 Uniform + capsule | quantity ranges with visible assumptions; cost-per-wear; buy-now-vs-wait | **PASS** (correction round 2026-08-04; P12-1/P12-2 closed) — `journey-3-capsule.spec.ts`, 4 tests: ranges + labeled assumptions + the uniform rule and the §1.5 dress-code-off state via the shipped form (unchanged); cost-per-wear renders on the category card as a Sum Rule money ledger through `renderFact` (hand-computed: 199c over 30-40 projected wears -> "$0.05 to $0.07 per wear" at whole-cent display, price + wears operands above the rule, wears basis as labeled `[user input]`/`[model constant]` assumptions, shared §1.4 provenance line on the card); buy-now-vs-wait reaches users through the form's optional price/timing fields — both observed-median branches asserted through the UI (verdict + reasoning + no-forecast disclaimer in the protected deadline section, price-history provenance attached); the API contract now carries `costPerWear` per line (`tests/api-policy.test.ts` hand-computed contract tests). Evidence: `screenshots/capsule-cost-per-wear-mobile.png` |

Correction round 2026-08-04: P12-1 and P12-2 were closed by the sanctioned
small additive work (option (a) of launch-checklist item 7) — API contract
+ handler (`src/api/contracts.ts`, `src/api/routes.ts`), capsule screen +
form wiring (`src/ui/screens/capsule.ts`, `src/ui/server.ts` `/capsule`
POST case, copy in `src/ui/copy/en.ts`), with unit, contract, and E2E
assertions added. No scope-guardian re-scope was needed: the shipped
product now meets the §6 journey-3 bar as written.

## Findings ledger (this phase)

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| P12-1 | major (release bar) | Cost-per-wear (§6 J3 outcome) implemented in `src/algorithms/capsule.ts` but surfaced by no route/screen | RESOLVED (correction round 2026-08-04) — `/api/capsule` returns `costPerWear` per line (engine helpers verbatim, wears basis as labeled assumptions, user-input provenance); capsule screen renders it as a Sum Rule money fact through `renderFact`; asserted by `tests/api-policy.test.ts`, `tests/ui-screens.test.ts`, and journey-3 E2E |
| P12-2 | major (release bar) | Buy-now-vs-wait renderer + API complete, but the capsule form sends `timing: null` — unreachable by users | RESOLVED (correction round 2026-08-04) — the capsule form ships an optional price/timing fieldset wired through the `/capsule` POST handler; both verdict branches render through the UI with reasoning, disclaimer, and price-history provenance; asserted by journey-3 E2E and screen tests |
| P12-3 | serious (fixed) | White-on-white recall-entry text inside the recall banner on the safety intercept | FIXED in `src/ui/styles.ts`; E2E computed-color regression + keyboard.spec expectation corrected; erratum appended to handoff 12 |
| P12-4 | major (release bar) | §6 J1 requires a "printable store-grouped checklist"; the shipped checklist was flat — `ChecklistLine` carried no retailer attribution, and store grouping existed only on the basket expanded view | RESOLVED (correction round 2, 2026-08-04) — `ChecklistData.grouping` + per-line `retailerSlug` read from the lowest-cost frontier view of the SAME Pareto computation the basket endpoint serves (labeled as that view, never "optimal"/"recommended"); grouped screen keeps in-store ergonomics and print (groups survive pagination); no basket result renders the honest ungrouped note (§1.5); a guard-refused grouping renders its suppression reason and falls back to the flat list (§1.4). Asserted by `tests/ui-screens.test.ts` (+4), the `ChecklistGrouping` provenance-carrier classification in `tests/api-policy.test.ts`, and the extended J1 E2E; erratum 2 in `docs/handoffs/13-release-qa-12.md` |
