/**
 * Phase 2 ingestion layer — public surface.
 *
 * Composition per source: adapter (fixture | live stub) + CircuitBreaker +
 * SwrCache + SourceHealthTracker inside an IngestionPipeline. All live
 * fetching is behind config/flags.ts liveSources (default OFF) AND the
 * breaker; outages degrade to stale-badged cache, never an error.
 */
export * from "./types";
export * from "./provenance";
export * from "./circuit-breaker";
export * from "./swr-cache";
export * from "./source-health";
export * from "./pipeline";
export * from "./registry";
export * from "./jobs";
export * from "./adapters/live-stub";
export * from "./adapters/nces-ccd";
export * from "./adapters/cpsc-recalls";
export * from "./adapters/tax-holidays";
export * from "./adapters/product-feeds";
