/**
 * Phase 5 API contracts — the typed request/response shapes the frontend
 * (Phase 7) codes against. Everything user-facing that leaves the Worker is
 * described here.
 *
 * Design rules baked into these types:
 *  - §1.4: every response is an envelope carrying a `provenance` dictionary;
 *    fact-bearing nodes inside `data` reference into it via `provenanceIds`.
 *    A fact that cannot cite provenance is not serialized (the gate in
 *    provenance-gate.ts throws before such a response can leave).
 *  - §1.5: suppressed/downgraded facts surface as SuppressionNote entries so
 *    the frontend can badge them; suppressed facts are OMITTED from data.
 *  - §1.2 precursor: no request contract anywhere carries account
 *    credentials. Sessions are anonymous opaque tokens; entitlements gate
 *    ad-free extras only and never appear on core-data contracts.
 *  - §1.7: no request or response field carries a person's name, contact,
 *    address, exact size, or budget. Alert subscriptions are in-app only.
 */
import type { Assumption } from "../algorithms/types";
import type { NetRequiredLine } from "../algorithms/net-required";
import type { BasketParetoResult } from "../algorithms/basket";
import type { MatchDisqualifier } from "../algorithms/match";
import type {
  CapsuleCategoryInput,
  CapsuleCategoryLine,
  BuyNowVsWaitResult,
} from "../algorithms/capsule";
import type { FamilyEvaluation, TrendLabel } from "../algorithms/trend";
import type { SuppressionDecision } from "../algorithms/suppression";
import type {
  Confidence,
  IsoTimestamp,
  ProvenanceRecord,
} from "../contracts/provenance";
import type {
  BrandRequirement,
  IntakeMethod,
  Optionality,
} from "../contracts/requirement";
import type { GradeLevel, StateCode } from "../contracts/school";
import type { RulingStyle, Unit } from "../contracts/product";
import type { Recall, RecallProduct } from "../contracts/recall";
import type { CircuitState } from "../contracts/source";
import type { SourceId } from "../../config/flags";
import type { ReviewPayload } from "../parsing/types";
import type { EntitlementKind, EntitlementStatus } from "../contracts/household";
import type { ItemCondition } from "../contracts/household";

/* ------------------------------------------------------------------ */
/* Response envelope                                                   */
/* ------------------------------------------------------------------ */

/** Per-source freshness/health surfaced with any source-fed response. */
export interface SourceStatus {
  sourceId: SourceId;
  /** true = older than the circuit-breaker staleness threshold (badge it). */
  stale: boolean;
  ageSeconds: number | null;
  storedAt: IsoTimestamp | null;
  circuitState: CircuitState;
  degraded: "none" | "cache_fallback" | "unavailable";
}

/** §1.5 note attached when a fact was downgraded or suppressed. */
export interface SuppressionNote {
  /** What the note is about, e.g. 'offer:fixture-mart:FXM-GLUE-06'. */
  subject: string;
  decision: SuppressionDecision;
}

export interface ResponseMeta {
  generatedAt: IsoTimestamp;
  fixtureMode: boolean;
  sources: SourceStatus[];
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  /** §1.4: every provenanceIds entry in data resolves here. */
  provenance: Record<string, ProvenanceRecord>;
  suppressions: SuppressionNote[];
  assumptions: Assumption[];
  meta: ResponseMeta;
}

export const API_ERROR_CODES = [
  "not_found",
  "method_not_allowed",
  "invalid_request",
  "validation_failed",
  "turnstile_required",
  "turnstile_failed",
  "rate_limited",
  "session_required",
  "upload_unavailable",
  "basket_search_space_exceeded",
  "webhook_verification_failed",
  "live_integration_disabled",
  "provenance_gate_failure",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErr {
  ok: false;
  error: {
    code: ApiErrorCode;
    /** Human-readable, never echoes request content (§1.7). */
    message: string;
    retryAfterSeconds?: number;
  };
  meta: ResponseMeta;
}

export type ApiResponseBody<T> = ApiOk<T> | ApiErr;

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

/** Opaque anonymous session cookie. Brand-neutral name (§0 brand isolation). */
export const SESSION_COOKIE = "k8p_sid";

export interface SessionData {
  established: boolean;
  /** true once any household state exists for this session. */
  householdPresent: boolean;
  /** Coarse geography (state) if volunteered; never finer (§1.7). */
  householdState: StateCode | null;
  memberOrdinals: number[];
}

/* ------------------------------------------------------------------ */
/* Intake                                                              */
/* ------------------------------------------------------------------ */

export interface PasteIntakeBody {
  text: string;
}

/** Mirrors src/parsing ManualEntryItem (controlled vocabularies only). */
export interface ManualIntakeItemBody {
  productTypeSlug: string;
  quantity: number;
  unit?: Unit;
  packCount?: number | null;
  dimensions?: string | null;
  material?: string | null;
  color?: string | null;
  rulingStyle?: RulingStyle | null;
  brandRequirement?: BrandRequirement;
  requiredBrandSlug?: string | null;
  optionality?: Optionality;
  prohibitedSubstitutions?: readonly string[];
}

export interface ManualIntakeBody {
  items: ManualIntakeItemBody[];
}

/** Upload: raw bytes body + `content-type` header + Turnstile header. */
export const TURNSTILE_HEADER = "x-turnstile-token";

export interface IntakeData {
  intakeId: string;
  /** The mandatory review payload — the parser proposes, the user confirms. */
  review: ReviewPayload;
  /** §1.4: per-line provenance for the review's parsed items. */
  itemProvenance: { lineNumber: number; provenanceIds: readonly string[] }[];
}

/* ------------------------------------------------------------------ */
/* Review confirmation -> persisted list                               */
/* ------------------------------------------------------------------ */

/**
 * One user-confirmed requirement. CONTROLLED-VOCABULARY FIELDS ONLY — there
 * is deliberately no free-text field on this contract, and the handler maps
 * fields explicitly (allowlist), so review-payload text can never reach D1
 * (§1.7, gate condition P3-2).
 */
export interface ConfirmedRequirementInput extends ManualIntakeItemBody {
  /** Parser extraction confidence carried from the review; 1.0 = user-edited. */
  sourceConfidence?: Confidence;
}

export interface ConfirmListBody {
  intakeId: string;
  intakeMethod: IntakeMethod;
  /** e.g. '2026-2027'. */
  schoolYear: string;
  gradeLevel?: GradeLevel | null;
  /** Anonymous child ordinal this list belongs to ('Child 1' = 1). */
  memberOrdinal: number;
  /** Coarse household geography for tax estimation (optional, §1.7). */
  state?: StateCode | null;
  items: ConfirmedRequirementInput[];
}

export interface RequirementSummary {
  id: string;
  listId: string;
  productTypeSlug: string;
  quantity: number;
  unit: Unit;
  packCount: number | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  rulingStyle: RulingStyle | null;
  brandRequirement: BrandRequirement;
  requiredBrandSlug: string | null;
  optionality: Optionality;
  prohibitedSubstitutions: readonly string[];
  sourceKind: IntakeMethod;
  sourceConfidence: Confidence;
  provenanceIds: readonly string[];
}

export interface ConfirmListData {
  listId: string;
  memberOrdinal: number;
  verificationStatus: "user_confirmed";
  requirements: RequirementSummary[];
}

export interface ListsData {
  lists: {
    listId: string;
    schoolYear: string;
    gradeLevel: GradeLevel | null;
    intakeMethod: IntakeMethod;
    verificationStatus: string;
    memberOrdinals: number[];
    requirements: RequirementSummary[];
  }[];
}

/* ------------------------------------------------------------------ */
/* Inventory                                                           */
/* ------------------------------------------------------------------ */

export interface InventoryItemBody {
  productTypeSlug: string;
  quantity: number;
  condition: ItemCondition;
}

export interface InventoryBody {
  items: InventoryItemBody[];
}

export interface InventorySummary {
  id: string;
  productTypeSlug: string;
  quantity: number;
  condition: ItemCondition;
  provenanceIds: readonly string[];
}

export interface InventoryData {
  items: InventorySummary[];
}

/* ------------------------------------------------------------------ */
/* Merge / checklist                                                   */
/* ------------------------------------------------------------------ */

export interface MergeData {
  /** Net-required math per merged line (Phase 4 shape, verbatim). */
  lines: NetRequiredLine[];
  /** Keys of lines that count toward required spend (optional never inflates). */
  requiredLineKeys: string[];
  /** §1.5 per-list findings (unverified/stale lists render downgraded). */
  listFindings: { listId: string; decision: SuppressionDecision }[];
}

export interface ChecklistLine {
  key: string;
  productTypeSlug: string;
  displayName: string;
  dimensions: string | null;
  rulingStyle: string | null;
  color: string | null;
  optionality: Optionality;
  unitsToBuy: number;
  netRequiredUnits: number;
  grossRequiredUnits: number;
  usableInventoryUnits: number;
  perMember: readonly { memberOrdinal: number; requiredUnits: number }[];
  /**
   * [P12-4] Store this line lands with under the grouping basket option
   * (§6 J1 store-grouped checklist); null = outside the basket (optional
   * line, inventory-covered line, or no grouping computed).
   */
  retailerSlug: string | null;
  provenanceIds: readonly string[];
}

/**
 * [P12-4] Store grouping for the printable checklist, read from ONE
 * labeled frontier view of the same Pareto basket the basket endpoint
 * serves — a view used for grouping purposes, never presented as "the"
 * answer (§0 capability 3). null when no basket result exists for the
 * plan; the checklist then renders ungrouped with an honest note (§1.5).
 */
export interface ChecklistGrouping {
  /** Which labeled frontier view supplied the store assignments. */
  view: "lowest_cost";
  /** One heading per store trip, in the option's deterministic order. */
  retailerSlugs: readonly string[];
  /** Offer/holiday provenance behind the store-assignment facts (§1.4). */
  provenanceIds: readonly string[];
}

export interface ChecklistData {
  generatedAt: IsoTimestamp;
  memberOrdinals: number[];
  lines: ChecklistLine[];
  /** null = no basket result; lines stay ungrouped, with the reason shown. */
  grouping: ChecklistGrouping | null;
}

/* ------------------------------------------------------------------ */
/* Basket                                                              */
/* ------------------------------------------------------------------ */

export interface BasketBody {
  /** Coarse geography override; defaults to the household state. */
  state?: StateCode | null;
  /** Days until the items are needed; enables deadline feasibility. */
  daysUntilNeeded?: number | null;
}

export interface ItemMatchReport {
  itemKey: string;
  eligibleCount: number;
  /** Gated-out candidates with §1.5-visible disqualifiers. */
  excluded: { candidateKey: string; disqualifiers: MatchDisqualifier[] }[];
}

export interface BasketData {
  /** The FULL Pareto result — frontier + four views, never one 'optimal'. */
  basket: BasketParetoResult;
  itemMatches: ItemMatchReport[];
  /** Required lines with zero units to buy (already covered). */
  coveredLineKeys: string[];
  /** Optional lines never enter the default basket (visible, not silent). */
  optionalLineKeysExcluded: string[];
  purchaseDate: string;
  state: StateCode | null;
}

/* ------------------------------------------------------------------ */
/* Capsule                                                             */
/* ------------------------------------------------------------------ */

export interface CapsuleTimingBody {
  daysUntilNeeded: number;
  typicalDeliveryDays: number;
  currentPriceCents: number;
  /** Price-history lookup key (fixture history in the beta). */
  upc?: string | null;
}

/**
 * [P12-1 correction] User inputs for the cost-per-wear math. Both values are
 * volunteered per request and never persisted (§1.7); the price applies to
 * each requested category line ("if a piece in this category costs this").
 */
export interface CapsuleCostPerWearBody {
  /** User-entered price per piece, in whole cents. */
  priceCents: number;
  /** User-entered wear days this season for the category. */
  seasonWearDays: number;
}

export interface CapsuleBody {
  categories: CapsuleCategoryInput[];
  costPerWear?: CapsuleCostPerWearBody | null;
  timing?: CapsuleTimingBody | null;
}

/**
 * [P12-1 correction] Cost-per-wear per garment category — engine output
 * verbatim (costPerWearCents / projectedWearsPerUnit, cents at 2 dp), with
 * the wears basis shipped as labeled assumptions, never as facts.
 */
export interface CapsuleCostPerWear {
  priceCents: number;
  seasonWearDays: number;
  /** Wears per piece: season wear days over usable existing + units to buy. */
  projectedWearsRange: { min: number; max: number };
  /** Engine cost-per-wear in cents (2 dp): min pairs with the most wears. */
  perWearCentsRange: { min: number; max: number };
  assumptions: readonly Assumption[];
  provenanceIds: readonly string[];
}

export interface CapsuleData {
  lines: (CapsuleCategoryLine & {
    provenanceIds: readonly string[];
    /** null when the request carried no cost-per-wear inputs. */
    costPerWear: CapsuleCostPerWear | null;
  })[];
  timing: (BuyNowVsWaitResult & { provenanceIds: readonly string[] }) | null;
}

/* ------------------------------------------------------------------ */
/* Trend                                                               */
/* ------------------------------------------------------------------ */

export interface TrendData {
  productSlug: string;
  /** Label + confidence + evidence ALWAYS ship together (§1.3). */
  label: TrendLabel;
  confidence: number;
  organicPassingFamilies: readonly string[];
  familyEvaluations: readonly FamilyEvaluation[];
  reasons: readonly string[];
  provenanceIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Recalls                                                             */
/* ------------------------------------------------------------------ */

export interface RecallEntry {
  recall: Recall;
  products: RecallProduct[];
  provenanceIds: readonly string[];
}

export interface RecallsData {
  recalls: RecallEntry[];
}

export interface RecallCheckBody {
  upc: string;
}

export interface RecallCheckData {
  upc: string;
  matches: RecallEntry[];
  decision: SuppressionDecision;
}

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

/** Mirrored by the alert_kind CHECK in migrations/0007_sessions_alerts.sql. */
export const ALERT_KINDS = [
  "recall",
  "price_change",
  "deadline",
  "list_correction",
] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export interface AlertSubscribeBody {
  alertKind: AlertKind;
  productTypeSlug?: string | null;
  listId?: string | null;
}

export interface AlertSubscribeData {
  subscriptionId: string;
  alertKind: AlertKind;
}

export interface AlertsData {
  subscriptions: {
    id: string;
    alertKind: AlertKind;
    productTypeSlug: string | null;
    listId: string | null;
    provenanceIds: readonly string[];
  }[];
}

/* ------------------------------------------------------------------ */
/* Data rights — export + one-pass deletion (Phase 10)                 */
/* ------------------------------------------------------------------ */

/**
 * Machine-readable export of EVERYTHING the anonymous session stores —
 * and, by §1.7, everything it stores is structural: controlled-vocabulary
 * requirements, ordinal-only members, coarse geography, alert kinds, and
 * entitlement windows. There is nothing else to export, which is the point.
 */
export interface ExportData {
  exportedAt: IsoTimestamp;
  /** Coarse geography (state) if volunteered; never finer (§1.7). */
  householdState: StateCode | null;
  /** Ordinal-only children ('Child N'); no name field exists to export. */
  members: {
    ordinal: number;
    gradeLevel: GradeLevel | null;
    provenanceIds: readonly string[];
  }[];
  lists: {
    listId: string;
    schoolYear: string;
    gradeLevel: GradeLevel | null;
    intakeMethod: IntakeMethod;
    verificationStatus: string;
    memberOrdinals: number[];
    requirements: RequirementSummary[];
  }[];
  inventory: InventorySummary[];
  alerts: {
    id: string;
    alertKind: AlertKind;
    productTypeSlug: string | null;
    listId: string | null;
    provenanceIds: readonly string[];
  }[];
  entitlements: {
    kind: EntitlementKind;
    status: EntitlementStatus;
    validFrom: IsoTimestamp;
    validUntil: IsoTimestamp;
    provenanceIds: readonly string[];
  }[];
}

/**
 * Acknowledgement of the one-pass purge (DELETE /api/session). rowsDeleted
 * is counted from the database, never estimated; 0 means there was no
 * session-linked data to remove (the purge is idempotent).
 */
export interface SessionPurgeData {
  purged: true;
  rowsDeleted: number;
}

/* ------------------------------------------------------------------ */
/* Entitlements                                                        */
/* ------------------------------------------------------------------ */

/**
 * Entitlements gate ad-free extras ONLY. This copy ships on the wire so the
 * §1.2 precursor is testable end to end: core data is never behind a pass.
 */
export const CORE_ACCESS_NOTICE =
  "Required list items, safety and recall warnings, dress-code restrictions, " +
  "corrections, price changes, assistance resources, and deadlines are always " +
  "available without an account and without a Season Pass.";

export interface EntitlementsData {
  seasonPass: {
    kind: EntitlementKind;
    status: EntitlementStatus;
    validFrom: IsoTimestamp;
    validUntil: IsoTimestamp;
    provenanceIds: readonly string[];
  } | null;
  /** The only thing an entitlement may ever gate. */
  gates: { adFreeExtras: boolean };
  coreAccessNotice: string;
}

/** Normalized webhook event shape (fixture-verified in the beta). */
export interface SeasonPassWebhookBody {
  _fixture?: boolean;
  eventId: string;
  eventType: "season_pass.purchased" | "season_pass.refunded";
  /** The anonymous household the purchase applies to (checkout metadata). */
  householdRef: string;
  /** Opaque processor reference — never card data, never an amount (§1.7). */
  paymentRef: string;
  validFrom: IsoTimestamp;
  validUntil: IsoTimestamp;
}

export interface WebhookAckData {
  received: true;
  entitlementId: string | null;
}
