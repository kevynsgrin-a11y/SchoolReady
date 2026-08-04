/**
 * Deal integrity (§0 capability 3/4 support): is a claimed deal real?
 *
 * Method: rolling nearest-rank percentiles over a trailing window of
 * UNIT prices (priceCents / packCount — pack-size changes cannot hide a
 * unit-price increase), plus an optional seasonal baseline comparison.
 *
 * Flags raised (each independent, all visible):
 *  - inflated_reference_price: the advertised "was" price exceeds every
 *    observed unit price in the window,
 *  - pack_size_trap: pack size changed from the window's modal pack AND the
 *    unit price rose above the rolling median,
 *  - membership_only_pricing: price requires a membership (not comparable
 *    as a plain landed cost),
 *  - shipping_erases_discount: shipping >= the claimed saving vs the median,
 *  - shipping_unknown: landed comparison incomplete (§1.5 low confidence),
 *  - insufficient_price_history: window below minimum points — NO verdict.
 *
 * This module NEVER predicts a future price and never declares a "low":
 * verdicts only compare the current price to the observed window.
 */
import { round } from "./types";

export interface PricePoint {
  readonly observedAt: string;
  readonly priceCents: number;
  readonly packCount: number;
  readonly provenanceId: string;
}

export interface CurrentOfferSnapshot {
  readonly priceCents: number;
  readonly packCount: number;
  /** Advertised comparison ("was") price; null = none advertised. */
  readonly referencePriceCents: number | null;
  readonly shippingCents: number | null;
  readonly membershipRequired: boolean;
  readonly provenanceIds: readonly string[];
}

export interface SeasonalBaseline {
  readonly periodLabel: string;
  readonly medianUnitPriceCents: number;
  readonly provenanceId: string;
}

export const DEAL_FLAGS = [
  "inflated_reference_price",
  "pack_size_trap",
  "membership_only_pricing",
  "shipping_erases_discount",
  "shipping_unknown",
  "insufficient_price_history",
] as const;
export type DealFlag = (typeof DEAL_FLAGS)[number];

export type DealVerdict =
  | "below_typical"
  | "typical"
  | "above_typical"
  | "insufficient_history";

export type SeasonalComparison =
  | "below_seasonal_median"
  | "at_seasonal_median"
  | "above_seasonal_median";

export interface DealIntegrityConfig {
  readonly windowDays: number;
  readonly minPoints: number;
}

export const DEFAULT_DEAL_CONFIG: DealIntegrityConfig = {
  windowDays: 90,
  minPoints: 5,
};

export interface DealIntegrityResult {
  readonly verdict: DealVerdict;
  readonly flags: readonly DealFlag[];
  readonly windowPoints: number;
  readonly currentUnitPriceCents: number;
  /** Nearest-rank percentiles of window unit prices; null when insufficient. */
  readonly p25UnitCents: number | null;
  readonly p50UnitCents: number | null;
  readonly p75UnitCents: number | null;
  readonly maxUnitCents: number | null;
  readonly modalPackCount: number | null;
  readonly seasonalComparison: SeasonalComparison | null;
  readonly notes: readonly string[];
  readonly provenanceIds: readonly string[];
}

/** Nearest-rank percentile over an ascending-sorted array. */
export function nearestRankPercentile(
  sortedAscending: readonly number[],
  quantile: number,
): number {
  if (sortedAscending.length === 0) {
    throw new RangeError("percentile of empty series");
  }
  if (quantile <= 0 || quantile > 1) {
    throw new RangeError(`quantile must be in (0, 1]; got ${quantile}`);
  }
  const rank = Math.ceil(quantile * sortedAscending.length);
  return sortedAscending[rank - 1]!;
}

const DAY_MS = 86_400_000;

function modalPack(points: readonly PricePoint[]): number {
  const counts = new Map<number, number>();
  for (const p of points) counts.set(p.packCount, (counts.get(p.packCount) ?? 0) + 1);
  let winner = points[0]!.packCount;
  let winnerCount = 0;
  for (const [pack, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    if (count > winnerCount) {
      winner = pack;
      winnerCount = count;
    }
  }
  return winner;
}

export function evaluateDealIntegrity(
  history: readonly PricePoint[],
  offer: CurrentOfferSnapshot,
  seasonal: SeasonalBaseline | null,
  nowMs: number,
  config: DealIntegrityConfig = DEFAULT_DEAL_CONFIG,
): DealIntegrityResult {
  const currentUnit = offer.priceCents / offer.packCount;
  const flags: DealFlag[] = [];
  const notes: string[] = [];
  const provenanceIds = [...offer.provenanceIds];

  const windowStartMs = nowMs - config.windowDays * DAY_MS;
  const window = history.filter((p) => {
    const t = Date.parse(p.observedAt);
    return t >= windowStartMs && t <= nowMs;
  });
  for (const p of window) provenanceIds.push(p.provenanceId);

  if (offer.membershipRequired) {
    flags.push("membership_only_pricing");
    notes.push("price requires a membership; not comparable as an open landed cost");
  }
  if (offer.shippingCents === null) {
    flags.push("shipping_unknown");
    notes.push("shipping unknown; landed comparison incomplete");
  }

  if (window.length < config.minPoints) {
    flags.push("insufficient_price_history");
    notes.push(
      `only ${window.length} price point(s) in the ${config.windowDays}-day window ` +
        `(minimum ${config.minPoints}); no typical-price verdict is made (§1.5)`,
    );
    return {
      verdict: "insufficient_history",
      flags,
      windowPoints: window.length,
      currentUnitPriceCents: round(currentUnit, 4),
      p25UnitCents: null,
      p50UnitCents: null,
      p75UnitCents: null,
      maxUnitCents: null,
      modalPackCount: null,
      seasonalComparison: null,
      notes,
      provenanceIds: provenanceIds.sort(),
    };
  }

  const unitPrices = window.map((p) => p.priceCents / p.packCount).sort((a, b) => a - b);
  const p25 = nearestRankPercentile(unitPrices, 0.25);
  const p50 = nearestRankPercentile(unitPrices, 0.5);
  const p75 = nearestRankPercentile(unitPrices, 0.75);
  const maxUnit = unitPrices[unitPrices.length - 1]!;
  const modal = modalPack(window);

  if (offer.referencePriceCents !== null) {
    const referenceUnit = offer.referencePriceCents / offer.packCount;
    if (referenceUnit > maxUnit) {
      flags.push("inflated_reference_price");
      notes.push(
        "advertised reference price exceeds every observed price in the window",
      );
    }
  }
  if (offer.packCount !== modal && currentUnit > p50) {
    flags.push("pack_size_trap");
    notes.push(
      `pack size ${offer.packCount} differs from the window's usual ` +
        `${modal} while the unit price is above the rolling median`,
    );
  }
  const savingsVsMedianCents = p50 * offer.packCount - offer.priceCents;
  if (
    offer.shippingCents !== null &&
    savingsVsMedianCents > 0 &&
    offer.shippingCents >= savingsVsMedianCents
  ) {
    flags.push("shipping_erases_discount");
    notes.push(
      `shipping (${offer.shippingCents}c) meets or exceeds the saving vs the ` +
        `rolling median (${round(savingsVsMedianCents, 2)}c)`,
    );
  }

  const verdict: DealVerdict =
    currentUnit <= p25
      ? "below_typical"
      : currentUnit >= p75
        ? "above_typical"
        : "typical";

  let seasonalComparison: SeasonalComparison | null = null;
  if (seasonal !== null) {
    provenanceIds.push(seasonal.provenanceId);
    seasonalComparison =
      currentUnit < seasonal.medianUnitPriceCents
        ? "below_seasonal_median"
        : currentUnit > seasonal.medianUnitPriceCents
          ? "above_seasonal_median"
          : "at_seasonal_median";
    notes.push(
      `seasonal baseline (${seasonal.periodLabel}) is an observed historical ` +
        `median, not a forecast`,
    );
  }

  return {
    verdict,
    flags,
    windowPoints: window.length,
    currentUnitPriceCents: round(currentUnit, 4),
    p25UnitCents: round(p25, 4),
    p50UnitCents: round(p50, 4),
    p75UnitCents: round(p75, 4),
    maxUnitCents: round(maxUnit, 4),
    modalPackCount: modal,
    seasonalComparison,
    notes,
    provenanceIds: provenanceIds.sort(),
  };
}
