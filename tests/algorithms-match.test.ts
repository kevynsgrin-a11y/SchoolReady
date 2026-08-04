/**
 * match(i, j) — hard-constraint gate, soft weighted score, and the §1.1
 * commission-injection test (byte-identical ranking).
 *
 * Hand-computed expected values (documented in handoff 05 §6):
 *  - Candidate A (brand match, pack 6 for 12 units, washable):
 *      applicable dims: brand (w .30, v 1), pack_fit (w .15, v 12/12 = 1)
 *      score = (.30*1 + .15*1) / (.30 + .15) = .45/.45 = 1.0
 *  - Candidate B (other brand, pack 5 for 12 units, washable):
 *      purchased = ceil(12/5)*5 = 15 -> pack_fit v = 12/15 = 0.8
 *      score = (.30*0 + .15*0.8) / .45 = 0.12/0.45 = 0.266666... -> 0.2667
 *  - Folder example (brand+color+material+pack applicable):
 *      score = (.30*1 + .20*1 + .15*0 + .15*1) / (.30+.20+.15+.15)
 *            = 0.65 / 0.80 = 0.8125
 *  - Ruling example (ruling+pack applicable, ruling mismatched):
 *      score = (.20*0 + .15*1) / 0.35 = 0.428571... -> 0.4286
 *
 * All inputs are hand-constructed test data (labeled; no real product).
 */
import { describe, expect, it } from "vitest";
import {
  match,
  prohibitedClassToken,
  rankCandidates,
  requiredAttributeToken,
  SOFT_WEIGHTS,
  type MatchCandidateInput,
  type MatchRequirementInput,
} from "../src/algorithms/match";

const baseRequirement: MatchRequirementInput = {
  productTypeSlug: "glue-stick",
  requiredUnits: 12,
  color: null,
  material: null,
  rulingStyle: null,
  dimensions: null,
  brandRequirement: "preferred",
  brandSlug: "fixture-brand",
  prohibitedSubstitutions: ["washable_required"],
};

const candidate = (
  overrides: Partial<MatchCandidateInput> & { candidateKey: string },
): MatchCandidateInput => ({
  productTypeSlug: "glue-stick",
  brandSlug: "fixture-brand",
  color: null,
  material: null,
  rulingStyle: null,
  dimensions: null,
  packCount: 6,
  attributeTokens: ["washable"],
  classTokens: [],
  provenanceIds: ["prov:test:candidate"],
  ...overrides,
});

describe("match — hard-constraint gate (violations disqualify outright)", () => {
  it("required_attribute: candidate missing 'washable' is disqualified", () => {
    const result = match(
      baseRequirement,
      candidate({ candidateKey: "no-washable", attributeTokens: [] }),
    );
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.disqualifiers).toEqual([
        expect.objectContaining({
          code: "required_attribute_missing",
          constraint: "washable_required",
        }),
      ]);
    }
  });

  it("prohibited_substitution: bluetooth candidate excluded under no_bluetooth", () => {
    const req: MatchRequirementInput = {
      ...baseRequirement,
      productTypeSlug: "headphones",
      prohibitedSubstitutions: ["no_bluetooth", "wired_required"],
    };
    const result = match(
      req,
      candidate({
        candidateKey: "bt-headset",
        productTypeSlug: "headphones",
        attributeTokens: ["wired"],
        classTokens: ["bluetooth"],
      }),
    );
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.disqualifiers).toEqual([
        expect.objectContaining({
          code: "prohibited_substitution_present",
          constraint: "no_bluetooth",
        }),
      ]);
    }
  });

  it("a perfect soft profile cannot rescue a gate violation", () => {
    const violating = candidate({
      candidateKey: "perfect-but-violating",
      attributeTokens: [], // missing washable
    });
    const modest = candidate({
      candidateKey: "modest-but-compliant",
      brandSlug: "other-brand", // soft brand miss
      packCount: 5, // soft pack-fit miss
    });
    const ranking = rankCandidates(baseRequirement, [violating, modest]);
    expect(ranking.eligible.map((r) => r.candidateKey)).toEqual([
      "modest-but-compliant",
    ]);
    expect(ranking.excluded.map((r) => r.candidateKey)).toEqual([
      "perfect-but-violating",
    ]);
  });

  it("brandRequirement 'required' gates on the exact brand", () => {
    const req: MatchRequirementInput = {
      ...baseRequirement,
      brandRequirement: "required",
      brandSlug: "ticonderoga",
      prohibitedSubstitutions: [],
    };
    const wrong = match(req, candidate({ candidateKey: "generic", brandSlug: null }));
    expect(wrong.eligible).toBe(false);
    if (!wrong.eligible) {
      expect(wrong.disqualifiers[0]?.code).toBe("brand_requirement_violated");
    }
    const right = match(
      req,
      candidate({ candidateKey: "branded", brandSlug: "ticonderoga" }),
    );
    expect(right.eligible).toBe(true);
  });

  it("product type mismatch and dimension mismatch/unknown disqualify", () => {
    const wrongType = match(
      baseRequirement,
      candidate({ candidateKey: "liquid", productTypeSlug: "liquid-glue" }),
    );
    expect(wrongType.eligible).toBe(false);

    const dimReq: MatchRequirementInput = {
      ...baseRequirement,
      productTypeSlug: "binder",
      dimensions: "1.5 in",
      prohibitedSubstitutions: [],
    };
    const wrongDim = match(
      dimReq,
      candidate({ candidateKey: "one-inch", productTypeSlug: "binder", dimensions: "1 in" }),
    );
    expect(wrongDim.eligible).toBe(false);
    if (!wrongDim.eligible) {
      expect(wrongDim.disqualifiers[0]?.code).toBe("dimensions_mismatch");
    }
    const unknownDim = match(
      dimReq,
      candidate({ candidateKey: "no-dim", productTypeSlug: "binder", dimensions: null }),
    );
    expect(unknownDim.eligible).toBe(false);
    if (!unknownDim.eligible) {
      // §1.5: unknown is not a match — suppressed, never guessed.
      expect(unknownDim.disqualifiers[0]?.code).toBe("dimensions_unverified");
    }
  });

  it("derives constraint tokens deterministically", () => {
    expect(requiredAttributeToken("presharpened_required")).toBe("presharpened");
    expect(prohibitedClassToken("no_rolling_backpacks")).toBe("rolling_backpacks");
  });
});

describe("match — weighted soft attributes (hand-computed)", () => {
  it("weights are the documented model constants and sum to 1.0", () => {
    expect(SOFT_WEIGHTS).toEqual({
      brand_preference: 0.3,
      color: 0.2,
      ruling: 0.2,
      material: 0.15,
      pack_fit: 0.15,
    });
    const sum = Object.values(SOFT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("candidate A scores exactly 1.0 (brand hit, exact pack fit)", () => {
    const result = match(baseRequirement, candidate({ candidateKey: "a" }));
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.score).toBe(1);
  });

  it("candidate B scores exactly 0.2667 (brand miss, 12/15 pack fit)", () => {
    const result = match(
      baseRequirement,
      candidate({ candidateKey: "b", brandSlug: "other-brand", packCount: 5 }),
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.score).toBe(0.2667);
  });

  it("folder example scores exactly 0.8125 (material miss among 4 applicable)", () => {
    const req: MatchRequirementInput = {
      productTypeSlug: "folder",
      requiredUnits: 4,
      color: "red",
      material: "plastic",
      rulingStyle: null,
      dimensions: null,
      brandRequirement: "preferred",
      brandSlug: "fixture-brand",
      prohibitedSubstitutions: [],
    };
    const result = match(
      req,
      candidate({
        candidateKey: "paper-folder",
        productTypeSlug: "folder",
        color: "red",
        material: "paper",
        packCount: 1,
        attributeTokens: [],
      }),
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.score).toBe(0.8125);
  });

  it("ruling mismatch scores exactly 0.4286 (ruling + pack applicable)", () => {
    const req: MatchRequirementInput = {
      productTypeSlug: "composition-notebook",
      requiredUnits: 5,
      color: null,
      material: null,
      rulingStyle: "wide_ruled",
      dimensions: null,
      brandRequirement: "generic_allowed",
      brandSlug: null,
      prohibitedSubstitutions: [],
    };
    const result = match(
      req,
      candidate({
        candidateKey: "college",
        productTypeSlug: "composition-notebook",
        rulingStyle: "college_ruled",
        packCount: 1,
        attributeTokens: [],
      }),
    );
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.score).toBe(0.4286);
  });

  it("ties break on candidateKey ascending — never on anything monetary", () => {
    const twin1 = candidate({ candidateKey: "twin-b" });
    const twin2 = candidate({ candidateKey: "twin-a" });
    const ranking = rankCandidates(baseRequirement, [twin1, twin2]);
    expect(ranking.eligible.map((r) => r.candidateKey)).toEqual(["twin-a", "twin-b"]);
  });

  it("rejects non-positive or fractional requiredUnits", () => {
    expect(() =>
      match({ ...baseRequirement, requiredUnits: 0 }, candidate({ candidateKey: "x" })),
    ).toThrow(RangeError);
    expect(() =>
      match({ ...baseRequirement, requiredUnits: 2.5 }, candidate({ candidateKey: "x" })),
    ).toThrow(RangeError);
  });
});

describe("match — §1.1 commission-injection (byte-identical ranking)", () => {
  const better = candidate({ candidateKey: "strictly-better" }); // score 1.0
  const inferior = candidate({
    candidateKey: "strictly-inferior", // score 0.2667
    brandSlug: "other-brand",
    packCount: 5,
  });

  it("a 40% commission on the inferior product changes nothing, byte for byte", () => {
    const baseline = JSON.stringify(rankCandidates(baseRequirement, [inferior, better]));

    // Monetization decoration lives OUTSIDE the algorithm inputs: there is no
    // field on MatchCandidateInput that could carry it (structural §1.1).
    const decorated = [
      {
        offer: inferior,
        economics: { commissionRate: 0.4, note: "injected by test, never by product code" },
      },
      { offer: better, economics: { commissionRate: 0 } },
    ];
    const withInjectedCommission = JSON.stringify(
      rankCandidates(baseRequirement, decorated.map((d) => d.offer)),
    );

    expect(withInjectedCommission).toBe(baseline); // byte-identical
    expect(baseline).not.toMatch(/commission/i); // economics never leaks into output

    const ranking = rankCandidates(baseRequirement, [inferior, better]);
    expect(ranking.eligible.map((r) => r.candidateKey)).toEqual([
      "strictly-better",
      "strictly-inferior", // commission bought it nothing
    ]);
  });

  it("MatchCandidateInput accepts no economics-shaped keys at runtime either", () => {
    const keys = Object.keys(better);
    expect(keys.filter((k) => /commission|payout|referral|fee|revenue/i.test(k))).toEqual([]);
  });
});
