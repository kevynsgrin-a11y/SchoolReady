/**
 * Dress-code-aware clothing capsule math (§0 product definition).
 *
 * Per garment category:
 *   units = ceil((days_between_washes + reserve_days) / rewears_per_unit)
 *           - usable_existing            (clamped at 0)
 *
 * rewears_per_unit is a RANGE per (category, climate band), so the output is
 * always a RANGE with its assumptions visible — never one universal number:
 *   unitsRange.min uses the rewear maximum (optimistic re-wear),
 *   unitsRange.max uses the rewear minimum (conservative re-wear).
 *
 * Dress-code constraints narrow substitution and add a reserve day when a
 * uniform is required (a uniform garment has no cross-wardrobe substitute).
 * Cost-per-wear and the buy-now-vs-wait rule are separate helpers; the
 * buy-now rule NEVER predicts prices — it only compares against observed
 * typical ranges (deal-integrity.ts) and deadline pressure.
 */
import type { Assumption } from "./types";
import { round } from "./types";

export const GARMENT_CATEGORIES = [
  "tops",
  "bottoms",
  "outer_layer",
  "socks",
] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

export const CLIMATE_BANDS = ["hot", "temperate", "cold"] as const;
export type ClimateBand = (typeof CLIMATE_BANDS)[number];

export interface RewearRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Model constants: wears per garment unit between washes, by category and
 * climate band. Rendered as visible assumptions on every output line.
 */
export const REWEARS_PER_UNIT: Readonly<
  Record<GarmentCategory, Readonly<Record<ClimateBand, RewearRange>>>
> = {
  tops: {
    hot: { min: 1, max: 1 },
    temperate: { min: 1, max: 2 },
    cold: { min: 2, max: 3 },
  },
  bottoms: {
    hot: { min: 1, max: 2 },
    temperate: { min: 2, max: 3 },
    cold: { min: 3, max: 4 },
  },
  outer_layer: {
    hot: { min: 10, max: 15 },
    temperate: { min: 5, max: 10 },
    cold: { min: 3, max: 5 },
  },
  socks: {
    hot: { min: 1, max: 1 },
    temperate: { min: 1, max: 1 },
    cold: { min: 1, max: 1 },
  },
};

export interface DressCodeConstraints {
  /** e.g. solid colors only (constraint vocabulary solid_colors_required). */
  readonly solidColorsOnly: boolean;
  /** Uniform garment required: no cross-wardrobe substitutes. */
  readonly uniformRequired: boolean;
  /** Allowed colors when the code names them; null = not restricted. */
  readonly allowedColors: readonly string[] | null;
}

export interface CapsuleCategoryInput {
  readonly category: GarmentCategory;
  readonly climateBand: ClimateBand;
  /** Household wash cadence in days (user input or labeled default). */
  readonly daysBetweenWashes: number;
  /** Buffer days on top of the cadence (spills, missed laundry). */
  readonly reserveDays: number;
  /** Usable existing units that meet the dress code (whole units). */
  readonly usableExisting: number;
  readonly dressCode: DressCodeConstraints | null;
}

export interface CapsuleCategoryLine {
  readonly category: GarmentCategory;
  readonly climateBand: ClimateBand;
  /** ALWAYS a range — even when min === max it renders as a range. */
  readonly unitsRange: { readonly min: number; readonly max: number };
  readonly rewearsAssumed: RewearRange;
  readonly effectiveReserveDays: number;
  /** Every number that produced the range, labeled with its basis. */
  readonly assumptions: readonly Assumption[];
  readonly dressCodeNotes: readonly string[];
}

function unitsFor(
  daysToCover: number,
  rewearsPerUnit: number,
  usableExisting: number,
): number {
  return Math.max(0, Math.ceil(daysToCover / rewearsPerUnit) - usableExisting);
}

export function computeCapsuleCategory(
  input: CapsuleCategoryInput,
): CapsuleCategoryLine {
  if (input.daysBetweenWashes <= 0 || !Number.isInteger(input.daysBetweenWashes)) {
    throw new RangeError(
      `daysBetweenWashes must be a positive integer; got ${input.daysBetweenWashes}`,
    );
  }
  if (input.reserveDays < 0 || !Number.isInteger(input.reserveDays)) {
    throw new RangeError(`reserveDays must be a non-negative integer`);
  }
  const rewears = REWEARS_PER_UNIT[input.category][input.climateBand];
  const uniformExtraReserve = input.dressCode?.uniformRequired ? 1 : 0;
  const effectiveReserveDays = input.reserveDays + uniformExtraReserve;
  const daysToCover = input.daysBetweenWashes + effectiveReserveDays;

  const dressCodeNotes: string[] = [];
  if (input.dressCode?.uniformRequired) {
    dressCodeNotes.push(
      "uniform required: +1 reserve day because uniform garments have no substitutes",
    );
  }
  if (input.dressCode?.solidColorsOnly) {
    dressCodeNotes.push("dress code restricts this category to solid colors");
  }
  if (input.dressCode?.allowedColors && input.dressCode.allowedColors.length > 0) {
    dressCodeNotes.push(
      `dress code limits colors to: ${[...input.dressCode.allowedColors].sort().join(", ")}`,
    );
  }

  const assumptions: Assumption[] = [
    {
      name: "days_between_washes",
      value: String(input.daysBetweenWashes),
      basis: "user_input",
    },
    { name: "reserve_days", value: String(effectiveReserveDays), basis: "model_constant" },
    {
      name: "rewears_per_unit_range",
      value: `${rewears.min}-${rewears.max} (${input.category}, ${input.climateBand} climate band)`,
      basis: "model_constant",
    },
    {
      name: "usable_existing_units",
      value: String(input.usableExisting),
      basis: "user_input",
    },
  ];

  return {
    category: input.category,
    climateBand: input.climateBand,
    unitsRange: {
      min: unitsFor(daysToCover, rewears.max, input.usableExisting),
      max: unitsFor(daysToCover, rewears.min, input.usableExisting),
    },
    rewearsAssumed: rewears,
    effectiveReserveDays,
    assumptions,
    dressCodeNotes,
  };
}

/** Whole-capsule convenience: one range per requested category. */
export function computeCapsule(
  inputs: readonly CapsuleCategoryInput[],
): CapsuleCategoryLine[] {
  return inputs.map(computeCapsuleCategory);
}

/**
 * Cost per wear in cents (2 dp). projectedWears must come from a labeled
 * assumption (e.g. season school days / units owned) — never invented.
 */
export function costPerWearCents(priceCents: number, projectedWears: number): number {
  if (projectedWears <= 0) {
    throw new RangeError(`projectedWears must be positive; got ${projectedWears}`);
  }
  return round(priceCents / projectedWears, 2);
}

/** Season wear-days spread over owned units. */
export function projectedWearsPerUnit(seasonWearDays: number, units: number): number {
  if (units <= 0) throw new RangeError(`units must be positive; got ${units}`);
  return round(seasonWearDays / units, 2);
}

export type BuyTiming = "buy_now" | "waiting_reasonable" | "insufficient_data";

export interface BuyNowVsWaitInput {
  readonly daysUntilNeeded: number;
  /** Typical delivery estimate for the candidate retailer (labeled). */
  readonly typicalDeliveryDays: number;
  readonly currentPriceCents: number;
  /** Rolling median from deal-integrity.ts; null = not enough history. */
  readonly rollingMedianCents: number | null;
}

export interface BuyNowVsWaitResult {
  readonly timing: BuyTiming;
  readonly reason: string;
  /** Standing disclaimer: comparison against observed history, no forecast. */
  readonly disclaimer: string;
}

const NO_FORECAST =
  "comparison against observed price history only; no price prediction is made";

/** Deadline buffer in days before delivery risk forces buy-now (model constant). */
export const BUY_NOW_DEADLINE_BUFFER_DAYS = 2;

export function buyNowVsWait(input: BuyNowVsWaitInput): BuyNowVsWaitResult {
  if (
    input.daysUntilNeeded <= input.typicalDeliveryDays + BUY_NOW_DEADLINE_BUFFER_DAYS
  ) {
    return {
      timing: "buy_now",
      reason:
        `deadline pressure: needed in ${input.daysUntilNeeded} day(s), ` +
        `typical delivery ${input.typicalDeliveryDays} day(s) + ` +
        `${BUY_NOW_DEADLINE_BUFFER_DAYS}-day buffer`,
      disclaimer: NO_FORECAST,
    };
  }
  if (input.rollingMedianCents === null) {
    return {
      timing: "insufficient_data",
      reason: "no price history window available to compare against",
      disclaimer: NO_FORECAST,
    };
  }
  if (input.currentPriceCents <= input.rollingMedianCents) {
    return {
      timing: "buy_now",
      reason: "current price is at or below the observed rolling median",
      disclaimer: NO_FORECAST,
    };
  }
  return {
    timing: "waiting_reasonable",
    reason:
      "current price is above the observed rolling median and there is no deadline pressure",
    disclaimer: NO_FORECAST,
  };
}
