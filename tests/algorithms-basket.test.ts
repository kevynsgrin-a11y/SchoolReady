/**
 * Basket optimizer — landed cost + Pareto set (§0 capability 3).
 *
 * Offers come from fixtures/product-feeds/offers.fixture.json through the
 * real Phase 2 adapter (provenance attached); the tax-holiday windows come
 * from fixtures/tax-holidays/2026.fixture.json. Delivery-day estimates and
 * the sales-tax rate are labeled fixture assumptions constructed here.
 *
 * Hand-computed scenario (glue 12 units, notebooks 20 units; TX holiday
 * window active 2026-08-07..09, purchase 2026-08-08, all lines school_supplies
 * under the 10000c cap -> tax 0 everywhere; deadline 4 days; delivery days
 * mart 2 / depot 5 / supply 3; shipping mart 0 / depot 599 / supply UNKNOWN):
 *
 *   glue packs: ceil(12/6) = 2; notebook packs: ceil(20/1) = 20
 *   option [cost, stops, deliveryMax, lowConfidence]:
 *   1 mart+mart    2x199 + 20x129 = 398+2580 = 2978, ship 0    [2978,1,2,1]
 *   2 mart+depot   398 + 20x99=1980, ship 599       = 2977     [2977,2,5,1]
 *   3 mart+supply  398 + 20x119=2380, ship unknown  = 2778     [2778,2,3,2]
 *   9 supply+supply 2x249=498 + 2380               = 2878     [2878,1,3,2]
 *   (remaining 5 combinations are all dominated — see handoff 05 §6)
 *   lowConfidence: +1 unverified fixture holiday applied (every option),
 *                  +1 per retailer with unknown shipping (supply).
 *   frontier (cost-sorted) = [2778, 2878, 2977, 2978]
 *   views: lowestCost=2778 (mart glue + supply notebooks),
 *          fewestStops=2878 (all-supply; 1 stop, cheaper than all-mart),
 *          fastest=2978 (all-mart, max delivery 2),
 *          highestConfidence=2977 (mart glue + depot notebooks; lowConf 1,
 *          cheaper than all-mart's 2978 at the same confidence)
 *   all-mart objective = 2978 + 500x1 + 300x0 + 1000x0 + 200x1 = 3678
 */
import { describe, expect, it } from "vitest";
import {
  computeBasketLine,
  DEFAULT_BASKET_LAMBDAS,
  BasketSearchSpaceError,
  optimizeBasket,
  type BasketContext,
  type BasketItemInput,
  type BasketOfferInput,
  type TaxHolidayWindowInput,
} from "../src/algorithms/basket";
import { createProductFeedFixtureAdapter } from "../src/ingestion/adapters/product-feeds";
import type { TaxHolidayRow } from "../src/ingestion/adapters/tax-holidays";
import { loadOffersFixture, loadTaxHolidaysFixture } from "./helpers/fixtures";

const offersDoc = loadOffersFixture();
const holidaysDoc = loadTaxHolidaysFixture();
const clock = () => Date.parse(offersDoc.generatedAt);

/** Pack counts per fixture UPC, stated by the fixture titles themselves. */
const PACK_BY_UPC: Record<string, number> = {
  "FIXTURE-UPC-0001": 6, // glue stick 6-pack
  "FIXTURE-UPC-0002": 1, // single composition notebook
  "FIXTURE-UPC-0003": 24, // 24-count crayon box (units = crayons)
};

/** Delivery-day estimates per fixture retailer (labeled fixture assumption). */
const DELIVERY_DAYS: Record<string, number> = {
  "fixture-mart": 2,
  "fixture-depot": 5,
  "fixture-supply-co": 3,
};

const ITEM_BY_UPC: Record<string, string> = {
  "FIXTURE-UPC-0001": "glue-stick",
  "FIXTURE-UPC-0002": "wide-ruled-notebook",
  "FIXTURE-UPC-0003": "crayons-24",
};

async function fixtureOffers(): Promise<BasketOfferInput[]> {
  const batch = await createProductFeedFixtureAdapter(offersDoc, clock).fetchBatch();
  return batch.records.map(({ record, provenance }) => ({
    offerKey: `${record.retailerSlug}:${record.sku}`,
    itemKey: ITEM_BY_UPC[record.upc ?? ""] ?? "unmapped",
    retailerSlug: record.retailerSlug,
    packCount: PACK_BY_UPC[record.upc ?? ""] ?? 1,
    priceCents: record.priceCents,
    availability: record.availability,
    shippingCents: record.shippingCents,
    matchScore: 1,
    estimatedDeliveryDays: DELIVERY_DAYS[record.retailerSlug] ?? null,
    shipsToStates: null,
    provenanceIds: [provenance.id],
  }));
}

function fixtureHolidays(): TaxHolidayWindowInput[] {
  return (holidaysDoc.records as TaxHolidayRow[]).map((row) => ({
    state: row.state,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    categories: row.categories,
    verified: false, // fixture calendar: NOT verified against any state (§1.5)
    provenanceId: `prov:${holidaysDoc.fixtureSet}:holiday-${row.state}-${row.year}`,
  }));
}

const context = (overrides: Partial<BasketContext> = {}): BasketContext => ({
  state: "TX",
  salesTaxRate: 0.0825,
  salesTaxBasis: {
    name: "sales_tax_rate",
    value: "0.0825 (fixture assumption for the TX validation scenario)",
    basis: "fixture_assumption",
  },
  purchaseDate: "2026-08-08",
  holidays: fixtureHolidays(),
  daysUntilNeeded: 4,
  lambdas: DEFAULT_BASKET_LAMBDAS,
  ...overrides,
});

const GLUE: BasketItemInput = {
  itemKey: "glue-stick",
  productTypeSlug: "glue-stick",
  unitsToBuy: 12,
  taxCategory: "school_supplies",
};
const NOTEBOOK: BasketItemInput = {
  itemKey: "wide-ruled-notebook",
  productTypeSlug: "composition-notebook",
  unitsToBuy: 20,
  taxCategory: "school_supplies",
};
const CRAYONS: BasketItemInput = {
  itemKey: "crayons-24",
  productTypeSlug: "crayons",
  unitsToBuy: 48,
  taxCategory: "school_supplies",
};

describe("basket — landed-cost math (hand-computed)", () => {
  it("pack conversion + holiday-exempt tax: all-mart landed cost is 2978", async () => {
    const offers = (await fixtureOffers()).filter((o) => o.retailerSlug === "fixture-mart");
    const result = optimizeBasket([GLUE, NOTEBOOK], offers, context());
    expect(result.feasible).toBe(true);
    expect(result.options).toHaveLength(1);
    const option = result.options[0]!;
    expect(option.lines.map((l) => l.packsToBuy)).toEqual([2, 20]);
    expect(option.itemsSubtotalCents).toBe(2978); // 2x199 + 20x129
    expect(option.taxCents).toBe(0); // TX holiday window covers 2026-08-08
    expect(option.shippingCents).toBe(0);
    expect(option.landedCostCents).toBe(2978);
    expect(option.lines.every((l) => l.holidayApplied)).toBe(true);
    expect(option.taxCaveats).toHaveLength(1); // fixture calendar is unverified
    expect(option.lowConfidenceCount).toBe(1); // the unverified holiday
    expect(option.weightedObjectiveCents).toBe(3678); // 2978 + 500 + 200
    expect(option.provenanceIds.length).toBeGreaterThan(0); // §1.4
  });

  it("outside the holiday window tax applies: 20 notebooks at depot = 163c tax", async () => {
    const depotNotebook = (await fixtureOffers()).find(
      (o) => o.offerKey === "fixture-depot:FXD-70241",
    )!;
    const line = computeBasketLine(
      NOTEBOOK,
      depotNotebook,
      context({ purchaseDate: "2026-08-20" }), // TX window ended 2026-08-09
    );
    expect(line.lineSubtotalCents).toBe(1980); // 20 x 99
    expect(line.taxCents).toBe(163); // round(1980 x 0.0825) = round(163.35)
    expect(line.holidayApplied).toBe(false);
  });

  it("holiday price caps hold: FL school_supplies cap 5000c", () => {
    const flContext = context({ state: "FL", purchaseDate: "2026-08-15" });
    const expensive: BasketOfferInput = {
      offerKey: "fixture-mart:CAP-TEST-HI",
      itemKey: "calculator",
      retailerSlug: "fixture-mart",
      packCount: 1,
      priceCents: 5100, // above the FL 5000c cap
      availability: "in_stock",
      shippingCents: 0,
      matchScore: 1,
      estimatedDeliveryDays: 2,
      shipsToStates: null,
      provenanceIds: ["prov:test:cap-hi"],
    };
    const item: BasketItemInput = {
      itemKey: "calculator",
      productTypeSlug: "calculator",
      unitsToBuy: 1,
      taxCategory: "school_supplies",
    };
    const over = computeBasketLine(item, expensive, flContext);
    expect(over.holidayApplied).toBe(false);
    expect(over.taxCents).toBe(421); // round(5100 x 0.0825) = round(420.75)
    const under = computeBasketLine(
      item,
      { ...expensive, offerKey: "fixture-mart:CAP-TEST-LO", priceCents: 4900 },
      flContext,
    );
    expect(under.holidayApplied).toBe(true);
    expect(under.taxCents).toBe(0);
  });
});

describe("basket — Pareto set, never one 'optimal'", () => {
  it("enumerates 9 options and returns the hand-computed 4-option frontier", async () => {
    const offers = (await fixtureOffers()).filter(
      (o) => o.itemKey === "glue-stick" || o.itemKey === "wide-ruled-notebook",
    );
    const result = optimizeBasket([GLUE, NOTEBOOK], offers, context());
    expect(result.feasible).toBe(true);
    expect(result.options).toHaveLength(9); // 3 glue x 3 notebook offers
    expect(result.frontier.map((o) => o.landedCostCents)).toEqual([
      2778, // mart glue + supply notebooks (shipping unknown -> incomplete)
      2878, // all supply
      2977, // mart glue + depot notebooks
      2978, // all mart
    ]);
    // The 2778 option's landed cost is incomplete (unknown shipping) and says so.
    expect(result.frontier[0]!.costComplete).toBe(false);
    expect(result.frontier[3]!.costComplete).toBe(true);
  });

  it("the four views are labeled perspectives, not a single winner", async () => {
    const offers = (await fixtureOffers()).filter(
      (o) => o.itemKey === "glue-stick" || o.itemKey === "wide-ruled-notebook",
    );
    const { views } = optimizeBasket([GLUE, NOTEBOOK], offers, context());
    expect(views.lowestCost?.landedCostCents).toBe(2778);
    expect(views.fewestStops?.landedCostCents).toBe(2878);
    expect(views.fewestStops?.stops).toBe(1);
    expect(views.fastest?.landedCostCents).toBe(2978);
    expect(views.fastest?.deliveryDaysMax).toBe(2);
    expect(views.highestConfidence?.landedCostCents).toBe(2977);
    expect(views.highestConfidence?.lowConfidenceCount).toBe(1);
  });

  it("result shape has no 'optimal'/'best'/'recommended' field anywhere", async () => {
    const offers = (await fixtureOffers()).filter((o) => o.itemKey === "glue-stick");
    const result = optimizeBasket([GLUE], offers, context());
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
      }
    };
    walk(result);
    expect(keys.filter((k) => /optimal|best|recommended|winner/i.test(k))).toEqual([]);
    expect(Object.keys(result.views).sort()).toEqual([
      "fastest",
      "fewestStops",
      "highestConfidence",
      "lowestCost",
    ]);
  });

  it("deadline risk prices into the objective: depot (5d) vs 4-day deadline", async () => {
    const offers = (await fixtureOffers()).filter(
      (o) => o.itemKey === "wide-ruled-notebook" && o.retailerSlug === "fixture-depot",
    );
    const result = optimizeBasket([NOTEBOOK], offers, context());
    const option = result.options[0]!;
    expect(option.deadlineRiskDays).toBe(1); // max(0, 5 - 4)
    // 1980 + 163x0? holiday applies -> tax 0; +599 ship = 2579
    expect(option.landedCostCents).toBe(2579);
    // 2579 + 500x1 stop + 300x1 risk day + 0 + 200x1 (unverified holiday)
    expect(option.weightedObjectiveCents).toBe(3579);
  });

  it("match penalty prices into the objective at lambda3 per point", () => {
    const mk = (offerKey: string, matchScore: number): BasketOfferInput => ({
      offerKey,
      itemKey: "glue-stick",
      retailerSlug: "fixture-mart",
      packCount: 6,
      priceCents: 199,
      availability: "in_stock",
      shippingCents: 0,
      matchScore,
      estimatedDeliveryDays: 2,
      shipsToStates: null,
      provenanceIds: [`prov:test:${offerKey}`],
    });
    const result = optimizeBasket(
      [GLUE],
      [mk("fixture-mart:HALF-MATCH", 0.5), mk("fixture-mart:FULL-MATCH", 1)],
      context(),
    );
    const [first, second] = result.options;
    expect(first!.matchPenalty).toBe(0);
    expect(second!.matchPenalty).toBe(0.5);
    // Identical cost/stops/delivery/confidence; objective differs by 1000x0.5.
    expect(second!.weightedObjectiveCents - first!.weightedObjectiveCents).toBe(500);
  });
});

describe("basket — constraints (§1.5 suppression inputs)", () => {
  it("out-of-stock offers are excluded; a sole-OOS item makes the basket infeasible", async () => {
    const depotCrayonsOnly = (await fixtureOffers()).filter(
      (o) => o.offerKey === "fixture-depot:FXD-70388", // out_of_stock in fixture
    );
    const result = optimizeBasket([CRAYONS], depotCrayonsOnly, context());
    expect(result.feasible).toBe(false);
    expect(result.excludedOffers).toEqual([
      { offerKey: "fixture-depot:FXD-70388", detail: "out of stock" },
    ]);
    expect(result.unfulfillableItems.map((u) => u.itemKey)).toEqual(["crayons-24"]);
    expect(result.frontier).toEqual([]);
    expect(result.views.lowestCost).toBeNull();
  });

  it("geography: an offer that does not ship to the household state is excluded", async () => {
    const offers = (await fixtureOffers())
      .filter((o) => o.itemKey === "glue-stick" && o.retailerSlug === "fixture-mart")
      .map((o) => ({ ...o, shipsToStates: ["CA"] as const }));
    const result = optimizeBasket([GLUE], offers, context({ state: "TX" }));
    expect(result.feasible).toBe(false);
    expect(result.excludedOffers[0]?.detail).toBe("does not ship to TX");
  });

  it("limited availability costs a confidence point", async () => {
    const martCrayons = (await fixtureOffers()).filter(
      (o) => o.offerKey === "fixture-mart:FXM-CRAY-24", // 'limited' in fixture
    );
    const result = optimizeBasket([CRAYONS], martCrayons, context());
    const option = result.options[0]!;
    // +1 limited availability, +1 unverified holiday
    expect(option.lowConfidenceCount).toBe(2);
    expect(option.lines[0]!.packsToBuy).toBe(2); // ceil(48/24)
  });

  it("caps the enumeration space with a descriptive error", () => {
    const items: BasketItemInput[] = ["a", "b", "c"].map((k) => ({
      itemKey: k,
      productTypeSlug: k,
      unitsToBuy: 1,
      taxCategory: null,
    }));
    const offers: BasketOfferInput[] = items.flatMap((item) =>
      Array.from({ length: 40 }, (_, i) => ({
        offerKey: `${item.itemKey}:offer-${i}`,
        itemKey: item.itemKey,
        retailerSlug: `retailer-${i}`,
        packCount: 1,
        priceCents: 100,
        availability: "in_stock" as const,
        shippingCents: 0,
        matchScore: 1,
        estimatedDeliveryDays: 2,
        shipsToStates: null,
        provenanceIds: ["prov:test:cap"],
      })),
    );
    // 40^3 = 64000 > 50000 cap
    expect(() => optimizeBasket(items, offers, context())).toThrow(BasketSearchSpaceError);
  });

  it("assumptions are visible and labeled on every result", async () => {
    const offers = (await fixtureOffers()).filter((o) => o.itemKey === "glue-stick");
    const result = optimizeBasket([GLUE], offers, context());
    expect(result.assumptions.map((a) => a.name)).toEqual([
      "sales_tax_rate",
      "basket_lambdas",
    ]);
    expect(result.assumptions[0]!.basis).toBe("fixture_assumption");
    expect(result.assumptions[1]!.basis).toBe("model_constant");
  });
});
