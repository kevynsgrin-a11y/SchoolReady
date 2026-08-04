/**
 * Deterministic single-line parser: one (already PII-redacted) list line ->
 * structured requirement fields + per-field confidence + ambiguity flags.
 *
 * SS1.5 posture: extraction is conservative. Anything the parser cannot
 * identify becomes a review-forcing ambiguity flag (unrecognized_product,
 * ambiguous_product, multi_color_split_needed, unparsed_detail, ...) — the
 * proposal is downgraded, never guessed. Leftover-token analysis guarantees
 * no meaningful phrase is silently normalized away: if words survive every
 * extraction pass, the line is flagged `unparsed_detail` and routed to
 * review with its full (redacted) original text.
 */
import type {
  BrandRequirement,
  Durability,
  GradeLevel,
  Optionality,
  RequirementScope,
  RulingStyle,
  Subject,
  Unit,
} from "../contracts";
import type { ConstraintCode } from "../contracts/constraint";
import type { AmbiguityFlag } from "./types";
import { REVIEW_FORCING_FLAGS } from "./types";
import {
  AMBIGUOUS_PRODUCT_PATTERNS,
  BRAND_LEXICON,
  COLOR_WORDS,
  MATERIAL_WORDS,
  PRODUCT_LEXICON,
} from "./lexicon";
import type { LexiconEntry } from "./lexicon";
import { REDACTION_TOKEN_RE } from "./pii";

/** Extraction confidences (single source of truth for scoring semantics). */
export const CONFIDENCE = {
  explicit: 0.95,
  strong: 0.9,
  material: 0.85,
  brandBare: 0.7,
  defaultField: 0.8,
  derivedUnit: 0.6,
  durabilityDefault: 0.7,
  implicitQuantity: 0.55,
  conflicting: 0.4,
  unknown: 0.2,
} as const;

export interface ParsedLineCore {
  productTypeSlug: string | null;
  quantity: number;
  unit: Unit;
  packCount: number | null;
  dimensions: string | null;
  material: string | null;
  color: string | null;
  rulingStyle: RulingStyle | null;
  brandRequirement: BrandRequirement;
  requiredBrandSlug: string | null;
  durability: Durability | null;
  optionality: Optionality;
  prohibitedSubstitutions: ConstraintCode[];
  fieldConfidences: Record<string, number>;
  productCandidates: string[];
  ambiguityFlags: AmbiguityFlag[];
  needsReview: boolean;
}

export type LineParse =
  | { kind: "noise" }
  | { kind: "heading"; scope: RequirementScope }
  | { kind: "item"; item: ParsedLineCore };

const mask = (m: string): string => " ".repeat(m.length);

interface ConstraintMatcher {
  code: ConstraintCode;
  re: RegExp;
}

/** Prohibitions ("no X") run before bare attributes so phrases mask whole. */
const CONSTRAINT_MATCHERS: readonly ConstraintMatcher[] = [
  { code: "no_liquid_glue", re: /\bno\s+liquid\s+glue\b/gi },
  { code: "no_mechanical_pencils", re: /\bno\s+mechanical(?:\s+pencils?)?\b/gi },
  { code: "no_spiral_notebooks", re: /\bno\s+spirals?(?:\s+(?:note)?books?)?\b/gi },
  { code: "no_trapper_keepers", re: /\bno\s+trapper\s+keepers?\b/gi },
  { code: "no_gel_pens", re: /\bno\s+gel(?:\s+pens?)?\b/gi },
  { code: "no_permanent_markers", re: /\bno\s+permanent(?:\s+markers?)?\b/gi },
  { code: "no_character_prints", re: /\bno\s+(?:characters?|cartoons?)(?:\s+prints?)?\b/gi },
  { code: "no_rolling_backpacks", re: /\bno\s+(?:rolling(?:\s+backpacks?)?|wheels)\b|\bwithout\s+wheels\b/gi },
  { code: "no_earbuds", re: /\bno\s+earbuds?\b/gi },
  { code: "no_bluetooth", re: /\bno\s+bluetooth\b/gi },
  { code: "no_wireless", re: /\bno\s+wireless\b/gi },
  { code: "solid_colors_required", re: /\b(?:solid|plain)\s+colou?rs?\s+only\b|\bno\s+patterns?\b/gi },
  { code: "presharpened_required", re: /\b(?:pre[-\s]?)?sharpened\b/gi },
  { code: "heavy_duty_required", re: /\bheavy[-\s]?duty\b/gi },
  { code: "wired_required", re: /\bwired\b/gi },
  { code: "washable_required", re: /\bwashable\b/gi },
  { code: "low_odor_required", re: /\blow[-\s]?odou?r\b/gi },
  { code: "unscented_required", re: /\bunscented\b|\bno\s+scents?\b/gi },
  { code: "blunt_tip_required", re: /\b(?:blunt|dull|safety)[-\s]?tip(?:ped)?\b/gi },
  { code: "pointed_tip_required", re: /\bpointed[-\s]?tip(?:ped)?\b|\bpointed\s+scissors\b/gi },
  { code: "prongs_required", re: /\bwith\s+prongs?\b|\b3[-\s]?prong(?:ed)?\b/gi },
  { code: "pockets_required", re: /\bwith\s+pockets?\b|\b2[-\s]?pockets?\b/gi },
  { code: "over_ear_required", re: /\bover[-\s](?:the[-\s])?ear\b/gi },
];

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const UNIT_WORD_MAP: Readonly<Record<string, Unit>> = {
  box: "box", pack: "pack", pkg: "pack", pk: "pack", set: "set", pair: "pair",
  ream: "ream", dozen: "dozen", roll: "roll", bottle: "bottle",
  tube: "tube", container: "each", canister: "each", case: "pack",
};

const normalizeUnitWord = (word: string): Unit | undefined => {
  const key = word.toLowerCase().replace(/e?s$/, "");
  return UNIT_WORD_MAP[key];
};

const STOPWORDS = new Set([
  "a", "an", "the", "of", "for", "with", "and", "or", "to", "in", "on", "at",
  "per", "each", "please", "thanks", "thank", "you", "your", "only", "any",
  "brand", "brands", "preferred", "prefer", "kind", "type", "new", "needed",
  "need", "is", "are", "be", "fine", "ok", "okay", "either", "item", "items",
  "ink", "class", "supply", "supplies", "list", "all", "will", "that",
]);

const GRADE_HEADING_RE =
  /^\s*(?:grade\s+(k|[1-8])\b|([1-8])\s*(?:st|nd|rd|th)[-\s]+grade\b|(kindergarten)\b)/i;

const SUBJECT_HEADING_RE =
  /^\s*(art|math|science|music|pe|gym|technology|computers?|reading|ela|social\s+studies|spanish|french)\s*(?:class)?\s*:?\s*$/i;

const SUBJECT_MAP: Readonly<Record<string, Subject>> = {
  art: "art", math: "math", science: "science", music: "music", pe: "pe",
  gym: "pe", technology: "technology", computer: "technology",
  computers: "technology", reading: "ela", ela: "ela",
  "social studies": "social_studies", spanish: "world_language",
  french: "world_language",
};

function detectHeading(line: string): RequirementScope | null {
  const grade = GRADE_HEADING_RE.exec(line);
  if (grade) {
    const raw = grade[3] ? "K" : (grade[1] ?? grade[2] ?? "K").toUpperCase();
    return {
      type: "grade",
      grade: raw as GradeLevel,
      subject: null,
      slot: null,
    };
  }
  const subject = SUBJECT_HEADING_RE.exec(line);
  if (subject) {
    const key = subject[1]!.toLowerCase().replace(/\s+/g, " ");
    const mapped = SUBJECT_MAP[key];
    if (mapped) return { type: "subject", grade: null, subject: mapped, slot: null };
  }
  return null;
}

interface DimensionRule {
  re: RegExp;
  toValue(m: RegExpExecArray): string;
}

/** "1.50" -> "1.5", "09" -> "9" (canonical numeric text). */
const trimNum = (raw: string): string => String(Number.parseFloat(raw));

const DIMENSION_RULES: readonly DimensionRule[] = [
  {
    re: /(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*[-\s]?(?:inch(?:es)?|in\b\.?|")?/i,
    toValue: (m) => `${trimNum(m[1]!)}x${trimNum(m[2]!)} in`,
  },
  {
    re: /\b(\d)\s+(\d)\s*\/\s*(\d)\s*[-\s]?(?:inch(?:es)?|in\b\.?|")/i,
    toValue: (m) => `${Number(m[1]) + Number(m[2]) / Number(m[3])} in`,
  },
  {
    re: /\b(\d)\s*\/\s*(\d)\s*[-\s]?(?:inch(?:es)?|in\b\.?|")/i,
    toValue: (m) => `${Number(m[1]) / Number(m[2])} in`,
  },
  {
    re: /\b(one|two|three)[-\s]inch(?:es)?\b/i,
    toValue: (m) => `${NUMBER_WORDS[m[1]!.toLowerCase()]} in`,
  },
  {
    re: /(\d+(?:\.\d+)?)\s*[-\s]?(?:inch(?:es)?|in\b\.?|")/i,
    toValue: (m) => `${trimNum(m[1]!)} in`,
  },
  {
    re: /(\d+(?:\.\d+)?)\s*[-\s]?(?:oz\b\.?|ounces?\b)/i,
    toValue: (m) => `${trimNum(m[1]!)} oz`,
  },
  {
    re: /\b(gallon|quart|sandwich|snack)(?:[-\s]?sized?)?\b/i,
    toValue: (m) => m[1]!.toLowerCase(),
  },
];

interface ProductMatch {
  start: number;
  length: number;
  entry: LexiconEntry;
}

function findProductMatches(work: string): ProductMatch[] {
  const out: ProductMatch[] = [];
  for (const entry of PRODUCT_LEXICON) {
    const m = entry.pattern.exec(work);
    if (m) out.push({ start: m.index, length: m[0].length, entry });
  }
  return out;
}

function pickWinner(matches: ProductMatch[]): ProductMatch | null {
  let winner: ProductMatch | null = null;
  for (const m of matches) {
    if (
      !winner ||
      m.start < winner.start ||
      (m.start === winner.start && m.length > winner.length)
    ) {
      winner = m;
    }
  }
  return winner;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Parse one redacted line. `stripBulletsOnly` lines that are blank, heading,
 * or list boilerplate come back as heading/noise (counted, never guessed
 * into items).
 */
export function parseLine(rawLine: string): LineParse {
  // Bullet / numbering prefixes.
  let work = rawLine.replace(/^\s*(?:[-*+•·●]+|\d{1,2}[.)])\s+/, mask);
  if (work.trim().length === 0) return { kind: "noise" };

  const heading = detectHeading(work);
  if (heading) return { kind: "heading", scope: heading };

  const flags = new Set<AmbiguityFlag>();
  const conf: Record<string, number> = {};
  const constraints = new Set<ConstraintCode>();

  // 1. Hard constraints (before product scan so "no X" phrases mask whole).
  for (const { code, re } of CONSTRAINT_MATCHERS) {
    work = work.replace(re, (m) => {
      constraints.add(code);
      return mask(m);
    });
  }

  // 2. Product dimensions ("1.5-inch", "9x12 in", "8 oz", "gallon").
  let dimensions: string | null = null;
  for (const rule of DIMENSION_RULES) {
    const m = rule.re.exec(work);
    if (m) {
      dimensions = rule.toValue(m);
      work = work.slice(0, m.index) + mask(m[0]) + work.slice(m.index + m[0].length);
      conf["dimensions"] = CONFIDENCE.strong;
      break;
    }
  }

  // 3. Pack size: "box of 24" (unit + packCount) and "(24 count)".
  let unit: Unit | null = null;
  let packCount: number | null = null;
  let packFromCount = false;
  const ofMatch =
    /\b(boxes|box|packs|pack|pkgs|pkg|sets|set|cases|case)\s+of\s+(\d{1,4})\b(?!\s*(?:x|\.\d))/i.exec(work);
  if (ofMatch) {
    unit = normalizeUnitWord(ofMatch[1]!) ?? "pack";
    packCount = Number(ofMatch[2]);
    conf["packCount"] = CONFIDENCE.strong;
    conf["unit"] = CONFIDENCE.strong;
    work = work.slice(0, ofMatch.index) + mask(ofMatch[0]) + work.slice(ofMatch.index + ofMatch[0].length);
  } else {
    // "(24 count)" / "24 ct" — and hyphenated "4-pack" (unambiguous pack
    // size; the unhyphenated "4 pack" is NOT assumed and falls to leftover
    // analysis -> review, never a guess).
    const countMatch =
      /\(?\b(\d{1,4})[-\s]?(?:count|ct)\b\.?\)?/i.exec(work) ??
      /\b(\d{1,4})-(?:pack|pk)\b/i.exec(work);
    if (countMatch) {
      packCount = Number(countMatch[1]);
      packFromCount = true;
      conf["packCount"] = CONFIDENCE.strong;
      work = work.slice(0, countMatch.index) + mask(countMatch[0]) + work.slice(countMatch.index + countMatch[0].length);
    }
  }

  // 4. Optionality.
  const optionalRe =
    /\boptional\b:?|\bif\s+possible\b|\bdonations?\b|\bappreciated\b|\bnot\s+required\b|\bvoluntary\b/gi;
  const isOptional = optionalRe.test(work);
  if (isOptional) {
    optionalRe.lastIndex = 0;
    work = work.replace(optionalRe, mask);
  }
  const optionality: Optionality = isOptional ? "optional" : "required";
  conf["optionality"] = isOptional ? CONFIDENCE.strong : CONFIDENCE.defaultField;

  // 5. Quantity (+ leading unit word). Missing quantity is the implicit-one
  // list convention: flagged for the mandatory review, confidence lowered.
  let quantity: number | null = null;
  let explicitQty = false;
  const leadDigit = /^\s*\(?(\d{1,3})\)?\s+/.exec(work);
  const leadWord = /^\s*(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|an|a)\b\s*/i.exec(work);
  if (leadDigit) {
    quantity = Number(leadDigit[1]);
    explicitQty = true;
    work = work.slice(0, leadDigit.index) + mask(leadDigit[0]) + work.slice(leadDigit.index + leadDigit[0].length);
  } else if (leadWord) {
    quantity = NUMBER_WORDS[leadWord[1]!.toLowerCase()]!;
    explicitQty = true;
    work = work.slice(0, leadWord.index) + mask(leadWord[0]) + work.slice(leadWord.index + leadWord[0].length);
  }
  const paren = /\((\d{1,3})\)/.exec(work);
  if (paren) {
    const parenQty = Number(paren[1]);
    if (quantity === null) {
      quantity = parenQty;
      explicitQty = true;
    } else if (parenQty !== quantity) {
      flags.add("conflicting_quantities");
    }
    work = work.slice(0, paren.index) + mask(paren[0]) + work.slice(paren.index + paren[0].length);
  }
  if (unit === null) {
    const unitMatch = /^\s*(boxes|box|packs|pack|pkgs|pkg|pks|pk|sets|set|pairs|pair|reams|ream|dozens|dozen|rolls|roll|bottles|bottle|tubes|tube|containers|container|canisters|canister)\b(?:\s+of\b)?\s*/i.exec(work);
    if (unitMatch && explicitQty) {
      unit = normalizeUnitWord(unitMatch[1]!) ?? null;
      if (unit) conf["unit"] = CONFIDENCE.strong;
      work = work.slice(0, unitMatch.index) + mask(unitMatch[0]) + work.slice(unitMatch.index + unitMatch[0].length);
    }
  }
  if (flags.has("conflicting_quantities")) {
    conf["quantity"] = CONFIDENCE.conflicting;
  } else if (explicitQty) {
    conf["quantity"] = CONFIDENCE.explicit;
  } else {
    quantity = 1;
    flags.add("quantity_implicit_one");
    conf["quantity"] = CONFIDENCE.implicitQuantity;
  }

  // 6. Product identification (earliest match wins; ties -> longest).
  const brandSpans = [...BRAND_LEXICON.flatMap((b) =>
    [...work.matchAll(b.pattern)].map((m) => ({
      slug: b.slug,
      start: m.index!,
      length: m[0].length,
    })),
  )];
  const matches = findProductMatches(work);
  const winner = pickWinner(matches);
  let entry: LexiconEntry | null = null;
  const candidates: string[] = [];
  if (winner) {
    entry = winner.entry;
    conf["product"] = winner.entry.matchConfidence;
    work = work.slice(0, winner.start) + " ".repeat(winner.length) + work.slice(winner.start + winner.length);
    // A second, distinct product on the same line?
    const second = pickWinner(
      findProductMatches(work).filter((m) => m.entry.slug !== winner.entry.slug),
    );
    if (second) {
      work = work.slice(0, second.start) + " ".repeat(second.length) + work.slice(second.start + second.length);
      if (/\bor\b/i.test(rawLine)) {
        flags.add("ambiguous_product");
        candidates.push(winner.entry.slug, second.entry.slug);
        entry = null;
        conf["product"] = CONFIDENCE.unknown;
      } else {
        flags.add("multiple_products");
        candidates.push(winner.entry.slug, second.entry.slug);
      }
    }
  } else {
    const ambiguous = AMBIGUOUS_PRODUCT_PATTERNS.find((p) => p.pattern.test(work));
    if (ambiguous) {
      flags.add("ambiguous_product");
      candidates.push(...ambiguous.candidates);
      conf["product"] = CONFIDENCE.unknown;
      work = work.replace(new RegExp(ambiguous.pattern.source, "gi"), mask);
    } else if (explicitQty) {
      flags.add("unrecognized_product");
      conf["product"] = CONFIDENCE.unknown;
    } else {
      // No quantity, no product, no heading: boilerplate/noise, skipped —
      // it stays visible to the user through the review payload counts.
      return { kind: "noise" };
    }
  }

  // 7. Brand and brand requirement.
  let brandRequirement: BrandRequirement = "generic_allowed";
  let requiredBrandSlug: string | null = null;
  for (const span of brandSpans) {
    work = work.slice(0, span.start) + " ".repeat(span.length) + work.slice(span.start + span.length);
  }
  const genericRe = /\bany\s+brand\b|\bor\s+similar\b|\bor\s+equivalent\b|\bgeneric\s+(?:is\s+)?(?:ok(?:ay)?|fine)\b/gi;
  const explicitGeneric = genericRe.test(work);
  work = work.replace(genericRe, mask);
  if (brandSpans.length > 0 && !explicitGeneric) {
    requiredBrandSlug = brandSpans[0]!.slug;
    const requiredRe = /\bonly\b|\bno\s+substitut\w*\b|\bmust\s+be\b|\bbrand\s+required\b/gi;
    if (requiredRe.test(work)) {
      brandRequirement = "required";
      conf["brandRequirement"] = CONFIDENCE.explicit;
      work = work.replace(requiredRe, mask);
    } else {
      brandRequirement = "preferred";
      conf["brandRequirement"] = CONFIDENCE.brandBare;
    }
    // Two DIFFERENT brands on one line ("Clorox or Lysol"): the meaning is a
    // brand choice, not one brand — propose the first, but route to review
    // (SS1.5) rather than silently dropping the alternative.
    if (new Set(brandSpans.map((s) => s.slug)).size > 1) {
      flags.add("multiple_brands");
      conf["brandRequirement"] = CONFIDENCE.conflicting;
    }
  } else {
    conf["brandRequirement"] = explicitGeneric ? CONFIDENCE.explicit : CONFIDENCE.defaultField;
  }

  // 8. Color. Multiple colors are NEVER merged: "or" between colors is a
  // permitted choice; otherwise the line needs a per-color split in review.
  let color: string | null = null;
  const assorted = /\bassorted(?:\s+colou?rs?)?\b/i.exec(work);
  if (assorted) {
    color = "assorted";
    conf["color"] = CONFIDENCE.strong;
    work = work.slice(0, assorted.index) + mask(assorted[0]) + work.slice(assorted.index + assorted[0].length);
  } else {
    const colorRe = new RegExp(`\\b(${COLOR_WORDS.join("|")})\\b`, "gi");
    const colorMatches = [...work.matchAll(colorRe)];
    if (colorMatches.length === 1) {
      color = colorMatches[0]![0].toLowerCase();
      conf["color"] = CONFIDENCE.strong;
    } else if (colorMatches.length > 1) {
      const between = work.slice(
        colorMatches[0]!.index! + colorMatches[0]![0].length,
        colorMatches[1]!.index!,
      );
      flags.add(/\bor\b/i.test(between) ? "color_choice" : "multi_color_split_needed");
      conf["color"] = CONFIDENCE.unknown;
    }
    work = work.replace(colorRe, mask);
  }

  // 9. Material.
  let material: string | null = null;
  const materialRe = new RegExp(`\\b(${MATERIAL_WORDS.join("|")})\\b`, "i");
  const materialMatch = materialRe.exec(work);
  if (materialMatch) {
    material = materialMatch[1]!.toLowerCase();
    conf["material"] = CONFIDENCE.material;
    work = work.slice(0, materialMatch.index) + mask(materialMatch[0]) + work.slice(materialMatch.index + materialMatch[0].length);
  }

  // 10. Ruling style.
  let rulingStyle: RulingStyle | null = null;
  const rulingRules: ReadonlyArray<[RegExp, RulingStyle]> = [
    [/\bwide[-\s]ruled?\b/gi, "wide_ruled"],
    [/\bcollege[-\s]ruled?\b/gi, "college_ruled"],
    [/\bprimary[-\s](?:ruled|journal)\b/gi, "primary_ruled"],
    [/\bdotted\b/gi, "dotted"],
    [/\bunruled\b/gi, "unruled"],
  ];
  for (const [re, style] of rulingRules) {
    if (re.test(work)) {
      rulingStyle = style;
      conf["rulingStyle"] = CONFIDENCE.strong;
      work = work.replace(re, mask);
      break;
    }
  }
  if (rulingStyle === null && entry?.slug === "graph-paper") {
    rulingStyle = "graph";
    conf["rulingStyle"] = CONFIDENCE.strong;
  }

  // 11. Unit resolution.
  let unitConf: number;
  if (unit !== null) {
    unitConf = conf["unit"] ?? CONFIDENCE.strong;
  } else if (packFromCount) {
    unit = "pack";
    unitConf = CONFIDENCE.derivedUnit;
  } else if (entry) {
    unit = entry.defaultUnit;
    unitConf = CONFIDENCE.derivedUnit;
  } else {
    unit = "each";
    unitConf = CONFIDENCE.unknown;
  }
  conf["unit"] = unitConf;

  // 12. Durability from the taxonomy default.
  const durability: Durability | null = entry ? entry.durability : null;
  conf["durability"] = entry ? CONFIDENCE.durabilityDefault : CONFIDENCE.unknown;

  if (constraints.size > 0) conf["constraints"] = CONFIDENCE.strong;

  // 13. Leftover analysis — nothing may be silently dropped (SS4 Phase 3).
  const leftover = work
    .replace(REDACTION_TOKEN_RE, " ")
    .replace(/[^A-Za-z\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  if (
    leftover.length > 0 &&
    !flags.has("unrecognized_product") &&
    !flags.has("ambiguous_product")
  ) {
    flags.add("unparsed_detail");
  }

  const ambiguityFlags = [...flags].sort();
  const needsReview = ambiguityFlags.some((f) => REVIEW_FORCING_FLAGS.includes(f));

  return {
    kind: "item",
    item: {
      productTypeSlug: entry ? entry.slug : null,
      quantity: quantity!,
      unit,
      packCount,
      dimensions,
      material,
      color,
      rulingStyle,
      brandRequirement,
      requiredBrandSlug,
      durability,
      optionality,
      prohibitedSubstitutions: [...constraints].sort(),
      fieldConfidences: Object.fromEntries(
        Object.entries(conf).map(([k, v]) => [k, round2(v)]),
      ),
      productCandidates: candidates,
      ambiguityFlags,
      needsReview,
    },
  };
}
