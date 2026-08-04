/**
 * Worth-it matrix (§0 capability 4): separates popular from worth buying.
 *
 * HARD RULE (mandate + §1): the dimensions stay VISIBLE and SEPARATE — the
 * matrix is never collapsed into one number. Enforcement is type-level and
 * runtime:
 *  - WorthItMatrix has no aggregate/overall/total/score field (a type-level
 *    assertion in tests/algorithms-worth-it.test.ts fails compilation if one
 *    is ever added);
 *  - this module exports no function that reduces a matrix to a number;
 *  - ratings are categorical, and a rating without supporting evidence is
 *    forced to 'unknown' (§1.5: suppression beats guessing).
 */
export const WORTH_IT_DIMENSIONS = [
  "durability",
  "cost_per_use",
  "requirement_fit",
  "safety",
  "hype_vs_evidence",
] as const;
export type WorthItDimensionId = (typeof WORTH_IT_DIMENSIONS)[number];

export const DIMENSION_RATINGS = ["strong", "adequate", "weak", "unknown"] as const;
export type DimensionRating = (typeof DIMENSION_RATINGS)[number];

/** Evidence grades: a = direct measurement, b = converging indirect,
 *  c = anecdotal/sparse, insufficient = below minimum evidence. */
export const EVIDENCE_GRADES = ["a", "b", "c", "insufficient"] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export interface WorthItDimensionEntry {
  readonly dimension: WorthItDimensionId;
  readonly rating: DimensionRating;
  readonly evidenceGrade: EvidenceGrade;
  /** One-line, dimension-specific summary; never a composite verdict. */
  readonly summary: string;
  readonly provenanceIds: readonly string[];
}

export interface WorthItMatrix {
  readonly productTypeSlug: string;
  /** Exactly the five dimensions, in WORTH_IT_DIMENSIONS order. */
  readonly dimensions: readonly WorthItDimensionEntry[];
  readonly generatedAt: string;
}

export class WorthItValidationError extends Error {
  constructor(detail: string) {
    super(`worth-it matrix rejected: ${detail}`);
    this.name = "WorthItValidationError";
  }
}

/**
 * Assembles and validates a matrix:
 *  - all five dimensions present exactly once (ordered canonically),
 *  - insufficient evidence or missing provenance forces rating 'unknown'
 *    (throws instead of silently rating — the caller must downgrade),
 *  - output carries NO aggregate anywhere.
 */
export function assembleWorthItMatrix(
  productTypeSlug: string,
  entries: readonly WorthItDimensionEntry[],
  generatedAt: string,
): WorthItMatrix {
  const byDimension = new Map<WorthItDimensionId, WorthItDimensionEntry>();
  for (const entry of entries) {
    if (byDimension.has(entry.dimension)) {
      throw new WorthItValidationError(`duplicate dimension '${entry.dimension}'`);
    }
    byDimension.set(entry.dimension, entry);
  }
  for (const dimension of WORTH_IT_DIMENSIONS) {
    if (!byDimension.has(dimension)) {
      throw new WorthItValidationError(`missing dimension '${dimension}'`);
    }
  }
  for (const entry of entries) {
    if (entry.rating !== "unknown" && entry.evidenceGrade === "insufficient") {
      throw new WorthItValidationError(
        `dimension '${entry.dimension}' rated '${entry.rating}' with ` +
          `insufficient evidence — a rating without evidence must be 'unknown' (§1.5)`,
      );
    }
    if (entry.rating !== "unknown" && entry.provenanceIds.length === 0) {
      throw new WorthItValidationError(
        `dimension '${entry.dimension}' rated '${entry.rating}' without ` +
          `provenance — a fact without provenance does not render (§1.4)`,
      );
    }
  }
  return {
    productTypeSlug,
    dimensions: WORTH_IT_DIMENSIONS.map((d) => byDimension.get(d)!),
    generatedAt,
  };
}
