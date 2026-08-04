import { BRAND } from "../config/brand";
import { DEFAULT_FLAGS } from "../config/flags";
import type { SourceId } from "../config/flags";
import { handleApiRequest } from "./api/routes";
import type { ApiDeps, FixtureLibrary } from "./api/deps";
import { createAllowlistLogger } from "./api/logging";
import { createFixtureTurnstileVerifier, createLiveTurnstileStub } from "./api/turnstile";
import { createFixtureStripeVerifier, createLiveStripeStub } from "./api/stripe";
import { createSourcePipelines } from "./api/sources";
import type { SourcePipelines } from "./api/sources";
import { R2UploadBuffer, createFixtureOcrEngine, createLiveOcrStub } from "./parsing";
import type { OcrFixtureRow, R2Like } from "./parsing";
import type { KvLike } from "./ingestion/swr-cache";
import type { FixtureDocument, IngestedRecord } from "./ingestion/types";
import type { RefreshJobMessage } from "./ingestion/jobs";
import type { ProductFeedRow } from "./ingestion/adapters/product-feeds";
import type { CpscRecallRow } from "./ingestion/adapters/cpsc-recalls";
import type { TaxHolidayRow } from "./ingestion/adapters/tax-holidays";
import type {
  PriceHistoryRow,
  RetailerLogisticsRow,
  TaxRateRow,
  TrendSignalRow,
  VariantResolutionRow,
} from "./api/catalog";

// Fixture documents bundle into the Worker at build time (§0 launch
// posture: fixture-mode validation beta; every live source is OFF).
import offersFixtureJson from "../fixtures/product-feeds/offers.fixture.json";
import recallsFixtureJson from "../fixtures/cpsc-recalls/recalls.fixture.json";
import taxHolidaysFixtureJson from "../fixtures/tax-holidays/2026.fixture.json";
import catalogFixtureJson from "../fixtures/catalog/variants.fixture.json";
import logisticsFixtureJson from "../fixtures/retailers/logistics.fixture.json";
import taxRatesFixtureJson from "../fixtures/tax-rates/rates.fixture.json";
import trendSignalsFixtureJson from "../fixtures/trend-signals/signals.fixture.json";
import priceHistoryFixtureJson from "../fixtures/price-history/history.fixture.json";

/**
 * Worker environment bindings (mirrors wrangler.jsonc). Phase 1 adds the D1
 * binding; later phases extend this interface with their own bindings.
 */
export interface Env {
  /** D1 database (fixture posture: local-only, placeholder database_id). */
  DB: D1Database;
  /**
   * KV namespace (Phase 2): source-health snapshots ('health:<sourceId>'),
   * SWR cache envelopes ('cache:<sourceId>'), runtime flag overrides
   * ('flags:overrides'). Phase 5 adds rate-limit buckets ('ratelimit:...').
   * Prefixes defined in src/ingestion/source-health.ts + src/api/rate-limit.ts.
   */
  SOURCE_KV: KVNamespace;
  /**
   * R2 transient upload buffer (Phase 3): the ONLY sanctioned R2 use (§2) —
   * uploaded list photos/PDFs held under a hard TTL while being parsed, then
   * deleted (src/parsing/upload-buffer.ts). Never a durable store (§1.7).
   */
  UPLOAD_BUFFER: R2Bucket;
  /**
   * Queues producer (Phase 5): ingestion-refresh jobs per the Phase 2
   * contract in src/ingestion/jobs.ts. §2 justification: Queues exist for
   * background refresh cycles; this is exactly and only that.
   */
  INGESTION_QUEUE: Queue<RefreshJobMessage>;
  FIXTURE_MODE: string;
}

export const FIXTURE_LIBRARY: FixtureLibrary = {
  offers: offersFixtureJson as unknown as FixtureDocument<ProductFeedRow>,
  recalls: recallsFixtureJson as unknown as FixtureDocument<CpscRecallRow>,
  taxHolidays: taxHolidaysFixtureJson as unknown as FixtureDocument<TaxHolidayRow>,
  catalog: catalogFixtureJson as unknown as FixtureDocument<VariantResolutionRow>,
  logistics: logisticsFixtureJson as unknown as FixtureDocument<RetailerLogisticsRow>,
  taxRates: taxRatesFixtureJson as unknown as FixtureDocument<TaxRateRow>,
  trendSignals: trendSignalsFixtureJson as unknown as FixtureDocument<TrendSignalRow>,
  priceHistory: priceHistoryFixtureJson as unknown as FixtureDocument<PriceHistoryRow>,
};

/**
 * Production OCR replay doc: empty by design. Real uploads only parse where
 * a labeled fixture OCR output exists (tests); anything else fails closed
 * with a descriptive error — no live OCR engine exists (Phase 3 posture).
 */
const EMPTY_OCR_DOC: FixtureDocument<OcrFixtureRow> = {
  _fixture: true,
  fixtureSet: "fixture:ocr-live-disabled-v1",
  description: "Synthetic empty OCR replay set: fixture-mode uploads fail closed until a labeled fixture output exists.",
  generatedAt: "2026-08-01T00:00:00.000Z",
  provenance: {
    source: "fixture:ocr-live-disabled-v1",
    sourceType: "fixture",
    observedAt: "2026-08-01T00:00:00.000Z",
    geography: "US",
    transformVersion: "none",
    confidence: 1,
    limitations: "No OCR outputs exist in the production fixture set (live OCR is disabled).",
  },
  records: [],
};

/** Composition root — the ONE place real clocks/ids/bindings are injected. */
export function buildApiDeps(env: Env): ApiDeps {
  const flags = DEFAULT_FLAGS;
  const clock = (): number => Date.now();
  return {
    db: env.DB,
    kv: env.SOURCE_KV as unknown as KvLike,
    uploadBuffer: new R2UploadBuffer(env.UPLOAD_BUFFER as unknown as R2Like, clock),
    ocr: flags.fixtureMode ? createFixtureOcrEngine(EMPTY_OCR_DOC) : createLiveOcrStub(),
    clock,
    ids: () => crypto.randomUUID().replace(/-/g, ""),
    flags,
    fixtures: FIXTURE_LIBRARY,
    turnstile: flags.fixtureMode ? createFixtureTurnstileVerifier() : createLiveTurnstileStub(),
    stripeWebhooks: flags.fixtureMode ? createFixtureStripeVerifier() : createLiveStripeStub(),
    logger: createAllowlistLogger((event) => console.log(JSON.stringify(event))),
  };
}

/** Queue consumer: re-seeds SWR caches per the src/ingestion/jobs.ts contract. */
export async function processRefreshMessages(
  messages: readonly RefreshJobMessage[],
  deps: ApiDeps,
): Promise<void> {
  const pipelines: SourcePipelines = createSourcePipelines(deps);
  const bySource: Partial<
    Record<SourceId, { refresh(): Promise<{ ok: boolean; records: IngestedRecord<unknown>[] }> }>
  > = {
    affiliate_feeds: pipelines.offers,
    cpsc_recalls: pipelines.recalls,
    state_tax_holidays: pipelines.taxHolidays,
  };
  for (const message of messages) {
    if (message.kind !== "source_refresh") continue;
    const pipeline = bySource[message.sourceId];
    if (!pipeline) {
      deps.logger.log("refresh_skipped", { sourceId: message.sourceId, reason: "no_pipeline" });
      continue;
    }
    const envelope = await pipeline.refresh();
    deps.logger.log("refresh_completed", {
      sourceId: message.sourceId,
      allowed: envelope.ok,
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({
        ok: true,
        service: BRAND.name,
        fixtureMode: DEFAULT_FLAGS.fixtureMode,
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, buildApiDeps(env));
    }
    return new Response("Not found", { status: 404 });
  },

  async queue(batch: MessageBatch<RefreshJobMessage>, env: Env): Promise<void> {
    const deps = buildApiDeps(env);
    deps.logger.log("queue_batch", { queueMessageCount: batch.messages.length });
    await processRefreshMessages(
      batch.messages.map((m) => m.body),
      deps,
    );
  },
} satisfies ExportedHandler<Env, RefreshJobMessage>;
