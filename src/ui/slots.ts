/**
 * §1.2 as layout DATA: the ad-slot registry and the placement rule.
 *
 * The rule (CLAUDE.md §1.2): no ad slot, sponsored unit, upsell, or
 * interstitial may render between a user and a required list item, a
 * safety/recall warning, a dress-code restriction, a list correction, a
 * price change, an assistance resource, or a shopping deadline.
 *
 * Encoding: every screen renders as an ORDERED list of typed sections; the
 * page composer calls assertSlotPlacement() on that list AT RENDER TIME, so
 * a violating layout throws instead of shipping. Monetization-engineer's
 * Phase 9 route-tree scan verifies the same rule from the outside using
 * this module's exports as its contract.
 *
 * Slots are reserved at FIXED dimensions (zero CLS) and are allowed only on
 * editorial/guide surfaces — no planner, safety, or checkout-path surface
 * declares one, and in this beta no slot is mounted anywhere.
 */
import type { Html } from "./html";
import { html } from "./html";
import { icon } from "./icons";
import { BADGES } from "./copy/en";

/* ------------------------------------------------------------------ */
/* Section kinds                                                       */
/* ------------------------------------------------------------------ */

export const SECTION_KINDS = [
  // §1.2 protected content — an ad may never precede any of these.
  "safety_warning",
  "required_items",
  "dress_code_restriction",
  "correction",
  "price_change",
  "assistance_resource",
  "deadline",
  // Everything else.
  "content",
  "form",
  "navigation",
  "disclosure",
  "ad_slot",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const CRITICAL_SECTION_KINDS: readonly SectionKind[] = [
  "safety_warning",
  "required_items",
  "dress_code_restriction",
  "correction",
  "price_change",
  "assistance_resource",
  "deadline",
];

export interface PageSection {
  kind: SectionKind;
  body: Html;
  /** Optional wrapper id (skip links, tests). */
  id?: string;
}

export class SlotPlacementError extends Error {
  constructor(detail: string) {
    super(`ad-slot placement violation (SS1.2): ${detail}`);
    this.name = "SlotPlacementError";
  }
}

/**
 * Throws unless every ad_slot section sits AFTER the last critical section
 * — i.e. no commercial unit between the user and protected content, in
 * document order. Safety warnings additionally must precede any ad slot by
 * construction (they are critical), satisfying "recall warnings above all
 * commercial content".
 */
export function assertSlotPlacement(sections: readonly { kind: SectionKind }[]): void {
  let lastCritical = -1;
  for (let i = sections.length - 1; i >= 0; i -= 1) {
    if (CRITICAL_SECTION_KINDS.includes(sections[i]!.kind)) {
      lastCritical = i;
      break;
    }
  }
  if (lastCritical === -1) return;
  for (let i = 0; i < lastCritical; i += 1) {
    if (sections[i]!.kind === "ad_slot") {
      throw new SlotPlacementError(
        `an ad_slot at section index ${i} precedes protected content at index ${lastCritical}`,
      );
    }
  }
}

/** Commercial section kinds — anything monetization-adjacent. */
export const COMMERCIAL_SECTION_KINDS: readonly SectionKind[] = ["ad_slot", "disclosure"];

/**
 * Safety-above-commercial (layout rule): every safety/recall warning must
 * render ABOVE every commercial section on the page. (Screens additionally
 * place recall banners first in their section order; tests pin that too.)
 */
export function assertSafetyFirst(sections: readonly { kind: SectionKind }[]): void {
  let maxSafety = -1;
  let minCommercial = Number.POSITIVE_INFINITY;
  sections.forEach((s, i) => {
    if (s.kind === "safety_warning") maxSafety = Math.max(maxSafety, i);
    if (COMMERCIAL_SECTION_KINDS.includes(s.kind)) minCommercial = Math.min(minCommercial, i);
  });
  if (maxSafety !== -1 && minCommercial < maxSafety) {
    throw new SlotPlacementError(
      `a commercial section at index ${minCommercial} renders above a safety_warning at index ${maxSafety}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Slot registry (Phase 9 contract)                                    */
/* ------------------------------------------------------------------ */

/** Surfaces where a slot MAY mount. Planner/safety surfaces are absent. */
export const SLOT_SURFACES = ["editorial_article", "editorial_guide_footer"] as const;
export type SlotSurface = (typeof SLOT_SURFACES)[number];

export interface AdSlotSpec {
  readonly id: string;
  /** Fixed reserved dimensions in px — the container never resizes (CLS 0). */
  readonly widthPx: number;
  readonly heightPx: number;
  readonly surfaces: readonly SlotSurface[];
  readonly description: string;
}

/**
 * The only slots that may ever exist. Standard IAB fixed sizes so creative
 * never reflows the reservation. In this beta ZERO slots are mounted;
 * editorial surfaces arrive in Phase 8 and fill/decline in Phase 9.
 */
export const AD_SLOT_REGISTRY: readonly AdSlotSpec[] = [
  {
    id: "editorial-inline-rect",
    widthPx: 300,
    heightPx: 250,
    surfaces: ["editorial_article"],
    description: "Single mid-article rectangle on editorial articles, below all protected content.",
  },
  {
    id: "editorial-footer-leaderboard",
    widthPx: 728,
    heightPx: 90,
    surfaces: ["editorial_guide_footer"],
    description: "Guide-page footer leaderboard, after the entire guide body.",
  },
] as const;

export function getSlotSpec(id: string): AdSlotSpec | undefined {
  return AD_SLOT_REGISTRY.find((s) => s.id === id);
}

/**
 * Renders a reserved, fixed-dimension sponsored container (ticket-notch
 * chip label per direction §2/§6). The reservation renders at full size
 * whether or not creative fills it — layout never shifts.
 */
export function renderAdSlot(spec: AdSlotSpec, creative: Html | null = null): Html {
  return html`<div class="ad-slot" data-slot-id="${spec.id}" style="width:${spec.widthPx}px;height:${spec.heightPx}px">
    <span class="badge badge-sponsored chip-ticket">${icon("megaphone", { size: 14, stroke: 1.75 })}<span>${BADGES.sponsored}</span></span>
    ${creative}
  </div>`;
}
