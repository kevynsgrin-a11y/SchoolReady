/**
 * Parsing pipeline types (Phase 3, parser-engineer).
 *
 * Intake (paste / manual / photo-PDF upload) -> OCR (upload path, fixture
 * engine only) -> PII redaction -> normalization -> confidence scoring ->
 * review payload. The parser PROPOSES; the user CONFIRMS: every parse yields
 * a ReviewPayload with `requiresUserConfirmation: true`, and ambiguous items
 * carry `needsReview: true` — the parser never guesses (SS1.5).
 *
 * SS1.7: raw intake text is PII-redacted at the boundary; only redacted text
 * appears anywhere downstream (review payload, logs). Persisted structure is
 * controlled-vocabulary fields only.
 */
import type {
  BrandRequirement,
  Confidence,
  Durability,
  IntakeMethod,
  IsoTimestamp,
  Optionality,
  ProvenanceRecord,
  RequirementScope,
  RequirementSourceKind,
  RulingStyle,
  Unit,
} from "../contracts";
import type { ConstraintCode } from "../contracts/constraint";
import type { Clock } from "../ingestion/types";

export type { Clock };

/** SS1.4 field 6 for every parsed fact (bumped on parser behavior changes). */
export const PARSER_TRANSFORM_VERSION = "list-parser@0.3.0";

/**
 * Ambiguity flags surfaced on review items. REVIEW_FORCING_FLAGS force
 * `needsReview: true` (SS1.5: suppress/route to human, never guess); the
 * remainder are informational highlights inside the always-mandatory review.
 */
export const AMBIGUITY_FLAGS = [
  "ambiguous_product",
  "color_choice",
  "conflicting_quantities",
  "low_ocr_confidence",
  "multi_color_split_needed",
  "multiple_brands",
  "multiple_products",
  "quantity_implicit_one",
  "underspecified_variant_size",
  "unparsed_detail",
  "unrecognized_product",
] as const;
export type AmbiguityFlag = (typeof AMBIGUITY_FLAGS)[number];

export const REVIEW_FORCING_FLAGS: readonly AmbiguityFlag[] = [
  "ambiguous_product",
  "conflicting_quantities",
  "low_ocr_confidence",
  "multi_color_split_needed",
  "multiple_brands",
  "multiple_products",
  "underspecified_variant_size",
  "unparsed_detail",
  "unrecognized_product",
];

/**
 * A proposed requirement in the Phase 1 schema's field vocabulary
 * (src/contracts/requirement.ts). Differences from the persisted Requirement
 * row, by design:
 *  - productTypeSlug (canonical taxonomy slug) instead of productTypeId /
 *    requiredBrandId — ULID assignment and FK resolution are Phase 5;
 *  - nullable slug/durability for unresolved items, which can only persist
 *    AFTER the user resolves them in review (SS1.5).
 */
export interface ParsedRequirementDraft {
  productTypeSlug: string | null;
  quantity: number;
  unit: Unit;
  packCount: number | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  rulingStyle: RulingStyle | null;
  brandRequirement: BrandRequirement;
  requiredBrandSlug: string | null;
  scope: RequirementScope;
  durability: Durability | null;
  optionality: Optionality;
  prohibitedSubstitutions: readonly ConstraintCode[];
  sourceKind: RequirementSourceKind;
  sourceConfidence: Confidence;
}

/** One parsed line item plus its SS1.4 provenance record. Inseparable. */
export interface ParsedItem {
  lineNumber: number;
  /** PII-REDACTED original line. Raw text never leaves the intake boundary. */
  originalText: string;
  draft: ParsedRequirementDraft;
  /** Per-field extraction confidence, 0.0-1.0. */
  fieldConfidences: Readonly<Record<string, Confidence>>;
  /** Candidate slugs when the product itself is ambiguous (review UX). */
  productCandidates: readonly string[];
  ambiguityFlags: readonly AmbiguityFlag[];
  needsReview: boolean;
  provenance: ProvenanceRecord;
}

export const PII_CATEGORIES = [
  "address",
  "budget_amount",
  "child_name",
  "classroom_id",
  "contact",
  "exact_size",
  "gift_recipient",
  "teacher_name",
] as const;
export type PiiCategory = (typeof PII_CATEGORIES)[number];

/** Categories hit and counts — NEVER the redacted values (SS1.7). */
export interface PiiRedactionReport {
  categoriesHit: readonly PiiCategory[];
  counts: Readonly<Partial<Record<PiiCategory, number>>>;
  redactionCount: number;
}

/** One row of the human-review UX contract. */
export interface ReviewItem {
  lineNumber: number;
  /** PII-redacted source line the user compares against. */
  originalText: string;
  /** Null when nothing was parseable from the line. */
  proposed: ParsedRequirementDraft | null;
  /** Human-readable rendering of the proposal (render.ts). */
  interpretation: string;
  fieldConfidences: Readonly<Record<string, Confidence>>;
  productCandidates: readonly string[];
  ambiguityFlags: readonly AmbiguityFlag[];
  needsReview: boolean;
}

/**
 * The typed payload the frontend renders for the mandatory human-review
 * step. EVERY parse produces one; nothing becomes `user_confirmed`
 * (supply_lists.verification_status) without the user acting on it.
 */
export interface ReviewPayload {
  intakeId: string;
  intakeMethod: IntakeMethod;
  parserVersion: string;
  parsedAt: IsoTimestamp;
  /** Literal true: the parser proposes, the user confirms. No bypass. */
  requiresUserConfirmation: true;
  redaction: PiiRedactionReport;
  items: readonly ReviewItem[];
  itemsNeedingReview: number;
  /** Lines skipped as headings/noise (still visible via originalText count). */
  skippedLineCount: number;
  /** Minimum item confidence — conservative aggregate (SS1.5). */
  overallConfidence: Confidence;
}

export interface ParseOutcome {
  intakeId: string;
  intakeMethod: IntakeMethod;
  items: readonly ParsedItem[];
  review: ReviewPayload;
  redaction: PiiRedactionReport;
}

/**
 * Structured log event. The pipeline logs counts, categories, and opaque ids
 * ONLY — never list text, never redacted values (SS1.7; proven by the
 * zero-PII cycle test, which captures and scans every emitted event).
 */
export interface ParseLogEvent {
  event: string;
  intakeId: string;
  fields: Readonly<Record<string, string | number | boolean>>;
}
export type ParseLogger = (event: ParseLogEvent) => void;

/** Thrown when a parsed item fails the SS1.4 completeness gate. */
export class ParseProvenanceError extends Error {
  constructor(intakeId: string, reason: string) {
    super(`Parse intake "${intakeId}" rejected (SS1.4): ${reason}`);
    this.name = "ParseProvenanceError";
  }
}

/** Thrown when a manual entry violates a controlled vocabulary. */
export class ManualEntryValidationError extends Error {
  constructor(reason: string) {
    super(`Manual entry rejected: ${reason}`);
    this.name = "ManualEntryValidationError";
  }
}
