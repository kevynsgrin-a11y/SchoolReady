/**
 * Ingestion pipeline (Phase 2): adapter + circuit breaker + SWR cache +
 * source-health tracker, composed so that a provider outage degrades to
 * stale-badged cached data and NEVER a thrown error when cached data exists
 * (§4 Phase 2 acceptance). When nothing was ever cached, the envelope is
 * `ok: false, degraded: "unavailable"` with empty records — the §1.5
 * suppression path — still never a throw.
 *
 * Write path: assertBatchProvenance() gates every batch before it reaches
 * the cache (§1.4 write-time rejection); the D1 provenance FK repeats the
 * rule at persistence time (Phase 5).
 */
import type { Flags } from "../../config/flags";
import type { IngestionBatch, SourceAdapter, SourceEnvelope, Clock } from "./types";
import { isoFromMs } from "./types";
import { assertBatchProvenance } from "./provenance";
import type { CircuitBreaker } from "./circuit-breaker";
import type { SwrCache } from "./swr-cache";
import type { SourceHealthTracker } from "./source-health";
import { cacheKeyFor } from "./source-health";

export interface PipelineDeps<T> {
  adapter: SourceAdapter<T>;
  breaker: CircuitBreaker;
  cache: SwrCache;
  health: SourceHealthTracker;
  flags: Flags;
  clock: Clock;
}

export class IngestionPipeline<T> {
  constructor(private readonly deps: PipelineDeps<T>) {}

  /**
   * Refresh-and-read. Attempts a fetch when the breaker allows it; falls
   * back to the SWR cache on failure or open circuit. Never throws on
   * provider failure — errors surface only in machine-readable envelope
   * fields. Provenance defects DO throw: rejecting an unprovenanced write
   * (§1.4) is not an outage.
   */
  async refresh(): Promise<SourceEnvelope<T>> {
    const { adapter, breaker, cache, health, flags, clock } = this.deps;
    const key = cacheKeyFor(adapter.sourceId);
    let lastError: string | null = null;

    if (breaker.allowRequest()) {
      let batch: IngestionBatch<T> | null = null;
      try {
        batch = await adapter.fetchBatch();
      } catch (err) {
        lastError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        breaker.recordFailure();
        health.recordFailure(lastError);
      }
      if (batch !== null) {
        // §1.4 write-time gate — a rejection here is a build/data defect,
        // not a provider outage, so it propagates instead of degrading.
        assertBatchProvenance(batch, { fixtureMode: flags.fixtureMode });
        await cache.put(key, batch);
        breaker.recordSuccess();
        health.recordSuccess();
        return {
          sourceId: adapter.sourceId,
          ok: true,
          stale: false,
          ageSeconds: 0,
          storedAt: batch.fetchedAt,
          servedAt: isoFromMs(clock()),
          circuitState: breaker.state(),
          degraded: "none",
          lastError: null,
          records: batch.records,
        };
      }
    }

    // Fetch failed or circuit open: stale-while-revalidate fallback.
    const cached = await cache.get<IngestionBatch<T>>(key);
    if (cached !== null) {
      return {
        sourceId: adapter.sourceId,
        ok: true,
        stale: cached.stale,
        ageSeconds: cached.ageSeconds,
        storedAt: cached.storedAt,
        servedAt: isoFromMs(clock()),
        circuitState: breaker.state(),
        degraded: "cache_fallback",
        lastError,
        records: cached.payload.records,
      };
    }

    // Nothing cached, nothing fetched: suppression, not an error page (§1.5).
    return {
      sourceId: adapter.sourceId,
      ok: false,
      stale: false,
      ageSeconds: null,
      storedAt: null,
      servedAt: isoFromMs(clock()),
      circuitState: breaker.state(),
      degraded: "unavailable",
      lastError,
      records: [],
    };
  }

  /** Read-only view: serves the cache without touching the provider. */
  async read(): Promise<SourceEnvelope<T>> {
    const { adapter, breaker, cache, clock } = this.deps;
    const cached = await cache.get<IngestionBatch<T>>(cacheKeyFor(adapter.sourceId));
    if (cached !== null) {
      return {
        sourceId: adapter.sourceId,
        ok: true,
        stale: cached.stale,
        ageSeconds: cached.ageSeconds,
        storedAt: cached.storedAt,
        servedAt: isoFromMs(clock()),
        circuitState: breaker.state(),
        degraded: "none",
        lastError: null,
        records: cached.payload.records,
      };
    }
    return {
      sourceId: adapter.sourceId,
      ok: false,
      stale: false,
      ageSeconds: null,
      storedAt: null,
      servedAt: isoFromMs(clock()),
      circuitState: breaker.state(),
      degraded: "unavailable",
      lastError: null,
      records: [],
    };
  }
}
