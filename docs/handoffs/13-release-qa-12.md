# HANDOFF 13 — release-qa — Phase 12

## 1. Inputs consumed

- `CLAUDE.md` §0/§1 (all eight invariants), §2 stack, process rules.
- `docs/handoffs/12-accessibility-qa-11.md` §8 + both errata blocks
  (binding: run both suites, own CI wiring, congruence-gate leftovers,
  MUST NOTs) and `docs/a11y/audit-phase-11.md` (esp. §10 human-AT
  checklist, §11 Lighthouse).
- Gates: `phase-9-gate.md` (P9-1, P9-2), `phase-10-gate.md` (P10-3),
  `phase-11-gate.md` (carried launch conditions), plus 0–8 for context.
- `.claude/agents/release-qa.md` (§5 congruence lines, §6 journeys,
  hard constraints), `docs/handoffs/TEMPLATE.md`.
- `docs/handoffs/08-frontend-engineer-7.md` §7 (documented capsule-timing
  gap), `10-monetization-engineer-9.md`, `11-compliance-officer-10.md`
  (licensing register, deletion, UNSET legal entity blocker).
- Code read end to end for assertion design: `src/ui/**` (server, slots,
  render-guard, screens, styles, copy), `src/api/routes.ts` +
  `contracts.ts` + `sources.ts`, `src/ingestion/{pipeline,swr-cache,
  adapters/product-feeds}.ts`, `src/algorithms/capsule.ts`,
  `src/monetization/route-scan.ts`, `public/assets/app.js`, `fixtures/**`,
  `wrangler.jsonc`, `lighthouserc.json`, `config/{brand,flags}.ts`,
  `tests-a11y/**`, `tests-workers/{api-helpers,monetization-routes,
  api-endpoints}.ts`, `tests/config.test.ts` (brand walk scope).

## 2. Decisions made

1. **Separate Playwright config for E2E** (`playwright.e2e.config.ts`,
   `npm run test:e2e`, testDir `tests-e2e/`) instead of adding projects to
   the Phase 11 config. Keeps `test:a11y` byte-identical to its Phase 11
   meaning and verify hermetic. Alternative (one config, two projects)
   rejected: it would change what `npm run test:a11y` runs — a Phase 11
   contract I do not own.
2. **Journey 2 boots its own wrangler dev (:8788, dedicated persist dir)
   with a pre-seeded offers cache.** The shipped fixture feed deliberately
   contains no recalled UPC, and a RUNNING miniflare holds its store
   exclusively (verified empirically: external `wrangler kv` writes are
   invisible to a live dev server). So the spec builds the recalled batch
   through the REAL fixture adapter (`createProductFeedFixtureAdapter`)
   from the shipped fixture documents — one UPC swapped to the recall
   fixture's UPC, the exact technique the Phase 5 workers test sanctioned —
   wraps it in the real SwrCache envelope shape, seeds it via
   `wrangler kv key put --persist-to` BEFORE the server starts, then
   drives the journey over HTTP. No number invented; adapter provenance
   code path real. Alternatives rejected: snapshot pages (not E2E),
   API-only (not the rendered intercept), editing fixtures (would change
   every other suite's ground truth).
3. **Journey 3 asserted to the product's honest boundary.** Ranges +
   labeled assumptions + the uniform dress-code rule run through the
   shipped form; buy-now-vs-wait runs over the live public API (both
   verdict branches, real price-history window) because the shipped form
   sends `timing: null`; cost-per-wear is surfaced NOWHERE, so no E2E
   asserts it. Recorded as release findings P12-2/P12-1 (launch-checklist
   item 7) instead of being faked or silently dropped. Alternative
   (adding the missing UI myself) rejected: feature work in the final
   phase, outside my sanctioned change list, crossing frontend-engineer's
   contract with pinned suites.
4. **P9-2 discharged as computed-style + hit-test checks** (no marker
   dependence): zero dialog apparatus, no visible fixed/sticky element
   covering >= 20% of the viewport, protected sections hit-testable via
   `elementFromPoint` — on 15 routes incl. recalled states, plus the
   recall banner itself in journey 2. The node-side scanner is untouched
   (not weakened).
5. **P12-3 fixed in place, one Phase 11 assertion corrected.** The gate
   found white-on-white recall-entry text inside the recall banner (axe
   files box-shadowed nodes as "incomplete", so Phase 11's
   violations-only bar missed it). Fixed with scoped style rules
   (`.banner-recall .card` reverts to the normal palette); one
   keyboard.spec expectation (white ring on the banner's first link — a
   link that sits ON the white card) updated to the green ring + an
   explicit on-card assertion. This deviates from "do not modify Phase
   0–11 tests": the alternative was shipping invisible safety text or an
   invisible focus ring to keep a pinned byte green, which fails the
   congruence gate outright. Erratum appended to handoff 12; a11y suite
   re-run 65/65; E2E carries a computed-color regression.
6. **BLOCKED-ENV discipline in the congruence gate.** Only cross-browser
   is BLOCKED-ENV outright; lines 1 and 9 pass on emulated viewports with
   the real-phone confirmation explicitly folded into launch item 3.
   Every line that could run here ran; the doc states the environment
   scope per line. Screenshot offline-banner artifact documented rather
   than edited away (CDP online-pinning attempted; the sandbox notifier
   is not overridable — noted in `tests-e2e/helpers.ts`).
7. **Lighthouse evidence split**: LHCI budget run (dist, 3x3, enforced
   assertions) + the P11-3 live pair archived under
   `docs/release/artifacts/` (tracked; verified free of the brand
   literal, which the §0 brand walk scans for in .json/.html).
8. **CI browser-suites job lands non-blocking** (`continue-on-error`)
   with the flip-to-required condition written into the workflow and
   launch checklist. Rationale: unproven on shared runners; a flaky infra
   failure must not mask verify. LHCI job unchanged — it activates on the
   repo variable only.
9. **P10-3 taken here** (the gate offered it to release-qa): `KvLike.
   delete` now required; the purge call site drops the optional-chaining.
   All doubles (MemoryKv, real KV) already comply; typecheck enforces it
   for future doubles.

## 3. Artifacts produced

Created:
- `playwright.e2e.config.ts`; `tests-e2e/helpers.ts`,
  `journey-1-merge.spec.ts`, `journey-2-safety-intercept.spec.ts`,
  `journey-3-capsule.spec.ts`, `overlay-interstitial.spec.ts` (P9-2),
  `congruence-evidence.spec.ts` — 13 tests total.
- `docs/release/congruence-gate.md` (15 lines + §6 journey table +
  findings ledger), `docs/release/runbook.md` (deploy/verify/rollback/
  incidents + dry-run record), `docs/release/launch-checklist.md`
  (8 blocking items with owners).
- `docs/release/screenshots/*.png` (20 evidence captures, mobile +
  desktop) and `docs/release/artifacts/live-{home,plan-seeded}.report.
  {json,html}` (P11-3 live pair).

Modified:
- `src/ingestion/swr-cache.ts` + `src/api/routes.ts` (P10-3, commented).
- `tests-workers/monetization-routes.test.ts` (P9-1: upload review render
  captured into the §1.2 sweep; `ui()` form values may be File).
- `src/ui/styles.ts` (P12-3 fix, four scoped rules, commented).
- `tests-a11y/keyboard.spec.ts` (P12-3: one ring expectation corrected +
  on-card assertion; see decision 5).
- `.github/workflows/ci.yml` (browser-suites job; LHCI note).
- `package.json` (script `test:e2e`).
- `docs/handoffs/12-accessibility-qa-11.md` (append-only erratum, P12-3).

Untouched: `CLAUDE.md`, `.claude/agents/`, `config/*`, `docs/design/`,
all other prior handoffs and gates, `migrations/`, `fixtures/`,
`src/{algorithms,api (except the P10-3 line),contracts,ingestion (except
swr-cache),monetization,parsing,seo}`, `src/ui/` except styles.ts,
`public/`, all Phase 0–11 tests except the two sanctioned files above.

## 4. Contracts exported

```jsonc
// package.json
"test:e2e": "playwright test --config=playwright.e2e.config.ts"
// needs Chromium: A11Y_CHROMIUM env, /opt/pw-browsers/chromium, or
// `npx playwright install chromium`; starts/reuses wrangler dev on :8787;
// journey 2 additionally boots :8788 with persist dir .wrangler/e2e-recall-state
```

```ts
// tests-e2e/helpers.ts — reusable by future phases
shot(page, name, fullPage?)        // evidence PNG -> docs/release/screenshots/
seedTwoChildPlan(page, base?)      // UI-driven 6+12 glue + 2 owned
addManualList(page, {quantity, memberValue, base?})
expectNoAccountAffordances(page, label)   // §6 J1 zero-account bar
expectOnlySessionCookie(page, label)      // only k8p_sid may exist
MOBILE_VIEWPORT = {390x844}; DESKTOP_VIEWPORT = {1280x800}
```

```ts
// src/ingestion/swr-cache.ts — BREAKING for future doubles (P10-3)
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;   // now REQUIRED
}
```

CSS contract additions (`src/ui/styles.ts`, P12-3): inside
`.banner-recall`/`.banner-restricted`, a nested `.card` reverts to
`color: var(--color-ink)`, links to `var(--color-action)`,
`.provenance-line` to `var(--color-graphite)`, and `:focus-visible`
outline to `var(--color-action)`. Banner chrome outside cards is
unchanged (Phase 11 D2/D3 white treatment intact).

CI contract: job `browser-suites` (non-blocking; flip condition in-file);
job `lighthouse` gated on `vars.LHCI_ENABLED == 'true'`.

## 5. Invariants touched

- **§1.2** — journey 2 proves the full stack in a real browser over real
  bindings: recall warning above all commercial content (structural
  section order + geometry + hit test), recalled offer suppressed from
  every option pre-optimization, alternatives priced with provenance.
  P9-1 closes the last rendered-route gap (upload review) in the workers
  sweep; P9-2 adds the marker-independent overlay check.
- **§1.4** — E2E asserts the VISIBLE half on plan/basket/safety/trends/
  capsule; P12-3 restores readability of provenance-carrying safety
  content (guard logic untouched; guard suite still green).
- **§1.5** — journey 2 asserts the suppression note names the recalled
  offer; journey 3 asserts the unconfirmable-dress-code refusal state.
- **§1.7** — journey 1 asserts zero account surface and that the ONLY
  cookie is the anonymous session id; P10-3 hardens the purge path type.
- **§1.8** — rendered-text emoji sweep across all routes (browser-level,
  complements the source lint).
- **§0 brand isolation** — no new file carries the brand literal
  (`tests/config.test.ts` walk covers docs/ and the new artifacts;
  verified green); docs refer to "the working name in config/brand.ts".
- **§1.1/§1.3/§1.6** — not modified; relied on (existing suites) and
  re-verified via `npm run verify`.

## 6. Acceptance evidence

Commands run 2026-08-04 (this environment), all exit 0:

```
npm run verify
  eslint .                          clean (incl. tests-e2e/, both playwright configs)
  lint-banned-claims: OK (8 claims checked across 2 root(s))
  lint-no-emoji: OK (2 root(s) scanned)
  tsc x3                            clean (KvLike.delete now required)
  Test Files  56 passed (56)   Tests  805 passed (805)   // 804 + P9-1

npm run test:a11y                   65 passed (~50s)     // green AFTER P12-3 fix
npm run test:e2e                    13 passed (~35s)
  journey-1-merge                    1 test  — merged 18-2=16 w/ receipts; frontier+4 views;
                                               store checklist >=44px + print; only k8p_sid
  journey-2-safety-intercept         2 tests — banner above views/cards/ledgers (y-order +
                                               section order + hit test); FXM-GLUE-06 absent
                                               from every option; §1.5 note names it; feasible
                                               alternatives w/ offers provenance; P12-3 regression
  journey-3-capsule                  3 tests — "0 to 1" range; assumptions w/ [user input]/
                                               [model constant]; uniform +1 reserve note;
                                               §1.5 dress-code-off state; buy_now + waiting_
                                               reasonable branches w/ price-history provenance
  overlay-interstitial (P9-2)        2 tests — 15 routes, 0 dialogs, 0 large fixed/sticky,
                                               protected content hit-testable
  congruence-evidence                5 tests — 24 internal links OK; 3 external links all
                                               fixture-namespace; 0 placeholder/emoji; provenance
                                               visible; footer trust surfaces 200; tap targets >=44

npx vitest run tests-workers/monetization-routes.test.ts   10 passed (P9-1 in sweep)
npx @lhci/cli autorun               all assertions pass (3 URLs x 3 runs)
                                    assertion-results.json == []
npx lighthouse (mobile, live pair — archived docs/release/artifacts/)
  /            => 100/98/96/100, CLS .0013, LCP 923ms
  /plan seeded => 99/100/96/63*, CLS .0134, LCP 1683ms   (*noindex by design)
npx wrangler deploy --dry-run       bundle + all 5 bindings resolve
```

Failures proving the new tests bite: journey 2 first run caught the
Secure-cookie/APIRequestContext gap (fixed in-spec) and then the
provenance-line multi-source collapse (assertion corrected to the actual
§1.4 rendering contract); the P12-3 regression failed against the
pre-fix stylesheet (white-on-white measured via computed styles) and
passes after. Evidence per congruence line: docs/release/congruence-gate.md.

## 7. Known gaps and risks

- **RELEASE BLOCKED — eight open launch items** with owners in
  `docs/release/launch-checklist.md`: brand/domain/legal entity; human AT
  pass; real-device/cross-browser; credentials + licensing sign-offs;
  LHCI_ENABLED; browser suites flip to required; P12-1/P12-2 (journey-3
  outcomes); live Turnstile/Stripe. Items 1–3 restate the standing
  blockers; 7 is new from this gate.
- **P12-1/P12-2**: §6 journey 3's cost-per-wear and buy-now-vs-wait are
  not user-reachable; E2E covers the API half honestly. Small additive
  work or an explicit scope-guardian re-scope — nothing else closes it.
- **No real deploy happened** — runbook §1–3 are unexecuted with real
  credentials; the dry-run record says exactly what ran. First real
  deploy must be attended.
- **Journey 2's seeded server** adds ~30–45s and a spawned process; on
  retry-after-failure the worker restart re-runs its beforeAll (port 8788
  rebind can race a dying server — visible failure, not silent).
- **Sandbox screenshot artifact**: the offline banner appears in some
  captures (sandbox network notifier; documented in the gate doc);
  retaken evidence minimizes but cannot fully eliminate it here.
- **Congruence lines 1 and 9** carry real-phone confirmation riders
  (launch item 3); line 15 is BLOCKED-ENV entirely.
- **heading-order advisory + D2 white-ring design review** remain open
  with design-director (Phase 11 §12); not release-blocking (moderate
  advisory), listed for completeness.
- **Chromium-only**: everything browser-proven here is Chromium 141;
  WebKit/Gecko behavior is untested by any suite yet.

## 8. Instructions to next agent

**To the repository owner — this is the final phase handoff; what remains
is yours, not an agent's.** The build is complete to its fixture-beta
scope and every automated gate is green, but the beta is NOT releasable
today. To launch:

1. Work `docs/release/launch-checklist.md` top to bottom — every item is
   blocking, each names its owner and its clearing condition. The three
   that only you can start: brand/domain/legal entity (item 1), the
   human-AT session (item 2, 8-item script in docs/a11y/audit-phase-11.md
   §10), and the real-device/cross-browser pass (item 3, plan in
   congruence-gate.md line 15).
2. For item 7 (P12-1/P12-2), dispatch frontend-engineer + backend-api
   through the orchestrator with scope-guardian review — OR record a
   scope decision. Do not ship the §6 journey-3 promise half-met without
   a written decision; that is exactly the drift §0 exists to stop.
3. Repo-admin actions: set `LHCI_ENABLED=true`; after the first green
   `browser-suites` runs, remove its `continue-on-error` and require it.
4. Deploy by `docs/release/runbook.md` only, in order; verify with its §4
   steps; know the rollback section before you need it. Then re-run the
   congruence gate against the REAL staging URL on a real phone and
   desktop as a first-time user — every line must pass there; any failure
   blocks release. That final walk cannot be delegated to this
   environment; it is the one thing this phase could not do for you.
5. MUST NOT: weaken `expectNoBlockingViolations` or the E2E assertions to
   get a green run; mount anything that renders above a `safety_warning`
   section; flip any `liveSources` flag without its licensing ruling
   (the suite will fail the build — that is by design); put the brand
   name anywhere but `config/brand.ts`.
6. MUST NOT ASSUME: that local suite greens equal CI greens (item 6
   exists for that); that Chromium results transfer to Safari/Firefox
   (line 15); that the fixture Turnstile protects anything real (item 8);
   that /plan's Lighthouse SEO 0.63 is a defect (noindex by design).

---

## Erratum (2026-08-04, correction round — P12-1/P12-2 closed)

Appended by frontend-engineer under the Phase 12 correction brief
(orchestrator-dispatched per §8 item 2 / launch-checklist item 7 option
(a)). Everything above is the original record and is unchanged.

**What changed.** The two §6 journey-3 outcome gaps this phase recorded
(P12-1 cost-per-wear surfaced nowhere; P12-2 buy-now-vs-wait unreachable
because the shipped form sent `timing: null`) are closed:

- `src/api/contracts.ts` — new `CapsuleCostPerWearBody` (request:
  user-entered `priceCents` + `seasonWearDays`, never persisted, §1.7) and
  `CapsuleCostPerWear` (per-line response node with `provenanceIds`);
  `CapsuleBody.costPerWear` and `CapsuleData.lines[].costPerWear` added.
  The gap WAS in the response contract: the engine computed cost-per-wear
  (Phase 4) but no API shape carried it — this erratum documents that
  sanctioned `src/api/**` change.
- `src/api/routes.ts` `handleCapsule` — validates the optional inputs,
  computes the wears basis (season wear days over usable existing + units
  to buy; both bounds provably >= 1 piece) through the engine helpers
  `projectedWearsPerUnit`/`costPerWearCents` verbatim, ships it as labeled
  `[user input]`/`[model constant]` assumptions on the node, provenance =
  the user:capsule-input record. No number invented.
- `src/ui/screens/capsule.ts` — optional "Price and timing" fieldset
  (5 labeled fields: price in dollars, season wear days, days until
  needed, delivery estimate, UPC with hint); cost-per-wear renders on the
  category card as a Sum Rule ledger (direction §5: price + projected-wears
  operands above a single rule, mono money result beneath, whole-cent
  display of the engine's 2 dp cents) through `renderFact` as a
  `withLine: false` member under the card's shared §1.4 provenance line
  (render-guard grouping contract); guard refusal renders the suppression
  reason, never the money. The existing timing renderer (deadline section)
  is now user-reachable.
- `src/ui/server.ts` `/capsule` POST case — dollars -> whole cents;
  `costPerWear`/`timing` sent only when their inputs are complete; UPC
  forwarded only when it matches the client-side pattern. SCOPE NOTE: this
  file was not on the correction brief's file list, but the hardcoded
  `timing: null` lived here — P12-2 is unfixable without it; the change is
  confined to this one case.
- `src/ui/copy/en.ts` `CAPSULE` — new labels/hints/value formatters
  (voice §10; no banned claims; hints state exactly which inputs produce
  which outputs and that no comparison is made without history).
- Tests: `tests/api-policy.test.ts` (+2: `CapsuleCostPerWear` classified
  as a provenance carrier, `CapsuleCostPerWearBody` as request body;
  hand-computed contract tests incl. null-without-input and 400 on
  invalid); `tests/ui-screens.test.ts` (+5: form fields, Sum Rule money
  render with visible wears basis, timing verdict render, no-price state
  invents nothing, guard-refusal on the money fact);
  `tests-e2e/journey-3-capsule.spec.ts` (+1 UI-driven test covering
  cost-per-wear and BOTH observed-median timing branches through the
  shipped form; API test extended with the `costPerWear` response
  contract). Evidence capture:
  `docs/release/screenshots/capsule-cost-per-wear-mobile.png`.

**Superseded statements above:** decision 3's journey-3 "honest boundary"
scoping, §6's journey-3 PARTIAL note, and the §7 P12-1/P12-2 bullet.
`docs/release/congruence-gate.md` journey 3 is now PASS;
`docs/release/launch-checklist.md` item 7 is DISCHARGED (the other seven
items stand — the release remains blocked on them).

**Suite tails after the correction (this environment, all exit 0):**

```
npm run verify      Test Files 56 passed (56)  Tests 812 passed (812)   // was 805
npm run test:a11y   65 passed                                           // unchanged; capsule re-axed
npm run test:e2e    14 passed                                           // was 13
```

---

## Erratum 2 (2026-08-04, correction round 2 — J1 store-grouped checklist, P12-4)

Appended by frontend-engineer under the Phase 12 correction brief.
Everything above (including erratum 1) is the original record, unchanged.

**Finding (congruence-gate J1 bar).** §6 journey 1 requires a "printable
store-grouped checklist". The shipped printable checklist was a flat
list: `ChecklistLine` (src/api/contracts.ts) carried no retailer
attribution, and store grouping existed only on the basket expanded view.
The J1 row recorded PASS on the strength of the store-MODE checklist —
the store-GROUPED half of the bar was not genuinely met. Recorded as
finding P12-4 in `docs/release/congruence-gate.md` and closed end to end:

- `src/api/contracts.ts` — `ChecklistLine.retailerSlug` (nullable) + new
  `ChecklistGrouping` carrier (`view: "lowest_cost"`, trip-ordered
  `retailerSlugs`, `provenanceIds`); `ChecklistData.grouping` nullable.
- `src/api/routes.ts` — the Pareto basket computation is extracted into
  `computeSessionBasket` (ONE code path; the pipeline order the P4-3
  byte-identity test recomputes is untouched and `handleBasket` behavior
  is unchanged — the workers byte-identity test still passes verbatim).
  `handleChecklist` reads store assignments from the lowest-cost frontier
  view when the plan has required units to buy: labeled as that view,
  never "optimal"/"recommended"; the grouping ships only when EVERY cited
  provenance record resolves (§1.4); offer/recall/holiday `SourceStatus`
  rides on the envelope so freshness stays visible where the grouping
  renders; `BasketSearchSpaceError` degrades to an ungrouped checklist
  instead of a broken one; no basket result (nothing to buy, infeasible,
  over-cap) -> `grouping: null` and the honest ungrouped state (§1.5).
- `src/ui/screens/checklist.ts` — one `.checklist-store-group` section
  per trip in the option's deterministic order (h2 "retailer trip"), an
  honest "No store trip" group for optional/inventory-covered lines, the
  grouping-basis label citing the "Lowest cost" view label + its §1.4
  provenance line (guardFact/provenanceLine, the plan.ts aggregate
  pattern); a guard-refused grouping renders its suppression reason and
  falls back to the flat list; `grouping: null` renders the ungrouped
  note. Check rows, checkbox ids, localStorage keys, >=44px targets, the
  progress bar, and the `[data-checklist]` container app.js targets are
  unchanged.
- `src/ui/styles.ts` — `.checklist-store-group`/`.checklist-store`/
  `.checklist-grouping` styles; print rules keep groups intact
  (`break-inside: avoid`; heading `break-after: avoid`); the check-strike
  selectors now include `.check-row.checked` (the screen's doc comment
  promised the strike; the CSS only covered `.list-row`).
- `src/ui/copy/en.ts` — `VIEW_LOWEST_COST` shared constant (the basket
  tab label and the checklist basis label can never drift) + CHECKLIST
  `storeTrip`/`groupedBy`/`noStoreHeading`/`noStoreNote`/`ungrouped`.
  No banned claims; no single-answer vocabulary (SINGLE_ANSWER_WORDS
  asserted false on the grouped render).
- Tests: `tests/api-policy.test.ts` (`ChecklistGrouping` classified as a
  provenance carrier); `tests/ui-screens.test.ts` +4 (grouped visit
  order + basis label + provenance line; no-store group; guard-refused
  grouping falls back with the reason and no store headings; ungrouped
  honest state); `tests/monetization-route-scan.test.ts` fixture extended
  so the §1.2 scan covers the grouped layout; `tests-a11y/snapshots.ts`
  checklist fixture now grouped (new markup re-axed);
  `tests-e2e/journey-1-merge.spec.ts` asserts trip headings, the basis
  label, and check rows inside their group on the printable checklist.
- Docs: `docs/release/congruence-gate.md` J1 row updated (bar genuinely
  met), finding P12-4 added to the ledger, correction-round-2 note in the
  verdict section.

**Scope notes.** `src/ui/styles.ts`, `tests/monetization-route-scan.test.ts`,
and `tests-a11y/snapshots.ts` were not on the correction brief's file
list: the styles are required for the grouped/print rendering the brief
mandates, and the two test files construct `ChecklistData` literals that
fail typecheck (and would leave the new markup unscanned/un-axed) without
the new required fields. No other file changed.

**Suite tails after this correction (this environment, all exit 0):**

```
npm run verify      Test Files 56 passed (56)  Tests 816 passed (816)   // was 812
npm run test:e2e    14 passed                                          // J1 extended in place
npm run test:a11y   65 passed                                          // checklist re-axed grouped
```
