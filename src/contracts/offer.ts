/**
 * Retailer offer contracts (Phase 2, ingestion-engineer; consumed by the
 * >=3-retailer basket comparison in Phase 4 — §0 capability 3).
 *
 * §1.1 HARD RULE: no commission, affiliate-economics, payout, or referral
 * field may EVER exist here — offers feed basket ranking directly. The
 * schema-side guard in tests/schema.test.ts scans every column name.
 *
 * Two shapes:
 *  - OfferCandidate: what a product feed adapter emits, keyed by retailer
 *    SKU/UPC. It has NO variant reference — entity resolution (Phase 4) maps
 *    candidates onto product_variants; unresolved candidates are suppressed
 *    from comparison (§1.5), never guessed into the basket.
 *  - Offer: the persisted, variant-resolved row (offers table), one per
 *    (variant, retailer), price/stock provenance attached.
 */
import type { IsoTimestamp, WithProvenance } from "./provenance";

export const AVAILABILITY_STATUSES = [
  "in_stock",
  "out_of_stock",
  "limited",
  "unknown",
] as const;
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

/** USD only for the US-scoped MVP; CHECK-enforced in SQL. */
export const CURRENCIES = ["USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Raw normalized feed line, pre-entity-resolution. */
export interface OfferCandidate {
  retailerSlug: string;
  retailerName: string;
  sku: string;
  title: string;
  /** UPC as printed in the feed; fixture feeds use FIXTURE- prefixed values. */
  upc: string | null;
  priceCents: number;
  currency: Currency;
  availability: AvailabilityStatus;
  /** null = shipping unknown (a §1.5 suppression input for landed cost). */
  shippingCents: number | null;
  /** Plain product deep link. Monetization decoration is Phase 9 and must
   * never alter ranking (§1.1). */
  deepLinkUrl: string | null;
}

/** Persisted offer: latest known price/stock for a resolved variant at a retailer. */
export interface Offer extends WithProvenance {
  id: string;
  variantId: string;
  retailerId: string;
  priceCents: number;
  currency: Currency;
  availability: AvailabilityStatus;
  shippingCents: number | null;
  deepLinkUrl: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
