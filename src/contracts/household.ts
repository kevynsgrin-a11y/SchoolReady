/**
 * Anonymous-first household contracts.
 *
 * §1.7 HARD RULES: a household is an opaque id plus optional coarse
 * geography (state — not an address). Members are "Child <ordinal>" with a
 * structural grade reference — no names, no birthdates, no sizes, no
 * budgets, ever. Do not add such fields; tests/schema.test.ts guards the
 * schema side.
 */
import type { IsoTimestamp, WithProvenance } from "./provenance";
import type { GradeLevel, StateCode } from "./school";

export interface Household extends WithProvenance {
  id: string;
  /** Coarse geography for tax estimation only; null until volunteered. */
  state: StateCode | null;
  createdAt: IsoTimestamp;
}

export interface HouseholdMember extends WithProvenance {
  id: string;
  householdId: string;
  /** Anonymous display handle: "Child 1", "Child 2". Never a name. */
  ordinal: number;
  gradeLevel: GradeLevel | null;
  schoolId: string | null;
  createdAt: IsoTimestamp;
}

export const ITEM_CONDITIONS = ["new", "usable", "worn_out"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

/** Existing-inventory audit row (§0 capability 2). */
export interface InventoryItem extends WithProvenance {
  id: string;
  householdId: string;
  productTypeId: string;
  /** Optional precise variant match. */
  variantId: string | null;
  quantity: number;
  condition: ItemCondition;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export const ENTITLEMENT_KINDS = ["season_pass"] as const;
export type EntitlementKind = (typeof ENTITLEMENT_KINDS)[number];

export const ENTITLEMENT_STATUSES = [
  "active",
  "expired",
  "refunded",
  "revoked",
] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/**
 * Season Pass entitlement. Gates features only; NEVER an input to match,
 * worth-it, viral, or basket ranking (§1.1). externalPaymentRef is an opaque
 * processor reference — no card data, no amounts (§1.7 bans budgets).
 */
export interface Entitlement extends WithProvenance {
  id: string;
  householdId: string;
  kind: EntitlementKind;
  status: EntitlementStatus;
  validFrom: IsoTimestamp;
  validUntil: IsoTimestamp;
  externalPaymentRef: string | null;
  createdAt: IsoTimestamp;
}
