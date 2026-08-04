/**
 * Transient upload buffer contract (SS1.7 / SS2).
 *
 * Uploaded list images/PDFs are processed EPHEMERALLY: bytes live only in
 * this buffer, carry a hard TTL, and are deleted in a `finally` block the
 * moment processing ends — success or failure. Deletion is verified by
 * test (`list()` after the cycle), never assumed. Nothing from an upload
 * ever touches KV or D1 as raw bytes/text.
 *
 * Two implementations against one structural interface:
 *  - MemoryUploadBuffer: fixture/node tests, injected clock.
 *  - R2UploadBuffer: wraps the R2 binding (wrangler.jsonc UPLOAD_BUFFER).
 *    R2 lifecycle rules have day granularity, so the hard TTL is ALSO
 *    enforced in code: an expired object is unreadable (get() deletes it
 *    and returns null) even if the lifecycle sweep has not run yet.
 */
import type { IsoTimestamp } from "../contracts";
import type { Clock } from "../ingestion/types";
import { isoFromMs } from "../ingestion/types";

/** Hard TTL for upload objects. 15 minutes: parse + review, nothing more. */
export const UPLOAD_BUFFER_TTL_SECONDS = 900;

/** All buffer keys are namespaced so sweeps/tests can scope precisely. */
export const UPLOAD_KEY_PREFIX = "uploads/";

export interface BufferedUploadMeta {
  key: string;
  contentType: string;
  byteLength: number;
  expiresAt: IsoTimestamp;
}

export interface BufferedUpload {
  meta: BufferedUploadMeta;
  bytes: Uint8Array;
}

export interface UploadBuffer {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<BufferedUploadMeta>;
  /** Null when absent OR past the hard TTL (expired = gone, by contract). */
  get(key: string): Promise<BufferedUpload | null>;
  delete(key: string): Promise<void>;
  /** Keys currently held — lets tests VERIFY deletion, not assume it. */
  list(): Promise<string[]>;
  /** Deletes every expired object; returns the swept keys. */
  sweepExpired(): Promise<string[]>;
}

export class UploadKeyError extends Error {
  constructor(key: string) {
    super(
      `Upload buffer keys must start with "${UPLOAD_KEY_PREFIX}" (got "${key}")`,
    );
    this.name = "UploadKeyError";
  }
}

const assertKey = (key: string): void => {
  if (!key.startsWith(UPLOAD_KEY_PREFIX)) throw new UploadKeyError(key);
};

interface MemoryEntry {
  meta: BufferedUploadMeta;
  bytes: Uint8Array;
  expiresAtMs: number;
}

/** In-memory fixture-mode implementation with an injected clock. */
export class MemoryUploadBuffer implements UploadBuffer {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlSeconds: number = UPLOAD_BUFFER_TTL_SECONDS,
  ) {}

  put(key: string, bytes: Uint8Array, contentType: string): Promise<BufferedUploadMeta> {
    assertKey(key);
    const expiresAtMs = this.clock() + this.ttlSeconds * 1000;
    const meta: BufferedUploadMeta = {
      key,
      contentType,
      byteLength: bytes.byteLength,
      expiresAt: isoFromMs(expiresAtMs),
    };
    this.entries.set(key, { meta, bytes, expiresAtMs });
    return Promise.resolve(meta);
  }

  get(key: string): Promise<BufferedUpload | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);
    if (this.clock() >= entry.expiresAtMs) {
      // Hard TTL: expired objects are unreadable and immediately removed.
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve({ meta: entry.meta, bytes: entry.bytes });
  }

  delete(key: string): Promise<void> {
    this.entries.delete(key);
    return Promise.resolve();
  }

  list(): Promise<string[]> {
    return Promise.resolve([...this.entries.keys()].sort());
  }

  sweepExpired(): Promise<string[]> {
    const swept: string[] = [];
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAtMs) {
        this.entries.delete(key);
        swept.push(key);
      }
    }
    return Promise.resolve(swept.sort());
  }
}

/**
 * Minimal structural view of an R2 bucket (same pattern as Phase 2's
 * KvLike): keeps src/parsing free of ambient workers types so node tests
 * typecheck, while the real R2Bucket binding satisfies it in workerd.
 */
export interface R2ObjectLike {
  key: string;
  customMetadata?: Record<string, string>;
}
export interface R2ObjectBodyLike extends R2ObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface R2Like {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    include?: ("httpMetadata" | "customMetadata")[];
  }): Promise<{ objects: R2ObjectLike[] }>;
}

const META_EXPIRES = "expiresAtMs";
const META_CONTENT_TYPE = "contentType";

/** R2-backed implementation. TTL enforced in code (see module docs). */
export class R2UploadBuffer implements UploadBuffer {
  constructor(
    private readonly bucket: R2Like,
    private readonly clock: Clock,
    private readonly ttlSeconds: number = UPLOAD_BUFFER_TTL_SECONDS,
  ) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<BufferedUploadMeta> {
    assertKey(key);
    const expiresAtMs = this.clock() + this.ttlSeconds * 1000;
    const copy = new Uint8Array(bytes); // detach from caller-owned memory
    await this.bucket.put(key, copy.buffer as ArrayBuffer, {
      customMetadata: {
        [META_EXPIRES]: String(expiresAtMs),
        [META_CONTENT_TYPE]: contentType,
      },
    });
    return {
      key,
      contentType,
      byteLength: bytes.byteLength,
      expiresAt: isoFromMs(expiresAtMs),
    };
  }

  async get(key: string): Promise<BufferedUpload | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    const expiresAtMs = Number(obj.customMetadata?.[META_EXPIRES] ?? 0);
    if (expiresAtMs === 0 || this.clock() >= expiresAtMs) {
      await this.bucket.delete(key);
      return null;
    }
    const bytes = new Uint8Array(await obj.arrayBuffer());
    return {
      meta: {
        key,
        contentType: obj.customMetadata?.[META_CONTENT_TYPE] ?? "application/octet-stream",
        byteLength: bytes.byteLength,
        expiresAt: isoFromMs(expiresAtMs),
      },
      bytes,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(): Promise<string[]> {
    const { objects } = await this.bucket.list({ prefix: UPLOAD_KEY_PREFIX });
    return objects.map((o) => o.key).sort();
  }

  async sweepExpired(): Promise<string[]> {
    const { objects } = await this.bucket.list({
      prefix: UPLOAD_KEY_PREFIX,
      include: ["customMetadata"],
    });
    const swept: string[] = [];
    const now = this.clock();
    for (const obj of objects) {
      const expiresAtMs = Number(obj.customMetadata?.[META_EXPIRES] ?? 0);
      if (expiresAtMs === 0 || now >= expiresAtMs) {
        await this.bucket.delete(obj.key);
        swept.push(obj.key);
      }
    }
    return swept.sort();
  }
}
