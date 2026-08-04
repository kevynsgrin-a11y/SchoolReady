/**
 * Badge system — direction.md §6, all eleven badges.
 *
 * Every badge = Lucide icon + mandatory text label + color + chip style.
 * Icon-only and color-only rendering are impossible by construction: the
 * label argument is baked into each factory and tests assert both channels
 * appear in the markup at every size. Chip grammar (direction §2):
 * solid fill = blocking/safety; dashed = availability/freshness;
 * outline = evidence/necessity; ticket notch = commercial.
 */
import type { Html } from "../html";
import { html } from "../html";
import type { IconName } from "../icons";
import { icon } from "../icons";
import { BADGES } from "../copy/en";

export const BADGE_KINDS = [
  "required",
  "useful",
  "optional",
  "trending",
  "cooling",
  "insufficient-evidence",
  "sponsored",
  "recalled",
  "out-of-stock",
  "school-restricted",
  "stale",
] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

interface BadgeSpec {
  readonly icon: IconName;
  readonly chipClass: string;
}

/** Fixed icon + chip-style mapping (direction §6 table; do not improvise). */
export const BADGE_SPECS: Readonly<Record<BadgeKind, BadgeSpec>> = {
  required: { icon: "asterisk", chipClass: "badge-required chip-fill" },
  useful: { icon: "circle-plus", chipClass: "badge-useful chip-outline" },
  optional: { icon: "circle-dashed", chipClass: "badge-optional chip-outline" },
  trending: { icon: "trending-up", chipClass: "badge-trending chip-outline" },
  cooling: { icon: "trending-down", chipClass: "badge-cooling chip-outline" },
  "insufficient-evidence": { icon: "circle-help", chipClass: "badge-insufficient chip-dotted" },
  sponsored: { icon: "megaphone", chipClass: "badge-sponsored chip-ticket" },
  recalled: { icon: "octagon-alert", chipClass: "badge-recalled chip-fill" },
  "out-of-stock": { icon: "package-x", chipClass: "badge-out-of-stock chip-dashed" },
  "school-restricted": { icon: "shield-x", chipClass: "badge-restricted chip-fill" },
  stale: { icon: "clock-alert", chipClass: "badge-stale chip-dashed" },
};

function renderBadge(kind: BadgeKind, label: string): Html {
  const spec = BADGE_SPECS[kind];
  return html`<span class="badge ${spec.chipClass}" data-badge="${kind}">${icon(spec.icon, {
    size: 14,
    stroke: 1.75,
  })}<span class="badge-label">${label}</span></span>`;
}

export const requiredBadge = (): Html => renderBadge("required", BADGES.required);
export const usefulBadge = (): Html => renderBadge("useful", BADGES.useful);
export const optionalBadge = (): Html => renderBadge("optional", BADGES.optional);
export const coolingBadge = (): Html => renderBadge("cooling", BADGES.cooling);
export const insufficientEvidenceBadge = (): Html =>
  renderBadge("insufficient-evidence", BADGES.insufficientEvidence);
export const sponsoredBadge = (): Html => renderBadge("sponsored", BADGES.sponsored);
export const recalledBadge = (): Html => renderBadge("recalled", BADGES.recalled);
export const outOfStockBadge = (): Html => renderBadge("out-of-stock", BADGES.outOfStock);
export const schoolRestrictedBadge = (): Html =>
  renderBadge("school-restricted", BADGES.schoolRestricted);

/**
 * §1.3: the trending badge REQUIRES its evidence count — there is no way to
 * render it without one (evidence is part of the design, not a tooltip).
 */
export const trendingBadge = (passingFamilies: number, totalFamilies: number): Html =>
  renderBadge("trending", BADGES.trending(passingFamilies, totalFamilies));

/** Freshness badge; the last-checked date comes from the source envelope. */
export const staleBadge = (lastCheckedDate: string): Html =>
  renderBadge("stale", BADGES.stale(lastCheckedDate));

export interface BadgeData {
  /** Trending badge evidence counts — mandatory for "trending" (§1.3). */
  passingFamilies?: number;
  totalFamilies?: number;
  /** Last-checked date — mandatory for "stale". */
  lastCheckedDate?: string;
}

/** Generic accessor (enumeration + data-driven call sites). Badges whose
 *  labels embed data REFUSE to render without it — no default is invented. */
export function badgeFor(kind: BadgeKind, data: BadgeData = {}): Html {
  switch (kind) {
    case "required": return requiredBadge();
    case "useful": return usefulBadge();
    case "optional": return optionalBadge();
    case "trending": {
      if (data.passingFamilies === undefined || data.totalFamilies === undefined) {
        throw new Error("trending badge requires its signal-family counts (SS1.3)");
      }
      return trendingBadge(data.passingFamilies, data.totalFamilies);
    }
    case "cooling": return coolingBadge();
    case "insufficient-evidence": return insufficientEvidenceBadge();
    case "sponsored": return sponsoredBadge();
    case "recalled": return recalledBadge();
    case "out-of-stock": return outOfStockBadge();
    case "school-restricted": return schoolRestrictedBadge();
    case "stale": {
      if (data.lastCheckedDate === undefined) {
        throw new Error("stale badge requires the last-checked date from the source envelope");
      }
      return staleBadge(data.lastCheckedDate);
    }
  }
}
