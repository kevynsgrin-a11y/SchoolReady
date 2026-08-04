/**
 * Suppression engine — §1.5 as code. One test block per trigger (all eight),
 * plus the recall-basket integration: recalled products leave EVERY basket.
 *
 * Thresholds (hand-checked): price/stock downgrade after 21600s (Phase 0
 * circuit-breaker staleness), suppress after 604800s (7 days). Injected
 * clocks only — no test reads the wall clock.
 */
import { describe, expect, it } from "vitest";
import {
  combineFindings,
  DEFAULT_SUPPRESSION_THRESHOLDS,
  evaluateDeadlineFeasibility,
  evaluateListStatus,
  evaluatePriceStockAge,
  evaluateRecallStatus,
  evaluateSchoolPolicy,
  evaluateSourceConflict,
  evaluateTrendClaim,
  evaluateVariantResolution,
  filterRecalledOffers,
  matchRecallsByUpc,
  SUPPRESSION_REASONS,
  type RecallAwareOffer,
} from "../src/algorithms/suppression";
import { DEFAULT_BASKET_LAMBDAS, optimizeBasket } from "../src/algorithms/basket";
import { loadRecallsFixture, loadOffersFixture } from "./helpers/fixtures";

const NOW_MS = Date.parse("2026-08-01T00:00:00.000Z");

describe("suppression — the eight §1.5 triggers", () => {
  it("has exactly eight distinct reason codes", () => {
    expect(SUPPRESSION_REASONS).toHaveLength(8);
    expect(new Set(SUPPRESSION_REASONS).size).toBe(8);
  });

  it("1. stale or unverified list -> downgrade; confirmed -> render", () => {
    expect(evaluateListStatus({ verificationStatus: "stale" })).toMatchObject({
      reason: "stale_or_unverified_list",
      action: "downgrade",
    });
    expect(evaluateListStatus({ verificationStatus: "unverified" })).toMatchObject({
      reason: "stale_or_unverified_list",
      action: "downgrade",
    });
    expect(evaluateListStatus({ verificationStatus: "user_confirmed" })).toBeNull();
  });

  it("2. unresolved variant or review-pending item -> suppress", () => {
    expect(
      evaluateVariantResolution({ resolutionStatus: "unresolved", needsReview: false }),
    ).toMatchObject({ reason: "unresolved_product_variant", action: "suppress" });
    expect(
      evaluateVariantResolution({ resolutionStatus: "ambiguous", needsReview: false }),
    ).toMatchObject({ reason: "unresolved_product_variant", action: "suppress" });
    expect(
      evaluateVariantResolution({ resolutionStatus: "resolved", needsReview: true }),
    ).toMatchObject({ reason: "unresolved_product_variant", action: "suppress" });
    expect(
      evaluateVariantResolution({ resolutionStatus: "resolved", needsReview: false }),
    ).toBeNull();
  });

  it("3. price/stock age: fresh renders, 7h downgrades, 8d suppresses", () => {
    expect(DEFAULT_SUPPRESSION_THRESHOLDS).toEqual({
      priceStockDowngradeAfterSeconds: 21_600,
      priceStockSuppressAfterSeconds: 604_800,
    });
    const hoursAgo = (h: number) => ({ retrievedAtMs: NOW_MS - h * 3_600_000 });
    expect(evaluatePriceStockAge(hoursAgo(1), NOW_MS)).toBeNull();
    expect(evaluatePriceStockAge(hoursAgo(7), NOW_MS)).toMatchObject({
      reason: "price_stock_stale",
      action: "downgrade", // 25200s > 21600s
    });
    expect(evaluatePriceStockAge(hoursAgo(8 * 24), NOW_MS)).toMatchObject({
      reason: "price_stock_stale",
      action: "suppress", // 691200s > 604800s
    });
  });

  it("4. single-signal-family viral claim -> suppressed (§1.3)", () => {
    expect(
      evaluateTrendClaim({ claimedLabel: "viral", organicPassingFamilyCount: 1 }),
    ).toMatchObject({ reason: "single_signal_family_trend", action: "suppress" });
    expect(
      evaluateTrendClaim({ claimedLabel: "viral", organicPassingFamilyCount: 3 }),
    ).toBeNull();
    expect(
      evaluateTrendClaim({
        claimedLabel: "insufficient_evidence",
        organicPassingFamilyCount: 1,
      }),
    ).toBeNull();
  });

  it("5. unconfirmable school policy -> suppress, never guessed", () => {
    expect(evaluateSchoolPolicy({ confirmation: "unconfirmed" })).toMatchObject({
      reason: "unconfirmable_school_policy",
      action: "suppress",
    });
    expect(evaluateSchoolPolicy({ confirmation: "conflicting" })).toMatchObject({
      reason: "unconfirmable_school_policy",
      action: "suppress",
    });
    expect(evaluateSchoolPolicy({ confirmation: "confirmed" })).toBeNull();
  });

  it("6. recalled, recall-candidate, or under-review -> suppress", () => {
    expect(
      evaluateRecallStatus({ recallMatch: "matched", correctionStatus: "none" }),
    ).toMatchObject({ reason: "recalled_or_under_review", action: "suppress" });
    expect(
      evaluateRecallStatus({ recallMatch: "candidate", correctionStatus: "none" }),
    ).toMatchObject({ reason: "recalled_or_under_review", action: "suppress" });
    expect(
      evaluateRecallStatus({ recallMatch: "none", correctionStatus: "under_review" }),
    ).toMatchObject({ reason: "recalled_or_under_review", action: "suppress" });
    expect(
      evaluateRecallStatus({ recallMatch: "none", correctionStatus: "retracted" }),
    ).toMatchObject({ reason: "recalled_or_under_review", action: "suppress" });
    expect(
      evaluateRecallStatus({ recallMatch: "none", correctionStatus: "none" }),
    ).toBeNull();
  });

  it("7. affiliate-feed price conflicting with the neutral source -> suppress", () => {
    expect(
      evaluateSourceConflict({
        affiliateFeedValueCents: 1099,
        neutralSourceValueCents: 899,
        toleranceCents: 100, // delta 200 > 100
      }),
    ).toMatchObject({ reason: "affiliate_neutral_conflict", action: "suppress" });
    expect(
      evaluateSourceConflict({
        affiliateFeedValueCents: 949,
        neutralSourceValueCents: 899,
        toleranceCents: 100, // delta 50 within tolerance
      }),
    ).toBeNull();
  });

  it("8. deadline unmeetable (or unknowable) -> suppress; zero buffer -> downgrade", () => {
    expect(
      evaluateDeadlineFeasibility({ daysUntilNeeded: 4, estimatedDeliveryDays: 5 }),
    ).toMatchObject({ reason: "deadline_unmeetable", action: "suppress" });
    expect(
      evaluateDeadlineFeasibility({ daysUntilNeeded: 4, estimatedDeliveryDays: null }),
    ).toMatchObject({ reason: "deadline_unmeetable", action: "suppress" });
    expect(
      evaluateDeadlineFeasibility({ daysUntilNeeded: 4, estimatedDeliveryDays: 4 }),
    ).toMatchObject({ reason: "deadline_unmeetable", action: "downgrade" });
    expect(
      evaluateDeadlineFeasibility({ daysUntilNeeded: 4, estimatedDeliveryDays: 2 }),
    ).toBeNull();
  });

  it("combineFindings: any suppress wins; downgrades stack; else render", () => {
    const suppress = evaluateSchoolPolicy({ confirmation: "unconfirmed" });
    const downgrade = evaluateListStatus({ verificationStatus: "stale" });
    expect(combineFindings([downgrade, suppress, null]).action).toBe("suppress");
    expect(combineFindings([downgrade, null]).action).toBe("downgrade");
    expect(combineFindings([null, null])).toEqual({ action: "render", findings: [] });
    expect(combineFindings([downgrade, suppress, null]).findings).toHaveLength(2);
  });
});

describe("suppression — recalled products leave every basket (§6 journey 2)", () => {
  const recallsDoc = loadRecallsFixture();
  const recallRefs = recallsDoc.records.flatMap((row) =>
    row.Products.map((p) => ({ recallId: row.RecallID, upc: p.UPC })),
  );

  const bottleOffer = (
    offerKey: string,
    upc: string | null,
  ): RecallAwareOffer => ({
    offerKey,
    itemKey: "water-bottle",
    retailerSlug: offerKey.split(":")[0]!,
    packCount: 1,
    priceCents: 1299,
    availability: "in_stock",
    shippingCents: 0,
    matchScore: 1,
    estimatedDeliveryDays: 2,
    shipsToStates: null,
    upc,
    provenanceIds: [`prov:test:${offerKey}`],
  });

  const bottleItem = {
    itemKey: "water-bottle",
    productTypeSlug: "water-bottle",
    unitsToBuy: 1,
    taxCategory: null,
  };

  const context = {
    state: null,
    salesTaxRate: 0.0825,
    salesTaxBasis: {
      name: "sales_tax_rate",
      value: "0.0825 (fixture assumption)",
      basis: "fixture_assumption" as const,
    },
    purchaseDate: "2026-08-08",
    holidays: [],
    daysUntilNeeded: null,
    lambdas: DEFAULT_BASKET_LAMBDAS,
  };

  it("matchRecallsByUpc is exact and never guesses on null", () => {
    const matches = matchRecallsByUpc("FIXTURE-UPC-0007", recallRefs);
    expect(matches.map((m) => m.recallId)).toEqual(["FIXTURE-990001"]);
    expect(matchRecallsByUpc(null, recallRefs)).toEqual([]);
    expect(matchRecallsByUpc("FIXTURE-UPC-9999", recallRefs)).toEqual([]);
  });

  it("a recall-matched offer is removed with an explicit reason before optimization", () => {
    const recalled = bottleOffer("fixture-mart:RECALLED-BOTTLE", "FIXTURE-UPC-0007");
    const safe = bottleOffer("fixture-depot:SAFE-BOTTLE", "FIXTURE-UPC-4242");
    const { allowed, suppressed } = filterRecalledOffers([recalled, safe], recallRefs);
    expect(allowed.map((o) => o.offerKey)).toEqual(["fixture-depot:SAFE-BOTTLE"]);
    expect(suppressed).toEqual([
      expect.objectContaining({
        offerKey: "fixture-mart:RECALLED-BOTTLE",
        recallIds: ["FIXTURE-990001"],
        finding: expect.objectContaining({
          reason: "recalled_or_under_review",
          action: "suppress",
        }),
      }),
    ]);

    const result = optimizeBasket([bottleItem], allowed, context);
    expect(result.feasible).toBe(true);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("RECALLED-BOTTLE"); // in NO option, view, or line
    for (const option of result.frontier) {
      expect(option.lines.every((l) => l.offerKey === "fixture-depot:SAFE-BOTTLE")).toBe(true);
    }
  });

  it("when the ONLY offer is recalled the basket goes infeasible — safety beats completeness", () => {
    const recalled = bottleOffer("fixture-mart:RECALLED-BOTTLE", "FIXTURE-UPC-0007");
    const { allowed, suppressed } = filterRecalledOffers([recalled], recallRefs);
    expect(allowed).toEqual([]);
    expect(suppressed).toHaveLength(1);
    const result = optimizeBasket([bottleItem], allowed, context);
    expect(result.feasible).toBe(false);
    expect(result.unfulfillableItems.map((u) => u.itemKey)).toEqual(["water-bottle"]);
  });

  it("the retailer-offers fixture is recall-clean against the recall fixture", () => {
    const offersDoc = loadOffersFixture();
    const offerUpcs = offersDoc.records.map((r) => r.upc);
    const recalledUpcs = new Set(recallRefs.map((r) => r.upc));
    expect(offerUpcs.filter((u) => u !== null && recalledUpcs.has(u))).toEqual([]);
  });
});
