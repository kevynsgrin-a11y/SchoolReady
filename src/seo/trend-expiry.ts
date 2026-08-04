/**
 * Trend-page expiry — Phase 8 (seo-architect).
 *
 * Trend pages carry evidence timestamps (the §1.4 provenance records that
 * already render on every trend card) and AUTO-EXPIRE into review: once the
 * newest supporting observation is older than TREND_PAGE_EXPIRY_DAYS —
 * derived from the trend engine's own decay constants, src/seo/config.ts —
 * the page's robots policy flips to noindex and the page is flagged for
 * editorial review instead of silently lingering in the index.
 */
import type { IsoTimestamp, ProvenanceRecord } from "../contracts/provenance";
import { TREND_PAGE_EXPIRY_DAYS } from "./config";
import { verifiedRecords } from "./quality-gate";

const DAY_MS = 86_400_000;

export interface TrendPageStatus {
  /**
   * Newest observedAt across the page's VERIFIED provenance (same filter as
   * the quality gate's verified_source check, gate finding P8-1); null = no
   * verified evidence.
   */
  readonly newestEvidenceAt: IsoTimestamp | null;
  /** newestEvidenceAt + the expiry window; null = no evidence. */
  readonly expiresAt: IsoTimestamp | null;
  readonly expired: boolean;
  /** Expired (or evidence-less) pages route into editorial review. */
  readonly review: boolean;
}

/** Evidence timestamps for a trend page, oldest to newest. */
export function evidenceTimestamps(
  provenance: readonly ProvenanceRecord[],
): IsoTimestamp[] {
  return provenance
    .map((record) => record.observedAt)
    .filter((iso) => !Number.isNaN(Date.parse(iso)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
}

export function trendPageStatus(
  provenance: readonly ProvenanceRecord[],
  nowMs: number,
  expiryDays: number = TREND_PAGE_EXPIRY_DAYS,
): TrendPageStatus {
  // P8-1: only verified records can keep a trend page alive — a fresh
  // fixture/user_entry record must not mask stale verified evidence.
  const timestamps = evidenceTimestamps(verifiedRecords(provenance));
  const newest = timestamps.length > 0 ? timestamps[timestamps.length - 1]! : null;
  if (newest === null) {
    // A trend page with no dated verified evidence has nothing to stand on:
    // treat it as expired and route it to review (suppression beats guessing).
    return { newestEvidenceAt: null, expiresAt: null, expired: true, review: true };
  }
  const expiresAtMs = Date.parse(newest) + expiryDays * DAY_MS;
  const expired = nowMs >= expiresAtMs;
  return {
    newestEvidenceAt: newest,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expired,
    review: expired,
  };
}
