/**
 * Trend evidence engine — §1.3 as code.
 *
 * Fixture series are constructed so the robust statistics are hand-checkable
 * (documented in handoff 05 §6):
 *  - rising series [4,5,6,5,4,5,20]:
 *      sorted [4,4,5,5,5,6,20] -> median 5
 *      |deviations| sorted [0,0,0,1,1,1,15] -> MAD 1 -> scaled MAD 1.4826
 *      winsor bound = 5 + 3x1.4826 = 9.4478 -> latest 20 clamps to 9.4478
 *      raw z = (9.4478 - 5) / 1.4826 = 3.0 exactly (by construction)
 *      age 0 days -> freshness e^0 = 1 -> decayed z = 3.0 -> passes
 *  - cooling series [10,11,9,10,11,10,5]: median 10, scaled MAD 1.4826,
 *      lower bound 10 - 4.4478 = 5.5522 -> latest 5 clamps up -> raw z = -3.0
 *  - freshness: 14 days at tau 14 -> e^-1 = 0.3679 -> decayed z 1.1037 (< 2)
 *      30 days -> e^(-30/14) = 0.1173 (< 0.3 floor)
 *  - confidence (single passing family, 7 samples, fresh):
 *      min(1, 7/5) x 1 = 1 evidence unit -> min(1, 1/3) = 0.3333
 */
import { describe, expect, it } from "vitest";
import {
  classifyTrend,
  DEFAULT_TREND_CONFIG,
  evaluateFamily,
  freshnessWeight,
  median,
  scaledMad,
  TREND_LABELS,
  winsorize,
  type FamilySeriesInput,
  type SignalFamily,
} from "../src/algorithms/trend";
import { provenanceFromFixture } from "../src/ingestion/provenance";
import { loadFixtureDoc } from "./helpers/fixtures";

interface TrendSignalRow {
  productSlug: string;
  family: SignalFamily;
  geography: string;
  sponsoredShare: number;
  values: number[];
  latestObservedAt: string;
}

const doc = loadFixtureDoc<TrendSignalRow>("trend-signals/signals.fixture.json");
const NOW_MS = Date.parse(doc.generatedAt);
const clock = () => NOW_MS;

function seriesFor(productSlug: string): FamilySeriesInput[] {
  return doc.records
    .filter((r) => r.productSlug === productSlug)
    .map((r) => ({
      family: r.family,
      values: r.values,
      latestObservedAtMs: Date.parse(r.latestObservedAt),
      sponsoredShare: r.sponsoredShare,
      geography: r.geography,
      provenanceIds: [
        provenanceFromFixture(doc.provenance, `signal-${r.productSlug}-${r.family}`, clock).id,
      ],
    }));
}

const classify = (productSlug: string) =>
  classifyTrend(seriesFor(productSlug).map((s) => evaluateFamily(s, NOW_MS)));

describe("trend — robust statistics (hand-computed)", () => {
  it("median and scaled MAD of the rising series", () => {
    const values = [4, 5, 6, 5, 4, 5, 20];
    expect(median(values)).toBe(5);
    expect(scaledMad(values)).toBeCloseTo(1.4826, 10);
  });

  it("winsorizes the outlier 20 to 9.4478 and z is exactly 3.0 at the clamp", () => {
    const evaluation = evaluateFamily(seriesFor("fixture-sticker-set")[0]!, NOW_MS);
    expect(evaluation.median).toBe(5);
    expect(evaluation.scaledMad).toBe(1.4826);
    expect(evaluation.winsorizedLatest).toBe(9.4478);
    expect(evaluation.rawZ).toBe(3);
    expect(evaluation.freshnessWeight).toBe(1); // age 0
    expect(evaluation.decayedZ).toBe(3);
    expect(evaluation.passes).toBe(true);
  });

  it("winsorize clamps both tails", () => {
    expect(winsorize(20, 5, 1.4826)).toBeCloseTo(9.4478, 10);
    expect(winsorize(-20, 5, 1.4826)).toBeCloseTo(0.5522, 10);
    expect(winsorize(6, 5, 1.4826)).toBe(6); // inside the band: unchanged
  });

  it("freshness decay e^(-dt/tau): 14 days at tau 14 fails the z threshold", () => {
    expect(freshnessWeight(14, 14)).toBeCloseTo(Math.exp(-1), 10);
    const aged = evaluateFamily(
      { ...seriesFor("fixture-sticker-set")[0]!, latestObservedAtMs: NOW_MS - 14 * 86_400_000 },
      NOW_MS,
    );
    expect(aged.freshnessWeight).toBe(0.3679);
    expect(aged.decayedZ).toBe(1.1037); // 3 x 0.3679
    expect(aged.passes).toBe(false);
    expect(aged.failureReasons.join(" ")).toContain("below threshold");
  });

  it("30-day-old signal falls under the freshness floor", () => {
    const stale = evaluateFamily(
      { ...seriesFor("fixture-sticker-set")[0]!, latestObservedAtMs: NOW_MS - 30 * 86_400_000 },
      NOW_MS,
    );
    expect(stale.freshnessWeight).toBe(0.1173);
    expect(stale.passes).toBe(false);
    expect(stale.failureReasons.join(" ")).toContain("below floor");
  });

  it("short series fail the minimum-sample threshold", () => {
    const short = evaluateFamily(
      { ...seriesFor("fixture-sticker-set")[0]!, values: [4, 5, 20] },
      NOW_MS,
    );
    expect(short.passes).toBe(false);
    expect(short.failureReasons.join(" ")).toContain("below minimum 5");
  });

  it("degenerate series (MAD 0) never passes and never produces a z", () => {
    const flat = evaluateFamily(
      { ...seriesFor("fixture-sticker-set")[0]!, values: [5, 5, 5, 5, 5, 5] },
      NOW_MS,
    );
    expect(flat.rawZ).toBeNull();
    expect(flat.passes).toBe(false);
  });
});

describe("trend — §1.3 classification", () => {
  it("SINGLE signal family returns insufficient_evidence — never viral", () => {
    const classification = classify("fixture-sticker-set");
    expect(classification.label).toBe("insufficient_evidence");
    expect(classification.passingFamilies).toEqual(["search_interest"]);
    // Confidence is SEPARATE from the label: strong single-family evidence
    // still reports its evidence volume while refusing the viral label.
    expect(classification.confidence).toBe(0.3333); // min(1, 1/3)
  });

  it("three independent organic families -> viral, confidence 1.0", () => {
    const classification = classify("fixture-gel-pen");
    expect(classification.label).toBe("viral");
    expect(classification.organicPassingFamilies).toEqual([
      "retail_sellthrough",
      "search_interest",
      "social_engagement",
    ]);
    expect(classification.confidence).toBe(1);
  });

  it("three passing but sponsored-majority families -> paid_campaign_driven", () => {
    const classification = classify("fixture-clip-light");
    expect(classification.label).toBe("paid_campaign_driven");
    expect(classification.organicPassingFamilies).toEqual([]);
  });

  it("two organic families concentrated in one state -> locally_popular", () => {
    const classification = classify("fixture-mesh-pouch");
    expect(classification.label).toBe("locally_popular");
    expect(classification.reasons.join(" ")).toContain("US-TX");
  });

  it("two well-sampled families with decayed z <= -1 -> cooling", () => {
    const classification = classify("fixture-slap-band");
    expect(classification.label).toBe("cooling");
    const zs = classification.familyEvaluations.map((e) => e.decayedZ);
    expect(zs).toEqual([-3, -3]);
  });

  it("the same family repeated is NOT independent evidence", () => {
    const one = seriesFor("fixture-sticker-set")[0]!;
    const repeated = [one, { ...one }, { ...one }].map((s) => evaluateFamily(s, NOW_MS));
    const classification = classifyTrend(repeated);
    expect(classification.label).toBe("insufficient_evidence");
    expect(classification.familyEvaluations).toHaveLength(1); // deduped by family
  });

  it("only the five permitted labels exist; default is insufficient_evidence", () => {
    expect([...TREND_LABELS].sort()).toEqual([
      "cooling",
      "insufficient_evidence",
      "locally_popular",
      "paid_campaign_driven",
      "viral",
    ]);
    const empty = classifyTrend([]);
    expect(empty.label).toBe("insufficient_evidence");
    expect(empty.confidence).toBe(0);
  });

  it("every family evaluation carries fixture provenance (§1.4)", () => {
    for (const evaluation of classify("fixture-gel-pen").familyEvaluations) {
      expect(evaluation.provenanceIds).toHaveLength(1);
      expect(evaluation.provenanceIds[0]).toContain("fixture:trend-signals-2026-v1");
    }
  });

  it("config thresholds are the documented model constants", () => {
    expect(DEFAULT_TREND_CONFIG).toEqual({
      tauDays: 14,
      minSamples: 5,
      zThreshold: 2,
      freshnessFloor: 0.3,
      sponsoredShareCeiling: 0.5,
      coolingZ: -1,
    });
  });
});
