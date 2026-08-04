/**
 * §1.6 Banned claims. scripts/lint-banned-claims.mjs fails the build when any
 * of these strings appears in user-facing copy (case-insensitive, word-boundary
 * aware). The lint parses this file so the list has a single source of truth.
 *
 * "Unsupported viral" is NOT in this list because it cannot be a string match:
 * "viral" is a permitted label when >=3 independent signal families pass their
 * minimum evidence thresholds (§1.3). That rule is enforced by the trend
 * engine and suppression engine tests owned by algorithm-engineer (Phase 4).
 */
export const BANNED_CLAIMS = [
  "must-have",
  "guaranteed fit",
  "school approved",
  "guaranteed savings",
  "guaranteed delivery",
  "safest",
  "best for every child",
  // Added by Phase 10 legal review (compliance-officer recommendation,
  // orchestrator-applied at gate; see docs/handoffs/gates/phase-10-gate.md).
  "risk-free",
] as const;

export type BannedClaim = (typeof BANNED_CLAIMS)[number];
