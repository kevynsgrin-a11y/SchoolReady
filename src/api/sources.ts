/**
 * Source access for the API: every read of recalls / tax holidays / retailer
 * offers goes through the Phase 2 IngestionPipeline — adapter (fixture
 * unless the live flag flips, in which case the live stub throws) + circuit
 * breaker + stale-while-revalidate KV cache + health tracker. Envelope
 * staleness and circuit state surface on ResponseMeta.sources so the
 * frontend badges stale data (§1.5), and outages degrade to cached data,
 * never an error page.
 */
import { CircuitBreaker } from "../ingestion/circuit-breaker";
import { SwrCache } from "../ingestion/swr-cache";
import { SourceHealthTracker } from "../ingestion/source-health";
import { IngestionPipeline } from "../ingestion/pipeline";
import { SOURCE_REGISTRATIONS } from "../ingestion/registry";
import { createProductFeedAdapter } from "../ingestion/adapters/product-feeds";
import { createCpscAdapter } from "../ingestion/adapters/cpsc-recalls";
import { createTaxHolidayAdapter } from "../ingestion/adapters/tax-holidays";
import type { RecallBundle } from "../ingestion/adapters/cpsc-recalls";
import type { TaxHolidayBundle } from "../ingestion/adapters/tax-holidays";
import type { OfferCandidate } from "../contracts/offer";
import type { SourceAdapter, SourceEnvelope } from "../ingestion/types";
import type { ApiDeps } from "./deps";
import type { SourceStatus } from "./contracts";

export interface SourcePipelines {
  offers: IngestionPipeline<OfferCandidate>;
  recalls: IngestionPipeline<RecallBundle>;
  taxHolidays: IngestionPipeline<TaxHolidayBundle>;
}

function buildPipeline<T>(deps: ApiDeps, adapter: SourceAdapter<T>): IngestionPipeline<T> {
  const breaker = new CircuitBreaker(deps.flags.circuitBreaker, deps.clock);
  return new IngestionPipeline<T>({
    adapter,
    breaker,
    cache: new SwrCache(deps.kv, deps.flags.circuitBreaker.staleAfterSeconds, deps.clock),
    health: new SourceHealthTracker(
      SOURCE_REGISTRATIONS[adapter.sourceId],
      breaker,
      deps.clock,
      `prov:api:health:${adapter.sourceId}`,
    ),
    flags: deps.flags,
    clock: deps.clock,
  });
}

export function createSourcePipelines(deps: ApiDeps): SourcePipelines {
  return {
    offers: buildPipeline(
      deps,
      createProductFeedAdapter(deps.flags, deps.fixtures.offers, deps.clock),
    ),
    recalls: buildPipeline(
      deps,
      createCpscAdapter(deps.flags, deps.fixtures.recalls, deps.clock),
    ),
    taxHolidays: buildPipeline(
      deps,
      createTaxHolidayAdapter(deps.flags, deps.fixtures.taxHolidays, deps.clock),
    ),
  };
}

/**
 * Serve-from-cache-first: cached envelopes age naturally (stale badges are
 * real), and only an empty cache triggers a refresh — which the circuit
 * breaker gates. Never throws on source trouble; the envelope says what
 * happened.
 */
export async function serveSource<T>(
  pipeline: IngestionPipeline<T>,
): Promise<SourceEnvelope<T>> {
  const cached = await pipeline.read();
  if (cached.degraded !== "unavailable") return cached;
  return pipeline.refresh();
}

export function sourceStatus<T>(envelope: SourceEnvelope<T>): SourceStatus {
  return {
    sourceId: envelope.sourceId,
    stale: envelope.stale,
    ageSeconds: envelope.ageSeconds,
    storedAt: envelope.storedAt,
    circuitState: envelope.circuitState,
    degraded: envelope.degraded,
  };
}
