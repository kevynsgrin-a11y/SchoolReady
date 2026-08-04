/**
 * SS1.5 — the parser proposes, the user confirms; ambiguity routes to human
 * review, never to a guess. Covers: ambiguous products (bare "glue"),
 * product-or-product choices, unrecognized products, conflicting quantities,
 * cross-line underspecified variant sizes, brand choices, and the mandatory
 * review payload every channel emits.
 */
import { describe, expect, it } from "vitest";
import { parseLine, parseManualIntake, parsePasteIntake } from "../src/parsing";
import { ManualEntryValidationError } from "../src/parsing";
import type { ReviewPayload } from "../src/parsing";

const clock = () => Date.parse("2026-08-04T12:00:00.000Z");
const paste = (text: string) =>
  parsePasteIntake({ intakeId: "review-test", text }, { clock });

describe("ambiguous items route to review — never guessed", () => {
  it('bare "glue" proposes candidates, not a product', () => {
    const outcome = paste("glue");
    expect(outcome.items).toHaveLength(1);
    const item = outcome.items[0]!;
    expect(item.needsReview).toBe(true);
    expect(item.ambiguityFlags).toContain("ambiguous_product");
    expect(item.draft.productTypeSlug).toBeNull();
    expect(item.productCandidates).toEqual(["glue-stick", "liquid-glue"]);
    // The review payload refuses to pretend it knows the product.
    const review = outcome.review.items[0]!;
    expect(review.proposed).toBeNull();
    expect(review.interpretation).toMatch(/needs your review/i);
    expect(review.needsReview).toBe(true);
  });

  it('"Pencil box or zipper pouch" is a choice the user must make', () => {
    const item = paste("Pencil box or zipper pouch").items[0]!;
    expect(item.needsReview).toBe(true);
    expect(item.draft.productTypeSlug).toBeNull();
    expect(item.productCandidates).toEqual(["pencil-box", "pencil-pouch"]);
  });

  it("an unrecognized product is flagged, not dropped and not invented", () => {
    const item = paste("2 robotics kits").items[0]!;
    expect(item.needsReview).toBe(true);
    expect(item.ambiguityFlags).toContain("unrecognized_product");
    expect(item.draft.productTypeSlug).toBeNull();
    expect(item.draft.quantity).toBe(2); // the explicit quantity is kept
    expect(item.fieldConfidences["product"]).toBeLessThanOrEqual(0.2);
  });

  it("conflicting quantities keep the lead value at low confidence + review", () => {
    const item = paste("2 folders (3)").items[0]!;
    expect(item.needsReview).toBe(true);
    expect(item.ambiguityFlags).toContain("conflicting_quantities");
    expect(item.draft.quantity).toBe(2);
    expect(item.fieldConfidences["quantity"]).toBeLessThanOrEqual(0.4);
  });

  it("a size-less line is ambiguous when the list distinguishes sizes elsewhere", () => {
    const outcome = paste("1 one-inch binder\n1 binder");
    const [sized, unsized] = outcome.items;
    expect(sized!.draft.dimensions).toBe("1 in");
    expect(sized!.needsReview).toBe(false);
    expect(unsized!.draft.dimensions).toBeNull();
    expect(unsized!.ambiguityFlags).toContain("underspecified_variant_size");
    expect(unsized!.needsReview).toBe(true);
  });

  it("two different brands on one line are a choice, not a silent pick", () => {
    const item = paste("3 containers of disinfecting wipes (Clorox or Lysol)")
      .items[0]!;
    expect(item.ambiguityFlags).toContain("multiple_brands");
    expect(item.needsReview).toBe(true);
    expect(item.fieldConfidences["brandRequirement"]).toBeLessThanOrEqual(0.4);
  });

  it("a color choice is highlighted but does not force review; a split does", () => {
    const choice = paste("1 blue or green plastic folder").items[0]!;
    expect(choice.ambiguityFlags).toContain("color_choice");
    expect(choice.needsReview).toBe(false);
    expect(choice.draft.color).toBeNull(); // never merged, never picked

    const split = paste("folders - 1 red, 1 blue").items[0]!;
    expect(split.ambiguityFlags).toContain("multi_color_split_needed");
    expect(split.needsReview).toBe(true);
    expect(split.draft.color).toBeNull();
  });

  it("noise lines are skipped and counted, never guessed into items", () => {
    const outcome = paste(
      "Please label everything\n2 glue sticks\nThank you for your support",
    );
    expect(outcome.items).toHaveLength(1);
    expect(outcome.items[0]!.draft.productTypeSlug).toBe("glue-stick");
    expect(outcome.review.skippedLineCount).toBe(2);
  });
});

describe("the review step is mandatory on every channel (SS1.5)", () => {
  const assertMandatory = (review: ReviewPayload) => {
    // Literal `true` in the type: there is no code path that emits false.
    const confirmed: true = review.requiresUserConfirmation;
    expect(confirmed).toBe(true);
    expect(review.parsedAt).toBe("2026-08-04T12:00:00.000Z");
  };

  it("paste intake emits a review payload with original text per item", () => {
    const outcome = paste("2 boxes #2 pencils, sharpened");
    assertMandatory(outcome.review);
    expect(outcome.review.items[0]!.originalText).toBe(
      "2 boxes #2 pencils, sharpened",
    );
    expect(outcome.review.items[0]!.interpretation).toBe(
      "2 box #2 pencils, pre-sharpened",
    );
    expect(outcome.review.itemsNeedingReview).toBe(0);
  });

  it("manual intake still requires confirmation despite structured entry", () => {
    const outcome = parseManualIntake(
      {
        intakeId: "manual-1",
        items: [{ productTypeSlug: "glue-stick", quantity: 4 }],
      },
      { clock },
    );
    assertMandatory(outcome.review);
    expect(outcome.items[0]!.needsReview).toBe(false);
    expect(outcome.items[0]!.draft.sourceConfidence).toBe(1);
  });

  it("overallConfidence is the MINIMUM item confidence (conservative)", () => {
    const outcome = paste("2 boxes #2 pencils, sharpened\nglue");
    const confidences = outcome.items.map((i) => i.draft.sourceConfidence);
    expect(outcome.review.overallConfidence).toBe(Math.min(...confidences));
  });
});

describe("manual entry validates against controlled vocabularies — throws, never guesses", () => {
  const opts = { clock };

  it("rejects an unknown product-type slug", () => {
    expect(() =>
      parseManualIntake(
        { intakeId: "m", items: [{ productTypeSlug: "mystery-item", quantity: 1 }] },
        opts,
      ),
    ).toThrow(ManualEntryValidationError);
  });

  it("rejects free-text dimensions (structural PII defense, SS1.7)", () => {
    expect(() =>
      parseManualIntake(
        {
          intakeId: "m",
          items: [
            {
              productTypeSlug: "binder",
              quantity: 1,
              dimensions: "fits a size 13.5 shoe",
            },
          ],
        },
        opts,
      ),
    ).toThrow(/free text is rejected/);
  });

  it("rejects colors and materials outside the controlled vocabulary", () => {
    expect(() =>
      parseManualIntake(
        {
          intakeId: "m",
          items: [{ productTypeSlug: "folder", quantity: 1, color: "chartreuse" }],
        },
        opts,
      ),
    ).toThrow(/controlled color vocabulary/);
    expect(() =>
      parseManualIntake(
        {
          intakeId: "m",
          items: [{ productTypeSlug: "folder", quantity: 1, material: "unobtainium" }],
        },
        opts,
      ),
    ).toThrow(/controlled material vocabulary/);
  });

  it("rejects a brand requirement without a brand", () => {
    expect(() =>
      parseManualIntake(
        {
          intakeId: "m",
          items: [
            { productTypeSlug: "crayons", quantity: 1, brandRequirement: "required" },
          ],
        },
        opts,
      ),
    ).toThrow(/requires requiredBrandSlug/);
  });

  it("rejects non-positive and non-integer quantities", () => {
    for (const quantity of [0, -1, 2.5]) {
      expect(() =>
        parseManualIntake(
          { intakeId: "m", items: [{ productTypeSlug: "crayons", quantity }] },
          opts,
        ),
      ).toThrow(/positive integer/);
    }
  });
});

describe("headings set scope without becoming items", () => {
  it("grade and subject headings scope the items after them", () => {
    const outcome = paste("3rd Grade\n2 glue sticks\nArt:\n1 art smock");
    expect(outcome.items).toHaveLength(2);
    expect(outcome.items[0]!.draft.scope).toEqual({
      type: "grade",
      grade: "3",
      subject: null,
      slot: null,
    });
    expect(outcome.items[1]!.draft.scope).toEqual({
      type: "subject",
      grade: null,
      subject: "art",
      slot: null,
    });
    expect(outcome.review.skippedLineCount).toBe(2);
  });

  it("kindergarten heading maps to grade K", () => {
    const parsed = parseLine("Kindergarten");
    expect(parsed).toEqual({
      kind: "heading",
      scope: { type: "grade", grade: "K", subject: null, slot: null },
    });
  });
});
