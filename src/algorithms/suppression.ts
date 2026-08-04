/**
 * Suppression engine — §1.5 as code. Suppression beats guessing.
 *
 * One evaluator per trigger, each returning an explicit reason code; the
 * combinator merges findings into a single decision:
 *   suppress  — the fact/option must not render (or must leave the basket),
 *   downgrade — renders only with its staleness/uncertainty made visible,
 *   render    — no trigger fired.
 *
 * The eight §1.5 triggers and their codes:
 *   1. stale_or_unverified_list      — list is stale or never user-confirmed
 *   2. unresolved_product_variant    — variant/product not resolved (or review pending)
 *   3. price_stock_stale             — price/stock older than threshold
 *   4. single_signal_family_trend    — a "viral" claim without >= 3 organic families
 *   5. unconfirmable_school_policy   — policy claim not confirmable
 *   6. recalled_or_under_review      — product recalled or match under review
 *   7. affiliate_neutral_conflict    — affiliate-fed fact conflicts with neutral source
 *   8. deadline_unmeetable           — deadline cannot be met with confidence
 *
 * Recalled products are suppressed from EVERY basket via
 * filterRecalledOffers() (design §6 journey 2 depends on this).
 */
import { DEFAULT_FLAGS } from "../../config/flags";
import type { VerificationStatus } from "../contracts/requirement";
import type { ResolutionStatus } from "../contracts/product";
import type { CorrectionStatus } from "../contracts/provenance";
import type { TrendLabel } from "./trend";
import type { BasketOfferInput } from "./basket";

export const SUPPRESSION_REASONS = [
  "stale_or_unverified_list",
  "unresolved_product_variant",
  "price_stock_stale",
  "single_signal_family_trend",
  "unconfirmable_school_policy",
  "recalled_or_under_review",
  "affiliate_neutral_conflict",
  "deadline_unmeetable",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export type SuppressionAction = "suppress" | "downgrade";

export interface SuppressionFinding {
  readonly reason: SuppressionReason;
  readonly action: SuppressionAction;
  readonly detail: string;
}

export interface SuppressionDecision {
  readonly action: "render" | "downgrade" | "suppress";
  readonly findings: readonly SuppressionFinding[];
}

export interface SuppressionThresholds {
  /** Price/stock older than this renders with a stale badge (downgrade). */
  readonly priceStockDowngradeAfterSeconds: number;
  /** Price/stock older than this does not render at all (suppress). */
  readonly priceStockSuppressAfterSeconds: number;
}

/** Downgrade threshold reuses the Phase 0 circuit-breaker staleness config. */
export const DEFAULT_SUPPRESSION_THRESHOLDS: SuppressionThresholds = {
  priceStockDowngradeAfterSeconds: DEFAULT_FLAGS.circuitBreaker.staleAfterSeconds,
  priceStockSuppressAfterSeconds: 7 * 24 * 3600,
};

/** Trigger 1 — stale or unverified list. */
export function evaluateListStatus(input: {
  readonly verificationStatus: VerificationStatus;
}): SuppressionFinding | null {
  if (input.verificationStatus === "stale") {
    return {
      reason: "stale_or_unverified_list",
      action: "downgrade",
      detail: "supply list is stale; renders only with a stale badge",
    };
  }
  if (input.verificationStatus === "unverified") {
    return {
      reason: "stale_or_unverified_list",
      action: "downgrade",
      detail: "supply list has not been user-confirmed; renders as unverified",
    };
  }
  return null;
}

/** Trigger 2 — unresolved product/variant (or intake still review-pending). */
export function evaluateVariantResolution(input: {
  readonly resolutionStatus: ResolutionStatus | null;
  readonly needsReview: boolean;
}): SuppressionFinding | null {
  if (input.needsReview) {
    return {
      reason: "unresolved_product_variant",
      action: "suppress",
      detail: "intake item is review-pending; excluded from match/merge/basket",
    };
  }
  if (input.resolutionStatus !== "resolved") {
    return {
      reason: "unresolved_product_variant",
      action: "suppress",
      detail: `variant resolution status is ${input.resolutionStatus ?? "missing"}; ` +
        "excluded from user-facing comparison",
    };
  }
  return null;
}

/** Trigger 3 — price/stock older than threshold. Injected clock only. */
export function evaluatePriceStockAge(
  input: { readonly retrievedAtMs: number },
  nowMs: number,
  thresholds: SuppressionThresholds = DEFAULT_SUPPRESSION_THRESHOLDS,
): SuppressionFinding | null {
  const ageSeconds = Math.max(0, (nowMs - input.retrievedAtMs) / 1000);
  if (ageSeconds > thresholds.priceStockSuppressAfterSeconds) {
    return {
      reason: "price_stock_stale",
      action: "suppress",
      detail: `price/stock is ${Math.floor(ageSeconds)}s old ` +
        `(> ${thresholds.priceStockSuppressAfterSeconds}s); does not render`,
    };
  }
  if (ageSeconds > thresholds.priceStockDowngradeAfterSeconds) {
    return {
      reason: "price_stock_stale",
      action: "downgrade",
      detail: `price/stock is ${Math.floor(ageSeconds)}s old ` +
        `(> ${thresholds.priceStockDowngradeAfterSeconds}s); renders with stale badge`,
    };
  }
  return null;
}

/**
 * Trigger 4 — single-signal-family trend. Guards any upstream "viral" claim:
 * without >= 3 organic passing families the claim is suppressed (the trend
 * engine itself never emits such a label; this catches every other path).
 */
export function evaluateTrendClaim(input: {
  readonly claimedLabel: TrendLabel;
  readonly organicPassingFamilyCount: number;
}): SuppressionFinding | null {
  if (input.claimedLabel === "viral" && input.organicPassingFamilyCount < 3) {
    return {
      reason: "single_signal_family_trend",
      action: "suppress",
      detail:
        `"viral" claimed with ${input.organicPassingFamilyCount} organic ` +
        `signal family(ies); §1.3 requires >= 3 — claim suppressed, ` +
        `label falls back to insufficient_evidence`,
    };
  }
  return null;
}

/** Trigger 5 — unconfirmable school policy. */
export function evaluateSchoolPolicy(input: {
  readonly confirmation: "confirmed" | "unconfirmed" | "conflicting";
}): SuppressionFinding | null {
  if (input.confirmation !== "confirmed") {
    return {
      reason: "unconfirmable_school_policy",
      action: "suppress",
      detail: `school policy is ${input.confirmation}; the policy claim is ` +
        "suppressed rather than guessed",
    };
  }
  return null;
}

/** Trigger 6 — recalled or under review (recall match or provenance status). */
export function evaluateRecallStatus(input: {
  readonly recallMatch: "matched" | "candidate" | "none";
  readonly correctionStatus: CorrectionStatus;
}): SuppressionFinding | null {
  if (input.recallMatch === "matched") {
    return {
      reason: "recalled_or_under_review",
      action: "suppress",
      detail: "product matches an active recall; suppressed from every basket",
    };
  }
  if (input.recallMatch === "candidate") {
    return {
      reason: "recalled_or_under_review",
      action: "suppress",
      detail: "ambiguous recall match pending operator review; suppressed " +
        "conservatively (never guessed safe)",
    };
  }
  if (
    input.correctionStatus === "under_review" ||
    input.correctionStatus === "retracted"
  ) {
    return {
      reason: "recalled_or_under_review",
      action: "suppress",
      detail: `provenance correction status is ${input.correctionStatus}`,
    };
  }
  return null;
}

/** Trigger 7 — affiliate-fed data conflicts with a neutral source. */
export function evaluateSourceConflict(input: {
  readonly affiliateFeedValueCents: number;
  readonly neutralSourceValueCents: number;
  readonly toleranceCents: number;
}): SuppressionFinding | null {
  const delta = Math.abs(
    input.affiliateFeedValueCents - input.neutralSourceValueCents,
  );
  if (delta > input.toleranceCents) {
    return {
      reason: "affiliate_neutral_conflict",
      action: "suppress",
      detail:
        `feed value differs from the neutral source by ${delta}c ` +
        `(tolerance ${input.toleranceCents}c); the feed-sourced fact is ` +
        "suppressed and only the neutral source may render",
    };
  }
  return null;
}

/** Trigger 8 — deadline cannot be met with confidence. */
export function evaluateDeadlineFeasibility(input: {
  readonly daysUntilNeeded: number;
  readonly estimatedDeliveryDays: number | null;
}): SuppressionFinding | null {
  if (input.estimatedDeliveryDays === null) {
    return {
      reason: "deadline_unmeetable",
      action: "suppress",
      detail: "no delivery estimate exists; an on-time claim cannot be made " +
        "with confidence and is suppressed",
    };
  }
  if (input.estimatedDeliveryDays > input.daysUntilNeeded) {
    return {
      reason: "deadline_unmeetable",
      action: "suppress",
      detail:
        `estimated delivery ${input.estimatedDeliveryDays} day(s) exceeds the ` +
        `${input.daysUntilNeeded} day(s) remaining; on-time claim suppressed`,
    };
  }
  if (input.estimatedDeliveryDays === input.daysUntilNeeded) {
    return {
      reason: "deadline_unmeetable",
      action: "downgrade",
      detail: "delivery estimate equals the days remaining (zero buffer); " +
        "renders only as at-risk",
    };
  }
  return null;
}

/** Merge findings: any suppress wins; else any downgrade; else render. */
export function combineFindings(
  findings: readonly (SuppressionFinding | null)[],
): SuppressionDecision {
  const active = findings.filter((f): f is SuppressionFinding => f !== null);
  const action = active.some((f) => f.action === "suppress")
    ? "suppress"
    : active.length > 0
      ? "downgrade"
      : "render";
  return { action, findings: active };
}

/* ------------------------------------------------------------------ */
/* Recall matching + basket integration (feeds design §6 journey 2).   */
/* ------------------------------------------------------------------ */

export interface RecallProductRef {
  readonly recallId: string;
  readonly upc: string | null;
}

/**
 * Deterministic UPC-exact recall matching. Name/model similarity matching is
 * NOT attempted here: a fuzzy match is 'candidate' evidence that requires
 * operator review (§1.5 — never guessed either way).
 */
export function matchRecallsByUpc(
  upc: string | null,
  recallProducts: readonly RecallProductRef[],
): readonly RecallProductRef[] {
  if (upc === null) return [];
  return recallProducts.filter((p) => p.upc !== null && p.upc === upc);
}

export interface RecallAwareOffer extends BasketOfferInput {
  readonly upc: string | null;
}

export interface RecallFilterResult {
  readonly allowed: readonly RecallAwareOffer[];
  readonly suppressed: readonly {
    readonly offerKey: string;
    readonly recallIds: readonly string[];
    readonly finding: SuppressionFinding;
  }[];
}

/** Removes recall-matched offers before basket optimization — every basket. */
export function filterRecalledOffers(
  offers: readonly RecallAwareOffer[],
  recallProducts: readonly RecallProductRef[],
): RecallFilterResult {
  const allowed: RecallAwareOffer[] = [];
  const suppressed: {
    offerKey: string;
    recallIds: readonly string[];
    finding: SuppressionFinding;
  }[] = [];
  for (const offer of offers) {
    const matches = matchRecallsByUpc(offer.upc, recallProducts);
    if (matches.length === 0) {
      allowed.push(offer);
    } else {
      suppressed.push({
        offerKey: offer.offerKey,
        recallIds: matches.map((m) => m.recallId).sort(),
        finding: evaluateRecallStatus({
          recallMatch: "matched",
          correctionStatus: "none",
        })!,
      });
    }
  }
  return { allowed, suppressed };
}
