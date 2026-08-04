/**
 * match(i, j) — requirement-to-candidate matching (§0 capability 3 input).
 *
 * Two stages, strictly ordered:
 *  1. HARD-CONSTRAINT GATE. A violated prohibited-substitution or a missing
 *     required attribute disqualifies the candidate outright — no soft score
 *     is computed and no soft score can rescue it (handoff 04 §8: hard
 *     filters, never soft preferences). Product type, required brand, and
 *     dimension identity are gated the same way; a candidate whose dimensions
 *     are unknown while the requirement specifies them is disqualified rather
 *     than guessed (§1.5).
 *  2. WEIGHTED SOFT ATTRIBUTES over the surviving candidates: brand
 *     preference, color, ruling, material, pack fit. Score is the weighted
 *     mean over the dimensions applicable to the requirement.
 *
 * §1.1: no signature or type in this module has any economics input, and the
 * ranking tie-break is the candidate key — never anything monetary. The
 * byte-identical injection test lives in tests/algorithms-match.test.ts.
 */
import { CONSTRAINT_DEFS, type ConstraintCode } from "../contracts/constraint";
import type { BrandRequirement } from "../contracts/requirement";
import type { RulingStyle } from "../contracts/product";
import { compareStrings, round } from "./types";

/** The requirement-side match input (already user-confirmed; see handoff 04 §8). */
export interface MatchRequirementInput {
  readonly productTypeSlug: string;
  /** Net units needed: quantity x (packCount ?? 1). Positive integer. */
  readonly requiredUnits: number;
  readonly color: string | null;
  readonly material: string | null;
  readonly rulingStyle: RulingStyle | null;
  /** Variant discriminator ('1.5 in'); distinct dimensions never merge. */
  readonly dimensions: string | null;
  readonly brandRequirement: BrandRequirement;
  /** Brand slug when brandRequirement is 'required' or 'preferred'. */
  readonly brandSlug: string | null;
  readonly prohibitedSubstitutions: readonly ConstraintCode[];
}

/** The candidate-side match input (catalog variant or resolved offer line). */
export interface MatchCandidateInput {
  /** Deterministic id, e.g. 'retailer:sku' or a variant id. */
  readonly candidateKey: string;
  readonly productTypeSlug: string;
  readonly brandSlug: string | null;
  readonly color: string | null;
  readonly material: string | null;
  readonly rulingStyle: RulingStyle | null;
  readonly dimensions: string | null;
  /** Units per purchase; null = sold as a single unit. */
  readonly packCount: number | null;
  /** required_attribute tokens this candidate satisfies ('presharpened'). */
  readonly attributeTokens: readonly string[];
  /** Substitute-class tokens this candidate belongs to ('bluetooth'). */
  readonly classTokens: readonly string[];
  /** §1.4 lineage for every fact used here. */
  readonly provenanceIds: readonly string[];
}

/** 'presharpened_required' -> 'presharpened'. */
export function requiredAttributeToken(code: ConstraintCode): string {
  return code.replace(/_required$/, "");
}

/** 'no_bluetooth' -> 'bluetooth'. */
export function prohibitedClassToken(code: ConstraintCode): string {
  return code.replace(/^no_/, "");
}

const KIND_BY_CODE: ReadonlyMap<string, "required_attribute" | "prohibited_substitution"> =
  new Map(CONSTRAINT_DEFS.map((d) => [d.code, d.kind]));

export type MatchDisqualifier =
  | { readonly code: "product_type_mismatch"; readonly detail: string }
  | { readonly code: "brand_requirement_violated"; readonly detail: string }
  | {
      readonly code: "required_attribute_missing";
      readonly constraint: ConstraintCode;
      readonly detail: string;
    }
  | {
      readonly code: "prohibited_substitution_present";
      readonly constraint: ConstraintCode;
      readonly detail: string;
    }
  | { readonly code: "dimensions_mismatch"; readonly detail: string }
  | { readonly code: "dimensions_unverified"; readonly detail: string };

export const SOFT_DIMENSIONS = [
  "brand_preference",
  "color",
  "ruling",
  "material",
  "pack_fit",
] as const;
export type SoftDimension = (typeof SOFT_DIMENSIONS)[number];

/** Fixed model constants; sum to 1.0. Documented in handoff 05 §4. */
export const SOFT_WEIGHTS: Readonly<Record<SoftDimension, number>> = {
  brand_preference: 0.3,
  color: 0.2,
  ruling: 0.2,
  material: 0.15,
  pack_fit: 0.15,
};

export interface SoftComponent {
  readonly dimension: SoftDimension;
  readonly weight: number;
  readonly applicable: boolean;
  /** 0..1 satisfaction on this dimension; 0 when not applicable. */
  readonly value: number;
}

export type MatchResult =
  | {
      readonly candidateKey: string;
      readonly eligible: false;
      readonly disqualifiers: readonly MatchDisqualifier[];
      readonly provenanceIds: readonly string[];
    }
  | {
      readonly candidateKey: string;
      readonly eligible: true;
      /** Weighted mean over applicable soft dimensions, rounded to 4 dp. */
      readonly score: number;
      readonly components: readonly SoftComponent[];
      readonly provenanceIds: readonly string[];
    };

const norm = (s: string | null): string | null =>
  s === null ? null : s.trim().toLowerCase();

function gate(
  req: MatchRequirementInput,
  cand: MatchCandidateInput,
): MatchDisqualifier[] {
  const out: MatchDisqualifier[] = [];
  if (req.productTypeSlug !== cand.productTypeSlug) {
    out.push({
      code: "product_type_mismatch",
      detail: `requirement is ${req.productTypeSlug}; candidate is ${cand.productTypeSlug}`,
    });
  }
  if (req.brandRequirement === "required" && req.brandSlug !== null) {
    if (cand.brandSlug !== req.brandSlug) {
      out.push({
        code: "brand_requirement_violated",
        detail: `brand ${req.brandSlug} is required; candidate brand is ${cand.brandSlug ?? "generic"}`,
      });
    }
  }
  const attrs = new Set(cand.attributeTokens);
  const classes = new Set(cand.classTokens);
  for (const constraint of req.prohibitedSubstitutions) {
    const kind = KIND_BY_CODE.get(constraint);
    if (kind === "required_attribute") {
      const token = requiredAttributeToken(constraint);
      if (!attrs.has(token)) {
        out.push({
          code: "required_attribute_missing",
          constraint,
          detail: `candidate does not declare required attribute '${token}'`,
        });
      }
    } else if (kind === "prohibited_substitution") {
      const token = prohibitedClassToken(constraint);
      if (classes.has(token)) {
        out.push({
          code: "prohibited_substitution_present",
          constraint,
          detail: `candidate belongs to prohibited class '${token}'`,
        });
      }
    }
  }
  if (req.dimensions !== null) {
    if (cand.dimensions === null) {
      // Unknown is not a match (§1.5: suppress, never guess).
      out.push({
        code: "dimensions_unverified",
        detail: `requirement specifies ${req.dimensions}; candidate dimensions unknown`,
      });
    } else if (norm(req.dimensions) !== norm(cand.dimensions)) {
      out.push({
        code: "dimensions_mismatch",
        detail: `requirement specifies ${req.dimensions}; candidate is ${cand.dimensions}`,
      });
    }
  }
  return out;
}

function softComponents(
  req: MatchRequirementInput,
  cand: MatchCandidateInput,
): SoftComponent[] {
  const equalOrZero = (r: string | null, c: string | null): number =>
    r !== null && c !== null && norm(r) === norm(c) ? 1 : 0;

  const pack = cand.packCount ?? 1;
  const purchased = Math.ceil(req.requiredUnits / pack) * pack;

  const brandApplicable =
    req.brandRequirement === "preferred" && req.brandSlug !== null;

  const rows: Array<[SoftDimension, boolean, number]> = [
    [
      "brand_preference",
      brandApplicable,
      brandApplicable && cand.brandSlug === req.brandSlug ? 1 : 0,
    ],
    ["color", req.color !== null, equalOrZero(req.color, cand.color)],
    [
      "ruling",
      req.rulingStyle !== null,
      req.rulingStyle !== null && cand.rulingStyle === req.rulingStyle ? 1 : 0,
    ],
    ["material", req.material !== null, equalOrZero(req.material, cand.material)],
    ["pack_fit", true, round(req.requiredUnits / purchased, 6)],
  ];
  return rows.map(([dimension, applicable, value]) => ({
    dimension,
    weight: SOFT_WEIGHTS[dimension],
    applicable,
    value: applicable ? value : 0,
  }));
}

/**
 * match(i, j): hard gate first; soft weighted score only for survivors.
 * Score = sum(w_k * v_k) / sum(w_k) over APPLICABLE dimensions, so an
 * unspecified requirement attribute never dilutes the score.
 */
export function match(
  req: MatchRequirementInput,
  cand: MatchCandidateInput,
): MatchResult {
  if (!Number.isInteger(req.requiredUnits) || req.requiredUnits <= 0) {
    throw new RangeError(
      `requiredUnits must be a positive integer; got ${req.requiredUnits}`,
    );
  }
  const disqualifiers = gate(req, cand);
  if (disqualifiers.length > 0) {
    return {
      candidateKey: cand.candidateKey,
      eligible: false,
      disqualifiers,
      provenanceIds: cand.provenanceIds,
    };
  }
  const components = softComponents(req, cand);
  const applicable = components.filter((c) => c.applicable);
  const weightSum = applicable.reduce((s, c) => s + c.weight, 0);
  const valueSum = applicable.reduce((s, c) => s + c.weight * c.value, 0);
  return {
    candidateKey: cand.candidateKey,
    eligible: true,
    score: weightSum === 0 ? 1 : round(valueSum / weightSum, 4),
    components,
    provenanceIds: cand.provenanceIds,
  };
}

export interface MatchRanking {
  /** Eligible candidates, score descending; tie-break candidateKey ascending. */
  readonly eligible: readonly Extract<MatchResult, { eligible: true }>[];
  /** Gated-out candidates with their disqualifiers (§1.5: visible, not silent). */
  readonly excluded: readonly Extract<MatchResult, { eligible: false }>[];
}

/** Ranks candidates for one requirement. Deterministic; no monetary input exists. */
export function rankCandidates(
  req: MatchRequirementInput,
  candidates: readonly MatchCandidateInput[],
): MatchRanking {
  const results = candidates.map((c) => match(req, c));
  const eligible = results
    .filter((r): r is Extract<MatchResult, { eligible: true }> => r.eligible)
    .sort(
      (a, b) => b.score - a.score || compareStrings(a.candidateKey, b.candidateKey),
    );
  const excluded = results
    .filter((r): r is Extract<MatchResult, { eligible: false }> => !r.eligible)
    .sort((a, b) => compareStrings(a.candidateKey, b.candidateKey));
  return { eligible, excluded };
}
