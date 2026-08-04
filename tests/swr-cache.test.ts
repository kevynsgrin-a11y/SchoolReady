/**
 * Stale-while-revalidate cache tests (injected clock, no real timers).
 * Data older than staleAfterSeconds is still served but carries the
 * machine-readable stale badge signal (`stale: true` + age).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_FLAGS } from "../config/flags";
import { MemoryKv, SwrCache } from "../src/ingestion/swr-cache";

const STALE_AFTER = DEFAULT_FLAGS.circuitBreaker.staleAfterSeconds; // 21600

function makeCache(startMs = 1_700_000_000_000) {
  let now = startMs;
  const cache = new SwrCache(new MemoryKv(), STALE_AFTER, () => now);
  return {
    cache,
    advanceSeconds: (s: number) => {
      now += s * 1000;
    },
  };
}

describe("SWR cache — freshness envelope", () => {
  it("returns null on a cache miss", async () => {
    const { cache } = makeCache();
    expect(await cache.get("cache:missing")).toBeNull();
  });

  it("serves young data with stale=false and an exact age", async () => {
    const { cache, advanceSeconds } = makeCache();
    await cache.put("cache:x", { value: "fixture-payload" });
    advanceSeconds(120);
    const hit = await cache.get<{ value: string }>("cache:x");
    expect(hit).not.toBeNull();
    expect(hit!.payload.value).toBe("fixture-payload");
    expect(hit!.ageSeconds).toBe(120);
    expect(hit!.stale).toBe(false);
  });

  it("still serves at exactly staleAfterSeconds without the badge (threshold is 'older than')", async () => {
    const { cache, advanceSeconds } = makeCache();
    await cache.put("cache:x", { value: 1 });
    advanceSeconds(STALE_AFTER);
    const hit = await cache.get("cache:x");
    expect(hit!.stale).toBe(false);
    expect(hit!.ageSeconds).toBe(STALE_AFTER);
  });

  it("serves data older than staleAfterSeconds WITH the machine-readable stale badge", async () => {
    const { cache, advanceSeconds } = makeCache();
    await cache.put("cache:x", { value: 1 });
    advanceSeconds(STALE_AFTER + 1);
    const hit = await cache.get("cache:x");
    expect(hit).not.toBeNull(); // stale data is served, never withheld
    expect(hit!.stale).toBe(true);
    expect(hit!.ageSeconds).toBe(STALE_AFTER + 1);
    expect(typeof hit!.storedAt).toBe("string");
  });

  it("a fresh put resets age and clears the stale badge", async () => {
    const { cache, advanceSeconds } = makeCache();
    await cache.put("cache:x", { generation: 1 });
    advanceSeconds(STALE_AFTER + 500);
    await cache.put("cache:x", { generation: 2 });
    const hit = await cache.get<{ generation: number }>("cache:x");
    expect(hit!.payload.generation).toBe(2);
    expect(hit!.stale).toBe(false);
    expect(hit!.ageSeconds).toBe(0);
  });
});
