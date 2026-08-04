# Accessibility audit — Phase 11 (accessibility-qa)

Date: 2026-08-04. WCAG target: 2.2 AA.
App under test: the fixture-mode Worker served by `npx wrangler dev` (local
D1/KV/R2, migrations 0001–0008 applied) plus hand-built state snapshots
rendered through the real screen functions (`tests-a11y/snapshots.ts`).

Tooling (exact versions):

| Tool | Version | Role |
|---|---|---|
| axe-core (via @axe-core/playwright 4.12.1) | 4.12.1 | automated WCAG scan, every screen × state |
| @playwright/test | 1.62.1 | browser driver (keyboard paths, reduced motion, DOM checks) |
| Chromium | 141.0.7390.37 (`/opt/pw-browsers/chromium`) | the one engine available in this environment |
| Lighthouse | 13.4.1 (via @lhci/cli 0.15.x and `npx lighthouse`) | first LHCI execution (gate finding P7-4) |
| wrangler dev | 4.x (repo pin) | live app, fixture mode |

Run entry point: `npm run test:a11y` (Playwright; deliberately OUTSIDE
`npm run verify` so verify stays hermetic). Suite: 65 tests across
`tests-a11y/{axe,keyboard,contrast,forms-motion}.spec.ts` — **65/65 passing**
after the fixes in §4. `npm run verify` remains green at the Phase 10
baseline (804 tests / 56 files).

**Honesty note:** no real screen reader (NVDA/JAWS/VoiceOver/TalkBack)
exists in this environment. §9 is a semantic/ARIA/accessible-name analysis
of the rendered DOM — the same bytes a browser hands to an AT — explicitly
labeled as such. §10 is the checklist a human must run with real AT before
launch. Nothing in §9 claims to be a recorded AT session.

---

## 1. Acceptance bar and result

- **Zero axe violations at serious/critical severity, no waivers: MET.**
  44 page×state scans (19 anonymous/empty live pages, 9 journey-driven live
  states, 16 snapshot states) return zero serious/critical violations.
- Three defects at serious severity were FOUND during this audit and fixed
  in `src/ui/**` (§4); the suite re-run proves them closed.
- Remaining advisories: one axe rule family (`heading-order`, moderate,
  BEST-PRACTICE tag — not a WCAG 2.2 AA failure), 8 occurrences on 5
  surfaces, deferred with rationale (§12).

## 2. Coverage: screen × state → how it was driven

Live = real wrangler-dev HTTP journey. Snapshot = real renderer + labeled
synthetic envelope (states unreachable over HTTP: injected stale clocks,
guard refusals, entitlements, loading, rate-limited).

| Screen | default | empty | error | stale | recalled | review | entitled |
|---|---|---|---|---|---|---|---|
| Home | live | — (static) | — | — | — | — | — |
| Intake (paste/manual/upload) | live ×3 | live (forms) | live 404 + snapshot plan-error pattern | — | — | live (paste → mandatory review incl. unparsed-line refusal) | — |
| Plan | live (seeded 2-child) | live | snapshot (`plan-error`, `plan-rate-limited`) | snapshot (`plan-partial` guard refusal + held-back total) | — | — | — |
| Checklist | live + live store-mode + snapshots ×2 | live | — | via envelope machinery | — | — | — |
| Basket | live (`?days=6`, `?view=lowest-cost`) + snapshot ready | live | snapshot `basket-infeasible` | snapshot `basket-stale` (dated badge) | snapshot `basket-recalled` (banner above all) | — | — |
| Capsule | live results (uniform ON) | live form | live server-side 422 (role=alert) | — | — | — | — |
| Trends | live (seeded) | live | — | snapshots (insufficient default + trending 3-of-5) | — | — | — |
| Item detail | live fixture slug | live unknown slug | — | — | (recall-check UI path exercised via snapshot gallery banner) | — | — |
| Safety center | live | live no-recall-match | — | — | **live intercept** `?upc=FIXTURE-UPC-0007` | — | — |
| Budget | live (seeded) | live | — | — | — | — | — |
| Deals | live (seeded) | live (no session) | — | — | — | — | — |
| Account | live + live with subscription | live | — | — | — | — | snapshot `account-entitled` (Season Pass active) |
| Methodology | live | — | — | — | — | — | — |
| Provider status | live | — | — | snapshot `status-stale` | — | — | — |
| 404 | live | — | live | — | — | — | — |
| Component gallery (all 11 badges, 3 banners, ledger, notices, skeleton) | snapshot | — | — | — | — | — | — |

## 3. Axe results

- **Blocking (serious/critical): 0** across all 44 scans (asserted by
  `tests-a11y/axe.spec.ts`; the assertion prints full violation JSON on any
  regression).
- Advisory findings (moderate, logged by the suite on every run):

| Rule | Impact | Where | Disposition |
|---|---|---|---|
| `heading-order` | moderate (best-practice tag) | home step cards (`.card > h3`), trends cards (h3), capsule card header (h3), safety-intercept recall cards (`.banner-body > .card > h3`), basket exclusion headings (h3) | Deferred (§12): h1 → h3 skips. Fixing means re-leveling headings whose type styles are pinned to the direction §3 scale (h2 = `title` 24px vs h3 = `heading` 20px), i.e. a visible design change — routed to design-director + frontend-engineer instead of patched blind. Not a WCAG 2.2 AA failure (1.3.1 requires programmatic structure, which exists; level-skipping is advisory). |
| `region` | moderate | fixture ribbon outside all landmarks | **FIXED** (§4, D5) — named `<aside>` landmark. Zero occurrences in the final run. |

## 4. Defects found, fixed, re-verified

Every fix is inside `src/ui/**` (sanctioned), keeps tokens untouched (the
direction-pin test `tests/ui-tokens.test.ts` is unchanged and green), and is
re-verified by both `npm run verify` (804/804) and `npm run test:a11y`
(65/65).

| ID | Severity | Defect | Fix (file:line region) |
|---|---|---|---|
| D1 | serious (axe `list`; WCAG 1.3.1) | `renderFact()` appends the §1.4 provenance `<p>` (and renders refusals as `<div>`) as SIBLINGS of the `<li>` it wraps — so plan `<ol>`, checklist/household/account `<ul>`, and the item-detail recall list shipped invalid non-`<li>` children on every ready render, and any guard refusal landed a `<div>` directly in a list. Screen readers mis-announce list size/structure. | `src/ui/screens/plan.ts` (planLine), `src/ui/screens/checklist.ts` (checkRow), `src/ui/screens/household.ts` (inventory rows), `src/ui/screens/account.ts` (alerts rows), `src/ui/screens/item.ts` (recall matches): the `<li>` now wraps the guard call; row markup became a `<div>` inside it. `src/ui/styles.ts`: new `.fact-row` rule moves the Rule-Blue separator to the wrapper (visual grammar unchanged; `data-line-key` stays on the element `public/assets/app.js` targets via `closest()`). |
| D2 | serious (WCAG 2.4.7 + 1.4.11) | The 2px Chalk Green focus ring measures **1.02:1 on Recall Red** and **1.16:1 on Policy Violet** — links inside recall/restriction banners had an effectively invisible focus indicator. | `src/ui/styles.ts`: `.banner-recall :focus-visible, .banner-restricted :focus-visible { outline-color: #FFFFFF }` (6.54:1 / 7.45:1; ring geometry unchanged). **Flagged for design-director review** — deviation from a literal reading of direction §11 ("2px Chalk Green outline"); no token changed. |
| D3 | serious (axe `color-contrast`, found LIVE on the safety intercept) | Provenance lines rendered inside the solid recall banner kept their Graphite color: **1.5:1 on Recall Red**. | `src/ui/styles.ts`: `.banner-recall .provenance-line, .banner-restricted .provenance-line { color: #FFFFFF }`. The §1.4 line stays a fully visible designed element. |
| D4 | moderate (WCAG 3.3.2/3.3.3) | The safety UPC input enforced `pattern="[0-9]{8,14}"` with no stated format — constraint failure gave users no format description. | `src/ui/screens/safety.ts`: `UPC_DIGITS` constant now feeds BOTH the pattern and a visible hint wired via `aria-describedby="upc-hint"`; hint string added as `SAFETY.checkHint(min,max)` in `src/ui/copy/en.ts` (numerals interpolate from the constant — none typed into copy). |
| D5 | moderate (axe `region`) | The fixture-mode ribbon sat outside every landmark. | `src/ui/components/chrome.ts`: ribbon wrapped in `<aside aria-label>` (label string `COMMON.fixtureNoticeLabel`); `role="note"` retained on the ribbon itself. |
| D6 | blocker for P7-4 execution (tooling, not WCAG) | `lighthouserc.json` set `settings.preset: "mobile"` — not a valid Lighthouse preset (choices: perf/experimental/desktop); every collect run exited 1, so the "wired" CI budgets could never have executed. | `lighthouserc.json`: invalid key removed with an explanatory `_comment`; mobile emulation + throttling are Lighthouse's defaults, so the budget intent is unchanged. First real execution now green (§11). |

Re-verification evidence: final `npm run test:a11y` run 65/65 with zero
blocking axe findings (log archived in the run output); `npm run verify`
804/804.

## 5. Keyboard-path maps (asserted by `tests-a11y/keyboard.spec.ts`)

Every stop below was walked with real Tab keypresses; at every stop the
suite asserts the computed outline is the 2px solid ring (Chalk Green
`rgb(27,107,84)`, or white inside safety banners per D2). Cycle detection is
by element identity, so a repeated stop = keyboard trap = test failure.

**Global:** first Tab on every page reveals the skip link ("Skip to main
content"), on-screen while focused, Enter jumps to `#main`. No positive
tabindex anywhere (also pinned by the Phase 7 vitest suite). No inline
`onclick`.

**Journey 1 — two-child merge (keyboard only):**
`/intake?tab=manual` → skip link → wordmark → primary nav (5) → intake tabs
(paste/manual/upload) → `#manual-product` → `#manual-quantity` →
`#manual-unit` → `#manual-color` → `#manual-ruling` → `#manual-optionality`
→ submit — order asserted strictly increasing (visual order = DOM order; no
tabindex reordering). Select operated with ArrowDown/ArrowUp; quantities
typed; submit via Enter. Review screen: `#item-0-include` checkbox toggled
with Space (pre-checked for a clean parse); child selector `#confirm-member`
operated with ArrowDown ("New child (2)" for the second pass); confirm via
Enter → 303 → `/plan`. Plan: Net-Required Stack rendered; the per-line
receipt `<details><summary>` is focusable and opens with Enter (per-child
breakdown announced from the expanded receipt). Inventory audit via
`/household` form (keyboard), then `/plan` shows the "Already at home"
subtraction. Full-page walk: 300-step bound, >10 unique stops, no trap.

**Journey 2 — safety intercept (keyboard only):**
`/safety` → walk to `#upc` (labeled; `aria-describedby="upc-hint"` resolves
to the visible digits hint). Typing 8 digits + Enter submits the GET form →
no-match state (explicit "not a safety endorsement" copy). Recalled state
(`/safety?upc=FIXTURE-UPC-0007`, the fixture recall's UPC): the
`role="alert"` recall banner renders ABOVE the check form (bounding-box
order asserted), carries icon + "Recalled" text label (never color alone),
has `animation: none` (direction §8: safety never waits for a transition),
and the CPSC link inside the banner takes focus with the WHITE ring
(D2 fix) at 6.54:1.

**Journey 3 — uniform + capsule (keyboard only):**
`/capsule` → `#cap-category` → `#cap-climate` → `#cap-wash` →
`#cap-reserve` → `#cap-existing` → `#cap-uniform` → submit; strict order
asserted. Uniform checkbox checked with Space; Enter submits. Results:
Eraser-Pink module headers render with Ink text (6.59:1), ranges (never a
single number), visible provenance line; results page re-walked with no
trap.

Fixture-data caveat: the fixture recall UPCs are non-numeric strings
(`FIXTURE-UPC-0007`), so the browser's pattern validation (correctly)
refuses them in the form — the recalled state is driven by URL for the
intercept assertion, and the form path is proven with a numeric UPC. With
real CPSC data (numeric GTINs) the form path covers both. Recorded for
release-qa; not a UI defect.

## 6. Contrast — measured, not eyeballed

Computed by `tests-a11y/contrast.spec.ts` from the pinned tokens
(`src/ui/tokens.ts`) using the WCAG 2.2 contrast-ratio definition
(`tests-a11y/color-math.ts`). The suite fails if any pair drops below its
threshold. Every badge and status color in the direction doc is covered.

| Foreground | Background | Where | Kind | Ratio | Required | Verdict |
|---|---|---|---|---|---|---|
| `#25302A` | `#F7F8F2` | body text on the page | text | 12.81:1 | 4.5:1 | pass |
| `#25302A` | `#FFFFFF` | text on cards/sheets | text | 13.68:1 | 4.5:1 | pass |
| `#5C6660` | `#F7F8F2` | secondary text (.muted, provenance, hints) | text | 5.58:1 | 4.5:1 | pass |
| `#5C6660` | `#FFFFFF` | secondary text + placeholders in cards/controls | text | 5.96:1 | 4.5:1 | pass |
| `#1B6B54` | `#F7F8F2` | links on the page | text | 6.00:1 | 4.5:1 | pass |
| `#1B6B54` | `#FFFFFF` | links / nav-active / tabs on surfaces | text | 6.41:1 | 4.5:1 | pass |
| `#FFFFFF` | `#1B6B54` | primary button label | text | 6.41:1 | 4.5:1 | pass |
| `#FFFFFF` | `#14523F` | primary button hover label | text | 9.10:1 | 4.5:1 | pass |
| `#25302A` | `#E5A49B` | capsule header title on Eraser Pink tint | text | 6.59:1 | 4.5:1 | pass |
| `#F7F8F2` | `#25302A` | badge **required** (fill) | text | 12.81:1 | 4.5:1 | pass |
| `#1B6B54` | `#FFFFFF` | badge **useful** (outline) | text | 6.41:1 | 4.5:1 | pass |
| `#5C6660` | `#FFFFFF` | badges **optional / out-of-stock / insufficient-evidence** | text | 5.96:1 | 4.5:1 | pass |
| `#2C5F9E` | `#FFFFFF` | badges **trending / cooling** (Signal Blue) | text | 6.49:1 | 4.5:1 | pass |
| `#6E5527` | `#F2E8D8` | badge **sponsored** + fixture ribbon (Kraft on tint) | text | 5.79:1 | 4.5:1 | pass |
| `#FFFFFF` | `#B3261E` | badge **recalled** + recall banner text/links | text | 6.54:1 | 4.5:1 | pass |
| `#B3261E` | `#FFFFFF` | inverse recalled badge inside the banner | text | 6.54:1 | 4.5:1 | pass |
| `#FFFFFF` | `#5B4B8A` | badge **school-restricted** + restriction banner | text | 7.45:1 | 4.5:1 | pass |
| `#5B4B8A` | `#FFFFFF` | inverse restricted badge inside the banner | text | 7.45:1 | 4.5:1 | pass |
| `#8A5B00` | `#FBEFD2` | badge **stale** + suppression notice + offline banner | text | 5.14:1 | 4.5:1 | pass |
| `#2C5F9E` | `#F7F8F2` | review-needs / trend text on the page | text | 6.07:1 | 4.5:1 | pass |
| `#B3261E` | `#F7F8F2` | recall text directly on the page (defense-in-depth) | text | 6.12:1 | 4.5:1 | pass |
| `#1B6B54` | `#F7F8F2` | **focus ring** on page background | non-text | 6.00:1 | 3:1 | pass |
| `#1B6B54` | `#FFFFFF` | **focus ring** on cards/header/footer | non-text | 6.41:1 | 3:1 | pass |
| `#1B6B54` | `#FBEFD2` | **focus ring** on stale-tint chrome | non-text | 5.61:1 | 3:1 | pass |
| `#1B6B54` | `#F2E8D8` | **focus ring** on kraft-tint chrome | non-text | 5.28:1 | 3:1 | pass |
| `#FFFFFF` | `#B3261E` | **focus ring** inside the recall banner (D2 fix) | non-text | 6.54:1 | 3:1 | pass |
| `#FFFFFF` | `#5B4B8A` | **focus ring** inside the restriction banner (D2 fix) | non-text | 7.45:1 | 3:1 | pass |
| `#5C6660` | `#FFFFFF` | input/select/textarea borders | non-text | 5.96:1 | 3:1 | pass |
| `#1B6B54` | `#FFFFFF` | checkbox accent color | non-text | 6.41:1 | 3:1 | pass |
| `#8A5B00` | `#FBEFD2` | dashed stale/suppression chip borders | non-text | 5.14:1 | 3:1 | pass |
| `#6E5527` | `#F2E8D8` | sponsored ticket-notch border | non-text | 5.79:1 | 3:1 | pass |
| `#2C5F9E` | `#FFFFFF` | review-needs left indicator | non-text | 6.49:1 | 3:1 | pass |
| `#25302A` | `#F7F8F2` | sum rule / double rule | non-text | 12.81:1 | 3:1 | pass |

Pre-fix failing pairs (now impossible in the codebase): Chalk Green ring on
Recall Red 1.02:1, on Policy Violet 1.16:1 (D2); Graphite provenance on
Recall Red ≈1.5:1 (D3).

Documented exemptions (asserted as exempt-and-non-semantic by the suite):
Rule Blue `#A7C4DE` on paper = 1.70:1 — decorative loose-leaf texture only
(direction §1: "never text, never icons, never a status"); the test pins
that no `.control` or `.button-*` boundary uses it. The `fieldset` border
also uses Rule Blue: decorative grouping, with meaning carried by the
`<legend>` + labels (WCAG 1.4.11 does not require contrast for boundaries
that are not needed to identify the control). Card borders
(20% Graphite) are likewise decorative container edges.

## 7. Eraser Pink vs Recall Red under color-vision deficiency

Simulation: **Machado, Oliveira & Fernandes, "A Physiologically-based Model
for Simulation of Color Vision Deficiency", IEEE TVCG 15(6), 2009 —
published severity-1.0 matrices** for protanopia, deuteranopia and
tritanopia, applied in linearized sRGB (constants reproduced in
`tests-a11y/color-math.ts`).

| Vision | Eraser Pink renders as | Recall Red renders as | Luminance contrast | deltaE (CIE76) |
|---|---|---|---|---|
| typical | `#E5A49B` | `#B3261E` | 3.15:1 | 53.3 |
| protanopia | `#B2AC9A` | `#534A1B` | 3.92:1 | 43.3 |
| deuteranopia | `#C1B99A` | `#756916` | 2.82:1 | 41.8 |
| tritanopia | `#F39CA2` | `#C60026` | 2.94:1 | 54.4 |

Reading: the HUES do converge under red-green CVD (the direction §13.4
risk is real — both drift toward olive/khaki under deuteranopia), but the
pair never approaches sameness: worst-case lightness separation is 2.82:1
(deuteranopia) with deltaE ≈ 42 — pink stays a light background tint, Recall
Red stays a dark fill. Those floors are convergence measurements, not AA
thresholds; **the normative guarantee is structural (WCAG 1.4.1)** and is
asserted against the generated CSS itself:

- `--color-accent` appears in exactly ONE rule: `.capsule-card-header`
  background. It is never a text color, never a chip, never a status.
- `--status-recall` appears only in `.banner-recall` / `.badge-recalled`
  safety chrome, where the badge component makes icon + text label
  mandatory by construction (throws without them) and banners carry
  `role="alert"` + icon + label.
- Therefore no screen exists where pink-vs-red discrimination carries
  meaning: the two can never occupy the same role, and every red surface
  self-identifies in text. Confirmed live on the capsule (pink headers) and
  safety intercept (red banner) pages.

## 8. Forms, errors, motion

- **Labeling:** every `input`/`select`/`textarea` on all 8 form-bearing live
  screens AND the generated per-item review controls has a programmatic
  label (`label[for]`, wrapping label, or aria-label); every
  `aria-describedby` token resolves to non-empty hint text. Asserted by
  `tests-a11y/forms-motion.spec.ts`.
- **Error identification:** client side, constraints are native +
  programmatic (`required`, `pattern`, min/max — announced by AT as
  invalid); server side, bypassing client validation (capsule
  `daysBetweenWashes=0` → 422) renders a `role="alert"` card whose copy
  states what went wrong and how to recover (voice §10). Rate-limited and
  generic error states use the same `role="alert"` cards (snapshot-scanned).
- **Motion:** the stylesheet's `@media (prefers-reduced-motion: reduce)`
  block collapses ALL animation/transition (`!important`); verified in a
  real reduced-motion context (skeleton pulse: `skeleton-pulse` → `none`).
  Recall banners have `animation: none` even WITHOUT reduced motion
  (direction §8). No autoplaying media, no `<marquee>`, no meta refresh.
  The check-strike falls under the global reduce rule (renders complete
  instantly).

## 9. Screen-reader semantic analysis — three critical journeys

**LABEL: this is a semantic/ARIA/accessible-name analysis of the rendered
DOM performed with browser tooling. It is NOT a screen-reader session; no
AT was available in this environment. §10 lists what a human must verify.**

### 9.1 Two-child merge

- Document: `<html lang="en">`, unique `<title>` per screen, one `<h1>`.
  Landmarks: skip link → (aside: data-source notice) → `banner` (header
  with "Primary" nav) → `main#main` → `contentinfo` (footer, "All pages"
  nav). Active nav link carries `aria-current="page"`.
- Manual intake: all six controls expose name/role/value via native
  elements + `<label for>`; the fieldset legend ("Add one item…") gives
  group context. The submit button's accessible name states the action.
- Review screen: each proposed item is a §1.4-guarded block — the include
  checkbox's label is "Looks right — keep it" / "Needs your attention"
  (state conveyed in the NAME, not by the blue border alone); original
  line, interpretation, and confidence are plain text; the provenance line
  is regular text content, readable in sequence. An unparseable line
  renders `role="note"` suppression text, not silence.
- Plan: requirement rows are an `<ol>` of `<li>` (valid after D1 — list
  size announced correctly). The Net-Required Stack reads in source order:
  "Required (both kids) 18 / Already at home − 5.5 / To buy 12.5 / To buy
  (whole units) 13" — the operator is the true minus U+2212, which AT reads
  as "minus". Per-line receipts are native `<details>/<summary>`
  (disclosure semantics for free); the expanded receipt lists "Child 1: 12,
  Child 2: 6" — children only ever named by ordinal (§1.7). Badges are
  text+icon spans inside the row, so "Required" is read with the item.
- Concern for human AT pass: the strikethrough check-off state on the
  checklist is visual (CSS `::after`) — the CHECKBOX state is the
  programmatic channel (checked/unchecked), which is correct, but a human
  should confirm the announced progress ("3 of 13" live region,
  `aria-live="polite"` on `#checklist-progress`) is not chatty on rapid
  check-offs.

### 9.2 Safety intercept

- The recall banner is `role="alert"` and is the FIRST content section
  (slots.ts enforces safety-first ordering at render time) — on page load
  an alert with the full recall text is announced immediately; nothing
  animates.
- Inside the banner: "Recalled" badge = icon (aria-hidden) + text; recall
  title as `<h3>` heading inside the card; hazard and remedy as
  "Hazard: …" / "Remedy: …" labeled sentences; the CPSC link's accessible
  name is the recall number (unique per recall); provenance line readable
  text (white, D3). The credit line names the U.S. Consumer Product Safety
  Commission.
- The UPC form: legend + label + format hint (aria-describedby). The
  no-match state renders the "not a safety endorsement" sentence as plain
  content — no false-assurance semantics.
- Concern for human AT pass: multiple `role="alert"` blocks on a recall
  list page (check + list sections) may double-announce on load in some
  AT/browser pairs — verify announcement behavior and whether the list
  section should be `role="region"` with the alert reserved for the check
  result.

### 9.3 Uniform + capsule

- The form is one fieldset with a legend; every control labeled; number
  inputs carry `inputmode="numeric"` + min/max. The uniform requirement is
  a real checkbox whose label states the policy consequence.
- Results: each category card's pink header contains an `<h3>` with icon
  (hidden) + text "School tops (Hot climate…)" — the tint is decoration on
  top of a normal heading. Ranges render as sentences ("between N and M"),
  assumptions as a labeled list ("[fixture assumption]" bases read aloud),
  and the no-confirmed-dress-code state is a `role="note"` suppression
  sentence — the §1.5 refusal is announced, not implied.
- Concern for human AT pass: h1 → h3 skip inside cards (§12 advisory)
  slightly flattens the rotor/heading map; confirm navigability.

## 10. Human AT verification checklist (before launch)

Blocking items for a real-AT pass (owner: release-qa to schedule; any
reader/browser pair from: NVDA+Firefox, JAWS+Chrome, VoiceOver+Safari
(macOS+iOS), TalkBack+Chrome (Android)):

1. Three journeys of §9 end-to-end by AT alone; record reader, browser,
   commands, and outcomes per the mandate (the §9 analysis predicts the
   outcomes; verify, don't assume).
2. Recall intercept: exactly what is announced on load, in what order, and
   whether double-announcement occurs (§9.2 concern).
3. Checklist live-region behavior during rapid check-offs (§9.1 concern).
4. `<details>` receipt announcement on the Net-Required Stack (summary
   text includes label + value — confirm it reads as one unit).
5. Forced-colors / High Contrast Mode on Windows: chip grammar (solid vs
   dashed vs dotted vs ticket-notch) is the designed non-color channel —
   confirm all four survive `forced-colors: active` (the CSS adds borders
   in that mode; the ticket-notch geometry was already flagged by Phase 7
   §7 for exactly this check).
6. 200% browser zoom + 320px-wide reflow (WCAG 1.4.10) spot pass on plan,
   basket (stacked cards below `md`), and the review screen.
7. Real mobile screen reader on the in-store checklist (store mode) —
   thumb-reach bar + 44px targets with TalkBack/VoiceOver gestures.
8. Speech input (Voice Control/Dragon): button names are long
   action-sentences by design ("Check this UPC against recalls") — confirm
   they remain speakable; visible label = accessible name (WCAG 2.5.3
   holds by construction: no aria-label overrides visible text anywhere in
   `src/ui`).

## 11. Lighthouse — first execution (gate finding P7-4)

Blocked-then-fixed: the committed `lighthouserc.json` was unrunnable
(D6, invalid `settings.preset: "mobile"`). After the one-key fix, mobile
emulation/throttling (Lighthouse defaults) apply.

`npx @lhci/cli autorun` over `npm run build` output (dist/), 3 runs per
URL, all budget assertions GREEN (medians shown):

| Page (dist) | Perf (≥0.90) | A11y (≥0.95) | Best-practices (≥0.95) | SEO (≥0.95) | CLS (<0.1) | LCP (<2500ms) |
|---|---|---|---|---|---|---|
| `/index.html` | 0.99 | 0.98 | 0.96 | 1.00 | 0.001 | 1666 |
| `/intake/index.html` | 1.00 | 1.00 | 0.96 | 1.00 | 0.002 | 921 |
| `/methodology/index.html` | 1.00 | 1.00 | 0.96 | 1.00 | 0.049 | 1355 |

`npx lighthouse` (13.4.1, mobile) against live wrangler dev:

| Page (live) | Perf | A11y | Best-practices | SEO | CLS | LCP |
|---|---|---|---|---|---|---|
| `/` | 0.99 | 0.98 | 0.96 | 1.00 | 0.001 | 1695ms |
| `/plan` (seeded session via cookie) | 1.00 | 1.00 | 0.96 | 0.63 | 0.014 | 927ms |

Non-1.00 explanations (none is a budget failure):

- A11y 0.98 on home = the `heading-order` advisory (§3/§12) — the only
  accessibility deduction Lighthouse finds anywhere.
- Best-practices 0.96 everywhere = one console error: `favicon.ico` 404 —
  the deliberately deferred brand-coupled icon set (Phase 7 handoff §7
  "manifest ships without icons"). Recorded for release-qa; not a11y.
- SEO 0.63 on `/plan` = `is-crawlable` fails because `/plan` is **noindex
  BY DESIGN** (Phase 8 route map: session-data screens never enter the
  index). The lighthouserc SEO budget applies to the indexable static
  pages, which score 1.00. Not a defect.
- CI wiring: the LHCI job still needs the `LHCI_ENABLED=true` repo variable
  (admin credentials absent here — unchanged from P7-4); with D6 fixed the
  job will actually execute when enabled. Sandbox note: this environment
  requires `--collect.settings.chromeFlags="--no-sandbox"` because the
  shell runs as root; CI runners as non-root need no flag, so it is NOT
  committed to lighthouserc.json.

## 12. Residual items (deferred, with owners)

1. **heading-order advisory** (8 occurrences / 5 surfaces, §3) — needs a
   design-level decision (h2-vs-h3 typography), routed to design-director +
   frontend-engineer. Not AA-blocking.
2. **Human AT checklist** (§10) — release-qa schedules before launch;
   §9 is analysis, not an AT recording.
3. **favicon 404 console error** (§11) — brand-coupled asset, deferred by
   design while the name is disposable.
4. **Fixture UPC vs numeric pattern** (§5 caveat) — resolves itself with
   real CPSC data; keep the pattern.
5. **Design-director review of D2** (white focus ring inside safety
   banners) — deviation note per direction §14 routing rule.
