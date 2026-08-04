/**
 * Deal integrity — rolling percentiles + seasonal baseline; traps flagged.
 *
 * Fixture window (fixtures/price-history/history.fixture.json, glue 6-pack,
 * 8 weekly points, all inside the 90-day window ending 2026-08-01):
 *   pack prices [199,189,209,199,249,199,219,189] -> unit prices /6:
 *   sorted [31.5, 31.5, 33.1667, 33.1667, 33.1667, 34.8333, 36.5, 41.5]
 *   nearest-rank: p25 = 2nd = 31.5; p50 = 4th = 33.1667; p75 = 6th = 34.8333
 *   max unit = 41.5 (the 249 point)
 * Current offer 179c/6-pack -> unit 29.8333 <= p25 -> below_typical.
 *   advertised reference 299 -> unit 49.8333 > max 41.5 -> inflated.
 *   saving vs median = 199 - 179 = 20c; shipping 599 >= 20 -> shipping trap.
 * Pack trap case: 2-pack at 89c -> unit 44.5 > p50 and pack 2 != modal 6.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEAL_CONFIG,
  evaluateDealIntegrity,
  nearestRankPercentile,
  type CurrentOfferSnapshot,
  type PricePoint,
} from "../src/algorithms/deal-integrity";
import { loadFixtureDoc } from "./helpers/fixtures";

interface PriceHistoryRow {
  upc: string;
  retailerSlug: string;
  observedAt: string;
  priceCents: number;
  packCount: number;
}

const doc = loadFixtureDoc<PriceHistoryRow>("price-history/history.fixture.json");
const NOW_MS = Date.parse(doc.generatedAt);

const historyFor = (upc: string): PricePoint[] =>
  doc.records
    .filter((r) => r.upc === upc)
    .map((r) => ({
      observedAt: r.observedAt,
      priceCents: r.priceCents,
      packCount: r.packCount,
      provenanceId: `prov:${doc.fixtureSet}:price-${r.upc}-${r.observedAt}`,
    }));

const GLUE_HISTORY = historyFor("FIXTURE-UPC-0001"); // 8 points
const SPARSE_HISTORY = historyFor("FIXTURE-UPC-0002"); // 3 points

const offer = (overrides: Partial<CurrentOfferSnapshot> = {}): CurrentOfferSnapshot => ({
  priceCents: 179,
  packCount: 6,
  referencePriceCents: null,
  shippingCents: 0,
  membershipRequired: false,
  provenanceIds: ["prov:test:current-offer"],
  ...overrides,
});

describe("deal integrity — rolling percentiles (hand-computed)", () => {
  it("nearest-rank percentile math", () => {
    expect(nearestRankPercentile([1, 2, 3, 4], 0.25)).toBe(1);
    expect(nearestRankPercentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(nearestRankPercentile([1, 2, 3, 4], 0.75)).toBe(3);
    expect(nearestRankPercentile([1, 2, 3, 4], 1)).toBe(4);
    expect(() => nearestRankPercentile([], 0.5)).toThrow(RangeError);
    expect(() => nearestRankPercentile([1], 0)).toThrow(RangeError);
  });

  it("computes p25/p50/p75/max of the fixture window", () => {
    const result = evaluateDealIntegrity(GLUE_HISTORY, offer(), null, NOW_MS);
    expect(result.windowPoints).toBe(8);
    expect(result.p25UnitCents).toBe(31.5);
    expect(result.p50UnitCents).toBe(33.1667);
    expect(result.p75UnitCents).toBe(34.8333);
    expect(result.maxUnitCents).toBe(41.5);
    expect(result.modalPackCount).toBe(6);
  });

  it("179c for the 6-pack is below_typical (unit 29.8333 <= p25 31.5)", () => {
    const result = evaluateDealIntegrity(GLUE_HISTORY, offer(), null, NOW_MS);
    expect(result.currentUnitPriceCents).toBe(29.8333);
    expect(result.verdict).toBe("below_typical");
  });

  it("199c is typical; 219c is already above_typical", () => {
    expect(
      evaluateDealIntegrity(GLUE_HISTORY, offer({ priceCents: 199 }), null, NOW_MS).verdict,
    ).toBe("typical"); // unit 33.1667 sits between p25 31.5 and p75 34.8333
    expect(
      evaluateDealIntegrity(GLUE_HISTORY, offer({ priceCents: 219 }), null, NOW_MS).verdict,
    ).toBe("above_typical"); // unit 36.5 >= p75 34.8333
  });

  it("points outside the 90-day window are ignored", () => {
    const stale: PricePoint = {
      observedAt: "2026-04-01T00:00:00.000Z", // > 90 days before 2026-08-01
      priceCents: 99,
      packCount: 6,
      provenanceId: "prov:test:hand-constructed-stale-point",
    };
    const result = evaluateDealIntegrity([...GLUE_HISTORY, stale], offer(), null, NOW_MS);
    expect(result.windowPoints).toBe(8); // the 99c point never enters
    expect(result.p25UnitCents).toBe(31.5);
  });
});

describe("deal integrity — trap flags", () => {
  it("inflated reference price: 'was 299' exceeds every observed price", () => {
    const result = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer({ referencePriceCents: 299 }),
      null,
      NOW_MS,
    );
    expect(result.flags).toContain("inflated_reference_price");
    // An honest reference inside the observed range does not flag.
    const honest = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer({ referencePriceCents: 219 }),
      null,
      NOW_MS,
    );
    expect(honest.flags).not.toContain("inflated_reference_price");
  });

  it("pack-size trap: smaller pack with a higher unit price", () => {
    const result = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer({ priceCents: 89, packCount: 2 }), // unit 44.5 > p50 33.1667
      null,
      NOW_MS,
    );
    expect(result.flags).toContain("pack_size_trap");
    expect(result.verdict).toBe("above_typical");
  });

  it("membership-only pricing is flagged", () => {
    const result = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer({ membershipRequired: true }),
      null,
      NOW_MS,
    );
    expect(result.flags).toContain("membership_only_pricing");
  });

  it("shipping erases the discount: 599c shipping vs a 20c saving", () => {
    const result = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer({ shippingCents: 599 }),
      null,
      NOW_MS,
    );
    expect(result.flags).toContain("shipping_erases_discount");
    // Free shipping on the same price does not flag.
    const free = evaluateDealIntegrity(GLUE_HISTORY, offer({ shippingCents: 0 }), null, NOW_MS);
    expect(free.flags).not.toContain("shipping_erases_discount");
  });

  it("unknown shipping is flagged as incomplete comparison (§1.5)", () => {
    const result = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer({ shippingCents: null }),
      null,
      NOW_MS,
    );
    expect(result.flags).toContain("shipping_unknown");
  });
});

describe("deal integrity — honesty rails", () => {
  it("insufficient history -> no verdict, no percentiles (§1.5)", () => {
    const result = evaluateDealIntegrity(
      SPARSE_HISTORY,
      offer({ priceCents: 119, packCount: 1 }),
      null,
      NOW_MS,
    );
    expect(SPARSE_HISTORY.length).toBeLessThan(DEFAULT_DEAL_CONFIG.minPoints);
    expect(result.verdict).toBe("insufficient_history");
    expect(result.flags).toContain("insufficient_price_history");
    expect(result.p50UnitCents).toBeNull();
    expect(result.modalPackCount).toBeNull();
  });

  it("seasonal baseline is an observed comparison, clearly non-predictive", () => {
    const result = evaluateDealIntegrity(
      GLUE_HISTORY,
      offer(),
      {
        periodLabel: "fixture back-to-school 2025 period",
        medianUnitPriceCents: 32,
        provenanceId: "prov:test:seasonal-baseline",
      },
      NOW_MS,
    );
    expect(result.seasonalComparison).toBe("below_seasonal_median"); // 29.8333 < 32
    expect(result.notes.join(" ")).toContain("not a forecast");
    expect(result.provenanceIds).toContain("prov:test:seasonal-baseline");
  });

  it("never predicts or promises: no such language in any output", () => {
    const serialized = JSON.stringify(
      evaluateDealIntegrity(GLUE_HISTORY, offer({ referencePriceCents: 299 }), null, NOW_MS),
    );
    expect(serialized).not.toMatch(/predict|guarantee|will drop|lowest price/i);
  });

  it("result carries provenance for the window and the offer (§1.4)", () => {
    const result = evaluateDealIntegrity(GLUE_HISTORY, offer(), null, NOW_MS);
    expect(result.provenanceIds).toContain("prov:test:current-offer");
    expect(
      result.provenanceIds.filter((p) => p.includes("fixture:price-history-2026-v1")),
    ).toHaveLength(8);
  });
});
