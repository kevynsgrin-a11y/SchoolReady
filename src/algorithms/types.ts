/**
 * Shared Phase 4 algorithm types and numeric helpers.
 *
 * §1.1 STRUCTURAL RULE for everything under src/algorithms/: no type here
 * accepts, carries, or references any monetization economics (commission,
 * payout, referral, affiliate revenue). The import graph of this directory
 * must never reach a monetization module — enforced by
 * tests/algorithms-independence.test.ts, which walks the transitive import
 * closure from disk and also scans comment-stripped sources for economics
 * identifiers, so the guarantee keeps holding when src/monetization/
 * appears in Phase 9.
 *
 * Injected clocks only (process rule): no module here calls Date.now().
 */
export type { Clock } from "../ingestion/types";

/**
 * A visible assumption attached to an output. §1.5/§0 process rule: model
 * constants and fixture-derived parameters are never presented as observed
 * facts — they render labeled with their basis.
 */
export interface Assumption {
  readonly name: string;
  readonly value: string;
  readonly basis: "model_constant" | "fixture_assumption" | "user_input";
}

/** Deterministic rounding for serialized scores (stable JSON bytes). */
export function round(value: number, decimalPlaces = 4): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Sorted union of provenance ids — every user-facing output carries §1.4 lineage. */
export function unionProvenance(
  ...groups: readonly (readonly string[])[]
): readonly string[] {
  const out = new Set<string>();
  for (const group of groups) for (const id of group) out.add(id);
  return [...out].sort();
}

/** Deterministic string comparator (never locale-dependent). */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
