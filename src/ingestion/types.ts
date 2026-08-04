/**
 * Common ingestion types (Phase 2, ingestion-engineer).
 *
 * Every source adapter implements SourceAdapter with a `fixture` and a `live`
 * implementation. §0 launch posture: all liveSources flags default OFF, so
 * live implementations are STUBS that throw LiveSourceDisabledError — they
 * contain no fetch code at all. §1.4: every emitted record carries a full
 * provenance record; assertBatchProvenance rejects a batch at write time
 * otherwise.
 */
import type { SourceId } from "../../config/flags";
import type { CircuitState } from "../contracts/source";
import type { IsoTimestamp, ProvenanceRecord } from "../contracts/provenance";

/** Injected clock (epoch milliseconds). Tests never use real timers. */
export type Clock = () => number;

export const isoFromMs = (ms: number): IsoTimestamp => new Date(ms).toISOString();

/** A single ingested fact plus its §1.4 provenance record. Inseparable. */
export interface IngestedRecord<T> {
  record: T;
  provenance: ProvenanceRecord;
}

/** What one adapter fetch yields. */
export interface IngestionBatch<T> {
  sourceId: SourceId;
  fetchedAt: IsoTimestamp;
  records: IngestedRecord<T>[];
}

export type AdapterMode = "fixture" | "live";

/** Common adapter surface. One per source, in src/ingestion/adapters/. */
export interface SourceAdapter<T> {
  readonly sourceId: SourceId;
  readonly mode: AdapterMode;
  /**
   * Fetch and normalize one batch. Fixture implementations read injected,
   * clearly-labeled fixture documents and touch no network. Live stubs throw
   * LiveSourceDisabledError unconditionally (Phase 2 ships no live fetch).
   */
  fetchBatch(): Promise<IngestionBatch<T>>;
}

/**
 * Thrown by every live adapter stub. Descriptive by contract: names the flag
 * and confirms no network request was made.
 */
export class LiveSourceDisabledError extends Error {
  constructor(
    public readonly sourceId: SourceId,
    detail: string,
  ) {
    super(
      `Live fetching for source "${sourceId}" is disabled by flag: gated on ` +
        `config/flags.ts liveSources.${sourceId} (defaults OFF; fixture-mode ` +
        `launch posture) and Phase 2 ships no live fetch implementation. ` +
        `No network request was made. ${detail}`,
    );
    this.name = "LiveSourceDisabledError";
  }
}

/** Thrown when a batch fails the §1.4 write-time provenance gate. */
export class ProvenanceRejectionError extends Error {
  constructor(sourceId: SourceId, reason: string) {
    super(
      `Batch from source "${sourceId}" rejected at write time (§1.4): ${reason}`,
    );
    this.name = "ProvenanceRejectionError";
  }
}

/**
 * Fixture-document wrapper. Every file under fixtures/ uses this shape;
 * adapters REFUSE documents that are not explicitly labeled `_fixture: true`
 * with a fixture-typed provenance template, so unlabeled data can never
 * enter through the fixture path.
 */
export interface FixtureProvenanceTemplate {
  /** Namespaced fixture set id, e.g. 'fixture:nces-ccd-2026-v1'. */
  source: string;
  sourceType: "fixture";
  observedAt: IsoTimestamp;
  geography: string;
  transformVersion: string;
  confidence: number;
  limitations: string;
}

export interface FixtureDocument<TRaw> {
  _fixture: true;
  fixtureSet: string;
  description: string;
  generatedAt: IsoTimestamp;
  provenance: FixtureProvenanceTemplate;
  records: TRaw[];
}

/**
 * The envelope every read/refresh returns to the API layer. Machine-readable
 * staleness (`stale`, `ageSeconds`) drives the frontend stale badge; a
 * provider outage yields `degraded: "cache_fallback"` with cached records —
 * NEVER a thrown error when cached data exists (§4 Phase 2 acceptance).
 * `ok: false` + `degraded: "unavailable"` (empty records, no throw) is the
 * §1.5 suppression path when nothing was ever cached.
 */
export interface SourceEnvelope<T> {
  sourceId: SourceId;
  ok: boolean;
  /** true when served data is older than circuitBreaker.staleAfterSeconds. */
  stale: boolean;
  ageSeconds: number | null;
  storedAt: IsoTimestamp | null;
  servedAt: IsoTimestamp;
  circuitState: CircuitState;
  degraded: "none" | "cache_fallback" | "unavailable";
  /** Machine-readable failure note for source-health surfaces; never thrown. */
  lastError: string | null;
  records: IngestedRecord<T>[];
}
