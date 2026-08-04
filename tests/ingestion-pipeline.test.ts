/**
 * Ingestion pipeline tests — the §4 Phase 2 acceptance scenario: a simulated
 * provider outage degrades to stale-badged cached data with the circuit
 * breaker opening/closing at configured thresholds, and NEVER surfaces an
 * error for data that exists in cache. Plus the §1.4 write-time provenance
 * gate. Injected clocks throughout; no real timers, no network.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "../config/flags";
import { CircuitBreaker } from "../src/ingestion/circuit-breaker";
import { MemoryKv, SwrCache } from "../src/ingestion/swr-cache";
import { SourceHealthTracker } from "../src/ingestion/source-health";
import { IngestionPipeline } from "../src/ingestion/pipeline";
import { SOURCE_REGISTRATIONS } from "../src/ingestion/registry";
import { createCpscFixtureAdapter } from "../src/ingestion/adapters/cpsc-recalls";
import type { RecallBundle } from "../src/ingestion/adapters/cpsc-recalls";
import type { IngestionBatch, SourceAdapter } from "../src/ingestion/types";
import { loadRecallsFixture } from "./helpers/fixtures";

const CONFIG = DEFAULT_FLAGS.circuitBreaker;

/** Wraps an adapter so tests can simulate a provider outage and recovery. */
class OutageSimulator<T> implements SourceAdapter<T> {
  readonly sourceId;
  readonly mode;
  down = false;
  calls = 0;

  constructor(private readonly inner: SourceAdapter<T>) {
    this.sourceId = inner.sourceId;
    this.mode = inner.mode;
  }

  fetchBatch(): Promise<IngestionBatch<T>> {
    this.calls += 1;
    if (this.down) {
      return Promise.reject(new Error("simulated provider outage (HTTP 503)"));
    }
    return this.inner.fetchBatch();
  }
}

function makeHarness() {
  let nowMs = 1_770_000_000_000;
  const clock = () => nowMs;
  const advanceSeconds = (s: number) => {
    nowMs += s * 1000;
  };
  const adapter = new OutageSimulator<RecallBundle>(
    createCpscFixtureAdapter(loadRecallsFixture(), clock),
  );
  const breaker = new CircuitBreaker(CONFIG, clock);
  const health = new SourceHealthTracker(
    SOURCE_REGISTRATIONS.cpsc_recalls,
    breaker,
    clock,
    "prov:system:source-health:cpsc_recalls",
  );
  const pipeline = new IngestionPipeline<RecallBundle>({
    adapter,
    breaker,
    cache: new SwrCache(new MemoryKv(), CONFIG.staleAfterSeconds, clock),
    health,
    flags: DEFAULT_FLAGS,
    clock,
  });
  return { adapter, breaker, health, pipeline, advanceSeconds };
}

describe("pipeline — healthy fixture path", () => {
  it("serves fresh fixture data with a clean envelope", async () => {
    const { pipeline } = makeHarness();
    const result = await pipeline.refresh();
    expect(result.ok).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.degraded).toBe("none");
    expect(result.circuitState).toBe("closed");
    expect(result.lastError).toBeNull();
    expect(result.records.length).toBeGreaterThan(0);
    for (const entry of result.records) {
      expect(entry.provenance.sourceType).toBe("fixture");
    }
  });
});

describe("pipeline — §4 acceptance: simulated provider outage", () => {
  it("outage degrades to cached data, opens the breaker at threshold, badges stale by age, and never throws", async () => {
    const { adapter, breaker, pipeline, advanceSeconds } = makeHarness();

    // 1. Healthy fetch primes the cache.
    const healthy = await pipeline.refresh();
    expect(healthy.ok).toBe(true);
    const cachedCount = healthy.records.length;

    // 2. Provider goes down. Every refresh up to the threshold serves the
    //    cache (degraded, not an error) while failures accumulate.
    adapter.down = true;
    for (let i = 1; i <= CONFIG.failureThreshold; i++) {
      advanceSeconds(60);
      const r = await pipeline.refresh(); // must not throw
      expect(r.ok).toBe(true);
      expect(r.degraded).toBe("cache_fallback");
      expect(r.records.length).toBe(cachedCount);
      expect(r.lastError).toContain("simulated provider outage");
      expect(r.circuitState).toBe(i < CONFIG.failureThreshold ? "closed" : "open");
    }

    // 3. Breaker open: the provider is NOT called again; cache still serves.
    const callsWhenOpened = adapter.calls;
    advanceSeconds(30);
    const whileOpen = await pipeline.refresh();
    expect(adapter.calls).toBe(callsWhenOpened);
    expect(whileOpen.ok).toBe(true);
    expect(whileOpen.circuitState).toBe("open");
    expect(whileOpen.degraded).toBe("cache_fallback");

    // 4. Once the cache ages past staleAfterSeconds, the served data carries
    //    the machine-readable stale badge — still served, still no error.
    advanceSeconds(CONFIG.staleAfterSeconds);
    // (cooldown elapsed too, so the breaker probes and fails again)
    const staleServed = await pipeline.refresh();
    expect(staleServed.ok).toBe(true);
    expect(staleServed.stale).toBe(true);
    expect(staleServed.ageSeconds).toBeGreaterThan(CONFIG.staleAfterSeconds);
    expect(staleServed.records.length).toBe(cachedCount);

    // 5. Failed probe re-opened the breaker with a fresh cooldown.
    expect(breaker.state()).toBe("open");
    advanceSeconds(CONFIG.cooldownSeconds);
    expect(breaker.state()).toBe("half_open");

    // 6. Provider recovers; the half-open probe succeeds and closes the
    //    breaker; data is fresh again and the badge clears.
    adapter.down = false;
    const recovered = await pipeline.refresh();
    expect(recovered.ok).toBe(true);
    expect(recovered.stale).toBe(false);
    expect(recovered.degraded).toBe("none");
    expect(recovered.circuitState).toBe("closed");
    expect(recovered.lastError).toBeNull();
  });

  it("with an empty cache an outage yields ok:false suppression — an envelope, never a throw", async () => {
    const { adapter, pipeline } = makeHarness();
    adapter.down = true; // down before anything was ever cached
    const r = await pipeline.refresh();
    expect(r.ok).toBe(false);
    expect(r.degraded).toBe("unavailable");
    expect(r.records).toEqual([]);
    expect(r.lastError).toContain("simulated provider outage");
  });

  it("tracks source health through failure and recovery", async () => {
    const { adapter, pipeline, health, advanceSeconds } = makeHarness();
    await pipeline.refresh();
    expect(health.snapshot().lastSuccessAt).not.toBeNull();

    adapter.down = true;
    for (let i = 0; i < CONFIG.failureThreshold; i++) {
      advanceSeconds(60);
      await pipeline.refresh();
    }
    const failing = health.snapshot();
    expect(failing.circuitState).toBe("open");
    expect(failing.consecutiveFailures).toBe(CONFIG.failureThreshold);
    expect(failing.openedAt).not.toBeNull();
    expect(failing.lastError).toContain("simulated provider outage");
    // Licensing flags ride along for the Phase 10 register.
    expect(failing.licenseBasis).toBe("us_government_open_data");
    const row = health.toRow();
    expect(row.source_id).toBe("cpsc_recalls");
    expect(row.circuit_state).toBe("open");
    expect(row.license_allows_live_fetch).toBe(0);

    adapter.down = false;
    advanceSeconds(CONFIG.cooldownSeconds);
    await pipeline.refresh();
    const recovered = health.snapshot();
    expect(recovered.circuitState).toBe("closed");
    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.lastError).toBe("");
  });
});

describe("pipeline — §1.4 write-time provenance gate", () => {
  it("rejects a batch containing a record without provenance before it reaches the cache", async () => {
    const nowMs = 1_770_000_000_000;
    const clock = () => nowMs;
    const badAdapter: SourceAdapter<{ note: string }> = {
      sourceId: "cpsc_recalls",
      mode: "fixture",
      fetchBatch: () =>
        Promise.resolve({
          sourceId: "cpsc_recalls",
          fetchedAt: new Date(nowMs).toISOString(),
          records: [
            {
              record: { note: "fact without provenance" },
              provenance: undefined as never,
            },
          ],
        }),
    };
    const breaker = new CircuitBreaker(CONFIG, clock);
    const cache = new SwrCache(new MemoryKv(), CONFIG.staleAfterSeconds, clock);
    const pipeline = new IngestionPipeline({
      adapter: badAdapter,
      breaker,
      cache,
      health: new SourceHealthTracker(
        SOURCE_REGISTRATIONS.cpsc_recalls,
        breaker,
        clock,
        "prov:test",
      ),
      flags: DEFAULT_FLAGS,
      clock,
    });
    await expect(pipeline.refresh()).rejects.toThrow(/§1.4|provenance/);
    // Nothing unprovenanced was written.
    expect(await cache.get("cache:cpsc_recalls")).toBeNull();
  });

  it("rejects non-fixture provenance while fixture mode is ON (no plausible fabrications)", async () => {
    const nowMs = 1_770_000_000_000;
    const clock = () => nowMs;
    const doc = loadRecallsFixture();
    const inner = createCpscFixtureAdapter(doc, clock);
    const masquerading: SourceAdapter<RecallBundle> = {
      sourceId: "cpsc_recalls",
      mode: "fixture",
      fetchBatch: async () => {
        const batch = await inner.fetchBatch();
        const first = batch.records[0]!;
        first.provenance = { ...first.provenance, sourceType: "government_feed" };
        return batch;
      },
    };
    const breaker = new CircuitBreaker(CONFIG, clock);
    const pipeline = new IngestionPipeline({
      adapter: masquerading,
      breaker,
      cache: new SwrCache(new MemoryKv(), CONFIG.staleAfterSeconds, clock),
      health: new SourceHealthTracker(
        SOURCE_REGISTRATIONS.cpsc_recalls,
        breaker,
        clock,
        "prov:test",
      ),
      flags: DEFAULT_FLAGS,
      clock,
    });
    await expect(pipeline.refresh()).rejects.toThrow(/fixture/);
  });
});
