/**
 * Supply-list and requirement contracts — the Phase 1 requirement schema
 * (brief §4). Every contractual field is present:
 * canonical product type, quantity, unit/pack count, dimensions, material,
 * color, ruling/style, brand-requirement, scope, consumable-vs-durable,
 * optional-vs-required, prohibited substitutions, source, source confidence.
 *
 * §0 NOT #1: these are USER-ENTERED or USER-UPLOADED requirements only —
 * never scraped/cached/mirrored school-hosted lists.
 * §1.7: scope is structural (grade/subject/anonymous slot ordinals). No
 * field anywhere holds a child name, teacher name, or classroom identifier.
 */
import type { Confidence, IsoTimestamp, WithProvenance } from "./provenance";
import type { Durability, RulingStyle, Unit } from "./product";
import type { GradeLevel } from "./school";

export const INTAKE_METHODS = ["paste", "manual", "upload"] as const;
export type IntakeMethod = (typeof INTAKE_METHODS)[number];

export const VERIFICATION_STATUSES = [
  "unverified",
  "user_confirmed",
  "stale",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const LIST_STATUSES = ["draft", "active", "archived"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

/** School year label, e.g. "2026-2027". */
export type SchoolYear = string;

export interface SupplyList extends WithProvenance {
  id: string;
  /** Null until an anonymous session associates a household. */
  householdId: string | null;
  schoolId: string | null;
  schoolYear: SchoolYear;
  gradeLevel: GradeLevel | null;
  intakeMethod: IntakeMethod;
  /** §1.5 suppression input: stale/unverified lists render downgraded. */
  verificationStatus: VerificationStatus;
  status: ListStatus;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Links a list to an anonymous household member (child ordinal). */
export interface ListAssignment extends WithProvenance {
  id: string;
  listId: string;
  householdMemberId: string;
  createdAt: IsoTimestamp;
}

export const BRAND_REQUIREMENTS = [
  "required",
  "preferred",
  "generic_allowed",
] as const;
export type BrandRequirement = (typeof BRAND_REQUIREMENTS)[number];

export const OPTIONALITIES = ["required", "optional"] as const;
export type Optionality = (typeof OPTIONALITIES)[number];

export const SCOPE_TYPES = [
  "list",
  "grade",
  "subject",
  "teacher",
  "classroom",
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const SUBJECTS = [
  "general",
  "math",
  "ela",
  "science",
  "social_studies",
  "art",
  "music",
  "pe",
  "world_language",
  "technology",
] as const;
export type Subject = (typeof SUBJECTS)[number];

export const REQUIREMENT_SOURCE_KINDS = [
  "paste",
  "manual",
  "upload",
  "fixture",
] as const;
export type RequirementSourceKind = (typeof REQUIREMENT_SOURCE_KINDS)[number];

/**
 * Structural requirement scope (§1.7): grade and subject are controlled
 * vocabularies; teacher/classroom scope is an anonymous per-list slot ordinal
 * ("teacher slot 1") — NEVER a person's name or school-issued room ID.
 */
export interface RequirementScope {
  type: ScopeType;
  /** Required when type === "grade". */
  grade: GradeLevel | null;
  /** Required when type === "subject". */
  subject: Subject | null;
  /** Required when type === "teacher" | "classroom". Anonymous ordinal >= 1. */
  slot: number | null;
}

export interface Requirement extends WithProvenance {
  id: string;
  listId: string;
  /** Canonical product type (FK into the product_types taxonomy). */
  productTypeId: string;
  /** Count of units (or packs, when unit is a packaging unit). Positive integer. */
  quantity: number;
  unit: Unit;
  /** Units per pack for multi-count packaging; null for 'each'. */
  packCount: number | null;
  /** Normalized product-dimension descriptor ('1 in', '9x12 in'); never a person's measurement. */
  dimensions: string | null;
  material: string | null;
  color: string | null;
  rulingStyle: RulingStyle | null;
  brandRequirement: BrandRequirement;
  /** Required when brandRequirement !== "generic_allowed". */
  requiredBrandId: string | null;
  scope: RequirementScope;
  /** Consumable-vs-durable. */
  durability: Durability;
  /** Optional-vs-required. */
  optionality: Optionality;
  /** Controlled-vocabulary restriction codes ('no_rolling_backpacks'); never raw prose. */
  prohibitedSubstitutions: readonly string[];
  /** How this row entered the system (full detail on the provenance record). */
  sourceKind: RequirementSourceKind;
  /** Parser extraction confidence 0.0-1.0 for this specific requirement. */
  sourceConfidence: Confidence;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
