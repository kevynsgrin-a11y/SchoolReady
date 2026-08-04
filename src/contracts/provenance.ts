/**
 * Universal provenance record — §1.4.
 *
 * Every user-facing fact carries provenance; a fact without provenance does
 * not render. In D1 this is the `provenance` table and every other table's
 * NOT NULL `provenance_id` FK (enforced by tests/schema.test.ts). At render
 * time (Phase 7) the guard refuses to display any fact whose provenance is
 * missing, 'expired', or 'retracted'.
 *
 * Vocabulary arrays are mirrored 1:1 by the SQL CHECK constraints in
 * migrations/; tests/schema.test.ts asserts the mirror never drifts.
 */

export const SOURCE_TYPES = [
  "user_entry",
  "user_upload",
  "fixture",
  "government_feed",
  "retailer_feed",
  "licensed_api",
  "model_inference",
  "operator_curation",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const FRESHNESS_LEVELS = ["fresh", "aging", "stale", "expired"] as const;
export type Freshness = (typeof FRESHNESS_LEVELS)[number];

export const CORRECTION_STATUSES = [
  "none",
  "corrected",
  "retracted",
  "under_review",
] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

/** ISO-8601 UTC timestamp string, e.g. "2026-08-04T00:00:00.000Z". */
export type IsoTimestamp = string;

/** "US" or an ISO 3166-2 region such as "US-TX". */
export type Geography = string;

/** Closed-interval confidence score, 0.0-1.0. */
export type Confidence = number;

/** The ten §1.4 fields, in brief order, plus the row id. */
export interface ProvenanceRecord {
  id: string;
  /** 1. Source: namespaced identifier ('user:manual-entry', 'fixture:catalog-2026-v1'). */
  source: string;
  /** 2. Source type. */
  sourceType: SourceType;
  /** 3. Observation/effective date of the underlying fact. */
  observedAt: IsoTimestamp;
  /** 4. Retrieval timestamp — when we recorded it. */
  retrievedAt: IsoTimestamp;
  /** 5. Geographic scope of the fact. */
  geography: Geography;
  /** 6. Transform/model version that produced the stored form; 'none' = verbatim. */
  transformVersion: string;
  /** 7. Freshness classification at last evaluation (§1.5 suppression input). */
  freshness: Freshness;
  /** 8. Confidence 0.0-1.0. */
  confidence: Confidence;
  /** 9. Limitations/caveats; empty string means none declared. */
  limitations: string;
  /** 10. Correction status ('retracted' never renders; 'under_review' suppresses). */
  correctionStatus: CorrectionStatus;
  createdAt: IsoTimestamp;
}

/** Mixin carried by every persisted user-facing entity. */
export interface WithProvenance {
  provenanceId: string;
}
