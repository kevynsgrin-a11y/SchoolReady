/**
 * Stale-while-revalidate cache (Phase 2).
 *
 * Data older than circuitBreaker.staleAfterSeconds is STILL SERVED but the
 * result carries machine-readable `stale: true` plus its age — the API layer
 * (Phase 5) and frontend (Phase 7) render that as the stale badge. Nothing
 * here ever deletes on staleness: a provider outage degrades to stale-badged
 * cached data, never an error page (§4 Phase 2 acceptance; §1.5 handles
 * suppression thresholds downstream).
 *
 * The store is a minimal KV-shaped interface: the production binding is the
 * SOURCE_KV namespace (wrangler.jsonc, key prefix 'cache:'), and MemoryKv
 * backs node-side tests and offline fixture runs. The clock is injected.
 */
import type { Clock } from "./types";
import { isoFromMs } from "./types";
import type { IsoTimestamp } from "../contracts/provenance";

/** Structural subset of KVNamespace (string values). */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  /**
   * REQUIRED. [Compliance — Phase 10] the §1.7 one-pass purge uses it to
   * drop rate-limit buckets keyed by deleted token hashes; [Release —
   * Phase 12, gate finding P10-3] made non-optional so a custom double
   * without it fails typecheck instead of silently skipping bucket drops.
   * The real KVNamespace and MemoryKv both provide it.
   */
  delete(key: string): Promise<void>;
}

/** In-memory KvLike for tests and offline fixture ingestion. */
export class MemoryKv implements KvLike {
  private readonly map = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }

  put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}

interface StoredEnvelope {
  storedAt: IsoTimestamp;
  payload: unknown;
}

export interface CachedResult<T> {
  payload: T;
  storedAt: IsoTimestamp;
  ageSeconds: number;
  /** Machine-readable stale badge signal: age > staleAfterSeconds. */
  stale: boolean;
}

export class SwrCache {
  constructor(
    private readonly store: KvLike,
    private readonly staleAfterSeconds: number,
    private readonly clock: Clock,
  ) {}

  async put(key: string, payload: unknown): Promise<void> {
    const envelope: StoredEnvelope = {
      storedAt: isoFromMs(this.clock()),
      payload,
    };
    await this.store.put(key, JSON.stringify(envelope));
  }

  async get<T>(key: string): Promise<CachedResult<T> | null> {
    const raw = await this.store.get(key);
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as StoredEnvelope;
    const ageSeconds = Math.max(
      0,
      Math.floor((this.clock() - Date.parse(envelope.storedAt)) / 1000),
    );
    return {
      payload: envelope.payload as T,
      storedAt: envelope.storedAt,
      ageSeconds,
      stale: ageSeconds > this.staleAfterSeconds,
    };
  }
}
