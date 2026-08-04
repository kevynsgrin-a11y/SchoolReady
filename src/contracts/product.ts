/**
 * Product catalog, identity graph, and entity-resolution contracts.
 *
 * §1.1: none of these types may ever gain a commission, affiliate-economics,
 * payout, or referral field — they all feed match/basket ranking. Enforced at
 * the schema level by tests/schema.test.ts.
 */
import type { Confidence, IsoTimestamp, WithProvenance } from "./provenance";

export const PRODUCT_CATEGORIES = [
  "writing",
  "paper",
  "organization",
  "art",
  "tech",
  "clothing",
  "hygiene",
  "classroom_shared",
  "other",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const UNITS = [
  "each",
  "pack",
  "box",
  "set",
  "pair",
  "ream",
  "dozen",
  "roll",
  "bottle",
  "tube",
  "stick",
] as const;
export type Unit = (typeof UNITS)[number];

export const DURABILITIES = ["consumable", "durable"] as const;
export type Durability = (typeof DURABILITIES)[number];

export const RULING_STYLES = [
  "wide_ruled",
  "college_ruled",
  "graph",
  "primary_ruled",
  "dotted",
  "unruled",
] as const;
export type RulingStyle = (typeof RULING_STYLES)[number];

export interface Brand extends WithProvenance {
  id: string;
  name: string;
  /** Lowercased, punctuation-collapsed merge key; unique. */
  normalizedName: string;
  createdAt: IsoTimestamp;
}

/** Canonical product-type taxonomy node ('glue-stick'). Requirements point here. */
export interface ProductType extends WithProvenance {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  defaultUnit: Unit;
  defaultDurability: Durability;
  createdAt: IsoTimestamp;
}

/** Abstract product: a brand's line of a canonical type. brandId null = generic. */
export interface Product extends WithProvenance {
  id: string;
  productTypeId: string;
  brandId: string | null;
  name: string;
  modelLine: string | null;
  createdAt: IsoTimestamp;
}

export const RESOLUTION_STATUSES = ["unresolved", "resolved", "ambiguous"] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

/**
 * Sellable variant. `size` is a PRODUCT attribute ('1 in', '24 ct') — never a
 * person's size (§1.7). §1.5: variants with resolutionStatus !== 'resolved'
 * are suppressed from user-facing comparison.
 */
export interface ProductVariant extends WithProvenance {
  id: string;
  productId: string;
  /** ER cluster representative; null until resolved. Representatives self-point. */
  canonicalVariantId: string | null;
  resolutionStatus: ResolutionStatus;
  size: string | null;
  color: string | null;
  packCount: number | null;
  dimensions: string | null;
  material: string | null;
  rulingStyle: RulingStyle | null;
  mpn: string | null;
  createdAt: IsoTimestamp;
}

/** Deliberately minimal; §1.1 forbids any economics field here forever. */
export interface Retailer extends WithProvenance {
  id: string;
  slug: string;
  name: string;
  createdAt: IsoTimestamp;
}

export const IDENTIFIER_TYPES = [
  "gtin14",
  "upc_a",
  "ean13",
  "isbn13",
  "mpn",
  "retailer_sku",
] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

/**
 * Identity-graph edge: an external identifier attached to a variant.
 * GTIN-family identifiers are global (retailerId null); 'retailer_sku' is
 * scoped to the issuing retailer (retailerId required).
 */
export interface ProductIdentifier extends WithProvenance {
  id: string;
  variantId: string;
  idType: IdentifierType;
  idValue: string;
  retailerId: string | null;
  createdAt: IsoTimestamp;
}

export const ER_RELATIONS = [
  "same_item",
  "pack_variant_of",
  "substitutable_for",
] as const;
export type ErRelation = (typeof ER_RELATIONS)[number];

export const ER_METHODS = [
  "exact_identifier",
  "normalized_attributes",
  "model_inference",
  "operator_review",
] as const;
export type ErMethod = (typeof ER_METHODS)[number];

export const ER_EDGE_STATUSES = ["proposed", "accepted", "rejected"] as const;
export type ErEdgeStatus = (typeof ER_EDGE_STATUSES)[number];

/**
 * Entity-resolution evidence edge. Model:
 *  1. exact_identifier — shared GTIN-family id => score 1.0, auto-acceptable.
 *  2. normalized_attributes — same brand+type+size/pack/color under
 *     normalization => scored candidate.
 *  3. model_inference — fuzzy match => scored candidate, never auto-accepted.
 *  4. operator_review — human decision; the only method that resolves
 *     'ambiguous'.
 * Acceptance thresholds live with algorithm-engineer (Phase 4); below
 * threshold stays 'proposed' and the variant stays suppressed (§1.5).
 */
export interface EntityResolutionEdge extends WithProvenance {
  id: string;
  variantAId: string;
  variantBId: string;
  relation: ErRelation;
  method: ErMethod;
  score: Confidence;
  status: ErEdgeStatus;
  createdAt: IsoTimestamp;
}
