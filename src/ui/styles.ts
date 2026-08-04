/**
 * The full stylesheet, generated from the typed token source (tokens.ts) so
 * CSS can never drift from the direction.md §14 contract. Served at
 * /assets/ui.css by the Worker.
 *
 * Layout notes (direction §4/§5): rules are either Rule Blue loose-leaf
 * texture (1px, rows only) or Ink sum rules above computed totals — there is
 * no third kind of rule. Elevation prefers rules to shadows. No pill shapes.
 */
import { tokensCss, TYPE_SCALE, BREAKPOINTS } from "./tokens";
import type { TypeStepName } from "./tokens";

function typeStepClasses(): string {
  return (Object.keys(TYPE_SCALE) as TypeStepName[])
    .map((step) => {
      const def: import("./tokens").TypeStep = TYPE_SCALE[step];
      return [
        `.text-${step} {`,
        `  font-family: var(--font-${def.face});`,
        `  font-size: var(--text-${step}-size);`,
        `  line-height: var(--text-${step}-line);`,
        `  font-weight: var(--text-${step}-weight);`,
        `  letter-spacing: var(--text-${step}-tracking);`,
        def.uppercase ? `  text-transform: uppercase;` : ``,
        `}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

export function buildStylesheet(): string {
  return `${tokensCss()}

/* Self-hosted OFL families (public/assets/fonts; licenses alongside). */
@font-face { font-family: "Bricolage Grotesque"; src: url(/assets/fonts/bricolage-grotesque-latin-600-normal.woff2) format("woff2"); font-weight: 600; font-display: swap; }
@font-face { font-family: "Bricolage Grotesque"; src: url(/assets/fonts/bricolage-grotesque-latin-700-normal.woff2) format("woff2"); font-weight: 700; font-display: swap; }
@font-face { font-family: "Bricolage Grotesque"; src: url(/assets/fonts/bricolage-grotesque-latin-800-normal.woff2) format("woff2"); font-weight: 800; font-display: swap; }
@font-face { font-family: "Atkinson Hyperlegible Next"; src: url(/assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2) format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Atkinson Hyperlegible Next"; src: url(/assets/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2) format("woff2"); font-weight: 700; font-display: swap; }
@font-face { font-family: "Spline Sans Mono"; src: url(/assets/fonts/spline-sans-mono-latin-400-normal.woff2) format("woff2"); font-weight: 400; font-display: swap; }
@font-face { font-family: "Spline Sans Mono"; src: url(/assets/fonts/spline-sans-mono-latin-500-normal.woff2) format("woff2"); font-weight: 500; font-display: swap; }

/* Base */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-body-size);
  line-height: var(--text-body-line);
}
h1, h2, h3, p, ul, ol, figure { margin: 0 0 var(--space-4); }
h1 { font-family: var(--font-display); font-size: var(--text-display-xl-size); line-height: var(--text-display-xl-line); font-weight: var(--text-display-xl-weight); letter-spacing: var(--text-display-xl-tracking); }
h2 { font-family: var(--font-display); font-size: var(--text-title-size); line-height: var(--text-title-line); font-weight: var(--text-title-weight); letter-spacing: var(--text-title-tracking); }
h3 { font-family: var(--font-display); font-size: var(--text-heading-size); line-height: var(--text-heading-line); font-weight: var(--text-heading-weight); letter-spacing: var(--text-heading-tracking); }
a { color: var(--color-action); }
${typeStepClasses()}
.lead { font-size: var(--text-body-l-size); line-height: var(--text-body-l-line); }
.muted { color: var(--color-graphite); }
.plain-list { list-style: none; padding: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* Focus: every interactive element gets the visible ring (direction §11). */
:focus-visible { outline: var(--focus-ring-width) solid var(--color-action); outline-offset: var(--focus-ring-offset); }
/* [A11y — Phase 11] On solid safety/restriction chrome the Chalk Green ring
   is invisible (1.02:1 on Recall Red, 1.16:1 on Policy Violet — measured in
   docs/a11y/audit-phase-11.md). Inside those banners the ring uses the
   banner's own white foreground (6.5:1 / 7.5:1); geometry unchanged.
   Deviation from a literal reading of direction §11 flagged for
   design-director review in the Phase 11 handoff. */
.banner-recall :focus-visible, .banner-restricted :focus-visible { outline-color: #FFFFFF; }
.skip-link { position: absolute; left: var(--space-4); top: -64px; background: var(--color-surface); color: var(--color-ink); padding: var(--space-3); border-radius: var(--radius-2); z-index: 30; transition: none; }
.skip-link:focus { top: var(--space-2); }

/* Containers (direction §4) */
.page { margin: 0 auto; padding: var(--space-4); width: 100%; }
.container-flow { max-width: var(--container-flow); }
.container-plan { max-width: var(--container-plan); }
.container-compare { max-width: var(--container-compare); }
.container-page { max-width: var(--container-page); }
@media (min-width: ${BREAKPOINTS.md}px) { .page { padding: var(--space-5); } }
.page-section { margin-bottom: var(--space-6); }

/* Chrome */
.site-header { border-bottom: 1px solid var(--color-rule); background: var(--color-surface); }
.site-header-inner { max-width: var(--container-page); margin: 0 auto; padding: var(--space-3) var(--space-4); display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-4); }
.wordmark { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; font-size: var(--text-title-size); color: var(--color-ink); text-decoration: none; }
.site-nav, .footer-nav { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); }
.nav-link { color: var(--color-ink); text-decoration: none; padding: var(--space-2) var(--space-1); min-height: var(--touch-target); display: inline-flex; align-items: center; border-bottom: 2px solid transparent; }
.nav-link:hover { color: var(--color-action); }
.nav-link-active { border-bottom-color: var(--color-action); color: var(--color-action); }
.site-footer { border-top: 1px solid var(--color-rule); margin-top: var(--space-7); padding: var(--space-5) var(--space-4); background: var(--color-surface); }
.footer-brand { color: var(--color-graphite); font-family: var(--font-data); font-size: var(--text-data-s-size); margin: var(--space-4) 0 0; }
.fixture-ribbon, .offline-banner { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-2) var(--space-4); font-family: var(--font-data); font-size: var(--text-data-s-size); line-height: var(--text-data-s-line); }
.fixture-ribbon { background: var(--status-sponsored-tint); color: var(--status-sponsored); }
.offline-banner { background: var(--status-stale-tint); color: var(--status-stale); border-bottom: 1px dashed var(--status-stale); }

/* Cards / sheets: Level 1 elevation = rule + faint shadow (direction §4). */
.card { background: var(--color-surface); border: 1px solid rgba(92,102,96,0.2); border-radius: var(--radius-2); box-shadow: var(--elevation-card); padding: var(--space-4); margin-bottom: var(--space-4); }
.capsule-card-header { background: var(--color-accent); border-radius: var(--radius-2) var(--radius-2) 0 0; margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-4)) var(--space-4); padding: var(--space-3) var(--space-4); color: var(--color-ink); }

/* Badges — chip grammar (direction §2/§6). Icon + text always. */
.badge { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-data); font-size: var(--text-data-s-size); line-height: var(--text-data-s-line); letter-spacing: var(--text-data-s-tracking); padding: 2px var(--space-2); border-radius: var(--radius-1); vertical-align: middle; }
.badge .icon { flex: none; }
.chip-fill { border: 1.5px solid transparent; }
.chip-outline { border: 1.5px solid currentColor; background: var(--color-surface); }
.chip-dashed { border: 1.5px dashed currentColor; background: var(--color-surface); }
.chip-dotted { border: 1.5px dotted currentColor; background: var(--color-surface); }
.badge-required { background: var(--color-ink); color: var(--color-paper); }
.badge-useful { color: var(--color-action); }
.badge-optional, .badge-insufficient, .badge-out-of-stock { color: var(--color-graphite); }
.badge-trending, .badge-cooling { color: var(--status-signal); }
.badge-recalled { background: var(--status-recall); color: #FFFFFF; }
.badge-restricted { background: var(--status-restricted); color: #FFFFFF; }
.badge-stale { color: var(--status-stale); background: var(--status-stale-tint); }
.badge-sponsored { color: var(--status-sponsored); background: var(--status-sponsored-tint); border: 1px solid var(--status-sponsored); }
/* Ticket notch: two half-circle cutouts on the left edge (direction §2). */
.chip-ticket { position: relative; padding-left: var(--space-3); }
.chip-ticket::before, .chip-ticket::after { content: ""; position: absolute; left: -4px; width: 8px; height: 8px; border-radius: 50%; background: var(--color-paper); border: 1px solid var(--status-sponsored); }
.chip-ticket::before { top: 15%; }
.chip-ticket::after { bottom: 15%; }
@media (forced-colors: active) { .badge { border: 1px solid; } }

/* Provenance line (§1.4) — a designed element, not fine print to hide. */
.provenance-line { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--color-graphite); font-family: var(--font-data); font-size: var(--text-data-s-size); line-height: var(--text-data-s-line); letter-spacing: var(--text-data-s-tracking); margin: var(--space-1) 0 var(--space-3); }
/* [A11y — Phase 11] Provenance lines rendered inside solid safety chrome
   inherit the banner's white foreground: Graphite measured 1.5:1 on Recall
   Red (axe serious, live safety intercept) — white measures 6.5:1 / 7.5:1.
   The §1.4 line stays fully visible; only its color adapts to the fill. */
.banner-recall .provenance-line, .banner-restricted .provenance-line { color: #FFFFFF; }
.provenance-limitations { flex-basis: 100%; }
.provenance-corrected { color: var(--color-action); }

/* Suppression notice (§1.5): dashed stale-amber chrome, reason visible. */
.suppression-notice { display: flex; gap: var(--space-2); align-items: flex-start; border: 1.5px dashed var(--status-stale); background: var(--status-stale-tint); color: var(--status-stale); border-radius: var(--radius-1); padding: var(--space-2) var(--space-3); font-family: var(--font-data); font-size: var(--text-data-s-size); line-height: var(--text-data-s-line); margin-bottom: var(--space-2); }
.suppressions-heading, .assumptions-heading { font-family: var(--font-data); font-size: var(--text-overline-size); line-height: var(--text-overline-line); font-weight: var(--text-overline-weight); letter-spacing: var(--text-overline-tracking); text-transform: uppercase; color: var(--color-graphite); }
.assumption { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; color: var(--color-graphite); font-family: var(--font-data); font-size: var(--text-data-s-size); margin-bottom: var(--space-1); }

/* Banners — static, motionless, full contrast (direction §8). */
.banner { display: flex; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-0); margin-bottom: var(--space-4); }
.banner-recall { background: var(--status-recall); color: #FFFFFF; }
.banner-recall a { color: #FFFFFF; }
.banner-recall .badge-recalled { background: #FFFFFF; color: var(--status-recall); }
.banner-restricted { background: var(--status-restricted); color: #FFFFFF; }
.banner-restricted .badge-restricted { background: #FFFFFF; color: var(--status-restricted); }
.banner-correction { background: var(--color-surface); border: 2px solid var(--color-ink); }
.banner-title { font-weight: 700; margin-bottom: var(--space-2); }
.banner-body p:last-child { margin-bottom: 0; }

/* Ledger — the Sum Rule and Net-Required Stack (direction §5). */
.ledger { font-family: var(--font-data); font-size: var(--text-data-size); line-height: var(--text-data-line); max-width: 420px; }
.ledger-line { display: flex; justify-content: space-between; gap: var(--space-4); padding: var(--space-1) 0; }
.ledger-value { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ledger-total-value { font-weight: 500; }
.sum-rule { border-top: 1px solid var(--color-ink); padding-top: var(--space-2); margin-top: var(--space-1); }
.ledger-total-value.double-rule { position: relative; border-bottom: 1px solid var(--color-ink); padding-bottom: 1px; }
.ledger-total-value.double-rule::after { content: ""; position: absolute; left: 0; right: 0; bottom: -5px; border-top: 2px solid var(--color-ink); }
.ledger-line-details summary { list-style: none; cursor: pointer; }
.ledger-line-details summary::-webkit-details-marker { display: none; }
.ledger-line-details[open] > summary .ledger-label { color: var(--color-action); }
.ledger-receipt { border-left: 2px solid var(--color-rule); margin: var(--space-1) 0 var(--space-2); padding-left: var(--space-3); color: var(--color-graphite); font-size: var(--text-data-s-size); }
.pack-chip { font-family: var(--font-data); font-size: var(--text-data-s-size); letter-spacing: var(--text-data-s-tracking); color: var(--color-graphite); }
.pack-result { border-bottom: 1px solid var(--color-ink); color: var(--color-ink); }
.budget-bar-track { height: var(--space-3); background: var(--color-surface); border: 1px solid rgba(92,102,96,0.2); border-radius: var(--radius-1); overflow: hidden; margin-top: var(--space-2); }
.budget-bar-fill { height: 100%; background: var(--color-action); }

/* List rows: loose-leaf texture — 1px Rule Blue separators, numbered gutter. */
.list-rows { list-style: none; padding: 0; margin: 0; }
.list-row { display: grid; grid-template-columns: 32px 1fr auto; gap: var(--space-2); align-items: start; padding: var(--space-3) 0; border-bottom: 1px solid var(--color-rule); min-height: 56px; }
/* [A11y — Phase 11] .fact-row is the <li> wrapper around guard-checked rows
   (plan/checklist/household/account): the Rule Blue separator moves to the
   wrapper so the row, its provenance line, or a refusal notice all sit above
   the same loose-leaf rule. Purely structural; visual grammar unchanged. */
.fact-row { border-bottom: 1px solid var(--color-rule); }
.fact-row .list-row, .fact-row .check-row { border-bottom: none; }
.row-ordinal { font-family: var(--font-data); font-size: var(--text-data-s-size); color: var(--color-graphite); }
.row-name { position: relative; display: inline-block; }
.list-row.checked { color: var(--color-graphite); }
.list-row.checked .row-name::after { content: ""; position: absolute; left: 0; top: 50%; height: 2px; width: 100%; background: var(--color-ink); animation: strike var(--motion-check-strike) var(--motion-easing); }
@keyframes strike { from { width: 0; } to { width: 100%; } }
.row-detail { color: var(--color-graphite); font-size: var(--text-data-s-size); font-family: var(--font-data); }
.row-badges { display: flex; flex-wrap: wrap; gap: var(--space-1); justify-content: flex-end; }

/* Checklist: 44px+ targets; store mode grows everything, thumb-reach bar. */
.check-row { display: grid; grid-template-columns: var(--touch-target) 1fr auto; gap: var(--space-3); align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-rule); }
.check-row .checkbox { width: 28px; height: 28px; margin: 8px; accent-color: var(--color-action); }
.check-row label { min-height: var(--touch-target); display: flex; align-items: center; cursor: pointer; }
.store-mode .check-row { padding: var(--space-3) 0; font-size: var(--text-body-l-size); }
.store-mode .check-row .checkbox { width: 36px; height: 36px; margin: 4px; }
.checklist-bar { position: sticky; bottom: 0; background: var(--color-surface); border-top: 1px solid var(--color-ink); padding: var(--space-3) var(--space-4); display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); font-family: var(--font-data); }

/* Buttons and forms — hit targets >= 44px (direction §4). */
.button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: var(--touch-target); padding: var(--space-2) var(--space-4); border-radius: var(--radius-2); font-family: var(--font-body); font-size: var(--text-label-size); font-weight: var(--text-label-weight); letter-spacing: var(--text-label-tracking); text-decoration: none; cursor: pointer; }
.button-primary { background: var(--color-action); color: #FFFFFF; border: 1px solid var(--color-action); }
.button-primary:hover { background: #14523F; }
.button-secondary { background: var(--color-surface); color: var(--color-ink); border: 1px solid var(--color-graphite); }
.button-secondary:hover { border-color: var(--color-ink); }
.button:disabled { background: var(--color-surface); color: var(--color-graphite); border-color: rgba(92,102,96,0.4); cursor: not-allowed; }
.field { margin-bottom: var(--space-4); }
.field-label { display: block; font-size: var(--text-label-size); font-weight: var(--text-label-weight); letter-spacing: var(--text-label-tracking); margin-bottom: var(--space-1); }
.field-hint { color: var(--color-graphite); font-size: var(--text-data-s-size); font-family: var(--font-data); margin-bottom: var(--space-1); }
.control { width: 100%; min-height: var(--touch-target); padding: var(--space-2) var(--space-3); border: 1px solid var(--color-graphite); border-radius: var(--radius-1); background: var(--color-surface); color: var(--color-ink); font-family: var(--font-body); font-size: var(--text-body-size); }
.control::placeholder { color: var(--color-graphite); }
.textarea { min-height: 160px; font-family: var(--font-data); font-size: var(--text-data-size); }
.checkbox-row { display: flex; align-items: center; gap: var(--space-2); min-height: var(--touch-target); }
.checkbox { width: 22px; height: 22px; accent-color: var(--color-action); }
fieldset { border: 1px solid var(--color-rule); border-radius: var(--radius-1); padding: var(--space-4); margin: 0 0 var(--space-4); }
legend { font-weight: 700; padding: 0 var(--space-2); }

/* Tabs (intake) — links, server-rendered state. */
.tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); border-bottom: 1px solid var(--color-rule); }
.tab { display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-3); min-height: var(--touch-target); color: var(--color-ink); text-decoration: none; border-bottom: 2px solid transparent; }
.tab-active { border-bottom-color: var(--color-action); color: var(--color-action); }

/* Basket comparison: columns >= md, stacked cards below (rule preserved). */
.basket-views { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
.basket-grid { display: grid; gap: var(--space-4); grid-template-columns: 1fr; }
@media (min-width: ${BREAKPOINTS.md}px) { .basket-grid { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); } }
.retailer-column { background: var(--color-surface); border: 1px solid rgba(92,102,96,0.2); border-radius: var(--radius-0); padding: var(--space-4); }
.retailer-name { font-family: var(--font-display); font-weight: 600; font-size: var(--text-heading-size); margin-bottom: var(--space-3); display: flex; gap: var(--space-2); align-items: center; }

/* Review table */
.review-item { border-bottom: 1px solid var(--color-rule); padding: var(--space-4) 0; }
.review-original { font-family: var(--font-data); font-size: var(--text-data-size); color: var(--color-graphite); }
.review-needs { border-left: 3px solid var(--status-signal); padding-left: var(--space-3); }

/* Skeletons: fixed dimensions, calm pulse, no facts. */
.skeleton-bar { background: rgba(92,102,96,0.16); border-radius: var(--radius-1); }
.skeleton-row { display: flex; gap: var(--space-3); align-items: center; padding: var(--space-3) 0; border-bottom: 1px solid var(--color-rule); min-height: 56px; }
.skeleton .skeleton-bar { animation: skeleton-pulse 1200ms ease-in-out infinite alternate; }
.skeleton-ledger { max-width: 420px; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); padding: var(--space-4) 0; }
@keyframes skeleton-pulse { from { opacity: 1; } to { opacity: 0.55; } }

/* Ad slot reservation: fixed dimensions, ticket-notch label, kraft tint. */
.ad-slot { background: var(--status-sponsored-tint); border: 1px solid var(--status-sponsored); border-radius: var(--radius-1); padding: var(--space-2); overflow: hidden; }

/* Trend evidence table */
.evidence-table { width: 100%; border-collapse: collapse; font-family: var(--font-data); font-size: var(--text-data-size); }
.evidence-table th { text-align: left; font-family: var(--font-data); font-size: var(--text-overline-size); letter-spacing: var(--text-overline-tracking); text-transform: uppercase; font-weight: var(--text-overline-weight); color: var(--color-graphite); padding: var(--space-2) var(--space-3) var(--space-2) 0; border-bottom: 1px solid var(--color-ink); }
.evidence-table td { padding: var(--space-2) var(--space-3) var(--space-2) 0; border-bottom: 1px solid var(--color-rule); vertical-align: top; }

/* Status table */
.status-table { width: 100%; border-collapse: collapse; }
.status-table th { text-align: left; font-family: var(--font-data); font-size: var(--text-overline-size); letter-spacing: var(--text-overline-tracking); text-transform: uppercase; font-weight: var(--text-overline-weight); color: var(--color-graphite); padding: var(--space-2) var(--space-3) var(--space-2) 0; border-bottom: 1px solid var(--color-ink); }
.status-table td { padding: var(--space-2) var(--space-3) var(--space-2) 0; border-bottom: 1px solid var(--color-rule); font-family: var(--font-data); font-size: var(--text-data-size); }

/* Motion discipline (direction §8). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}

/* Print: the checklist is the export. */
@media print {
  .site-header, .site-footer, .fixture-ribbon, .offline-banner, .checklist-bar, .button, .skip-link, script { display: none !important; }
  body { background: #FFFFFF; }
}
`;
}
