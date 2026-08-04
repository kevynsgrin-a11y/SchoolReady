/**
 * Source registry + source-health contracts (Phase 2, ingestion-engineer).
 *
 * §0 launch posture: every live source is OFF (config/flags.ts) and sits
 * behind a circuit breaker. The `source_health` table persists breaker state
 * and the per-source licensing flags; the code-level registration record
 * lives in src/ingestion/registry.ts (compliance-officer builds the Phase 10
 * licensing register from it).
 *
 * SOURCE_IDS mirrors config/flags.ts `SourceId` — `satisfies` proves every
 * entry is a valid SourceId at compile time; tests/ingestion-registry.test.ts
 * proves completeness against DEFAULT_FLAGS.liveSources at runtime.
 */
import type { SourceId } from "../../config/flags";
import type { IsoTimestamp, WithProvenance } from "./provenance";

export const SOURCE_IDS = [
  "nces_ccd",
  "cpsc_recalls",
  "state_tax_holidays",
  "affiliate_feeds",
] as const satisfies readonly SourceId[];

/**
 * Circuit-breaker states (config/flags.ts CircuitBreakerConfig semantics):
 * closed -> open after failureThreshold consecutive failures -> half_open
 * probe after cooldownSeconds -> closed on probe success / open on failure.
 */
export const CIRCUIT_STATES = ["closed", "open", "half_open"] as const;
export type CircuitState = (typeof CIRCUIT_STATES)[number];

/**
 * Legal basis under which a source's data may be handled at all. Paired with
 * the four permission booleans below; the closed vocabulary is mirrored by
 * the SQL CHECK on source_health.license_basis.
 */
export const LICENSE_BASES = [
  "synthetic_fixture",
  "us_government_open_data",
  "state_public_records",
  "commercial_contract_required",
] as const;
export type LicenseBasis = (typeof LICENSE_BASES)[number];

/**
 * The licensing flag carried by every source registration: what may be
 * fetched, cached, persisted, and displayed for this source. All four are
 * false until credentials + licensing land (except pure fixtures).
 */
export interface SourceLicensing {
  basis: LicenseBasis;
  /** May we make live network requests to this source at all? */
  allowLiveFetch: boolean;
  /** May responses be held in bounded caches (KV, stale-while-revalidate)? */
  allowCache: boolean;
  /** May normalized records persist in D1? */
  allowPersist: boolean;
  /** May the data render to users (with provenance, per §1.4)? */
  allowDisplay: boolean;
  /** Whether display must carry source attribution. */
  attributionRequired: boolean;
  /** Human-readable terms summary for the Phase 10 compliance register. */
  notes: string;
}

/** Persisted per-source health + licensing row (source_health table). */
export interface SourceHealth extends WithProvenance {
  sourceId: SourceId;
  circuitState: CircuitState;
  consecutiveFailures: number;
  openedAt: IsoTimestamp | null;
  lastSuccessAt: IsoTimestamp | null;
  lastFailureAt: IsoTimestamp | null;
  /** Machine-readable failure note; empty string = none. Never a stack trace. */
  lastError: string;
  licenseBasis: LicenseBasis;
  licenseAllowsLiveFetch: boolean;
  licenseAllowsCache: boolean;
  licenseAllowsPersist: boolean;
  licenseAllowsDisplay: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}
