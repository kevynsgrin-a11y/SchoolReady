/**
 * SEO policy thresholds — Phase 8 (seo-architect).
 *
 * Every numeric threshold the SEO layer applies lives HERE, not inline, so
 * tuning is a config change with test coverage, never a scattered edit.
 * These are policy constants (like the trend engine's own TrendConfig), not
 * observed facts — no price, rating, or engagement number appears here.
 *
 * The canonical origin derives from config/brand.ts at call time. The brand
 * name/domain is never hardcoded anywhere in src/seo (§0 brand isolation;
 * tests/config.test.ts scans for the literal).
 */
import { BRAND } from "../../config/brand";
import { DEFAULT_TREND_CONFIG } from "../algorithms/trend";
import type { SourceType } from "../contracts/provenance";

/** Absolute origin for canonicals, sitemap `<loc>`s, and JSON-LD urls. */
export function canonicalOrigin(): string {
  return `https://${BRAND.domain}`;
}

/* ------------------------------------------------------------------ */
/* Programmatic quality gate thresholds                                */
/* ------------------------------------------------------------------ */

export interface SeoQualityGateConfig {
  /**
   * Minimum provenance records from a VERIFIED source type (below). Note
   * that "fixture" is deliberately absent from the verified list: synthetic
   * beta data can render for users (labeled), but can never justify
   * generating an indexable programmatic page. In fixture mode this check
   * alone keeps every programmatic page out of the index — by design.
   */
  readonly minVerifiedSources: number;
  /** Minimum data-backed fields the template actually populated. */
  readonly minPopulatedFields: number;
  /** Newest supporting evidence must be at most this old. */
  readonly maxEvidenceAgeDays: number;
  /**
   * Jaccard similarity (word 3-gram shingles) versus any existing page at
   * or above this value marks the candidate as duplicative and rejects it.
   */
  readonly maxTemplateSimilarity: number;
  /** Shingle width (words) used by the similarity check. */
  readonly shingleWidth: number;
  /** Source types that count as verified for the gate. */
  readonly verifiedSourceTypes: readonly SourceType[];
}

export const SEO_QUALITY_GATE: SeoQualityGateConfig = {
  minVerifiedSources: 1,
  minPopulatedFields: 6,
  maxEvidenceAgeDays: 30,
  maxTemplateSimilarity: 0.6,
  shingleWidth: 3,
  verifiedSourceTypes: [
    "government_feed",
    "licensed_api",
    "retailer_feed",
    "operator_curation",
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Trend-page expiry                                                   */
/* ------------------------------------------------------------------ */

/**
 * Days until a trend page's evidence is too old to stand behind, DERIVED
 * from the trend engine's own decay constants rather than invented here:
 * the engine weights evidence by e^(-ageDays/tauDays) and refuses any
 * family whose weight falls below freshnessFloor, so the oldest age at
 * which even a single fresh-at-observation signal still clears the floor is
 * tauDays * ln(1 / freshnessFloor). Past that age the engine itself would
 * reject the evidence — so the page auto-expires into review.
 */
export const TREND_PAGE_EXPIRY_DAYS = Math.ceil(
  DEFAULT_TREND_CONFIG.tauDays * Math.log(1 / DEFAULT_TREND_CONFIG.freshnessFloor),
);
