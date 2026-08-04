/**
 * UI test fixtures: labeled synthetic provenance records and envelope
 * builders. Everything here is test-only synthetic data (clearly labeled
 * fixture sources) — hand-constructed to exercise screen states, never a
 * claim about real products or prices.
 */
import type { ProvenanceRecord } from "../../src/contracts/provenance";
import type { ApiOk, ResponseMeta, SourceStatus, SuppressionNote } from "../../src/api/contracts";
import type { Assumption } from "../../src/algorithms/types";

export const T0_ISO = "2026-08-04T12:00:00.000Z";

export function record(overrides: Partial<ProvenanceRecord> = {}): ProvenanceRecord {
  return {
    id: "prov:test:1",
    source: "fixture:ui-test-v1",
    sourceType: "fixture",
    observedAt: "2026-08-01T00:00:00.000Z",
    retrievedAt: T0_ISO,
    geography: "US",
    transformVersion: "none",
    freshness: "fresh",
    confidence: 0.92,
    limitations: "",
    correctionStatus: "none",
    createdAt: T0_ISO,
    ...overrides,
  };
}

export function envelope<T>(
  data: T,
  provenance: Record<string, ProvenanceRecord> = {},
  extras: {
    suppressions?: SuppressionNote[];
    assumptions?: Assumption[];
    sources?: SourceStatus[];
    meta?: Partial<ResponseMeta>;
  } = {},
): ApiOk<T> {
  return {
    ok: true,
    data,
    provenance,
    suppressions: extras.suppressions ?? [],
    assumptions: extras.assumptions ?? [],
    meta: {
      generatedAt: T0_ISO,
      fixtureMode: true,
      sources: extras.sources ?? [],
      ...extras.meta,
    },
  };
}

export const staleSource: SourceStatus = {
  sourceId: "affiliate_feeds",
  stale: true,
  ageSeconds: 26 * 3600,
  storedAt: "2026-08-03T10:00:00.000Z",
  circuitState: "closed",
  degraded: "cache_fallback",
};

/** Regex mirroring scripts/lint-no-emoji.mjs (main blocks + singletons + combiners). */
export const EMOJI_RE = new RegExp(
  "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{1F1E6}-\\u{1F1FF}" +
    "\\u{2190}-\\u{21FF}\\u{2139}\\u{203C}\\u{2049}\\u{3030}\\u{303D}\\u{3297}\\u{3299}]" +
    `|${String.fromCodePoint(0xfe0f)}|${String.fromCodePoint(0x20e3)}`,
  "u",
);

/** Words that would present one basket option as "the answer" (handoff 06 §8). */
export const SINGLE_ANSWER_WORDS = /\b(optimal|recommended|cheapest overall|winner)\b/i;
