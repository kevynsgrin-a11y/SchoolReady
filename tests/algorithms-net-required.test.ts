/**
 * net_required_i = max(0, sum_child(required_qty) - usable_inventory
 *                         - replenishment_reserve)
 *
 * Hand-computed expected values (documented in handoff 05 §6):
 *  - glue-stick: children need 12 + 8 = 20 (non-shareable -> sum).
 *      inventory: 4 new (4x1.0=4.0) + 3 usable (3x0.5=1.5) + 2 worn_out (0)
 *                 = 5.5 usable units (condition-weighted)
 *      reserve: 2 (labeled fixture assumption)
 *      net = max(0, 20 - 5.5 - 2) = 12.5 -> unitsToBuy = ceil(12.5) = 13
 *  - pencil-sharpener (shareable): gross = max(1, 1) = 1;
 *      inventory 1 usable = 0.5 -> net = 0.5 -> unitsToBuy = 1
 *  - crayons: required 2, inventory 3 new = 3.0 -> net = max(0, 2-3) = 0
 *
 * All inputs are hand-constructed test data; no real household or price.
 */
import { describe, expect, it } from "vitest";
import {
  computeNetRequired,
  CONDITION_FACTORS,
  mergeKey,
  partitionMergeInputs,
  requiredSpendLines,
  type InventoryItemInput,
  type MemberRequirementInput,
} from "../src/algorithms/net-required";

const req = (
  overrides: Partial<MemberRequirementInput>,
): MemberRequirementInput => ({
  memberOrdinal: 1,
  productTypeSlug: "glue-stick",
  dimensions: null,
  rulingStyle: null,
  color: null,
  requiredUnits: 12,
  shareable: false,
  optionality: "required",
  provenanceIds: ["prov:test:req"],
  ...overrides,
});

const inv = (overrides: Partial<InventoryItemInput>): InventoryItemInput => ({
  productTypeSlug: "glue-stick",
  dimensions: null,
  rulingStyle: null,
  color: null,
  quantity: 1,
  condition: "new",
  provenanceIds: ["prov:test:inv"],
  ...overrides,
});

describe("net-required — condition-weighted formula (hand-computed)", () => {
  it("condition factors are the documented model constants", () => {
    expect(CONDITION_FACTORS).toEqual({ new: 1.0, usable: 0.5, worn_out: 0.0 });
  });

  it("glue-stick: 20 gross - 5.5 usable - 2 reserve = 12.5 -> buy 13", () => {
    const lines = computeNetRequired(
      [
        req({ memberOrdinal: 1, requiredUnits: 12 }),
        req({ memberOrdinal: 2, requiredUnits: 8 }),
      ],
      [
        inv({ quantity: 4, condition: "new" }),
        inv({ quantity: 3, condition: "usable" }),
        inv({ quantity: 2, condition: "worn_out" }),
      ],
      [{ productTypeSlug: "glue-stick", units: 2, basis: "fixture_assumption" }],
    );
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line.grossRequiredUnits).toBe(20);
    expect(line.usableInventoryUnits).toBe(5.5);
    expect(line.reserveUnits).toBe(2);
    expect(line.netRequiredUnits).toBe(12.5);
    expect(line.unitsToBuy).toBe(13);
    expect(line.perMember).toEqual([
      { memberOrdinal: 1, requiredUnits: 12 },
      { memberOrdinal: 2, requiredUnits: 8 },
    ]);
    // §1.4: provenance union covers requirement AND inventory lineage.
    expect(line.provenanceIds).toEqual(["prov:test:inv", "prov:test:req"]);
  });

  it("shareable: gross is the max across members, not the sum", () => {
    const lines = computeNetRequired(
      [
        req({
          memberOrdinal: 1,
          productTypeSlug: "pencil-sharpener",
          requiredUnits: 1,
          shareable: true,
        }),
        req({
          memberOrdinal: 2,
          productTypeSlug: "pencil-sharpener",
          requiredUnits: 1,
          shareable: true,
        }),
      ],
      [inv({ productTypeSlug: "pencil-sharpener", quantity: 1, condition: "usable" })],
    );
    const line = lines[0]!;
    expect(line.shareable).toBe(true);
    expect(line.grossRequiredUnits).toBe(1); // max(1, 1), not 2
    expect(line.netRequiredUnits).toBe(0.5); // 1 - 0.5
    expect(line.unitsToBuy).toBe(1);
  });

  it("mixed shareability sums conservatively and flags it", () => {
    const lines = computeNetRequired(
      [
        req({ memberOrdinal: 1, requiredUnits: 2, shareable: true }),
        req({ memberOrdinal: 2, requiredUnits: 3, shareable: false }),
      ],
      [],
    );
    const line = lines[0]!;
    expect(line.shareable).toBe(false);
    expect(line.mixedShareability).toBe(true);
    expect(line.grossRequiredUnits).toBe(5);
  });

  it("inventory beyond need clamps at zero (never negative)", () => {
    const lines = computeNetRequired(
      [req({ productTypeSlug: "crayons", requiredUnits: 2 })],
      [inv({ productTypeSlug: "crayons", quantity: 3, condition: "new" })],
    );
    expect(lines[0]!.netRequiredUnits).toBe(0);
    expect(lines[0]!.unitsToBuy).toBe(0);
  });

  it("distinct dimensions never merge (handoff 04 §8)", () => {
    const lines = computeNetRequired(
      [
        req({ productTypeSlug: "binder", dimensions: "1 in", requiredUnits: 1 }),
        req({
          memberOrdinal: 2,
          productTypeSlug: "binder",
          dimensions: "1.5 in",
          requiredUnits: 1,
        }),
      ],
      [],
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.key)).toEqual([
      mergeKey("binder", "1 in", null, null),
      mergeKey("binder", "1.5 in", null, null),
    ]);
  });

  it("inventory offsets only on exact key match — wildcards would guess (§1.5)", () => {
    const lines = computeNetRequired(
      [req({ productTypeSlug: "folder", color: "red", requiredUnits: 2 })],
      [inv({ productTypeSlug: "folder", color: null, quantity: 5, condition: "new" })],
    );
    expect(lines[0]!.usableInventoryUnits).toBe(0); // color-null stock not assumed red
    expect(lines[0]!.unitsToBuy).toBe(2);
  });

  it("optional-only groups stay optional and never inflate required spend", () => {
    const lines = computeNetRequired(
      [
        req({ requiredUnits: 12 }),
        req({
          memberOrdinal: 2,
          productTypeSlug: "hand-sanitizer",
          requiredUnits: 1,
          optionality: "optional",
        }),
      ],
      [],
    );
    expect(lines.find((l) => l.productTypeSlug === "hand-sanitizer")?.optionality).toBe(
      "optional",
    );
    const spend = requiredSpendLines(lines);
    expect(spend.map((l) => l.productTypeSlug)).toEqual(["glue-stick"]);
  });

  it("a group with any required member is required", () => {
    const lines = computeNetRequired(
      [
        req({ requiredUnits: 2, optionality: "optional" }),
        req({ memberOrdinal: 2, requiredUnits: 2, optionality: "required" }),
      ],
      [],
    );
    expect(lines[0]!.optionality).toBe("required");
  });

  it("rejects non-integer or non-positive required units", () => {
    expect(() => computeNetRequired([req({ requiredUnits: 0 })], [])).toThrow(RangeError);
    expect(() => computeNetRequired([req({ requiredUnits: 1.5 })], [])).toThrow(RangeError);
  });
});

describe("net-required — §1.5 pre-merge gate", () => {
  it("null slug and review-pending items are suppressed, never merged", () => {
    const items = [
      { productTypeSlug: null, needsReview: true, label: "bare glue" },
      { productTypeSlug: "glue-stick", needsReview: true, label: "conflicting qty" },
      { productTypeSlug: "glue-stick", needsReview: false, label: "confirmed" },
    ];
    const { eligible, suppressed } = partitionMergeInputs(items);
    expect(eligible.map((i) => i.label)).toEqual(["confirmed"]);
    expect(suppressed.map((s) => s.reason)).toEqual([
      "unresolved_product_variant",
      "unresolved_product_variant",
    ]);
  });
});
