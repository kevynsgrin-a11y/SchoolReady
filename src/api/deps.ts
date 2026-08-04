/**
 * API dependency container. Everything effectful is injected: database, KV,
 * upload buffer, OCR engine, clock, id generator, fixture library, and the
 * Turnstile/Stripe verifiers — so tests run the REAL route handlers with
 * fixture implementations and the production entry (src/index.ts) wires the
 * bindings from wrangler.jsonc.
 *
 * All types here are STRUCTURAL (no ambient Cloudflare types), so node-side
 * suites can exercise src/api modules under the node type environment; the
 * real D1/KV/R2 bindings satisfy the interfaces in workerd.
 */
import type { Flags } from "../../config/flags";
import type { KvLike } from "../ingestion/swr-cache";
import type { Clock, FixtureDocument } from "../ingestion/types";
import type { ProductFeedRow } from "../ingestion/adapters/product-feeds";
import type { CpscRecallRow } from "../ingestion/adapters/cpsc-recalls";
import type { TaxHolidayRow } from "../ingestion/adapters/tax-holidays";
import type { UploadBuffer } from "../parsing/upload-buffer";
import type { OcrEngine } from "../parsing/ocr";
import type { ApiLogger } from "./logging";
import type { TurnstileVerifier } from "./turnstile";
import type { StripeWebhookVerifier } from "./stripe";
import type {
  PriceHistoryRow,
  RetailerLogisticsRow,
  TaxRateRow,
  TrendSignalRow,
  VariantResolutionRow,
} from "./catalog";

/* Structural D1 subset (satisfied by D1Database). */
export interface D1RowsLike<T> {
  results: T[];
}
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<D1RowsLike<T>>;
}
export interface D1Like {
  prepare(sql: string): D1PreparedLike;
}

/**
 * Every fixture document the API serves from. All are `_fixture: true`
 * labeled and pass the tests/fixtures.test.ts guards; the worker entry
 * imports them from fixtures/ at build time, tests inject them.
 */
export interface FixtureLibrary {
  offers: FixtureDocument<ProductFeedRow>;
  recalls: FixtureDocument<CpscRecallRow>;
  taxHolidays: FixtureDocument<TaxHolidayRow>;
  catalog: FixtureDocument<VariantResolutionRow>;
  logistics: FixtureDocument<RetailerLogisticsRow>;
  taxRates: FixtureDocument<TaxRateRow>;
  trendSignals: FixtureDocument<TrendSignalRow>;
  priceHistory: FixtureDocument<PriceHistoryRow>;
}

export interface ApiDeps {
  db: D1Like;
  /** SOURCE_KV: SWR cache envelopes + rate-limit buckets. */
  kv: KvLike;
  uploadBuffer: UploadBuffer;
  ocr: OcrEngine;
  /** Injected clock (epoch ms). No API module calls Date.now(). */
  clock: Clock;
  /** Opaque unique id generator (crypto.randomUUID in production). */
  ids: () => string;
  flags: Flags;
  fixtures: FixtureLibrary;
  turnstile: TurnstileVerifier;
  stripeWebhooks: StripeWebhookVerifier;
  logger: ApiLogger;
}
