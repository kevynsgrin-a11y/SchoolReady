/**
 * Node-side API test harness: real route handlers, fixture dependencies,
 * injected clock/ids, captured logs. The db member throws on touch by
 * default so session-less endpoints are PROVEN not to need storage; suites
 * that exercise D1 run in tests-workers/ against real workerd D1.
 */
import { DEFAULT_FLAGS } from "../../config/flags";
import { MemoryKv } from "../../src/ingestion/swr-cache";
import type { FixtureDocument } from "../../src/ingestion/types";
import { MemoryUploadBuffer, createFixtureOcrEngine } from "../../src/parsing";
import type { OcrFixtureRow } from "../../src/parsing";
import type { ApiDeps, D1Like, FixtureLibrary } from "../../src/api/deps";
import type { ApiLogEvent } from "../../src/api/logging";
import { createAllowlistLogger } from "../../src/api/logging";
import { createFixtureTurnstileVerifier } from "../../src/api/turnstile";
import { createFixtureStripeVerifier } from "../../src/api/stripe";
import type {
  PriceHistoryRow,
  RetailerLogisticsRow,
  TaxRateRow,
  TrendSignalRow,
  VariantResolutionRow,
} from "../../src/api/catalog";
import type { ProductFeedRow } from "../../src/ingestion/adapters/product-feeds";
import type { CpscRecallRow } from "../../src/ingestion/adapters/cpsc-recalls";
import type { TaxHolidayRow } from "../../src/ingestion/adapters/tax-holidays";
import { loadFixtureDoc } from "./fixtures";

export const T0 = Date.parse("2026-08-04T12:00:00.000Z");

export function loadFixtureLibrary(): FixtureLibrary {
  return {
    offers: loadFixtureDoc<ProductFeedRow>("product-feeds/offers.fixture.json"),
    recalls: loadFixtureDoc<CpscRecallRow>("cpsc-recalls/recalls.fixture.json"),
    taxHolidays: loadFixtureDoc<TaxHolidayRow>("tax-holidays/2026.fixture.json"),
    catalog: loadFixtureDoc<VariantResolutionRow>("catalog/variants.fixture.json"),
    logistics: loadFixtureDoc<RetailerLogisticsRow>("retailers/logistics.fixture.json"),
    taxRates: loadFixtureDoc<TaxRateRow>("tax-rates/rates.fixture.json"),
    trendSignals: loadFixtureDoc<TrendSignalRow>("trend-signals/signals.fixture.json"),
    priceHistory: loadFixtureDoc<PriceHistoryRow>("price-history/history.fixture.json"),
  };
}

/** A db that fails the test if any handler touches it. */
export const untouchableDb: D1Like = {
  prepare(): never {
    throw new Error("this endpoint must not touch D1");
  },
};

export const EMPTY_OCR_DOC: FixtureDocument<OcrFixtureRow> = {
  _fixture: true,
  fixtureSet: "fixture:ocr-node-tests-v1",
  description: "Synthetic empty OCR replay set for node-side API tests.",
  generatedAt: "2026-08-01T00:00:00.000Z",
  provenance: {
    source: "fixture:ocr-node-tests-v1",
    sourceType: "fixture",
    observedAt: "2026-08-01T00:00:00.000Z",
    geography: "US",
    transformVersion: "none",
    confidence: 1,
    limitations: "Empty synthetic OCR set (node API tests never upload).",
  },
  records: [],
};

export interface NodeApiHarness {
  deps: ApiDeps;
  logs: ApiLogEvent[];
  setNow(ms: number): void;
}

export function makeNodeDeps(overrides: Partial<ApiDeps> = {}): NodeApiHarness {
  let now = T0;
  const clock = (): number => now;
  let counter = 0;
  const logs: ApiLogEvent[] = [];
  const deps: ApiDeps = {
    db: untouchableDb,
    kv: new MemoryKv(),
    uploadBuffer: new MemoryUploadBuffer(clock),
    ocr: createFixtureOcrEngine(EMPTY_OCR_DOC),
    clock,
    ids: () => `t${(counter += 1)}`,
    flags: DEFAULT_FLAGS,
    fixtures: loadFixtureLibrary(),
    turnstile: createFixtureTurnstileVerifier(),
    stripeWebhooks: createFixtureStripeVerifier(),
    logger: createAllowlistLogger((event) => logs.push(event)),
    ...overrides,
  };
  return { deps, logs, setNow: (ms) => (now = ms) };
}

export interface CallOptions {
  body?: unknown;
  rawBody?: string;
  headers?: Record<string, string>;
}

export interface CallResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  setCookie: string | null;
}

export async function callApi(
  deps: ApiDeps,
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<CallResult> {
  const { handleApiRequest } = await import("../../src/api/routes");
  const headers = new Headers(options.headers ?? {});
  let bodyInit: string | undefined;
  if (options.rawBody !== undefined) {
    bodyInit = options.rawBody;
  } else if (options.body !== undefined) {
    bodyInit = JSON.stringify(options.body);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const response = await handleApiRequest(
    new Request(`http://fixture.test${path}`, { method, headers, body: bodyInit }),
    deps,
  );
  return {
    status: response.status,
    body: await response.json(),
    setCookie: response.headers.get("set-cookie"),
  };
}
