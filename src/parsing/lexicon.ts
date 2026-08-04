/**
 * Deterministic product-type and brand lexicon for text parsing.
 *
 * Selection rule (parse-line.ts): all patterns are matched against the
 * masked line; the EARLIEST match wins, ties broken by LONGEST match — so
 * "pencil-top erasers" beats "pencil" and "colored pencils" beats "pencils"
 * without a fragile priority order.
 *
 * Slugs are canonical taxonomy slugs (product_types.slug, Phase 1 schema).
 * Phase 5 resolves slug -> product_type_id at persistence time; entries
 * carry the taxonomy defaults (category/unit/durability) a Phase 5 seeder
 * needs so nothing here is a plausible fabrication of catalog data.
 */
import type { Durability, ProductCategory, Unit } from "../contracts";

export interface LexiconEntry {
  slug: string;
  /** Re-parseable display name (render.ts round-trip anchor). */
  displayName: string;
  category: ProductCategory;
  defaultUnit: Unit;
  durability: Durability;
  /** Match confidence when this pattern hits (specific > generic). */
  matchConfidence: number;
  pattern: RegExp;
}

export const PRODUCT_LEXICON: readonly LexiconEntry[] = [
  { slug: "no2-pencil", displayName: "#2 pencils", category: "writing", defaultUnit: "each", durability: "consumable", matchConfidence: 0.97, pattern: /(?:#\s?2|no\.?\s?2|number\s?2)\s+pencils?/i },
  { slug: "colored-pencil", displayName: "colored pencils", category: "art", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /colou?red\s+pencils?/i },
  { slug: "mechanical-pencil", displayName: "mechanical pencils", category: "writing", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /mechanical\s+pencils?/i },
  { slug: "pencil-top-eraser", displayName: "pencil-top erasers", category: "writing", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /pencil[-\s]top\s+erasers?/i },
  { slug: "pencil-box", displayName: "pencil box", category: "organization", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /pencil\s+(?:box(?:es)?|cases?)/i },
  { slug: "pencil-pouch", displayName: "pencil pouch", category: "organization", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /(?:pencil|zipper)\s+pouch(?:es)?/i },
  { slug: "pencil", displayName: "pencils", category: "writing", defaultUnit: "each", durability: "consumable", matchConfidence: 0.8, pattern: /\bpencils?\b/i },
  { slug: "crayons", displayName: "crayons", category: "art", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /\bcrayons?\b/i },
  { slug: "dry-erase-marker", displayName: "dry erase markers", category: "classroom_shared", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.97, pattern: /dry[-\s]erase\s+markers?/i },
  { slug: "permanent-marker", displayName: "permanent markers", category: "writing", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /permanent\s+markers?/i },
  { slug: "marker", displayName: "markers", category: "art", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.9, pattern: /\bmarkers?\b/i },
  { slug: "highlighter", displayName: "highlighters", category: "writing", defaultUnit: "each", durability: "consumable", matchConfidence: 0.95, pattern: /\bhighlighters?\b/i },
  { slug: "glue-stick", displayName: "glue sticks", category: "art", defaultUnit: "each", durability: "consumable", matchConfidence: 0.97, pattern: /glue\s+sticks?/i },
  { slug: "liquid-glue", displayName: "school glue", category: "art", defaultUnit: "bottle", durability: "consumable", matchConfidence: 0.93, pattern: /(?:school|liquid|white)\s+glue\b|glue\s+bottles?/i },
  { slug: "scissors", displayName: "scissors", category: "art", defaultUnit: "pair", durability: "durable", matchConfidence: 0.95, pattern: /\bscissors\b/i },
  { slug: "composition-notebook", displayName: "composition notebooks", category: "paper", defaultUnit: "each", durability: "consumable", matchConfidence: 0.97, pattern: /comp(?:osition)?\s+(?:note)?books?/i },
  { slug: "spiral-notebook", displayName: "spiral notebooks", category: "paper", defaultUnit: "each", durability: "consumable", matchConfidence: 0.97, pattern: /spiral\s+(?:note)?books?/i },
  { slug: "notebook", displayName: "notebooks", category: "paper", defaultUnit: "each", durability: "consumable", matchConfidence: 0.85, pattern: /\bnotebooks?\b/i },
  { slug: "filler-paper", displayName: "filler paper", category: "paper", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.93, pattern: /(?:filler|loose[-\s]?leaf|notebook)\s+paper/i },
  { slug: "copy-paper", displayName: "copy paper", category: "paper", defaultUnit: "ream", durability: "consumable", matchConfidence: 0.95, pattern: /(?:copy|printer)\s+paper/i },
  { slug: "construction-paper", displayName: "construction paper", category: "art", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /construction\s+paper/i },
  { slug: "graph-paper", displayName: "graph paper", category: "paper", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /graph\s+paper/i },
  { slug: "paper-towels", displayName: "paper towels", category: "hygiene", defaultUnit: "roll", durability: "consumable", matchConfidence: 0.95, pattern: /paper\s+towels?/i },
  { slug: "binder", displayName: "binder", category: "organization", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /(?:3[-\s]?ring\s+)?binders?/i },
  { slug: "binder-divider", displayName: "binder dividers", category: "organization", defaultUnit: "set", durability: "consumable", matchConfidence: 0.93, pattern: /(?:tab\s+)?dividers?/i },
  { slug: "sheet-protectors", displayName: "sheet protectors", category: "organization", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /sheet\s+protectors?/i },
  { slug: "folder", displayName: "pocket folders", category: "organization", defaultUnit: "each", durability: "consumable", matchConfidence: 0.9, pattern: /(?:pocket\s+)?folders?/i },
  { slug: "backpack", displayName: "backpack", category: "organization", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /backpacks?|book\s?bags?/i },
  { slug: "earbuds", displayName: "earbuds", category: "tech", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /\bearbuds?\b/i },
  { slug: "headphones", displayName: "headphones", category: "tech", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /\bhead\s?phones?\b/i },
  { slug: "calculator", displayName: "calculator", category: "tech", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /\bcalculators?\b/i },
  { slug: "facial-tissue", displayName: "tissues", category: "hygiene", defaultUnit: "box", durability: "consumable", matchConfidence: 0.93, pattern: /(?:facial\s+)?tissues?\b|kleenex/i },
  { slug: "hand-sanitizer", displayName: "hand sanitizer", category: "hygiene", defaultUnit: "bottle", durability: "consumable", matchConfidence: 0.95, pattern: /hand\s+sanitizer/i },
  { slug: "disinfecting-wipes", displayName: "disinfecting wipes", category: "hygiene", defaultUnit: "each", durability: "consumable", matchConfidence: 0.93, pattern: /(?:disinfecting|sanitizing|clorox|lysol)\s+wipes?/i },
  { slug: "baby-wipes", displayName: "baby wipes", category: "hygiene", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.93, pattern: /baby\s+wipes?/i },
  { slug: "storage-bags", displayName: "storage bags", category: "classroom_shared", defaultUnit: "box", durability: "consumable", matchConfidence: 0.9, pattern: /(?:zip[-\s]?loc[k]?|zip[-\s]?top|storage|plastic)\s+(?:freezer\s+)?bag(?:gie)?s?/i },
  { slug: "index-cards", displayName: "index cards", category: "paper", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.95, pattern: /index\s+cards?/i },
  { slug: "sticky-notes", displayName: "sticky notes", category: "paper", defaultUnit: "pack", durability: "consumable", matchConfidence: 0.93, pattern: /sticky\s+notes?|post[-\s]?it(?:\s+notes?)?/i },
  { slug: "eraser", displayName: "erasers", category: "writing", defaultUnit: "each", durability: "consumable", matchConfidence: 0.9, pattern: /\berasers?\b/i },
  { slug: "pen", displayName: "pens", category: "writing", defaultUnit: "each", durability: "consumable", matchConfidence: 0.88, pattern: /\bpens?\b/i },
  { slug: "ruler", displayName: "ruler", category: "other", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /\brulers?\b/i },
  { slug: "protractor", displayName: "protractor", category: "other", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /\bprotractors?\b/i },
  { slug: "watercolor-paints", displayName: "watercolor paints", category: "art", defaultUnit: "set", durability: "consumable", matchConfidence: 0.93, pattern: /water\s?colou?rs?(?:\s+paints?)?/i },
  { slug: "clipboard", displayName: "clipboard", category: "organization", defaultUnit: "each", durability: "durable", matchConfidence: 0.95, pattern: /\bclipboards?\b/i },
  { slug: "art-smock", displayName: "art smock", category: "clothing", defaultUnit: "each", durability: "durable", matchConfidence: 0.9, pattern: /art\s+smocks?|paint\s+shirts?/i },
];

const LEXICON_BY_SLUG: ReadonlyMap<string, LexiconEntry> = new Map(
  PRODUCT_LEXICON.map((e) => [e.slug, e]),
);

export function getLexiconEntry(slug: string): LexiconEntry | undefined {
  return LEXICON_BY_SLUG.get(slug);
}

/**
 * Product words that identify a line as an ITEM but not which item —
 * SS1.5: the parser proposes candidates and routes to review, never picks.
 */
export interface AmbiguousProductPattern {
  pattern: RegExp;
  candidates: readonly string[];
}
export const AMBIGUOUS_PRODUCT_PATTERNS: readonly AmbiguousProductPattern[] = [
  { pattern: /\bglue\b/i, candidates: ["glue-stick", "liquid-glue"] },
];

export interface BrandEntry {
  slug: string;
  displayName: string;
  pattern: RegExp;
}

/**
 * Brand lexicon. Genericized trademarks that read as product words in list
 * prose (ziploc, post-it) are deliberately product patterns above, not brand
 * hits. "kleenex" maps to the facial-tissue product AND this brand entry.
 */
export const BRAND_LEXICON: readonly BrandEntry[] = [
  { slug: "ticonderoga", displayName: "Ticonderoga", pattern: /\bticonderoga\b/gi },
  { slug: "crayola", displayName: "Crayola", pattern: /\bcrayola\b/gi },
  { slug: "elmers", displayName: "Elmer's", pattern: /\belmer'?s\b/gi },
  { slug: "expo", displayName: "Expo", pattern: /\bexpo\b/gi },
  { slug: "fiskars", displayName: "Fiskars", pattern: /\bfiskars\b/gi },
  { slug: "kleenex", displayName: "Kleenex", pattern: /\bkleenex\b/gi },
  { slug: "clorox", displayName: "Clorox", pattern: /\bclorox\b/gi },
  { slug: "lysol", displayName: "Lysol", pattern: /\blysol\b/gi },
  { slug: "sharpie", displayName: "Sharpie", pattern: /\bsharpie\b/gi },
  { slug: "bic", displayName: "Bic", pattern: /\bbic\b/gi },
  { slug: "papermate", displayName: "Paper Mate", pattern: /\bpaper\s?mate\b/gi },
  { slug: "five-star", displayName: "Five Star", pattern: /\bfive\s?star\b/gi },
  { slug: "mead", displayName: "Mead", pattern: /\bmead\b/gi },
];

export function getBrandEntry(slug: string): BrandEntry | undefined {
  return BRAND_LEXICON.find((b) => b.slug === slug);
}

/** Controlled color vocabulary (requirements.color values). */
export const COLOR_WORDS = [
  "assorted",
  "black",
  "blue",
  "brown",
  "gray",
  "green",
  "orange",
  "pink",
  "purple",
  "red",
  "white",
  "yellow",
] as const;

/** Controlled material vocabulary (requirements.material values). */
export const MATERIAL_WORDS = [
  "canvas",
  "clear",
  "fabric",
  "mesh",
  "nylon",
  "paper",
  "plastic",
  "poly",
  "vinyl",
] as const;
