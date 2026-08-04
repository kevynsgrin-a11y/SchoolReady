/**
 * Renders a parsed requirement draft back to canonical list phrasing.
 *
 * This is the round-trip half of the hard-constraint guarantee (brief SS4
 * Phase 3): parse -> render -> parse must reproduce the same structure, so
 * "2 boxes #2 pencils, sharpened" can never silently lose its meaning. The
 * review payload also uses this as the human-readable interpretation the
 * user confirms against.
 */
import { constraintPhrase } from "../contracts/constraint";
import { getBrandEntry, getLexiconEntry } from "./lexicon";
import type { ParsedRequirementDraft } from "./types";

const RULING_PHRASES: Readonly<Record<string, string>> = {
  wide_ruled: "wide ruled",
  college_ruled: "college ruled",
  primary_ruled: "primary ruled",
  dotted: "dotted",
  unruled: "unruled",
  // graph is implied by the graph-paper product type; rendering the bare
  // word would double-parse, so it is deliberately omitted here.
};

function renderDimensions(dimensions: string): string {
  const inch = /^([\d.]+) in$/.exec(dimensions);
  if (inch) return `${inch[1]}-inch`;
  const pair = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?) in$/.exec(dimensions);
  if (pair) return `${pair[1]}x${pair[2]} inch`;
  return dimensions; // "8 oz", "gallon", "quart", ...
}

/**
 * Canonical, re-parseable phrasing for a draft. Returns a review prompt for
 * unresolved items (null slug) instead of pretending to know the product.
 */
export function renderRequirementText(draft: ParsedRequirementDraft): string {
  if (draft.productTypeSlug === null) {
    return "Unrecognized item: needs your review";
  }
  const entry = getLexiconEntry(draft.productTypeSlug);
  const productName = entry ? entry.displayName : draft.productTypeSlug;

  const parts: string[] = [String(draft.quantity)];
  if (draft.unit !== "each") {
    parts.push(
      draft.packCount !== null
        ? `${draft.unit} of ${draft.packCount}`
        : draft.unit,
    );
  } else if (draft.packCount !== null) {
    parts.push(`pack of ${draft.packCount}`);
  }
  if (draft.dimensions !== null) parts.push(renderDimensions(draft.dimensions));
  if (draft.material !== null) parts.push(draft.material);
  if (draft.color !== null && draft.color !== "assorted") parts.push(draft.color);
  if (draft.color === "assorted") parts.push("assorted");
  if (draft.rulingStyle !== null) {
    const phrase = RULING_PHRASES[draft.rulingStyle];
    if (phrase) parts.push(phrase);
  }
  if (draft.requiredBrandSlug !== null && draft.brandRequirement !== "generic_allowed") {
    const brand = getBrandEntry(draft.requiredBrandSlug);
    const name = brand ? brand.displayName : draft.requiredBrandSlug;
    parts.push(draft.brandRequirement === "required" ? `${name} only` : name);
  }
  parts.push(productName);

  let text = parts.join(" ");
  for (const code of draft.prohibitedSubstitutions) {
    text += `, ${constraintPhrase(code)}`;
  }
  if (draft.optionality === "optional") text += ", optional";
  return text;
}
