# Design direction — K–8 back-to-school planning utility

Phase 6 deliverable. Direction only — no UI code. Frontend (Phase 7) implements
this as design tokens and components. The working name (config/brand.ts) is
disposable; nothing below depends on it (see "Brand-name independence").

All numerals inside example copy in this document are placeholders that
illustrate format and voice only. They are not data, not fixtures, and must
never ship as literals (CLAUDE.md: "Never invent a number").

---

## 0. Who this serves, and the stance

The user is a parent or guardian of one or more K–8 kids, in the July–August
crunch, often on a phone — in a store aisle, on a break at work, in a school
pickup line. They arrive with a paper list, a photo of a list, or a half-typed
list, and a real budget. They are interrupted constantly. They do not want a
magazine; they want the errand finished and the math shown.

The stance that follows from that:

- **A worksheet, not a storefront.** The product's surfaces borrow from the
  paper artifacts of this exact errand — the loose-leaf handout, the hand-ruled
  arithmetic, the receipt — because those artifacts already encode trust:
  numbers you can check, lines you can cross off.
- **Show the work.** The core promise (§0) is verified, deduplicated, budgeted
  math. The design's job is to make computation *visible and auditable*:
  every total sits on a rule, every fact carries its source line (§1.4).
- **Calm under load.** One-handed reach, glare-readable contrast, no urgency
  theatrics, no motion that competes with a recall warning.

---

## 1. Palette

Six named brand values. Derived from the physical school kit — loose-leaf
paper, blackboard, notebook rule lines, graphite, a pink rubber eraser —
not from a trend board.

| Token | Name | Hex | Role |
|---|---|---|---|
| `--color-ink` | Blackboard | `#25302A` | Primary text, icon strokes, the sum rule, wordmark. Near-black with a green cast (chalkboard, not carbon). |
| `--color-paper` | Loose-leaf | `#F7F8F2` | Page background. A cool paper white with a drop of green — deliberately not cream. |
| `--color-surface` | Ream | `#FFFFFF` | Cards, sheets, table surfaces raised off the page. |
| `--color-action` | Chalk Green | `#1B6B54` | Primary buttons, links, focus, selected states, savings deltas. The one saturated brand voice. |
| `--color-rule` | Rule Blue | `#A7C4DE` | Structural lines only: row rules, table dividers, the ruled-paper texture. Never text, never icons, never a status. |
| `--color-graphite` | Graphite | `#5C6660` | Secondary text, captions, placeholders, disabled states. |
| `--color-accent` | Eraser Pink | `#E5A49B` | Background tint accent only: clothing-capsule module headers, empty-state spot illustration, selection highlight wash. Never text, never below 24px areas, never a status. |

(That is six chromatic identities; Ream is a neutral surface, not an identity
color.)

A deliberate omission: real loose-leaf has a **red margin line**, and the first
instinct is to use it as a signature. We do not. Red is reserved exclusively
for recall/safety (§2). No decorative red anywhere, ever — a red line in this
product must always mean "stop and read this."

### Computed contrast (WCAG 2.1 ratios, rounded)

| Pair | Ratio | Verdict |
|---|---|---|
| Blackboard on Loose-leaf | 12.8:1 | AAA body text |
| Graphite on Loose-leaf | 5.6:1 | AA body text |
| White on Chalk Green | 6.4:1 | AA body text (buttons) |
| Blackboard on Eraser Pink tint | 6.6:1 | AA (tinted headers) |

Phase 7 must re-verify these with axe-core/tooling after tokens land; Rule
Blue is decorative and exempt from text contrast, but any *interactive*
boundary uses Graphite or Ink, not Rule Blue (3:1 non-text minimum).

---

## 2. Status colors — semantically distinct, never hue alone

Status colors are a separate family from the brand palette. None of them
reuse a brand hue. Every status is always expressed through **at least three
channels: icon + text label + chip style (fill/border shape)** — color is
reinforcement, never the message (WCAG 1.4.1; §4 Phase 6 constraint). All
statuses must survive Windows forced-colors mode via their borders and icons.

| Token | Name | Hex | Meaning | Typical surface |
|---|---|---|---|---|
| `--status-recall` | Recall Red | `#B3261E` | CPSC recall / safety review | Solid fill, white text (6.5:1) |
| `--status-restricted` | Policy Violet | `#5B4B8A` | School/dress-code restriction | Solid fill, white text (7.5:1) |
| `--status-stale` | Stale Amber | `#8A5B00` on tint `#FBEFD2` | Price/stock/list data older than threshold; suppression notices (§1.5) | Dashed border, amber-brown text (5.1:1 on tint) |
| `--status-stock` | Graphite | `#5C6660` | Out of stock / unavailable | Dashed border, graphite text |
| `--status-signal` | Signal Blue | `#2C5F9E` | Trend/evidence states (trending, cooling counts) | Outlined chip, blue text (6.1:1 on paper) |
| `--status-sponsored` | Kraft | `#6E5527` on tint `#F2E8D8` | Paid/sponsored units | Ticket-notch chip, kraft-ink text (5.8:1 on tint) |

Chip-style grammar (the non-color severity channel):

- **Solid fill** = blocking/safety (recalled, school-restricted). Cannot be
  visually confused with anything informational.
- **Dashed border** = availability/freshness problems (out of stock, stale).
  The dash literally reads as "provisional."
- **Solid 1.5px outline** = evidence/necessity information (required, useful,
  optional, trending, cooling, insufficient evidence).
- **Ticket notch** (a chip with two half-circle cutouts on the left edge, like a
  perforated price tag) = commercial content (sponsored). Sponsored can never
  borrow any other chip shape. Per §1.2, sponsored units additionally may
  never sit between the user and required items, safety warnings, corrections,
  price changes, assistance resources, or deadlines — that is a layout rule
  monetization-engineer enforces with a route-tree test in Phase 9.

---

## 3. Typography

Three faces, three jobs. All open-source (SIL OFL 1.1), all on Google Fonts,
self-hosted in production (no third-party font CDN calls — §1.7 posture).

| Role | Face | License | Why this one |
|---|---|---|---|
| Display | **Bricolage Grotesque** | SIL OFL 1.1 | Warm, slightly irregular grotesque with real personality at 24px+; reads "friendly workbook," not "fintech dashboard." Variable (weight + optical size). |
| Body / UI | **Atkinson Hyperlegible Next** (fallback: Atkinson Hyperlegible) | SIL OFL 1.1 | Designed by the Braille Institute for maximum character disambiguation. A parent squinting at a phone in aisle glare, a grandparent helping out, a kid reading over a shoulder — legibility is the mission here, and this face makes that a stated commitment, not an accident. |
| Utility / data | **Spline Sans Mono** | SIL OFL 1.1 | Every number the product computes — prices, quantities, pack math, dates, provenance lines — is set in mono. Fixed-width digits make ledger columns align without OpenType gymnastics, and the receipt-printer texture is native to this errand. |

`system-ui` appears only in the font-fallback stack, never as the design.

### Scale

Modular scale, ratio 1.25 from a 16px base, rounded to the 4px baseline grid.
Line heights are multiples of 4.

| Step | Face | Size/Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display-xl` | Bricolage | 40/44 | 800 | -0.02em | Page hero (one per page, max) |
| `display-l` | Bricolage | 32/36 | 700 | -0.015em | Section heads |
| `title` | Bricolage | 24/28 | 700 | -0.01em | Card/module titles |
| `heading` | Bricolage | 20/24 | 600 | -0.005em | Sub-modules, table titles |
| `body-l` | Atkinson | 18/28 | 400 | 0 | Lead paragraphs |
| `body` | Atkinson | 16/24 | 400 (700 emphasis) | 0 | Default UI text |
| `label` | Atkinson | 14/20 | 700 | +0.01em | Form labels, buttons |
| `overline` | Spline Mono | 12/16 | 500 | +0.06em, uppercase | Section eyebrows, table column heads |
| `data` | Spline Mono | 14/20 | 400 (500 for totals) | 0 | Prices, quantities, ledger rows |
| `data-s` | Spline Mono | 12/16 | 400 | +0.01em | Provenance lines, badge counts, timestamps |

Numerals inside body copy that represent computed facts get promoted to
`data` styling inline — the mono digits are the visual signal that "the system
computed this," which is the typographic arm of the signature element (§5).

---

## 4. Layout system

- **Grid:** 8px base grid; 4px sub-grid for type baselines and icon optics.
- **Spacing scale (px):** 4, 8, 12, 16, 24, 32, 48, 64, 96. Tokens
  `--space-1` … `--space-9` in that order. Nothing off-scale.
- **Radii:** `--radius-0: 0` (ledger blocks, comparison tables, anything
  carrying the sum rule — paper has corners), `--radius-1: 4px` (badges,
  chips, inputs — stamp-like, deliberately tight), `--radius-2: 8px` (buttons,
  cards), `--radius-3: 16px` (sheets, dialogs). No pill shapes.
- **Elevation:** paper prefers rules to shadows. Level 0: flat + 1px rules.
  Level 1 (card): `0 1px 2px rgba(37,48,42,0.08)` + 1px Graphite-20% border.
  Level 2 (overlay/sheet): `0 8px 24px rgba(37,48,42,0.16)`. There is no
  level 3.
- **Containers:** reading/flow column 640px; plan + capsule views 880px;
  basket-comparison and Pareto views 1120px; hard page max 1200px. Gutters
  16px below `md`, 24px at `md` and above.
- **Breakpoints:** `sm` 480px, `md` 768px, `lg` 1024px, `xl` 1280px.
  Mobile-first; the comparison table degrades to stacked per-retailer cards
  below `md` with the sum rule preserved per card.
- **Touch:** 44px minimum hit target; primary actions in thumb reach on mobile.

---

## 5. Signature element: the Sum Rule and the Net-Required Stack

**The one memorable thing:** every number this product computes sits on
hand-arithmetic ledger rules, exactly the way a parent would do the math in
the margin of the supply list.

Concrete spec (buildable by frontend-engineer without interpretation):

1. **The Sum Rule.** A computed subtotal always sits directly beneath a
   single rule: `border-top: 1px solid var(--color-ink)`, 8px padding above
   the total. A *final* total (plan grand total, per-retailer landed cost)
   additionally carries the accountant's double rule beneath it:
   1px Ink line, 3px gap, 2px Ink line, spanning only the numeric column's
   width — not the full container. Totals are `data` style, weight 500,
   right-aligned, decimal-aligned (mono makes this automatic).
2. **The Net-Required Stack.** The multi-child merge and inventory audit
   (§0 capability 2) renders literally as stacked subtraction, right-aligned
   in Spline Sans Mono, with the true minus sign (U+2212):

   ```
   Required (both kids)        48
   Already at home           − 19
   ─────────────────────────────
   To buy                      29
   ```

   Row 1 and 2 are `data` 400; the rule is the 1px Sum Rule; row 3 is
   `data` 500 in Ink. Tapping any operand expands the line-item receipt
   behind that number. This stack appears per merged item and once for the
   whole plan. (Counts above are placeholders.)
3. **Where it appears:** merged list summary, per-retailer basket columns
   (each column bottom carries its own double rule under landed cost),
   pack-size conversion chips ("2 × 24 ct = 48" set in `data-s`, the `=`
   result underlined with a 1px rule), and the budget bar.
4. **Where it never appears:** marketing prose, sponsored units, anything
   not actually computed by the engine. The rule is a certificate of
   computation — diluting it to decoration is a design regression.

Supporting motifs (secondary, used sparingly, never competing):

- **Numbered gutter:** requirement rows carry handout-style numbering
  ("1.", "2." in `data-s` Graphite) in a fixed 32px left gutter.
- **Check-strike:** acquiring/owning an item draws a single 2px Ink
  strikethrough left-to-right across the item name — crossing it off the
  list — with the row dropping to Graphite. Never a green fill; the strike
  *is* the state.
- **Ruled rows:** list rows separate with 1px Rule Blue lines (the
  loose-leaf texture), on the 8px grid.

Why this passes the swappability test: the signature is the product's core
claim — net-required math and landed-cost comparison — made visible. A
recipe app, a news site, or a generic budget tool has no "required minus
owned" subtraction and no per-retailer double-ruled landed cost to hang
this on.

---

## 6. Badge system

Every badge = icon (Lucide) + text label + color + chip style. No badge ever
communicates by color alone; icon and text are mandatory in every render,
including the smallest breakpoint. Badge text is `data-s` (12/16 mono,
+0.01em); icons 14px within badges, 1.75px stroke to hold weight at size.

| Badge | Text label | Lucide icon | Color | Chip style |
|---|---|---|---|---|
| required | "Required" | `asterisk` | Ink fill `#25302A`, Loose-leaf text | Solid fill |
| useful | "Useful" | `circle-plus` | Chalk Green `#1B6B54` text + border on Ream | 1.5px outline |
| optional | "Optional" | `circle-dashed` | Graphite `#5C6660` text + border on Ream | 1.5px outline |
| trending | "Trending" + evidence count ("4 of 5 signal families") | `trending-up` | Signal Blue `#2C5F9E` text + border on Ream | 1.5px outline |
| cooling | "Cooling" | `trending-down` | Signal Blue `#2C5F9E` text + border on Ream | 1.5px outline |
| insufficient-evidence | "Not enough evidence" | `circle-help` | Graphite `#5C6660` text, dotted border | Dotted 1.5px outline |
| sponsored | "Sponsored" | `megaphone` | Kraft Ink `#6E5527` on Kraft tint `#F2E8D8` | Ticket-notch chip |
| recalled | "Recalled" | `octagon-alert` | Recall Red `#B3261E` fill, white text | Solid fill |
| out-of-stock | "Out of stock" | `package-x` | Graphite `#5C6660` text, dashed border | Dashed 1.5px outline |
| school-restricted | "Restricted by school policy" (short: "School-restricted") | `shield-x` | Policy Violet `#5B4B8A` fill, white text | Solid fill |
| stale (freshness) | "Prices last checked [date] — rechecking" | `clock-alert` | Stale Amber `#8A5B00` on tint `#FBEFD2` | Dashed 1.5px outline |

Rules:

- `trending` may only render when the trend engine passes §1.3 (≥3 signal
  families); the badge *displays the count* as part of its label — evidence is
  part of the design, not a tooltip. Default state is insufficient-evidence.
- `recalled` and `school-restricted` badges are never truncated, never
  icon-only, and always accompanied by a provenance line (§7 of this doc).
- `sponsored` never coexists with `trending` styling on the same row without
  both being fully visible; a sponsored item can never visually inherit
  evidence chrome.
- Badge text lives in copy files under lint scan roots so the banned-claims
  lint (§1.6) covers it — Phase 7 must extend the lint roots when it creates
  the copy directory (Phase 0 handoff §4 requirement).

---

## 7. Iconography

- **Set:** [Lucide](https://lucide.dev) — **ISC License** (permissive OSS,
  attribution not required, commercial use allowed). Community-maintained
  fork of Feather with 1500+ glyphs on a consistent 24×24 grid, 2px stroke,
  round caps/joins.
- **Usage grid:** 24px default at 2px stroke; 20px in dense tables; 14px in
  badges at 1.75px stroke; 32px for empty states. Optical centering on the
  4px sub-grid. Stroke color is Ink or the status color of the containing
  chip — icons never introduce a color of their own.
- **Core vocabulary (fixed mappings, do not improvise):** `clipboard-paste`
  (paste a list), `camera` (photo intake), `scan-line` (parsing), `list-checks`
  (the plan), `backpack` (child/list), `store` (retailer/stop count),
  `shirt` (clothing capsule), `history` (provenance/retrieval time), plus the
  badge icons in §6.
- **No emoji, ever** (§1.8) — including in copy, empty states, and marketing
  surfaces. Enforced by `scripts/lint-no-emoji.mjs`.
- **Provenance line pattern (§1.4):** every rendered fact carries a `data-s`
  Graphite line: `[source name] · [source type] · observed [date] ·
  retrieved [timestamp] · [confidence]` with a `history` icon at 14px. A fact
  without this line does not render — frontend implements the render guard;
  design's contribution is that the provenance line is a *visible, designed
  element*, not fine print to hide.

---

## 8. Motion

Motion exists to confirm state changes the user caused; it never decorates
and never delays safety information.

| Moment | Motion | Duration/easing | Why |
|---|---|---|---|
| Check-strike (item marked owned/bought) | Strikethrough draws left-to-right | 160ms, `cubic-bezier(0.2, 0, 0, 1)` | Confirms the crossing-off — the core satisfaction of the errand |
| Ledger recompute (totals change) | Old value fades out, new value fades in with 4px rise; the sum rule itself never animates | 120ms | Signals "recomputed," avoids slot-machine theatrics around money |
| Sheet/dialog entry | 200ms translate-up + fade | 200ms | Spatial continuity on mobile |
| Parse progress (upload) | Determinate stepper, discrete steps | none (state swap) | Honest progress; no fake spinners |
| Recall/restriction banners | **None.** Render immediately, static, full contrast | — | A safety warning must never wait for a transition |

`prefers-reduced-motion: reduce`: all transforms drop to opacity-only or
instant state swap; the check-strike renders complete immediately. No
parallax, no scroll-jacking, no auto-playing anything, anywhere, for anyone.

---

## 9. Imagery

**No generic smiling-family stock photography. None.** The category's
credibility failure mode is interchangeable lifestyle imagery; ours is a
tool, and it looks like one.

Licensing strategy, in order of preference:

1. **Owned vector spot illustrations** — flat, two-color (Ink + one of
   Chalk Green / Eraser Pink / Rule Blue) drawings of the objects themselves:
   a composition book, a glue stick, a numbered handout, a receipt. Drawn
   in-house on the Lucide 24px grid language (consistent stroke), owned
   outright, no license exposure. These carry empty states and marketing.
2. **Retailer/manufacturer product images** — only via the affiliate/feed
   program terms that permit display, only attached to the specific product
   fact, always with provenance (§1.4). Fixture mode ships with clearly
   labeled synthetic placeholder art, not scraped images.
3. **CPSC recall imagery** — U.S. federal government work product from
   cpsc.gov (public domain) for recall detail views, credited to CPSC with
   retrieval date.
4. **Prohibited:** stock lifestyle photography (any license), scraped images,
   AI-generated photorealistic children or families, teacher/classroom
   photography of any kind (adjacent to §1.7 PII posture).

---

## 10. Voice

Plain, active, specific. Second person. Sentence case everywhere including
buttons and headings. Numbers over adjectives. No exclamation points in UI
chrome. No urgency theatrics: real deadlines get real dates, never countdown
anxiety. Banned-claim strings (config/banned-claims.ts) never appear; the
lint enforces it, the voice makes it moot — we don't talk that way.

**Buttons say what happens** (placeholder numerals throughout):

- "Compare baskets across 3 stores" — not "Get started"
- "Add another child's list" — not "Add more"
- "Mark 19 items as already owned" — not "Confirm"
- "See why this is labeled Trending" — not "Learn more"

**Errors say what went wrong and how to fix it:**

- "We couldn't read page 2 of your photo. Retake it with the list flat and
  the whole page in frame, or type those items in below."
- "This store's prices are 26 hours old, so we've hidden its total. We're
  rechecking now — the other 2 stores are current."
- "We can't confirm this school's dress code from an official source, so the
  capsule filter is off. You can apply the district's published policy
  manually."

**Empty states invite action:**

- "No lists yet. Paste your school's supply list, snap a photo of it, or type
  the first item."
- "Nothing marked as owned. Walk through what's already at home and we'll
  subtract it from every child's list."

**Suppression states explain the refusal (§1.5 — suppression is a designed
state, not an apology):**

- "Not enough evidence to call this trending. It's popular in 1 signal
  family; we need at least 3 independent ones."
- "This product's exact variant isn't confirmed, so we're not counting it
  toward your total yet."

Vocabulary: say "checked against CPSC recalls on [date]", "verified [date]",
"landed cost", "in 4 of 5 signal families". Avoid hype vocabulary entirely —
superlatives, "essential", "hurry", "don't miss out".

---

## 11. Component inventory and states (Phase 7 scope preview)

Core set frontend-engineer should token-build first: list row (default /
checked-off / suppressed / recalled), badge (all 11 in §6), sum-rule total
block, net-required stack, provenance line, retailer basket column, pack-math
chip, deadline card, upload dropzone with parse stepper, sponsored ticket
container, banner (recall / restriction / correction). Every component
defines all of: default, hover, focus-visible (2px Chalk Green outline, 2px
offset), active, disabled, loading, error, and — where facts render —
suppressed. Dark mode is deliberately out of MVP scope; tokens are structured
so a dark theme is additive later.

---

## 12. Brand-name independence

The identity carriers are the palette, the three typefaces, the Sum Rule, the
chip grammar, and the voice — none reference the working name. The wordmark
is simply the runtime value of the brand config set in Bricolage Grotesque
700 with -0.02em tracking; when the name changes, one config file changes and
no visual asset is invalidated. No monogram, no initial-letter mark, no
name-derived pun assets are permitted in Phase 7.

---

## 13. Self-critique (required; revisions made)

Checked each axis against the named generic defaults — (a) cream background +
high-contrast serif + terracotta accent, (b) near-black + acid accent, (c)
broadsheet hairline rules:

1. **Palette — revised.** The first draft used a warm cream page (`#FAF3E3`)
   with a terracotta accent — literally generic default (a). Replaced with
   Loose-leaf `#F7F8F2` (cool, green-cast paper white taken from actual
   filler paper, not bakery cream) and the accent re-derived from a physical
   object in this world: Pink Pearl eraser pink, restricted to tint-only use.
   Also removed the first draft's decorative red margin line — recognizable,
   but it spent red, which this product must reserve for recalls.
2. **Type — revised.** The first pairing was a high-contrast display serif
   over Inter — defaults (a) and (b) hybridized, swappable onto any product.
   Replaced with Bricolage Grotesque (workbook warmth) + Atkinson
   Hyperlegible Next (a body choice that *argues the product's accessibility
   mission*) + Spline Sans Mono for every computed number (the receipt/ledger
   texture the signature element needs). The mono-for-computed-facts rule is
   the pairing's reason to exist here and nowhere else.
3. **Rules — interrogated and constrained.** The signature leans on ruled
   lines, which risks generic default (c), broadsheet hairlines. Resolution:
   our rules are never neutral gray hairlines scattered as texture. They are
   either Rule Blue (the loose-leaf artifact, decorative, 1px, rows only) or
   Ink sum rules that appear *only above computed totals* — a rule with
   semantics. If a rule isn't loose-leaf texture or a certificate of
   computation, it doesn't exist.
4. **Residual risk, accepted with mitigation:** Eraser Pink sits within
   waving distance of Recall Red on a hue wheel. Mitigation is structural:
   pink is never text, never a chip, never below 24px areas; red never
   appears outside solid-fill safety chrome with icon + label. The two can
   never occupy the same role, so proximity cannot mislead.

---

## 14. Token export contract (for Phase 7)

Frontend-engineer translates §1–§6 into `--color-*`, `--space-*`,
`--radius-*`, `--font-*`, `--text-*` custom properties (names as given
above), self-hosts the three OFL font families, vendors Lucide, and writes
the render-guard and badge components against the tables in §6–§7. This
document is the source of truth; deviations route back through
design-director with a note in the Phase 7 handoff.
