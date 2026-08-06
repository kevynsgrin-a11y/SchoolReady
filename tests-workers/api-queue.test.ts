/**
 * Phase 5 queue wiring on real workerd: the ingestion-refresh queue binding
 * exists (wrangler.jsonc, §2-justified) and the consumer logic processes the
 * Phase 2 job contract (src/ingestion/jobs.ts) by re-seeding the SWR caches
 * through the same breaker-guarded pipelines the API reads — with no live
 * network anywhere (fixture adapters only; live sources stay flag-OFF).
 */
import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FLAGS } from "../config/flags";
import { planRefreshJobs, INGESTION_QUEUE_NAME } from "../src/ingestion/jobs";
import {
  processRefreshMessages,
  processRefreshQueueMessages,
  type RefreshQueueMessage,
} from "../src/index";
import { makeClient, clearSourceCaches, T0 } from "./api-helpers";

describe("ingestion-refresh queue (§2: Queues for background jobs only)", () => {
  it("exposes the producer binding named for the contracted queue", () => {
    expect(INGESTION_QUEUE_NAME).toBe("ingestion-refresh");
    expect(env.INGESTION_QUEUE).toBeDefined();
    expect(typeof env.INGESTION_QUEUE.send).toBe("function");
  });

  it("consumer processing re-seeds the SWR caches from the fixture pipelines", async () => {
    await clearSourceCaches();
    const client = makeClient({ idPrefix: "q", nowMs: T0 });
    const jobs = planRefreshJobs(DEFAULT_FLAGS, "2026-08-04T12:00:00.000Z");
    expect(jobs).toHaveLength(4); // all sources refresh in fixture mode
    await processRefreshMessages(jobs, client.deps);
    for (const sourceId of ["affiliate_feeds", "cpsc_recalls", "state_tax_holidays"]) {
      const cached = await env.SOURCE_KV.get(`cache:${sourceId}`);
      expect(cached, `cache:${sourceId} not seeded`).not.toBeNull();
      const envelope = JSON.parse(cached!) as { payload: { records: unknown[] } };
      expect(envelope.payload.records.length).toBeGreaterThan(0);
    }
    // The school directory has no serving pipeline yet: skipped VISIBLY.
    const skips = client.logs.filter((e) => e.event === "refresh_skipped");
    expect(skips).toHaveLength(1);
    expect(skips[0]!.fields["sourceId"]).toBe("nces_ccd");
  });

  it("acknowledges successful messages individually", async () => {
    await clearSourceCaches();
    const client = makeClient({ idPrefix: "q-ack", nowMs: T0 });
    const [job] = planRefreshJobs(DEFAULT_FLAGS, "2026-08-04T12:00:00.000Z");
    const ack = vi.fn();
    const retry = vi.fn();
    const message: RefreshQueueMessage = {
      body: job!,
      attempts: 1,
      ack,
      retry,
    };

    await processRefreshQueueMessages([message], client.deps);

    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });

  it("retries only the failed message with bounded backoff", async () => {
    const client = makeClient({ idPrefix: "q-retry", nowMs: T0 });
    const job = planRefreshJobs(DEFAULT_FLAGS, "2026-08-04T12:00:00.000Z").find(
      ({ sourceId }) => sourceId === "affiliate_feeds",
    );
    const ack = vi.fn();
    const retry = vi.fn();
    const message: RefreshQueueMessage = {
      body: job!,
      attempts: 2,
      ack,
      retry,
    };
    const failingDeps = {
      ...client.deps,
      kv: {
        get: () => Promise.resolve(null),
        put: () => Promise.reject(new Error("synthetic KV failure")),
        delete: () => Promise.resolve(),
      },
    };

    await processRefreshQueueMessages([message], failingDeps);

    expect(ack).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(client.logs).toContainEqual({
      event: "refresh_failed",
      fields: {
        sourceId: "affiliate_feeds",
        reason: "pipeline_error",
        retryAfterSeconds: 60,
      },
    });
  });
});
