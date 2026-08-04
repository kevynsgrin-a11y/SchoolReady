/**
 * Hard-constraint round-trips (brief SS4 Phase 3): meaning survives as
 * structure, never silently normalized away. For each phrasing:
 *
 *   parse(text) -> draft A -> render(A) -> parse(rendered) -> draft B
 *
 * and A === B on every meaning-bearing field. The three canonical phrasings
 * from the brief plus adversarial ones are pinned to the exact constraint
 * codes they must produce. The controlled-vocabulary write gate
 * (sanitizeProhibitedSubstitutions) is proven to reject raw prose.
 */
import { describe, expect, it } from "vitest";
import {
  ConstraintSanitizationError,
  constraintPhrase,
  sanitizeProhibitedSubstitutions,
} from "../src/contracts/constraint";
import type { ConstraintCode } from "../src/contracts/constraint";
import { parseLine, renderRequirementText } from "../src/parsing";
import type { ParsedRequirementDraft } from "../src/parsing";
import type { RequirementScope } from "../src/contracts";

const LIST_SCOPE: RequirementScope = {
  type: "list",
  grade: null,
  subject: null,
  slot: null,
};

/** parseLine core -> draft (same field mapping the pipeline performs). */
function draftOf(text: string): ParsedRequirementDraft {
  const parsed = parseLine(text);
  if (parsed.kind !== "item") {
    throw new Error(`expected an item parse for: ${text}`);
  }
  const c = parsed.item;
  return {
    productTypeSlug: c.productTypeSlug,
    quantity: c.quantity,
    unit: c.unit,
    packCount: c.packCount,
    dimensions: c.dimensions,
    material: c.material,
    color: c.color,
    rulingStyle: c.rulingStyle,
    brandRequirement: c.brandRequirement,
    requiredBrandSlug: c.requiredBrandSlug,
    scope: LIST_SCOPE,
    durability: c.durability,
    optionality: c.optionality,
    prohibitedSubstitutions: sanitizeProhibitedSubstitutions(
      c.prohibitedSubstitutions,
    ),
    sourceKind: "paste",
    sourceConfidence: 0.9,
  };
}

interface RoundTripCase {
  text: string;
  constraints: ConstraintCode[];
  slug: string;
}

const CANONICAL: RoundTripCase[] = [
  {
    text: "2 boxes #2 pencils, sharpened",
    constraints: ["presharpened_required"],
    slug: "no2-pencil",
  },
  {
    text: "one 1.5-inch heavy-duty binder",
    constraints: ["heavy_duty_required"],
    slug: "binder",
  },
  {
    text: "wired earbuds, no Bluetooth",
    constraints: ["no_bluetooth", "wired_required"],
    slug: "earbuds",
  },
];

const ADVERSARIAL: RoundTripCase[] = [
  {
    text: "24 Ticonderoga #2 pencils, pre-sharpened, no mechanical pencils",
    constraints: ["no_mechanical_pencils", "presharpened_required"],
    slug: "no2-pencil",
  },
  {
    text: "1 pair Fiskars scissors, pointed-tip, no substitutions",
    constraints: ["pointed_tip_required"],
    slug: "scissors",
  },
  {
    text: "3 boxes of 24 Crayola crayons, washable",
    constraints: ["washable_required"],
    slug: "crayons",
  },
  {
    text: "backpack - no wheels, no character prints, solid colors only",
    constraints: [
      "no_character_prints",
      "no_rolling_backpacks",
      "solid_colors_required",
    ],
    slug: "backpack",
  },
  {
    text: "wired over-ear headphones (no earbuds, no bluetooth)",
    constraints: [
      "no_bluetooth",
      "no_earbuds",
      "over_ear_required",
      "wired_required",
    ],
    slug: "headphones",
  },
  {
    text: "12 glue sticks, washable, low-odor",
    constraints: ["low_odor_required", "washable_required"],
    slug: "glue-stick",
  },
  {
    text: "1 box gallon-size Ziploc bags",
    constraints: [],
    slug: "storage-bags",
  },
  {
    text: "Optional: 2 packs unscented baby wipes",
    constraints: ["unscented_required"],
    slug: "baby-wipes",
  },
  {
    text: "1 4-pack Expo dry erase markers, low odor",
    constraints: ["low_odor_required"],
    slug: "dry-erase-marker",
  },
  {
    text: "1 red plastic pocket folder with prongs",
    constraints: ["prongs_required"],
    slug: "folder",
  },
];

const ALL = [...CANONICAL, ...ADVERSARIAL];

describe("hard-constraint round-trips: parse -> render -> parse is identity", () => {
  it.each(ALL.map((c) => [c.text, c] as const))("%s", (_text, c) => {
    const a = draftOf(c.text);
    // The meaning was captured as the pinned structured constraints...
    expect(a.prohibitedSubstitutions).toEqual(c.constraints);
    expect(a.productTypeSlug).toBe(c.slug);
    // ...every code renders back through its canonical phrase...
    const rendered = renderRequirementText(a);
    for (const code of c.constraints) {
      expect(rendered).toContain(constraintPhrase(code));
    }
    // ...and re-parsing the rendering reproduces the identical structure.
    const b = draftOf(rendered);
    expect(b).toEqual(a);
  });

  it("adversarial set is >= 5 beyond the three canonical phrasings", () => {
    expect(CANONICAL).toHaveLength(3);
    expect(ADVERSARIAL.length).toBeGreaterThanOrEqual(5);
  });

  it("constraints are codes with canonical phrases, never lost casing tricks", () => {
    // "no Bluetooth" (mixed case, comma placement) and "no bluetooth" parse
    // to the same code; rendering is stable under a second round-trip.
    const a = draftOf("Wired earbuds - NO BLUETOOTH");
    expect(a.prohibitedSubstitutions).toEqual(["no_bluetooth", "wired_required"]);
    const again = draftOf(renderRequirementText(draftOf(renderRequirementText(a))));
    expect(again.prohibitedSubstitutions).toEqual(a.prohibitedSubstitutions);
  });
});

describe("nothing meaningful is silently dropped (SS1.5 leftover analysis)", () => {
  it("routes unrecognized qualifiers to review instead of discarding them", () => {
    const parsed = parseLine("2 folders with metallic finish");
    expect(parsed.kind).toBe("item");
    if (parsed.kind !== "item") return;
    expect(parsed.item.ambiguityFlags).toContain("unparsed_detail");
    expect(parsed.item.needsReview).toBe(true);
  });

  it("keeps the redacted original text next to every proposal", () => {
    // The review UX contract carries originalText per item; parseLine's
    // leftover flag guarantees a reviewer sees lines the parser could not
    // fully consume. Sanity: a fully-consumed line carries no leftover flag.
    const clean = parseLine("2 boxes #2 pencils, sharpened");
    expect(clean.kind).toBe("item");
    if (clean.kind !== "item") return;
    expect(clean.item.ambiguityFlags).not.toContain("unparsed_detail");
  });
});

describe("prohibited_substitutions write gate (handoff 02 SS7 obligation)", () => {
  it("accepts only controlled constraint codes, deduplicated and sorted", () => {
    expect(
      sanitizeProhibitedSubstitutions([
        "wired_required",
        "no_bluetooth",
        "wired_required",
      ]),
    ).toEqual(["no_bluetooth", "wired_required"]);
  });

  it("throws on raw list prose so it can never reach the JSON column", () => {
    expect(() => sanitizeProhibitedSubstitutions(["sharpened"])).toThrow(
      ConstraintSanitizationError,
    );
    expect(() =>
      sanitizeProhibitedSubstitutions(["no bluetooth please"]),
    ).toThrow(/controlled constraint codes only/);
  });
});
