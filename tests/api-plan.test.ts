/**
 * Phase 5 plan pipeline (node): merge over persisted-row shapes and basket
 * input derivation in the MANDATED order — net-required -> rankCandidates
 * (match gate feeds matchScore, P4-3) -> filterRecalledOffers BEFORE
 * optimizeBasket — with §1.5 staleness handling on offers.
 */
import { describe, expect, it } from "vitest";
import { computeMergePlan, deriveBasketInputs } from "../src/api/plan";
import type { BasketDerivationArgs } from "../src/api/plan";
import { deriveCandidates } from "../src/api/catalog";
import { rankCandidates } from "../src/algorithms/match";
import { optimizeBasket } from "../src/algorithms/basket";
import { createProductFeedFixtureAdapter } from "../src/ingestion/adapters/product-feeds";
import type { RequirementJoinRow, InventoryJoinRow } from "../src/api/store";
import { loadFixtureLibrary, T0 } from "./helpers/api";

const fixtures = loadFixtureLibrary();

function row(overrides: Partial<RequirementJoinRow>): RequirementJoinRow {
  return {
    id: "req_x",
    list_id: "list_1",
    product_type_slug: "glue-stick",
    quantity: 1,
    unit: "each",
    pack_count: null,
    dimensions: null,
    material: null,
    color: null,
    ruling_style: null,
    brand_requirement: "generic_allowed",
    required_brand_id: null,
    optionality: "required",
    prohibited_substitutions: null,
    source_kind: "paste",
    source_confidence: 0.9,
    provenance_id: "prov:req:x",
    verification_status: "user_confirmed",
    grade_level: "3",
    school_year: "2026-2027",
    intake_method: "paste",
    ordinal: 1,
    ...overrides,
  };
}

const CHILD_ROWS: RequirementJoinRow[] = [
  row({ id: "r1", provenance_id: "prov:req:r1", quantity: 12, ordinal: 1 }),
  row({
    id: "r2",
    provenance_id: "prov:req:r2",
    product_type_slug: "composition-notebook",
    quantity: 2,
    ruling_style: "wide_ruled",
    ordinal: 1,
  }),
  row({ id: "r3", provenance_id: "prov:req:r3", quantity: 6, ordinal: 2, list_id: "list_2" }),
  row({
    id: "r4",
    provenance_id: "prov:req:r4",
    product_type_slug: "crayons",
    quantity: 1,
    pack_count: 24,
    unit: "pack",
    ordinal: 2,
    list_id: "list_2",
  }),
];

const INVENTORY: InventoryJoinRow[] = [
  { id: "i1", product_type_slug: "glue-stick", quantity: 4, condition: "new", provenance_id: "prov:inv:i1" },
  { id: "i2", product_type_slug: "glue-stick", quantity: 3, condition: "usable", provenance_id: "prov:inv:i2" },
];

describe("computeMergePlan — multi-child merge over persisted rows", () => {
  it("nets glue across children minus condition-weighted inventory: 18 - 5.5 = 12.5 -> buy 13", () => {
    const merge = computeMergePlan(CHILD_ROWS, INVENTORY);
    const glue = merge.lines.find((l) => l.productTypeSlug === "glue-stick")!;
    expect(glue.grossRequiredUnits).toBe(18);
    expect(glue.usableInventoryUnits).toBe(5.5);
    expect(glue.netRequiredUnits).toBe(12.5);
    expect(glue.unitsToBuy).toBe(13);
    expect(glue.perMember).toEqual([
      { memberOrdinal: 1, requiredUnits: 12 },
      { memberOrdinal: 2, requiredUnits: 6 },
    ]);
  });

  it("expands pack quantities (1 pack of 24 crayons -> 24 units) and keeps ruling distinct", () => {
    const merge = computeMergePlan(CHILD_ROWS, INVENTORY);
    expect(merge.lines.find((l) => l.productTypeSlug === "crayons")!.unitsToBuy).toBe(24);
    const notebook = merge.lines.find((l) => l.productTypeSlug === "composition-notebook")!;
    expect(notebook.key).toContain("wide_ruled");
    expect(notebook.unitsToBuy).toBe(2);
  });

  it("takes the STRICTEST brand requirement across contributing rows", () => {
    const rows = [
      row({ id: "r1", provenance_id: "p1", ordinal: 1 }),
      row({
        id: "r2",
        provenance_id: "p2",
        ordinal: 2,
        brand_requirement: "required",
        required_brand_id: "brand:fixture-brand",
      }),
    ];
    const merge = computeMergePlan(rows, []);
    const meta = merge.lineMeta.get(merge.lines[0]!.key)!;
    expect(meta.brandRequirement).toBe("required");
    expect(meta.brandSlug).toBe("fixture-brand");
  });

  it("downgrades (never hides) lines from unverified lists — §1.5 finding", () => {
    const rows = [row({ id: "r1", provenance_id: "p1", verification_status: "unverified" })];
    const merge = computeMergePlan(rows, []);
    expect(merge.lines).toHaveLength(1);
    const finding = merge.listFindings[0]!;
    expect(finding.decision.action).toBe("downgrade");
    expect(finding.decision.findings[0]!.reason).toBe("stale_or_unverified_list");
  });
});

async function candidateDerivation(atMs: number = T0) {
  const adapter = createProductFeedFixtureAdapter(fixtures.offers, () => atMs);
  const batch = await adapter.fetchBatch();
  return deriveCandidates(batch.records, fixtures.catalog, fixtures.logistics, () => atMs);
}

function derivationArgs(
  overrides: Partial<BasketDerivationArgs>,
): BasketDerivationArgs {
  return {
    merge: computeMergePlan(CHILD_ROWS, INVENTORY),
    candidatesBySlug: new Map(),
    recallRefs: [],
    holidays: [],
    state: "TX",
    salesTaxRate: 0.0825,
    salesTaxBasis: {
      name: "sales_tax_rate",
      value: "0.0825 (fixture placeholder)",
      basis: "fixture_assumption",
    },
    purchaseDate: "2026-08-04",
    daysUntilNeeded: null,
    nowMs: T0,
    ...overrides,
  };
}

describe("deriveBasketInputs — order and gates (P4-3)", () => {
  it("matchScore on every offer equals the rankCandidates score for that candidate", async () => {
    const derivation = await candidateDerivation();
    const args = derivationArgs({ candidatesBySlug: derivation.bySlug });
    const inputs = deriveBasketInputs(args);
    // All 9 fixture offers pass the match gate (out-of-stock exclusion is
    // optimizeBasket's, with a visible reason — not a silent pre-filter).
    expect(inputs.offers.length).toBe(9);
    for (const offer of inputs.offers) {
      const line = args.merge.lines.find((l) => l.key === offer.itemKey)!;
      const meta = args.merge.lineMeta.get(line.key)!;
      const ranking = rankCandidates(
        {
          productTypeSlug: line.productTypeSlug,
          requiredUnits: line.unitsToBuy,
          color: line.color,
          material: null,
          rulingStyle: line.rulingStyle as "wide_ruled" | null,
          dimensions: line.dimensions,
          brandRequirement: meta.brandRequirement,
          brandSlug: meta.brandSlug,
          prohibitedSubstitutions: meta.prohibitedSubstitutions,
        },
        derivation.bySlug.get(line.productTypeSlug)!.map((c) => c.candidate),
      );
      const match = ranking.eligible.find((e) => e.candidateKey === offer.offerKey);
      expect(match, `offer ${offer.offerKey} must be gate-eligible`).toBeDefined();
      expect(offer.matchScore).toBe(match!.score);
    }
  });

  it("filters recalled offers BEFORE optimization; a recalled UPC appears in no option", async () => {
    const derivation = await candidateDerivation();
    const inputs = deriveBasketInputs(
      derivationArgs({
        candidatesBySlug: derivation.bySlug,
        recallRefs: [{ recallId: "FIXTURE-990001", upc: "FIXTURE-UPC-0001" }],
      }),
    );
    // Every glue offer shares the recalled UPC -> all suppressed.
    expect(inputs.offers.some((o) => o.upc === "FIXTURE-UPC-0001")).toBe(false);
    const recallNotes = inputs.suppressions.filter(
      (s) => s.decision.findings[0]?.reason === "recalled_or_under_review",
    );
    expect(recallNotes).toHaveLength(3);
    // And the basket goes infeasible for the glue line rather than guessing.
    const result = optimizeBasket(inputs.items, inputs.offers, inputs.ctx);
    expect(result.feasible).toBe(false);
    expect(JSON.stringify(result)).not.toContain("FIXTURE-UPC-0001");
    expect(
      result.unfulfillableItems.some((u) => u.itemKey.startsWith("glue-stick")),
    ).toBe(true);
  });

  it("suppresses offers past the price/stock staleness threshold (8 days)", async () => {
    const derivation = await candidateDerivation();
    const inputs = deriveBasketInputs(
      derivationArgs({
        candidatesBySlug: derivation.bySlug,
        nowMs: T0 + 8 * 24 * 3600 * 1000,
      }),
    );
    expect(inputs.offers).toHaveLength(0);
    expect(
      inputs.suppressions.every(
        (s) => s.decision.findings[0]?.reason === "price_stock_stale",
      ),
    ).toBe(true);
    expect(inputs.suppressions.every((s) => s.decision.action === "suppress")).toBe(true);
  });

  it("downgrades (keeps, with findings) offers older than 6h but younger than 7 days", async () => {
    const derivation = await candidateDerivation();
    const inputs = deriveBasketInputs(
      derivationArgs({
        candidatesBySlug: derivation.bySlug,
        nowMs: T0 + 7 * 3600 * 1000,
      }),
    );
    expect(inputs.offers.length).toBeGreaterThan(0);
    const staleNotes = inputs.suppressions.filter(
      (s) => s.decision.findings[0]?.reason === "price_stock_stale",
    );
    expect(staleNotes.length).toBe(9);
    expect(staleNotes.every((s) => s.decision.action === "downgrade")).toBe(true);
  });

  it("optional lines never enter the basket; zero-buy lines are reported covered", () => {
    const rows = [
      row({ id: "r1", provenance_id: "p1" , quantity: 2 }),
      row({
        id: "r2",
        provenance_id: "p2",
        product_type_slug: "crayons",
        optionality: "optional",
        quantity: 1,
      }),
    ];
    const inventory: InventoryJoinRow[] = [
      { id: "i1", product_type_slug: "glue-stick", quantity: 5, condition: "new", provenance_id: "p3" },
    ];
    const inputs = deriveBasketInputs(
      derivationArgs({ merge: computeMergePlan(rows, inventory) }),
    );
    expect(inputs.items).toHaveLength(0);
    expect(inputs.coveredLineKeys).toEqual(["glue-stick|*|*|*"]);
    expect(inputs.optionalLineKeysExcluded).toEqual(["crayons|*|*|*"]);
  });
});
