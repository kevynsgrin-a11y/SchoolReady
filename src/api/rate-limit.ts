/**
 * Token-bucket rate limiting over KV (no Durable Objects — §2 keeps DO usage
 * to live family-collaboration sessions only). Clock injected; state is a
 * small JSON envelope per (bucket, subject) under the 'ratelimit:' prefix.
 *
 * Subjects are opaque session-token hashes — never IPs, never anything
 * derived from identity (§1.7). Buckets per CLAUDE.md §2: upload, alert
 * subscription (account creation does not exist in the beta — accounts are
 * optional-later and no endpoint creates one).
 */
import type { KvLike } from "../ingestion/swr-cache";
import type { Clock } from "../ingestion/types";

export const KV_RATE_LIMIT_PREFIX = "ratelimit:";

export interface RateLimitRule {
  bucket: string;
  /** Max tokens (burst size). */
  capacity: number;
  /** Tokens restored per second. */
  refillPerSecond: number;
}

/** Model constants — operational limits, not user-facing facts. */
export const RATE_LIMIT_RULES = {
  upload: { bucket: "upload", capacity: 5, refillPerSecond: 5 / 60 },
  alerts: { bucket: "alerts", capacity: 5, refillPerSecond: 5 / 60 },
} as const satisfies Record<string, RateLimitRule>;

interface BucketState {
  tokens: number;
  updatedAtMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  kv: KvLike,
  rule: RateLimitRule,
  subject: string,
  clock: Clock,
): Promise<RateLimitDecision> {
  const key = `${KV_RATE_LIMIT_PREFIX}${rule.bucket}:${subject}`;
  const nowMs = clock();
  const raw = await kv.get(key);
  let tokens = rule.capacity;
  if (raw !== null) {
    const state = JSON.parse(raw) as BucketState;
    const elapsedSeconds = Math.max(0, (nowMs - state.updatedAtMs) / 1000);
    tokens = Math.min(rule.capacity, state.tokens + elapsedSeconds * rule.refillPerSecond);
  }
  if (tokens >= 1) {
    const next: BucketState = { tokens: tokens - 1, updatedAtMs: nowMs };
    await kv.put(key, JSON.stringify(next));
    return { allowed: true, remaining: Math.floor(tokens - 1), retryAfterSeconds: 0 };
  }
  const deficit = 1 - tokens;
  const state: BucketState = { tokens, updatedAtMs: nowMs };
  await kv.put(key, JSON.stringify(state));
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.ceil(deficit / rule.refillPerSecond),
  };
}
