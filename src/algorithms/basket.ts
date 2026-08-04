/**
 * True basket comparison (§0 capability 3): landed cost across retailers
 * with pack-size conversion, sales tax (with tax-holiday eligibility),
 * shipping, and stop count — returning a PARETO SET, never one false
 * "optimal".
 *
 * Weighted objective (a diagnostic sort aid, NOT a collapse of the output):
 *   objective = landedCostCents
 *             + lambda_stops        * stops
 *             + lambda_deadlineRisk * deadlineRiskDays
 *             + lambda_matchPenalty * sum(1 - matchScore)
 *             + lambda_lowConfidence* lowConfidenceCount
 *
 * §1.1: no economics field exists anywhere in these inputs; offers arrive as
 * plain price/stock facts. §1.5: out-of-stock offers are excluded; unknown
 * shipping/delivery/limited stock count as low-confidence facts and options
 * carrying them are flagged, not silently preferred; unverified (fixture)
 * tax-holiday calendars caveat the tax math and cost a confidence point.
 */
import type { AvailabilityStatus } from "../contracts/offer";
import type { Assumption } from "./types";
import { compareStrings, round, unionProvenance } from "./types";

export interface BasketItemInput {
  /** Net-required line key (net-required.ts). */
  readonly itemKey: string;
  readonly productTypeSlug: string;
  /** unitsToBuy from net-required math; positive integer. */
  readonly unitsToBuy: number;
  /** Tax-holiday category; null = unknown -> holiday never applied (§1.5). */
  readonly taxCategory: string | null;
}

export interface BasketOfferInput {
  /** Deterministic key, e.g. 'fixture-mart:FXM-GLUE-06'. */
  readonly offerKey: string;
  /** The item this offer can fulfill (compatibility pre-gated via match.ts). */
  readonly itemKey: string;
  readonly retailerSlug: string;
  /** Units per purchase; >= 1. */
  readonly packCount: number;
  /** Price per purchase (per pack), cents. */
  readonly priceCents: number;
  readonly availability: AvailabilityStatus;
  /** Flat per-retailer shipping, cents; null = unknown (low confidence). */
  readonly shippingCents: number | null;
  /** Eligible match score from match.ts (0..1). */
  readonly matchScore: number;
  /** Delivery estimate in days (labeled assumption); null = unknown. */
  readonly estimatedDeliveryDays: number | null;
  /** null = no declared restriction; else allowed state codes. */
  readonly shipsToStates: readonly string[] | null;
  readonly provenanceIds: readonly string[];
}

export interface TaxHolidayWindowInput {
  readonly state: string;
  /** Inclusive ISO dates. */
  readonly startsOn: string;
  readonly endsOn: string;
  readonly categories: readonly {
    readonly category: string;
    readonly priceCapCents: number | null;
  }[];
  /** false for fixture calendars — applying one caveats the tax math (§1.5). */
  readonly verified: boolean;
  readonly provenanceId: string;
}

export interface BasketLambdas {
  readonly perStopCents: number;
  readonly perDeadlineRiskDayCents: number;
  readonly perMatchPointCents: number;
  readonly perLowConfidenceCents: number;
}

/** Model constants (labeled; not user-facing facts). */
export const DEFAULT_BASKET_LAMBDAS: BasketLambdas = {
  perStopCents: 500,
  perDeadlineRiskDayCents: 300,
  perMatchPointCents: 1000,
  perLowConfidenceCents: 200,
};

export interface BasketContext {
  /** Household state code ('TX') or null (then no holiday can apply). */
  readonly state: string | null;
  /** Sales-tax rate as a fraction; source labeled via salesTaxBasis. */
  readonly salesTaxRate: number;
  readonly salesTaxBasis: Assumption;
  /** ISO purchase date used for holiday-window checks. */
  readonly purchaseDate: string;
  readonly holidays: readonly TaxHolidayWindowInput[];
  /** Days until the items are needed; null = no deadline given. */
  readonly daysUntilNeeded: number | null;
  readonly lambdas: BasketLambdas;
}

export interface BasketLine {
  readonly itemKey: string;
  readonly offerKey: string;
  readonly retailerSlug: string;
  readonly packsToBuy: number;
  readonly unitsPurchased: number;
  readonly lineSubtotalCents: number;
  readonly taxCents: number;
  readonly holidayApplied: boolean;
}

export interface BasketOption {
  /** Deterministic identity: sorted 'itemKey->offerKey' pairs. */
  readonly assignmentKey: string;
  readonly lines: readonly BasketLine[];
  readonly retailerSlugs: readonly string[];
  readonly stops: number;
  readonly itemsSubtotalCents: number;
  readonly taxCents: number;
  readonly shippingCents: number;
  readonly landedCostCents: number;
  /** false when any shipping cost is unknown (landed cost incomplete). */
  readonly costComplete: boolean;
  /** Max known delivery days; null when no stop has a known estimate. */
  readonly deliveryDaysMax: number | null;
  /** true when every stop has a known delivery estimate. */
  readonly deliveryDaysKnown: boolean;
  readonly deadlineRiskDays: number;
  readonly matchPenalty: number;
  readonly lowConfidenceCount: number;
  /** Diagnostic weighted objective (cents); the OUTPUT is the Pareto set. */
  readonly weightedObjectiveCents: number;
  readonly taxCaveats: readonly string[];
  readonly provenanceIds: readonly string[];
}

export interface BasketParetoResult {
  readonly feasible: boolean;
  readonly unfulfillableItems: readonly {
    readonly itemKey: string;
    readonly detail: string;
  }[];
  readonly excludedOffers: readonly {
    readonly offerKey: string;
    readonly detail: string;
  }[];
  /** Every enumerated complete option (diagnostics; frontier is the answer). */
  readonly options: readonly BasketOption[];
  /** Non-dominated options on [cost, stops, deliveryDays, lowConfidence]. */
  readonly frontier: readonly BasketOption[];
  /** Labeled frontier views — four perspectives, never one 'optimal'. */
  readonly views: {
    readonly lowestCost: BasketOption | null;
    readonly fewestStops: BasketOption | null;
    readonly fastest: BasketOption | null;
    readonly highestConfidence: BasketOption | null;
  };
  readonly assumptions: readonly Assumption[];
}

export class BasketSearchSpaceError extends Error {
  constructor(combinations: number, cap: number) {
    super(
      `basket enumeration space ${combinations} exceeds cap ${cap}; ` +
        `split the list or reduce candidate offers per item`,
    );
    this.name = "BasketSearchSpaceError";
  }
}

const SEARCH_SPACE_CAP = 50_000;

function holidayEligibility(
  ctx: BasketContext,
  taxCategory: string | null,
  pricePerPurchaseCents: number,
): { eligible: boolean; verified: boolean; provenanceId: string | null } {
  if (ctx.state === null || taxCategory === null) {
    return { eligible: false, verified: false, provenanceId: null };
  }
  for (const holiday of ctx.holidays) {
    if (holiday.state !== ctx.state) continue;
    if (ctx.purchaseDate < holiday.startsOn || ctx.purchaseDate > holiday.endsOn) continue;
    for (const cat of holiday.categories) {
      if (cat.category !== taxCategory) continue;
      if (cat.priceCapCents !== null && pricePerPurchaseCents > cat.priceCapCents) continue;
      return {
        eligible: true,
        verified: holiday.verified,
        provenanceId: holiday.provenanceId,
      };
    }
  }
  return { eligible: false, verified: false, provenanceId: null };
}

/** Landed-cost math for a single item/offer pairing (unit-testable alone). */
export function computeBasketLine(
  item: BasketItemInput,
  offer: BasketOfferInput,
  ctx: BasketContext,
): BasketLine & { holidayVerified: boolean; holidayProvenanceId: string | null } {
  const packsToBuy = Math.ceil(item.unitsToBuy / offer.packCount);
  const lineSubtotalCents = packsToBuy * offer.priceCents;
  const holiday = holidayEligibility(ctx, item.taxCategory, offer.priceCents);
  const taxCents = holiday.eligible
    ? 0
    : Math.round(lineSubtotalCents * ctx.salesTaxRate);
  return {
    itemKey: item.itemKey,
    offerKey: offer.offerKey,
    retailerSlug: offer.retailerSlug,
    packsToBuy,
    unitsPurchased: packsToBuy * offer.packCount,
    lineSubtotalCents,
    taxCents,
    holidayApplied: holiday.eligible,
    holidayVerified: holiday.verified,
    holidayProvenanceId: holiday.provenanceId,
  };
}

function buildOption(
  items: readonly BasketItemInput[],
  chosen: readonly BasketOfferInput[],
  ctx: BasketContext,
): BasketOption {
  const lines = items.map((item, i) => computeBasketLine(item, chosen[i]!, ctx));
  const retailerSlugs = [...new Set(chosen.map((o) => o.retailerSlug))].sort(compareStrings);

  const shippingByRetailer = new Map<string, number | null>();
  const deliveryByRetailer = new Map<string, number | null>();
  for (const offer of chosen) {
    // Per-retailer flat facts: any known value wins over unknown.
    const prevShip = shippingByRetailer.get(offer.retailerSlug);
    if (prevShip === undefined || prevShip === null) {
      shippingByRetailer.set(offer.retailerSlug, offer.shippingCents);
    }
    const prevDays = deliveryByRetailer.get(offer.retailerSlug);
    const days = offer.estimatedDeliveryDays;
    if (prevDays === undefined || prevDays === null) {
      deliveryByRetailer.set(offer.retailerSlug, days);
    } else if (days !== null && days > prevDays) {
      deliveryByRetailer.set(offer.retailerSlug, days);
    }
  }

  let shippingCents = 0;
  let costComplete = true;
  for (const slug of retailerSlugs) {
    const ship = shippingByRetailer.get(slug) ?? null;
    if (ship === null) costComplete = false;
    else shippingCents += ship;
  }

  const knownDelivery = retailerSlugs
    .map((slug) => deliveryByRetailer.get(slug) ?? null)
    .filter((d): d is number => d !== null);
  const deliveryDaysKnown = knownDelivery.length === retailerSlugs.length;
  const deliveryDaysMax = knownDelivery.length > 0 ? Math.max(...knownDelivery) : null;

  let deadlineRiskDays = 0;
  if (ctx.daysUntilNeeded !== null) {
    for (const days of knownDelivery) {
      deadlineRiskDays += Math.max(0, days - ctx.daysUntilNeeded);
    }
  }

  const itemsSubtotalCents = lines.reduce((s, l) => s + l.lineSubtotalCents, 0);
  const taxCents = lines.reduce((s, l) => s + l.taxCents, 0);
  const matchPenalty = round(
    chosen.reduce((s, o) => s + (1 - o.matchScore), 0),
    4,
  );

  const unverifiedHoliday = lines.some((l) => l.holidayApplied && !l.holidayVerified);
  const lowConfidenceCount =
    chosen.filter((o) => o.availability === "limited" || o.availability === "unknown")
      .length +
    retailerSlugs.filter((slug) => (shippingByRetailer.get(slug) ?? null) === null)
      .length +
    retailerSlugs.filter((slug) => (deliveryByRetailer.get(slug) ?? null) === null)
      .length +
    (unverifiedHoliday ? 1 : 0);

  const landedCostCents = itemsSubtotalCents + taxCents + shippingCents;
  const stops = retailerSlugs.length;
  const weightedObjectiveCents = round(
    landedCostCents +
      ctx.lambdas.perStopCents * stops +
      ctx.lambdas.perDeadlineRiskDayCents * deadlineRiskDays +
      ctx.lambdas.perMatchPointCents * matchPenalty +
      ctx.lambdas.perLowConfidenceCents * lowConfidenceCount,
    2,
  );

  const taxCaveats: string[] = [];
  if (unverifiedHoliday) {
    taxCaveats.push(
      "tax-holiday eligibility computed from an UNVERIFIED fixture calendar; " +
        "renders as an estimate with its provenance, never as verified guidance",
    );
  }

  return {
    assignmentKey: lines
      .map((l) => `${l.itemKey}->${l.offerKey}`)
      .sort(compareStrings)
      .join(";"),
    lines: lines.map((l) => ({
      itemKey: l.itemKey,
      offerKey: l.offerKey,
      retailerSlug: l.retailerSlug,
      packsToBuy: l.packsToBuy,
      unitsPurchased: l.unitsPurchased,
      lineSubtotalCents: l.lineSubtotalCents,
      taxCents: l.taxCents,
      holidayApplied: l.holidayApplied,
    })),
    retailerSlugs,
    stops,
    itemsSubtotalCents,
    taxCents,
    shippingCents,
    landedCostCents,
    costComplete,
    deliveryDaysMax,
    deliveryDaysKnown,
    deadlineRiskDays,
    matchPenalty,
    lowConfidenceCount,
    weightedObjectiveCents,
    taxCaveats,
    provenanceIds: unionProvenance(
      ...chosen.map((o) => o.provenanceIds),
      lines.map((l) => l.holidayProvenanceId).filter((p): p is string => p !== null),
    ),
  };
}

/** [cost, stops, deliveryDays (unknown = +Infinity), lowConfidence]. */
function dominanceVector(option: BasketOption): readonly number[] {
  return [
    option.landedCostCents,
    option.stops,
    option.deliveryDaysMax ?? Number.POSITIVE_INFINITY,
    option.lowConfidenceCount,
  ];
}

function dominates(a: BasketOption, b: BasketOption): boolean {
  const va = dominanceVector(a);
  const vb = dominanceVector(b);
  let strictly = false;
  for (let i = 0; i < va.length; i += 1) {
    if (va[i]! > vb[i]!) return false;
    if (va[i]! < vb[i]!) strictly = true;
  }
  return strictly;
}

function sortBy(
  options: readonly BasketOption[],
  keys: readonly ((o: BasketOption) => number)[],
): BasketOption[] {
  return [...options].sort((a, b) => {
    for (const key of keys) {
      const diff = key(a) - key(b);
      if (diff !== 0) return diff;
    }
    return compareStrings(a.assignmentKey, b.assignmentKey);
  });
}

/**
 * Enumerates feasible assignments and returns the Pareto set plus four
 * labeled views. NEVER a single "optimal": callers get the frontier.
 */
export function optimizeBasket(
  items: readonly BasketItemInput[],
  offers: readonly BasketOfferInput[],
  ctx: BasketContext,
): BasketParetoResult {
  const excludedOffers: { offerKey: string; detail: string }[] = [];
  const byItem = new Map<string, BasketOfferInput[]>();
  for (const item of items) byItem.set(item.itemKey, []);

  for (const offer of offers) {
    const bucket = byItem.get(offer.itemKey);
    if (!bucket) {
      excludedOffers.push({
        offerKey: offer.offerKey,
        detail: `no basket item with key ${offer.itemKey}`,
      });
      continue;
    }
    if (offer.availability === "out_of_stock") {
      excludedOffers.push({ offerKey: offer.offerKey, detail: "out of stock" });
      continue;
    }
    if (
      ctx.state !== null &&
      offer.shipsToStates !== null &&
      !offer.shipsToStates.includes(ctx.state)
    ) {
      excludedOffers.push({
        offerKey: offer.offerKey,
        detail: `does not ship to ${ctx.state}`,
      });
      continue;
    }
    bucket.push(offer);
  }

  const assumptions: Assumption[] = [
    ctx.salesTaxBasis,
    {
      name: "basket_lambdas",
      value: JSON.stringify(ctx.lambdas),
      basis: "model_constant",
    },
  ];

  const unfulfillableItems = items
    .filter((item) => (byItem.get(item.itemKey) ?? []).length === 0)
    .map((item) => ({
      itemKey: item.itemKey,
      detail: "no in-stock, geography-eligible offer available",
    }));
  if (unfulfillableItems.length > 0) {
    return {
      feasible: false,
      unfulfillableItems,
      excludedOffers,
      options: [],
      frontier: [],
      views: { lowestCost: null, fewestStops: null, fastest: null, highestConfidence: null },
      assumptions,
    };
  }

  const buckets = items.map((item) => byItem.get(item.itemKey)!);
  const combinations = buckets.reduce((product, b) => product * b.length, 1);
  if (combinations > SEARCH_SPACE_CAP) {
    throw new BasketSearchSpaceError(combinations, SEARCH_SPACE_CAP);
  }

  const options: BasketOption[] = [];
  const chosen: BasketOfferInput[] = [];
  const enumerate = (index: number): void => {
    if (index === items.length) {
      options.push(buildOption(items, [...chosen], ctx));
      return;
    }
    for (const offer of buckets[index]!) {
      chosen.push(offer);
      enumerate(index + 1);
      chosen.pop();
    }
  };
  enumerate(0);

  const frontier = sortBy(
    options.filter((o) => !options.some((other) => dominates(other, o))),
    [
      (o) => o.landedCostCents,
      (o) => o.stops,
      (o) => o.deliveryDaysMax ?? Number.POSITIVE_INFINITY,
      (o) => o.lowConfidenceCount,
    ],
  );

  const withKnownDelivery = frontier.filter((o) => o.deliveryDaysKnown);
  const views = {
    lowestCost:
      sortBy(frontier, [(o) => o.landedCostCents, (o) => o.stops])[0] ?? null,
    fewestStops:
      sortBy(frontier, [(o) => o.stops, (o) => o.landedCostCents])[0] ?? null,
    fastest:
      sortBy(withKnownDelivery, [
        (o) => o.deliveryDaysMax ?? Number.POSITIVE_INFINITY,
        (o) => o.landedCostCents,
      ])[0] ?? null,
    highestConfidence:
      sortBy(frontier, [(o) => o.lowConfidenceCount, (o) => o.landedCostCents])[0] ??
      null,
  };

  return {
    feasible: true,
    unfulfillableItems: [],
    excludedOffers,
    options: sortBy(options, [(o) => o.weightedObjectiveCents]),
    frontier,
    views,
    assumptions,
  };
}
