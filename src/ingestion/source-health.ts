/**
 * Source-health tracking (Phase 2). The tracker mirrors circuit-breaker
 * transitions into a SourceHealth record; snapshots go to the SOURCE_KV
 * namespace (key 'health:<sourceId>') for cheap reads and to the
 * source_health D1 table for durable state + the licensing flags.
 * Persistence wiring is Phase 5 (no data-access layer exists yet);
 * toRow()/KV_HEALTH_PREFIX are the contract for it.
 */
import type { SourceId } from "../../config/flags";
import type { SourceHealth } from "../contracts/source";
import type { SourceRegistration } from "./registry";
import type { CircuitBreaker } from "./circuit-breaker";
import type { Clock } from "./types";
import { isoFromMs } from "./types";

export const KV_HEALTH_PREFIX = "health:";
export const KV_CACHE_PREFIX = "cache:";
export const KV_FLAGS_KEY = "flags:overrides";

export class SourceHealthTracker {
  private health: SourceHealth;

  constructor(
    registration: SourceRegistration,
    private readonly breaker: CircuitBreaker,
    private readonly clock: Clock,
    provenanceId: string,
  ) {
    const now = isoFromMs(clock());
    this.health = {
      sourceId: registration.sourceId,
      circuitState: breaker.state(),
      consecutiveFailures: 0,
      openedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: "",
      licenseBasis: registration.licensing.basis,
      licenseAllowsLiveFetch: registration.licensing.allowLiveFetch,
      licenseAllowsCache: registration.licensing.allowCache,
      licenseAllowsPersist: registration.licensing.allowPersist,
      licenseAllowsDisplay: registration.licensing.allowDisplay,
      provenanceId,
      createdAt: now,
      updatedAt: now,
    };
  }

  recordSuccess(): void {
    const now = isoFromMs(this.clock());
    this.health = {
      ...this.health,
      circuitState: this.breaker.state(),
      consecutiveFailures: this.breaker.failureCount(),
      openedAt: null,
      lastSuccessAt: now,
      lastError: "",
      updatedAt: now,
    };
  }

  recordFailure(message: string): void {
    const now = isoFromMs(this.clock());
    const openedAtMs = this.breaker.openedAt();
    this.health = {
      ...this.health,
      circuitState: this.breaker.state(),
      consecutiveFailures: this.breaker.failureCount(),
      openedAt: openedAtMs === null ? null : isoFromMs(openedAtMs),
      lastFailureAt: now,
      lastError: message,
      updatedAt: now,
    };
  }

  snapshot(): SourceHealth {
    return { ...this.health, circuitState: this.breaker.state() };
  }

  kvKey(): string {
    return `${KV_HEALTH_PREFIX}${this.health.sourceId}`;
  }

  /** snake_case row for the source_health table (Phase 5 persists it). */
  toRow(): Record<string, string | number | null> {
    const s = this.snapshot();
    return {
      source_id: s.sourceId,
      circuit_state: s.circuitState,
      consecutive_failures: s.consecutiveFailures,
      opened_at: s.openedAt,
      last_success_at: s.lastSuccessAt,
      last_failure_at: s.lastFailureAt,
      last_error: s.lastError,
      license_basis: s.licenseBasis,
      license_allows_live_fetch: s.licenseAllowsLiveFetch ? 1 : 0,
      license_allows_cache: s.licenseAllowsCache ? 1 : 0,
      license_allows_persist: s.licenseAllowsPersist ? 1 : 0,
      license_allows_display: s.licenseAllowsDisplay ? 1 : 0,
      provenance_id: s.provenanceId,
      created_at: s.createdAt,
      updated_at: s.updatedAt,
    };
  }
}

export const cacheKeyFor = (sourceId: SourceId): string =>
  `${KV_CACHE_PREFIX}${sourceId}`;
