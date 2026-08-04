/**
 * Trend evidence engine (§0 capability 4, §1.3).
 *
 * Per signal family:
 *  - robust location/scale: median and scaled MAD (MAD x 1.4826),
 *  - the latest observation is WINSORIZED into [median +/- 3 x scaledMAD],
 *  - robust z = (winsorized latest - median) / scaledMAD  (so |z| <= 3),
 *  - freshness decay: weight = e^(-ageDays / tauDays); decayedZ = z x weight,
 *  - minimum evidence: sample count, freshness floor, decayed-z threshold.
 *
 * §1.3 HARD RULE: "viral" requires >= 3 INDEPENDENT signal families passing
 * their minimum evidence thresholds with organic (non-sponsored-majority)
 * signal. Permitted outputs otherwise: insufficient_evidence (the default),
 * paid_campaign_driven, locally_popular, cooling. Confidence is reported
 * SEPARATELY from the label and reflects evidence volume/freshness only.
 */
import { clamp01, round } from "./types";

export const SIGNAL_FAMILIES = [
  "search_interest",
  "retail_sellthrough",
  "social_engagement",
  "editorial_coverage",
  "review_velocity",
] as const;
export type SignalFamily = (typeof SIGNAL_FAMILIES)[number];

export const TREND_LABELS = [
  "viral",
  "insufficient_evidence",
  "paid_campaign_driven",
  "locally_popular",
  "cooling",
] as const;
export type TrendLabel = (typeof TREND_LABELS)[number];

export interface FamilySeriesInput {
  readonly family: SignalFamily;
  /** Chronological observation window; the LAST value is the latest. */
  readonly values: readonly number[];
  readonly latestObservedAtMs: number;
  /** Fraction of window observations that are sponsored/paid placements. */
  readonly sponsoredShare: number;
  /** 'US' or a sub-national scope like 'US-TX'. */
  readonly geography: string;
  readonly provenanceIds: readonly string[];
}

export interface TrendConfig {
  readonly tauDays: number;
  readonly minSamples: number;
  readonly zThreshold: number;
  readonly freshnessFloor: number;
  /** Family counts as paid-driven above this sponsored share. */
  readonly sponsoredShareCeiling: number;
  /** Decayed z at or below this marks a cooling family. */
  readonly coolingZ: number;
}

/** Model constants (labeled; tuned only through this exported object). */
export const DEFAULT_TREND_CONFIG: TrendConfig = {
  tauDays: 14,
  minSamples: 5,
  zThreshold: 2,
  freshnessFloor: 0.3,
  sponsoredShareCeiling: 0.5,
  coolingZ: -1,
};

/** Consistency constant for MAD as a scale estimator under normality. */
export const MAD_SCALE = 1.4826;
export const WINSOR_K = 3;

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median of empty series");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Scaled median absolute deviation; 0 = degenerate series (no spread). */
export function scaledMad(values: readonly number[]): number {
  const m = median(values);
  return MAD_SCALE * median(values.map((v) => Math.abs(v - m)));
}

/** Clamp a value into [median - k*scaledMad, median + k*scaledMad]. */
export function winsorize(
  value: number,
  seriesMedian: number,
  seriesScaledMad: number,
  k: number = WINSOR_K,
): number {
  const lower = seriesMedian - k * seriesScaledMad;
  const upper = seriesMedian + k * seriesScaledMad;
  return Math.min(upper, Math.max(lower, value));
}

/** e^(-ageDays/tauDays), clamped to [0, 1]. */
export function freshnessWeight(ageDays: number, tauDays: number): number {
  return clamp01(Math.exp(-Math.max(0, ageDays) / tauDays));
}

export interface FamilyEvaluation {
  readonly family: SignalFamily;
  readonly samples: number;
  readonly median: number;
  readonly scaledMad: number;
  readonly winsorizedLatest: number | null;
  /** null when the series is degenerate (scaled MAD = 0) or too short. */
  readonly rawZ: number | null;
  readonly freshnessWeight: number;
  readonly decayedZ: number | null;
  /** Passes minimum evidence thresholds for a POSITIVE trend signal. */
  readonly passes: boolean;
  readonly sponsoredShare: number;
  readonly geography: string;
  readonly failureReasons: readonly string[];
  readonly provenanceIds: readonly string[];
}

const DAY_MS = 86_400_000;

export function evaluateFamily(
  series: FamilySeriesInput,
  nowMs: number,
  config: TrendConfig = DEFAULT_TREND_CONFIG,
): FamilyEvaluation {
  const samples = series.values.length;
  const failureReasons: string[] = [];
  const ageDays = (nowMs - series.latestObservedAtMs) / DAY_MS;
  const freshness = round(freshnessWeight(ageDays, config.tauDays), 4);

  if (samples === 0) {
    return {
      family: series.family,
      samples: 0,
      median: Number.NaN,
      scaledMad: Number.NaN,
      winsorizedLatest: null,
      rawZ: null,
      freshnessWeight: freshness,
      decayedZ: null,
      passes: false,
      sponsoredShare: series.sponsoredShare,
      geography: series.geography,
      failureReasons: ["empty series"],
      provenanceIds: series.provenanceIds,
    };
  }

  const m = round(median(series.values), 4);
  const s = round(scaledMad(series.values), 4);
  const latest = series.values[samples - 1]!;
  let winsorizedLatest: number | null = null;
  let rawZ: number | null = null;
  let decayedZ: number | null = null;

  if (s === 0) {
    failureReasons.push("degenerate series: scaled MAD is 0");
  } else {
    winsorizedLatest = round(winsorize(latest, m, s), 4);
    rawZ = round((winsorizedLatest - m) / s, 4);
    decayedZ = round(rawZ * freshness, 4);
  }
  if (samples < config.minSamples) {
    failureReasons.push(
      `sample count ${samples} below minimum ${config.minSamples}`,
    );
  }
  if (freshness < config.freshnessFloor) {
    failureReasons.push(
      `freshness ${freshness} below floor ${config.freshnessFloor}`,
    );
  }
  if (decayedZ !== null && decayedZ < config.zThreshold) {
    failureReasons.push(
      `decayed z ${decayedZ} below threshold ${config.zThreshold}`,
    );
  }

  return {
    family: series.family,
    samples,
    median: m,
    scaledMad: s,
    winsorizedLatest,
    rawZ,
    freshnessWeight: freshness,
    decayedZ,
    passes: failureReasons.length === 0,
    sponsoredShare: series.sponsoredShare,
    geography: series.geography,
    failureReasons,
    provenanceIds: series.provenanceIds,
  };
}

export interface TrendClassification {
  readonly label: TrendLabel;
  /** Families passing minimum evidence with organic signal. */
  readonly organicPassingFamilies: readonly SignalFamily[];
  readonly passingFamilies: readonly SignalFamily[];
  /**
   * SEPARATE from the label: evidence volume/freshness on [0,1].
   * confidence = min(1, sum_f(min(1, samples_f/minSamples) x freshness_f) / 3)
   */
  readonly confidence: number;
  readonly familyEvaluations: readonly FamilyEvaluation[];
  readonly reasons: readonly string[];
}

const isSubNational = (geography: string): boolean => /^US-/.test(geography);

/**
 * §1.3 classification. Default output is insufficient_evidence; "viral"
 * requires >= 3 organic passing families — a single-family spike can NEVER
 * be viral, no matter how large its z-score.
 */
export function classifyTrend(
  evaluations: readonly FamilyEvaluation[],
  config: TrendConfig = DEFAULT_TREND_CONFIG,
): TrendClassification {
  const distinct = new Map<SignalFamily, FamilyEvaluation>();
  for (const evaluation of evaluations) {
    // Same-family series are NOT independent; keep the first per family.
    if (!distinct.has(evaluation.family)) distinct.set(evaluation.family, evaluation);
  }
  const evals = [...distinct.values()];
  const passing = evals.filter((e) => e.passes);
  const organic = passing.filter(
    (e) => e.sponsoredShare <= config.sponsoredShareCeiling,
  );
  const reasons: string[] = [
    `${passing.length} of ${evals.length} distinct families pass minimum evidence; ` +
      `${organic.length} organic`,
  ];

  const evidenceUnits = evals.reduce(
    (sum, e) =>
      sum + Math.min(1, e.samples / config.minSamples) * e.freshnessWeight,
    0,
  );
  const confidence = round(Math.min(1, evidenceUnits / 3), 4);

  let label: TrendLabel;
  if (organic.length >= 3) {
    label = "viral";
    reasons.push(">= 3 independent organic families pass thresholds");
  } else if (passing.length >= 1 && organic.length === 0) {
    label = "paid_campaign_driven";
    reasons.push("every passing family is sponsored-majority");
  } else if (
    organic.length >= 1 &&
    organic.every((e) => isSubNational(e.geography)) &&
    new Set(organic.map((e) => e.geography)).size === 1
  ) {
    label = "locally_popular";
    reasons.push(
      `organic evidence is concentrated in ${organic[0]!.geography} only`,
    );
  } else if (
    evals.filter(
      (e) =>
        e.samples >= config.minSamples &&
        e.decayedZ !== null &&
        e.decayedZ <= config.coolingZ,
    ).length >= 2
  ) {
    label = "cooling";
    reasons.push(">= 2 well-sampled families show decayed z at or below cooling threshold");
  } else {
    label = "insufficient_evidence";
    reasons.push(
      "default: fewer than 3 organic families pass minimum evidence thresholds (§1.3)",
    );
  }

  return {
    label,
    organicPassingFamilies: organic.map((e) => e.family).sort(),
    passingFamilies: passing.map((e) => e.family).sort(),
    confidence,
    familyEvaluations: evals,
    reasons,
  };
}
