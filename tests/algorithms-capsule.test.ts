/**
 * Capsule math — units = ceil((days_between_washes + reserve)/rewears) -
 * usable_existing, per garment category, ALWAYS a range with visible
 * assumptions (never one universal number).
 *
 * Hand-computed expected values (documented in handoff 05 §6):
 *  - tops / temperate: wash cadence 7 + reserve 2 = 9 days to cover;
 *      rewears 1..2 -> min units = ceil(9/2) - 3 = 5 - 3 = 2
 *                      max units = ceil(9/1) - 3 = 9 - 3 = 6      -> {2, 6}
 *  - tops / hot: rewears 1..1 -> ceil(9/1) - 3 = 6 both           -> {6, 6}
 *  - tops / cold: rewears 2..3 -> min = ceil(9/3)-3 = 0, max = ceil(9/2)-3 = 2
 *  - uniform (temperate tops): +1 reserve day -> 10 days;
 *      min = ceil(10/2) - 3 = 2, max = ceil(10/1) - 3 = 7          -> {2, 7}
 *  - cost per wear: 1200c / 30 wears = 40c; 180 season days / 6 units = 30
 *
 * All inputs are hand-constructed test data with labeled bases.
 */
import { describe, expect, it } from "vitest";
import {
  BUY_NOW_DEADLINE_BUFFER_DAYS,
  buyNowVsWait,
  computeCapsule,
  computeCapsuleCategory,
  costPerWearCents,
  projectedWearsPerUnit,
  REWEARS_PER_UNIT,
  type CapsuleCategoryInput,
} from "../src/algorithms/capsule";

const input = (
  overrides: Partial<CapsuleCategoryInput> = {},
): CapsuleCategoryInput => ({
  category: "tops",
  climateBand: "temperate",
  daysBetweenWashes: 7,
  reserveDays: 2,
  usableExisting: 3,
  dressCode: null,
  ...overrides,
});

describe("capsule — unit ranges per category and climate band (hand-computed)", () => {
  it("tops / temperate: {min 2, max 6}", () => {
    const line = computeCapsuleCategory(input());
    expect(line.unitsRange).toEqual({ min: 2, max: 6 });
    expect(line.rewearsAssumed).toEqual({ min: 1, max: 2 });
  });

  it("tops / hot: {6, 6} — still expressed as a range", () => {
    const line = computeCapsuleCategory(input({ climateBand: "hot" }));
    expect(line.unitsRange).toEqual({ min: 6, max: 6 });
  });

  it("tops / cold: {0, 2}", () => {
    const line = computeCapsuleCategory(input({ climateBand: "cold" }));
    expect(line.unitsRange).toEqual({ min: 0, max: 2 });
  });

  it("climate band changes the answer — there is no universal number", () => {
    const hot = computeCapsuleCategory(input({ climateBand: "hot" }));
    const temperate = computeCapsuleCategory(input());
    expect(hot.unitsRange).not.toEqual(temperate.unitsRange);
  });

  it("uniform dress code adds a reserve day and a visible note: {2, 7}", () => {
    const line = computeCapsuleCategory(
      input({
        dressCode: { solidColorsOnly: true, uniformRequired: true, allowedColors: ["navy", "white"] },
      }),
    );
    expect(line.effectiveReserveDays).toBe(3);
    expect(line.unitsRange).toEqual({ min: 2, max: 7 });
    expect(line.dressCodeNotes).toHaveLength(3); // uniform + solid colors + colors
    expect(line.dressCodeNotes[2]).toContain("navy, white");
  });

  it("existing usable units clamp the range at zero", () => {
    const line = computeCapsuleCategory(input({ usableExisting: 20 }));
    expect(line.unitsRange).toEqual({ min: 0, max: 0 });
  });

  it("every assumption is visible and labeled with its basis", () => {
    const line = computeCapsuleCategory(input());
    expect(line.assumptions.map((a) => a.name)).toEqual([
      "days_between_washes",
      "reserve_days",
      "rewears_per_unit_range",
      "usable_existing_units",
    ]);
    for (const assumption of line.assumptions) {
      expect(["model_constant", "fixture_assumption", "user_input"]).toContain(
        assumption.basis,
      );
    }
  });

  it("computeCapsule returns one range per requested category", () => {
    const lines = computeCapsule([
      input(),
      input({ category: "bottoms" }),
      input({ category: "socks", usableExisting: 0 }),
    ]);
    expect(lines.map((l) => l.category)).toEqual(["tops", "bottoms", "socks"]);
    // bottoms / temperate: rewears 2..3 -> min ceil(9/3)-3=0, max ceil(9/2)-3=2
    expect(lines[1]!.unitsRange).toEqual({ min: 0, max: 2 });
    // socks rewear 1..1 -> 9 - 0 = 9 both
    expect(lines[2]!.unitsRange).toEqual({ min: 9, max: 9 });
  });

  it("rewear table is per category AND band (model constants, exported)", () => {
    expect(REWEARS_PER_UNIT.tops.temperate).toEqual({ min: 1, max: 2 });
    expect(REWEARS_PER_UNIT.outer_layer.cold).toEqual({ min: 3, max: 5 });
  });

  it("rejects invalid cadence and reserve inputs", () => {
    expect(() => computeCapsuleCategory(input({ daysBetweenWashes: 0 }))).toThrow(RangeError);
    expect(() => computeCapsuleCategory(input({ reserveDays: -1 }))).toThrow(RangeError);
  });
});

describe("capsule — cost per wear (hand-computed)", () => {
  it("1200c over 30 projected wears = 40c per wear", () => {
    expect(projectedWearsPerUnit(180, 6)).toBe(30);
    expect(costPerWearCents(1200, 30)).toBe(40);
  });

  it("rejects non-positive divisors", () => {
    expect(() => costPerWearCents(1200, 0)).toThrow(RangeError);
    expect(() => projectedWearsPerUnit(180, 0)).toThrow(RangeError);
  });
});

describe("capsule — buy-now-vs-wait (observed comparisons only, no forecast)", () => {
  it("deadline pressure forces buy_now regardless of price", () => {
    const result = buyNowVsWait({
      daysUntilNeeded: 4,
      typicalDeliveryDays: 3,
      currentPriceCents: 9999,
      rollingMedianCents: 100,
    });
    expect(result.timing).toBe("buy_now");
    expect(result.reason).toContain(`${BUY_NOW_DEADLINE_BUFFER_DAYS}-day buffer`);
  });

  it("no history window -> insufficient_data (§1.5, never guessed)", () => {
    const result = buyNowVsWait({
      daysUntilNeeded: 30,
      typicalDeliveryDays: 3,
      currentPriceCents: 189,
      rollingMedianCents: null,
    });
    expect(result.timing).toBe("insufficient_data");
  });

  it("at or below the observed median -> buy_now; above -> waiting_reasonable", () => {
    const below = buyNowVsWait({
      daysUntilNeeded: 30,
      typicalDeliveryDays: 3,
      currentPriceCents: 189,
      rollingMedianCents: 199,
    });
    expect(below.timing).toBe("buy_now");
    const above = buyNowVsWait({
      daysUntilNeeded: 30,
      typicalDeliveryDays: 3,
      currentPriceCents: 219,
      rollingMedianCents: 199,
    });
    expect(above.timing).toBe("waiting_reasonable");
  });

  it("every outcome carries the no-prediction disclaimer", () => {
    for (const rollingMedianCents of [null, 100, 500]) {
      const result = buyNowVsWait({
        daysUntilNeeded: 30,
        typicalDeliveryDays: 3,
        currentPriceCents: 200,
        rollingMedianCents,
      });
      expect(result.disclaimer).toContain("no price prediction");
    }
  });
});
