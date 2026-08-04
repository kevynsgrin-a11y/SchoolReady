/**
 * Acceptance proof: FULL ingestion runs offline in fixture mode.
 *
 * globalThis.fetch is poisoned for the duration of the suite — any network
 * attempt fails the test. All four sources ingest from fixture documents
 * through the real pipeline (breaker + SWR cache + health), every record
 * carries fixture-typed provenance (§1.4), and every live stub throws the
 * descriptive disabled-by-flag error without touching the (poisoned) fetch.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_FLAGS } from "../config/flags";
import type { Flags, SourceId } from "../config/flags";
import { CircuitBreaker } from "../src/ingestion/circuit-breaker";
import { MemoryKv, SwrCache } from "../src/ingestion/swr-cache";
import { SourceHealthTracker } from "../src/ingestion/source-health";
import { IngestionPipeline } from "../src/ingestion/pipeline";
import { SOURCE_REGISTRATIONS } from "../src/ingestion/registry";
import { LiveSourceDisabledError } from "../src/ingestion/types";
import type { SourceAdapter, SourceEnvelope } from "../src/ingestion/types";
import { createLiveStub } from "../src/ingestion/adapters/live-stub";
import { createNcesCcdAdapter } from "../src/ingestion/adapters/nces-ccd";
import { createCpscAdapter } from "../src/ingestion/adapters/cpsc-recalls";
import { createTaxHolidayAdapter } from "../src/ingestion/adapters/tax-holidays";
import { createProductFeedAdapter } from "../src/ingestion/adapters/product-feeds";
import { SOURCE_IDS } from "../src/contracts/source";
import {
  loadOffersFixture,
  loadRecallsFixture,
  loadSchoolsFixture,
  loadTaxHolidaysFixture,
} from "./helpers/fixtures";

let networkAttempts = 0;

beforeAll(() => {
  vi.stubGlobal("fetch", () => {
    networkAttempts += 1;
    throw new Error("network access attempted during offline fixture ingestion");
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function runPipeline<T>(adapter: SourceAdapter<T>): Promise<SourceEnvelope<T>> {
  let nowMs = 1_770_000_000_000;
  const clock = () => nowMs;
  const breaker = new CircuitBreaker(DEFAULT_FLAGS.circuitBreaker, clock);
  const pipeline = new IngestionPipeline<T>({
    adapter,
    breaker,
    cache: new SwrCache(new MemoryKv(), DEFAULT_FLAGS.circuitBreaker.staleAfterSeconds, clock),
    health: new SourceHealthTracker(
      SOURCE_REGISTRATIONS[adapter.sourceId],
      breaker,
      clock,
      `prov:system:source-health:${adapter.sourceId}`,
    ),
    flags: DEFAULT_FLAGS,
    clock,
  });
  nowMs += 1;
  return pipeline.refresh();
}

describe("offline fixture ingestion — all four sources, zero network", () => {
  const clock = () => 1_770_000_000_000;

  it("ingests the NCES CCD fixture directory (synthetic schools only)", async () => {
    const result = await runPipeline(
      createNcesCcdAdapter(DEFAULT_FLAGS, loadSchoolsFixture(), clock),
    );
    expect(result.ok).toBe(true);
    expect(result.records.length).toBeGreaterThanOrEqual(3);
    for (const { record, provenance } of result.records) {
      expect(provenance.sourceType).toBe("fixture");
      expect(provenance.source).toBe("fixture:nces-ccd-2026-v1");
      expect(record.isSynthetic).toBe(true);
      expect(record.ncesSchoolId).toBeNull();
      expect(record.name).toContain("(Fixture)");
      expect(record.provenanceId).toBe(provenance.id);
    }
  });

  it("ingests the CPSC fixture recalls (synthetic, CPSC field shape)", async () => {
    const result = await runPipeline(
      createCpscAdapter(DEFAULT_FLAGS, loadRecallsFixture(), clock),
    );
    expect(result.ok).toBe(true);
    expect(result.records.length).toBeGreaterThanOrEqual(3);
    for (const { record, provenance } of result.records) {
      expect(provenance.sourceType).toBe("fixture");
      expect(record.recall.isSynthetic).toBe(true);
      expect(record.recall.cpscRecallId).toMatch(/^FIXTURE-/);
      expect(record.recall.title).toContain("(Fixture Sample)");
      expect(record.products.length).toBeGreaterThan(0);
      for (const p of record.products) expect(p.provenanceId).toBe(provenance.id);
    }
  });

  it("ingests the tax-holiday fixture calendar with reduced confidence + limitations", async () => {
    const result = await runPipeline(
      createTaxHolidayAdapter(DEFAULT_FLAGS, loadTaxHolidaysFixture(), clock),
    );
    expect(result.ok).toBe(true);
    expect(result.records.length).toBeGreaterThanOrEqual(3);
    for (const { record, provenance } of result.records) {
      expect(provenance.sourceType).toBe("fixture");
      expect(provenance.confidence).toBeLessThan(1); // never presented as verified
      expect(provenance.limitations).toMatch(/NOT verified/);
      expect(provenance.geography).toBe(`US-${record.holiday.state}`);
      expect(record.holiday.isSynthetic).toBe(true);
      expect(record.holiday.infoUrl).toContain("example.com"); // never a real state URL
      expect(record.categories.length).toBeGreaterThan(0);
    }
  });

  it("ingests the retailer feed fixture across >=3 synthetic retailers", async () => {
    const result = await runPipeline(
      createProductFeedAdapter(DEFAULT_FLAGS, loadOffersFixture(), clock),
    );
    expect(result.ok).toBe(true);
    const retailers = new Set(result.records.map((r) => r.record.retailerSlug));
    expect(retailers.size).toBeGreaterThanOrEqual(3); // §0 capability 3
    for (const { record, provenance } of result.records) {
      expect(provenance.sourceType).toBe("fixture");
      expect(record.retailerName).toContain("Fixture");
      expect(record.sku).toMatch(/^F/);
      expect(record.upc === null || record.upc.startsWith("FIXTURE-")).toBe(true);
      expect(Number.isInteger(record.priceCents)).toBe(true);
    }
  });

  it("every live stub throws the descriptive disabled-by-flag error (and never fetches)", async () => {
    for (const sourceId of SOURCE_IDS) {
      const stub = createLiveStub(sourceId);
      await expect(stub.fetchBatch()).rejects.toThrow(LiveSourceDisabledError);
      await expect(stub.fetchBatch()).rejects.toThrow(
        new RegExp(`disabled by flag.*liveSources\\.${sourceId}`),
      );
      await expect(stub.fetchBatch()).rejects.toThrow(/No network request was made/);
    }
  });

  it("factories select the fixture path for every source under default flags", () => {
    const docs = {
      nces_ccd: () => createNcesCcdAdapter(DEFAULT_FLAGS, loadSchoolsFixture(), clock),
      cpsc_recalls: () => createCpscAdapter(DEFAULT_FLAGS, loadRecallsFixture(), clock),
      state_tax_holidays: () =>
        createTaxHolidayAdapter(DEFAULT_FLAGS, loadTaxHolidaysFixture(), clock),
      affiliate_feeds: () =>
        createProductFeedAdapter(DEFAULT_FLAGS, loadOffersFixture(), clock),
    } satisfies Record<SourceId, () => SourceAdapter<unknown>>;
    for (const make of Object.values(docs)) {
      expect(make().mode).toBe("fixture");
    }
  });

  it("a live-flagged source still cannot fetch: the factory hands back the throwing stub", async () => {
    const liveFlags: Flags = {
      ...DEFAULT_FLAGS,
      liveSources: { ...DEFAULT_FLAGS.liveSources, nces_ccd: true },
    };
    const adapter = createNcesCcdAdapter(liveFlags, loadSchoolsFixture(), clock);
    expect(adapter.mode).toBe("live");
    await expect(adapter.fetchBatch()).rejects.toThrow(/no live fetch code/i);
  });

  it("zero network attempts were made across the entire suite", () => {
    expect(networkAttempts).toBe(0);
  });
});
