# HANDOFF 07 — design-director — Phase 6

## 1. Inputs consumed

- `CLAUDE.md` — §0 (product definition, who this serves, the NOT list), §1
  invariants (esp. §1.2 ad placement, §1.3 evidence labels, §1.4 provenance,
  §1.5 suppression, §1.6 banned claims, §1.8 no emoji), stack summary,
  process rules.
- `config/brand.ts` — confirmed the working name is disposable and its
  literal may exist only there (also enforced repo-wide by
  `tests/config.test.ts`).
- `config/banned-claims.ts` — the seven banned strings; direction copy
  examples were written to avoid them and their trivial variants.
- `docs/handoffs/00-orchestrator-0.md` — Phase 0 decisions, esp. decision 7
  (brand literal not repeated even in docs), decision 9 (widened brand scan),
  §4 (lint roots default to `src/`; copy directories must extend them), §7
  risks.
- `docs/handoffs/TEMPLATE.md`, `.claude/agents/design-director.md` (mandate,
  hard constraints, acceptance criteria).
- Note: Phases 1–5 have not run; this phase depends on none of their
  artifacts (direction is documentation-only by mandate).

## 2. Decisions made

1. **Signature element = the Sum Rule + Net-Required Stack** (ledger
   arithmetic rendered literally: operands, U+2212 minus, single rule,
   double rule under grand totals). Alternatives considered: composition-book
   marble texture (decorative, swappable onto any "school-ish" product);
   locker/door motif (spatially cute, no tie to the product's actual job);
   red loose-leaf margin line (rejected — spends red, which is reserved for
   recalls). Chosen because it visualizes §0 capabilities 2 and 3 (net-required
   math, landed cost) — it cannot be transplanted to a product that doesn't
   compute "required minus owned."
2. **Palette from physical school objects**, cool paper white (not cream),
   Chalkboard-green ink cast, Rule Blue for structure, Eraser Pink tint-only
   accent. Status family fully separate (Recall Red, Policy Violet, Stale
   Amber, Signal Blue, Kraft) with a chip-style grammar (solid fill = safety,
   dashed = availability/freshness, outline = evidence, ticket-notch =
   commercial) so meaning never rides on hue alone. First-draft cream +
   terracotta was rejected in the written self-critique (direction.md §13).
3. **Type trio, all SIL OFL**: Bricolage Grotesque (display), Atkinson
   Hyperlegible Next (body — legibility-mission argument), Spline Sans Mono
   (every computed number). Rejected: display-serif-over-Inter (the named
   generic default) and system-ui-everywhere (explicitly barred by mandate).
   Mono-for-computed-facts is the typographic arm of the signature element.
4. **Icon set: Lucide, ISC license** — 24px grid, 2px stroke, consistent
   metrics, badge-size variant at 14px/1.75px stroke. Rejected: Heroicons
   (two incompatible stroke styles invite drift), commercial sets (license
   cost unjustified pre-launch, and OSS was preferred by mandate).
5. **Imagery: no photography of people at all in MVP** — owned two-color
   vector spots + feed-licensed product images with provenance + public
   domain CPSC imagery. Rejected: any stock lifestyle photography (mandate)
   and AI-photorealistic children (adjacent to §1.7 posture).
6. **Contrast ratios computed, not asserted**: WCAG 2.1 relative-luminance
   math done by hand for every text-bearing pair in the doc (values listed in
   direction.md §1–§2); Phase 7 must re-verify with axe-core once tokens
   exist. This respects "never invent a number" — the ratios are
   deterministic computation, and all numerals in example copy are explicitly
   labeled placeholders.
7. **Dark mode deferred** (stated in direction.md §11) — tokens structured so
   a dark theme is additive; building it now would be scope drift.

## 3. Artifacts produced

- `docs/design/direction.md` (new; repo-relative path — the repo root's
  directory name contains the brand literal, so absolute paths are not
  written into scanned files) — the full direction: palette, status colors,
  type, layout, signature element, badge system, iconography, motion,
  imagery licensing, voice, component/state inventory, brand-name
  independence, self-critique with named revisions, token export contract.
- `docs/handoffs/07-design-director-6.md` (this file).
- Nothing else touched. No UI code (hard constraint), no config, no src.

## 4. Contracts exported

Phase 7 codes against direction.md §14 plus these literals:

Color tokens (brand): `--color-ink #25302A`, `--color-paper #F7F8F2`,
`--color-surface #FFFFFF`, `--color-action #1B6B54`, `--color-rule #A7C4DE`,
`--color-graphite #5C6660`, `--color-accent #E5A49B` (tint-only).
Status tokens: `--status-recall #B3261E`, `--status-restricted #5B4B8A`,
`--status-stale #8A5B00` (tint `#FBEFD2`), `--status-stock #5C6660`,
`--status-signal #2C5F9E`, `--status-sponsored #6E5527` (tint `#F2E8D8`).

Type: Bricolage Grotesque / Atkinson Hyperlegible Next / Spline Sans Mono
(all SIL OFL 1.1, self-hosted); scale table in direction.md §3 (steps
`display-xl` 40/44 … `data-s` 12/16).

Layout: spacing `--space-1..9` = 4, 8, 12, 16, 24, 32, 48, 64, 96;
radii 0/4/8/16; breakpoints 480/768/1024/1280; containers 640/880/1120/1200.

Badge contract (direction.md §6): 11 badges, each with fixed Lucide icon +
mandatory text label + color + chip style; icon-only rendering is forbidden
at every breakpoint. Trend badges display their signal-family count as label
text.

Signature element spec (direction.md §5): sum rule = 1px Ink top rule above
subtotals; final totals add 1px + 3px gap + 2px double rule under the numeric
column; Net-Required Stack layout as specified.

Icon set: Lucide, ISC license, vendored (not CDN).

## 5. Invariants touched

- **§1.8 (no emoji):** direction mandates Lucide-only iconography and bans
  emoji across UI, copy, and marketing. This doc set contains no emoji
  (evidence in §6). Enforcement remains `scripts/lint-no-emoji.mjs` (already
  ENFORCED, Phase 0).
- **§1.6 (banned claims):** all example copy written clean; direction §6
  requires Phase 7 to place copy files under lint scan roots and extend the
  script roots in `package.json` (Phase 0 handoff §4 requirement carried
  forward). No new test needed this phase — docs are not user-facing copy;
  the existing lint covers the code that will be.
- **§1.2 (no ads before critical content):** designed as the ticket-notch
  quarantine + placement rules in direction §2/§6; the proving route-tree
  test remains owned by monetization-engineer (Phase 9), as CLAUDE.md's
  table states.
- **§1.3 (viral evidence) / §1.5 (suppression):** designed as first-class UI
  states (evidence counts inside badge labels; suppression copy patterns).
  Proving tests remain algorithm-engineer's (Phase 4).
- **§1.4 (provenance):** the provenance line is specified as a designed,
  visible element on every fact; the render-guard test remains
  frontend-engineer's (Phase 7) per CLAUDE.md.
- **§0 brand isolation:** neither new file contains the brand literal;
  `tests/config.test.ts` (repo-wide scan) will verify on the next test run.
- Per §1's declaration rule: no automated test can assert "the direction is
  specific to this brief" — that acceptance is human judgment, assigned by
  the agent mandate to scope-guardian + orchestrator at the Phase 6 gate.

## 6. Acceptance evidence

- Tooling limitation, declared honestly: this agent's toolset (Read, Write,
  Edit, Grep, Glob — per `.claude/agents/design-director.md`) includes no
  shell, so `npm run verify` could not be executed from this session. The
  gate must re-run it (it re-runs stated commands verbatim per process rules).
  Risk of breakage is nil-by-construction: the only changes are two new
  Markdown files under `docs/`, which no lint root, tsconfig include, or test
  glob compiles — except the repo-wide brand scan, addressed next.
- Grep evidence over both new files (patterns and results recorded at
  completion time; re-runnable by the gate):
  - Brand literal (the string in `config/brand.ts` `name`): 0 matches in
    `docs/design/direction.md` and this file.
  - Banned-claim patterns (all seven strings parsed from
    `config/banned-claims.ts`, matched case-insensitively with a wildcard
    hyphen, plus the first word of each two-word claim as a superset check;
    the literals are deliberately not reproduced here so this file stays
    scan-clean): 0 matches in both files.
  - Emoji/symbol ranges (U+1F000–U+1FAFF, U+2600–U+27BF, U+2B00–U+2BFF,
    U+FE0F, U+20E3, U+2190–U+21FF): 0 matches in both files. Non-ASCII in
    the doc is limited to typographic dashes, the U+2212 minus sign, U+00B7
    middle dots, U+2265 in "≥3 signal families", U+00D7 multiplication sign,
    and U+2500 box-drawing rule inside one code block — none emoji-capable.
- Mandate acceptance criteria self-check: every badge specifies icon + text +
  color (direction §6 table, 11 rows); the self-critique exists and names
  three revisions plus one accepted risk (direction §13); brand-name
  independence is an explicit section (direction §12); no UI code was
  produced.

## 7. Known gaps and risks

- **Verify not run by this agent** (no shell tool) — gate must run
  `npm run verify` before sign-off; expected green for the reasons in §6.
- **Contrast ratios are hand-computed**; correct math, but Phase 7 must
  confirm with axe-core/Lighthouse once real tokens and rendered text exist
  (glyph weight and size interact with perceived contrast).
- **Atkinson Hyperlegible Next weight coverage** should be confirmed at
  self-host time; the fallback (original Atkinson Hyperlegible, 400/700 only)
  is specified in direction §3 if lighter/heavier weights are unavailable.
- **Eraser Pink vs Recall Red proximity** — accepted risk with structural
  mitigation (direction §13.4); accessibility-qa (Phase 11) should
  specifically probe this pair under color-vision-deficiency simulation.
- **Ticket-notch chip in forced-colors mode** — the notch shape must survive
  `forced-colors: active`; flagged for Phase 7 implementation care and
  Phase 11 verification.
- **No visual comps exist** — this is a written direction by mandate; the
  first rendered instance of the Sum Rule may need one design-director
  consult during Phase 7 (the agent description allows consultation).
- Phases 1–5 are unstarted; if the eventual data contracts (Phase 1) add
  user-facing fact types beyond those anticipated (§6 badges + provenance
  line), the badge/provenance tables may need an additive revision.

## 8. Instructions to next agent

**frontend-engineer (Phase 7)** — and note the phase table shows Phases 1–5
before you; do not start until they land:

- MUST read CLAUDE.md §0/§1, `docs/design/direction.md` in full, and this
  handoff before writing any UI code. Direction.md §14 is your token
  contract; the literals in §4 above are canonical.
- MUST self-host the three OFL font families and vendor Lucide (ISC) — no
  third-party font/icon CDNs (§1.7 posture). Record both licenses in your
  handoff.
- MUST implement the render guard: a fact without a full §1.4 provenance
  record does not render — and write the test proving it (CLAUDE.md
  invariant table row 4 names you as co-owner).
- MUST render every badge with icon + text + color at every breakpoint;
  write a test that fails on icon-only or color-only badge rendering.
- MUST honor `prefers-reduced-motion` exactly as direction §8 specifies and
  keep recall/restriction banners motionless and unblocked (§1.2).
- MUST extend the banned-claims and no-emoji lint roots in `package.json` to
  cover every directory where you put user-facing copy (Phase 0 handoff §4;
  this is a standing gate requirement).
- MUST keep all brand strings sourced from the brand config module at
  runtime — no name-derived assets, monograms, or puns (direction §12).
- MUST NOT ship any numeral as a literal in UI copy; all numbers come from
  engine output or labeled fixtures (process rule: never invent a number).
- MUST NOT use the Sum Rule decoratively — it appears only above/below
  engine-computed values (direction §5.4); treat that as a review criterion.
- MUST NOT introduce colors, radii, spacings, or type steps outside the
  token tables without routing back through design-director.
- MUST NOT assume dark mode; structure tokens so it is additive later.

**scope-guardian + orchestrator (Phase 6 gate):** the mandate requires you
both to confirm in the gate file that this direction is specific to the brief
and not swappable onto an unrelated product; the swappability argument to
evaluate is direction §5 (last paragraph) and §13. Also re-run
`npm run verify` (see §6 tooling limitation) and the three grep checks in §6.
