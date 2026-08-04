/**
 * Page chrome and the document composer.
 *
 * The wordmark is the RUNTIME value of config/brand.ts set in the display
 * face (direction §12) — no name-derived asset exists anywhere. The composer
 * enforces the §1.2 layout rule and safety-first ordering on every render
 * (slots.ts): a violating section order throws instead of shipping.
 */
import { BRAND } from "../../../config/brand";
import type { Html } from "../html";
import { html, joinHtml, raw } from "../html";
import { icon } from "../icons";
import type { ContainerName } from "../tokens";
import type { PageSection } from "../slots";
import { assertSafetyFirst, assertSlotPlacement } from "../slots";
import { COMMON } from "../copy/en";

export const NAV_KEYS = [
  "home",
  "intake",
  "plan",
  "checklist",
  "basket",
  "capsule",
  "trends",
  "safety",
  "budget",
  "deals",
  "household",
  "account",
  "methodology",
  "status",
] as const;
export type NavKey = (typeof NAV_KEYS)[number];

export const NAV_ITEMS: readonly { key: NavKey; href: string; label: string }[] = [
  { key: "home", href: "/", label: COMMON.navHome },
  { key: "intake", href: "/intake", label: COMMON.navIntake },
  { key: "plan", href: "/plan", label: COMMON.navPlan },
  { key: "checklist", href: "/plan/checklist", label: COMMON.navChecklist },
  { key: "basket", href: "/plan/basket", label: COMMON.navBasket },
  { key: "capsule", href: "/capsule", label: COMMON.navCapsule },
  { key: "trends", href: "/trends", label: COMMON.navTrends },
  { key: "safety", href: "/safety", label: COMMON.navSafety },
  { key: "budget", href: "/budget", label: COMMON.navBudget },
  { key: "deals", href: "/deals", label: COMMON.navDeals },
  { key: "household", href: "/household", label: COMMON.navHousehold },
  { key: "account", href: "/account", label: COMMON.navAccount },
  { key: "methodology", href: "/methodology", label: COMMON.navMethodology },
  { key: "status", href: "/admin/status", label: COMMON.navStatus },
];

const PRIMARY_NAV: readonly NavKey[] = ["intake", "plan", "checklist", "basket", "safety"];

export interface Screen {
  /** Document title (brand name appended at render from config). */
  title: string;
  description: string;
  activeNav: NavKey | null;
  container: ContainerName;
  sections: readonly PageSection[];
  bodyClass?: string;
}

function navLink(item: { key: NavKey; href: string; label: string }, active: NavKey | null): Html {
  const current = item.key === active;
  return html`<a class="nav-link${current ? " nav-link-active" : ""}" href="${item.href}"${
    current ? html` aria-current="page"` : null
  }>${item.label}</a>`;
}

function header(active: NavKey | null): Html {
  const items = NAV_ITEMS.filter((i) => PRIMARY_NAV.includes(i.key));
  return html`<header class="site-header"><div class="site-header-inner"><a class="wordmark" href="/">${BRAND.wordmark}</a><nav class="site-nav" aria-label="Primary">${joinHtml(
    items.map((i) => navLink(i, active)),
  )}</nav></div></header>`;
}

function footer(active: NavKey | null): Html {
  const items = NAV_ITEMS.filter((i) => i.key !== "home");
  return html`<footer class="site-footer"><nav class="footer-nav" aria-label="All pages">${joinHtml(
    items.map((i) => navLink(i, active)),
  )}<a class="nav-link" href="/assets/licenses/ISC-lucide.txt">${COMMON.footerLicenses}</a></nav><p class="footer-brand">${BRAND.name}</p></footer>`;
}

function fixtureRibbon(fixtureMode: boolean): Html {
  if (!fixtureMode) return raw("");
  return html`<div class="fixture-ribbon" role="note">${icon("circle-alert", { size: 14, stroke: 1.75 })}<span>${COMMON.fixtureNotice}</span></div>`;
}

/** Hidden until the enhancement layer detects connection loss. */
function offlineBanner(): Html {
  return html`<div class="offline-banner" id="offline-banner" role="status" hidden>${icon("wifi-off", { size: 20 })}<span>${COMMON.offline}</span></div>`;
}

export function renderSections(sections: readonly PageSection[]): Html {
  assertSlotPlacement(sections);
  assertSafetyFirst(sections);
  return joinHtml(
    sections.map(
      (s) =>
        html`<section class="page-section section-${s.kind}"${s.id ? html` id="${s.id}"` : null}>${s.body}</section>`,
    ),
  );
}

/**
 * [SEO — Phase 8] Per-route head resolved by src/seo/integration.ts
 * (route-metadata map). When absent the document defaults to noindex with
 * no canonical and no structured data — safe by default: a page rendered
 * outside the server integration cannot accidentally enter the index.
 */
export interface SeoHead {
  readonly robots: string;
  readonly canonicalUrl: string | null;
  /** Serialized JSON-LD blocks (already validated + "<"-escaped). */
  readonly jsonLd: readonly string[];
}

const SEO_DEFAULT: SeoHead = { robots: "noindex", canonicalUrl: null, jsonLd: [] };

export interface RenderOptions {
  fixtureMode: boolean;
  seo?: SeoHead;
}

/** Composes the full HTML document for a screen. */
export function renderDocument(screen: Screen, options: RenderOptions): string {
  const seo = options.seo ?? SEO_DEFAULT;
  const doc = html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${screen.title} — ${BRAND.name}</title>
<meta name="description" content="${screen.description}">
<meta name="robots" content="${seo.robots}">
${seo.canonicalUrl ? html`<link rel="canonical" href="${seo.canonicalUrl}">
` : null}${joinHtml(seo.jsonLd.map((block) => html`<script type="application/ld+json">${raw(block)}</script>
`))}<meta name="theme-color" content="#F7F8F2">
<link rel="stylesheet" href="/assets/ui.css">
<link rel="manifest" href="/manifest.webmanifest">
</head>
<body${screen.bodyClass ? html` class="${screen.bodyClass}"` : null}>
<a class="skip-link" href="#main">${COMMON.skipToContent}</a>
${offlineBanner()}
${fixtureRibbon(options.fixtureMode)}
${header(screen.activeNav)}
<main id="main" class="page container-${screen.container}">
${renderSections(screen.sections)}
</main>
${footer(screen.activeNav)}
<script src="/assets/app.js" defer></script>
</body>
</html>`;
  return doc.__html;
}
