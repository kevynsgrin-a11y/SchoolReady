/**
 * §0 Launch posture: fixture-mode validation beta first. Every live-data
 * integration sits behind a feature flag AND a source-health circuit breaker,
 * so production feed credentials and partnerships land later without a rewrite.
 *
 * Defaults below are the shipped defaults. Runtime overrides come from KV
 * (Phase 2, ingestion-engineer) — never from code edits.
 */
export type SourceId =
  | "nces_ccd"
  | "cpsc_recalls"
  | "state_tax_holidays"
  | "affiliate_feeds";

export interface CircuitBreakerConfig {
  /** Consecutive failures before a source is marked unhealthy. */
  failureThreshold: number;
  /** Seconds an unhealthy source stays open before a probe is allowed. */
  cooldownSeconds: number;
  /** Age in seconds after which cached data must render with a stale badge. */
  staleAfterSeconds: number;
}

export interface Flags {
  /** ON = synthetic schools, sample lists, fixture product data. Default ON. */
  fixtureMode: boolean;
  /** Live-data integrations. Every one OFF until credentials + licensing land. */
  liveSources: Record<SourceId, boolean>;
  circuitBreaker: CircuitBreakerConfig;
}

export const DEFAULT_FLAGS: Flags = {
  fixtureMode: true,
  liveSources: {
    nces_ccd: false,
    cpsc_recalls: false,
    state_tax_holidays: false,
    affiliate_feeds: false,
  },
  circuitBreaker: {
    failureThreshold: 3,
    cooldownSeconds: 300,
    staleAfterSeconds: 21_600,
  },
};
