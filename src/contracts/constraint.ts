/**
 * Hard-constraint controlled vocabulary (Phase 3, parser-engineer).
 *
 * Discharges the open obligation from handoff 02 SS7 / handoff 03 SS8:
 * `requirements.prohibited_substitutions` is a JSON TEXT column that SQLite
 * cannot CHECK-constrain, so the controlled vocabulary is enforced here in
 * code — only codes from CONSTRAINT_CODES may ever be persisted, never raw
 * list prose. sanitizeProhibitedSubstitutions() is the write-time gate.
 *
 * Meaning survives as structure (brief SS4 Phase 3): "sharpened",
 * "heavy-duty", "no Bluetooth" become codes, and every code renders back
 * through its canonical `phrase`, so a hard constraint is never silently
 * normalized away. Two kinds:
 *  - required_attribute: substitutes lacking the attribute are prohibited
 *    ('presharpened_required', 'wired_required').
 *  - prohibited_substitution: a named substitute class is banned
 *    ('no_bluetooth', 'no_rolling_backpacks').
 */

export const CONSTRAINT_KINDS = [
  "required_attribute",
  "prohibited_substitution",
] as const;
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

export interface ConstraintDef {
  readonly code: string;
  readonly kind: ConstraintKind;
  /**
   * Canonical human-readable phrase. The parser recognizes it and the
   * renderer emits it, so parse -> render -> parse is stable (round-trip
   * tests in tests/parsing-roundtrip.test.ts).
   */
  readonly phrase: string;
}

export const CONSTRAINT_DEFS = [
  { code: "presharpened_required", kind: "required_attribute", phrase: "pre-sharpened" },
  { code: "heavy_duty_required", kind: "required_attribute", phrase: "heavy-duty" },
  { code: "wired_required", kind: "required_attribute", phrase: "wired" },
  { code: "washable_required", kind: "required_attribute", phrase: "washable" },
  { code: "low_odor_required", kind: "required_attribute", phrase: "low-odor" },
  { code: "unscented_required", kind: "required_attribute", phrase: "unscented" },
  { code: "solid_colors_required", kind: "required_attribute", phrase: "solid colors only" },
  { code: "blunt_tip_required", kind: "required_attribute", phrase: "blunt-tip" },
  { code: "pointed_tip_required", kind: "required_attribute", phrase: "pointed-tip" },
  { code: "prongs_required", kind: "required_attribute", phrase: "with prongs" },
  { code: "pockets_required", kind: "required_attribute", phrase: "with pockets" },
  { code: "over_ear_required", kind: "required_attribute", phrase: "over-ear" },
  { code: "no_bluetooth", kind: "prohibited_substitution", phrase: "no bluetooth" },
  { code: "no_wireless", kind: "prohibited_substitution", phrase: "no wireless" },
  { code: "no_earbuds", kind: "prohibited_substitution", phrase: "no earbuds" },
  { code: "no_rolling_backpacks", kind: "prohibited_substitution", phrase: "no rolling backpacks" },
  { code: "no_character_prints", kind: "prohibited_substitution", phrase: "no character prints" },
  { code: "no_liquid_glue", kind: "prohibited_substitution", phrase: "no liquid glue" },
  { code: "no_mechanical_pencils", kind: "prohibited_substitution", phrase: "no mechanical pencils" },
  { code: "no_spiral_notebooks", kind: "prohibited_substitution", phrase: "no spiral notebooks" },
  { code: "no_trapper_keepers", kind: "prohibited_substitution", phrase: "no trapper keepers" },
  { code: "no_gel_pens", kind: "prohibited_substitution", phrase: "no gel pens" },
  { code: "no_permanent_markers", kind: "prohibited_substitution", phrase: "no permanent markers" },
] as const satisfies readonly ConstraintDef[];

export type ConstraintCode = (typeof CONSTRAINT_DEFS)[number]["code"];

export const CONSTRAINT_CODES: readonly ConstraintCode[] = CONSTRAINT_DEFS.map(
  (d) => d.code,
);

const DEFS_BY_CODE: ReadonlyMap<string, ConstraintDef> = new Map(
  CONSTRAINT_DEFS.map((d) => [d.code, d]),
);

export function isConstraintCode(value: string): value is ConstraintCode {
  return DEFS_BY_CODE.has(value);
}

/** Canonical render phrase for a code (round-trip anchor). */
export function constraintPhrase(code: ConstraintCode): string {
  return DEFS_BY_CODE.get(code)!.phrase;
}

export class ConstraintSanitizationError extends Error {
  constructor(offender: string) {
    super(
      `prohibited_substitutions accepts controlled constraint codes only ` +
        `(src/contracts/constraint.ts CONSTRAINT_CODES) — never raw list ` +
        `prose. Rejected value: ${JSON.stringify(offender)}`,
    );
    this.name = "ConstraintSanitizationError";
  }
}

/**
 * Write-time sanitization gate (handoff 02 SS7). Throws on anything that is
 * not a known code — raw prose can never reach the JSON column. Deduplicates
 * and sorts for deterministic persistence.
 */
export function sanitizeProhibitedSubstitutions(
  values: readonly string[],
): ConstraintCode[] {
  const out = new Set<ConstraintCode>();
  for (const value of values) {
    if (!isConstraintCode(value)) throw new ConstraintSanitizationError(value);
    out.add(value);
  }
  return [...out].sort();
}
