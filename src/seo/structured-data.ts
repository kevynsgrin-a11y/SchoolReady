/**
 * Structured data (JSON-LD) — Phase 8 (seo-architect).
 *
 * Only where genuinely applicable: WebSite on the homepage and
 * BreadcrumbList on indexable tool pages — both describe things we actually
 * hold. NOTHING here may ever claim review, rating, or offer data we do not
 * have: assertNoInventedMarkup() throws on any such node and every emitter
 * serializes through it, so invented markup cannot ship. (FAQPage is
 * deliberately absent — no real Q&A content exists yet; add the helper only
 * when it does.)
 */
import { BRAND } from "../../config/brand";
import { canonicalOrigin } from "./config";

/**
 * Schema.org types this product must never emit: they assert commercial or
 * review data we do not hold (§ "never invent a number"; §1.1 posture).
 */
export const FORBIDDEN_STRUCTURED_TYPES = [
  "AggregateRating",
  "Review",
  "Rating",
  "Offer",
  "AggregateOffer",
  "Product",
] as const;

/** Keys whose mere presence means invented review/rating/offer data. */
export const FORBIDDEN_STRUCTURED_KEYS = [
  "aggregateRating",
  "review",
  "reviews",
  "ratingValue",
  "reviewCount",
  "ratingCount",
  "offers",
  "price",
  "priceValidUntil",
] as const;

export class InventedMarkupError extends Error {
  constructor(detail: string) {
    super(`structured-data violation: ${detail}`);
    this.name = "InventedMarkupError";
  }
}

/** Deep-walks a JSON-LD node; throws if any forbidden type/key appears. */
export function assertNoInventedMarkup(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) assertNoInventedMarkup(item);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if ((FORBIDDEN_STRUCTURED_KEYS as readonly string[]).includes(key)) {
      throw new InventedMarkupError(`forbidden key "${key}" (review/rating/offer data we do not hold)`);
    }
    if (key === "@type") {
      const types = Array.isArray(value) ? value : [value];
      for (const t of types) {
        if (typeof t === "string" && (FORBIDDEN_STRUCTURED_TYPES as readonly string[]).includes(t)) {
          throw new InventedMarkupError(`forbidden @type "${t}" (review/rating/offer data we do not hold)`);
        }
      }
    }
    assertNoInventedMarkup(value);
  }
}

/**
 * Serializes JSON-LD for a <script type="application/ld+json"> block after
 * asserting no invented markup. "<" is escaped so the payload can never
 * close its own script tag.
 */
export function serializeJsonLd(node: object): string {
  assertNoInventedMarkup(node);
  return JSON.stringify(node).replace(/</g, "\\u003c");
}

/** WebSite node for the homepage. Name/url from config — never a literal. */
export function webSiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND.name,
    url: `${canonicalOrigin()}/`,
  };
}

export interface BreadcrumbItem {
  readonly name: string;
  readonly path: string;
}

/** BreadcrumbList for an indexable tool page's real navigation trail. */
export function breadcrumbJsonLd(items: readonly BreadcrumbItem[]): object {
  const origin = canonicalOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
}
