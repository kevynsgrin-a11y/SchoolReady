/**
 * Multi-child merge + existing-inventory audit (§0 capability 2).
 *
 * Per merged line i:
 *   net_required_i = max(0, gross_required_i
 *                           - usable_inventory_i
 *                           - replenishment_reserve_i)
 * where
 *   gross_required_i = sum over children of required units   (non-shareable)
 *                    = max over children of required units   (shareable)
 *   usable_inventory_i = sum(quantity x condition factor) over EXACT-key
 *                        inventory matches (condition-weighted; wildcard
 *                        matching would be guessing — §1.5).
 *
 * Merge key: productTypeSlug | dimensions | rulingStyle | color. Distinct
 * dimensions are distinct requirements and never collapse (handoff 04 §8).
 * Items that still need review or have no resolved product type MUST NOT
 * enter the merge — partitionMergeInputs() routes them to suppression.
 */
import type { ItemCondition } from "../contracts/household";
import type { Optionality } from "../contracts/requirement";
import { round, unionProvenance, compareStrings } from "./types";

/** Condition weighting for the existing-inventory audit (model constants). */
export const CONDITION_FACTORS: Readonly<Record<ItemCondition, number>> = {
  new: 1.0,
  usable: 0.5,
  worn_out: 0.0,
};

export interface MemberRequirementInput {
  /** Anonymous member ordinal ("Child 1" is ordinal 1) — §1.7, never a name. */
  readonly memberOrdinal: number;
  readonly productTypeSlug: string;
  readonly dimensions: string | null;
  readonly rulingStyle: string | null;
  readonly color: string | null;
  /** quantity x (packCount ?? 1); positive integer. */
  readonly requiredUnits: number;
  /** true = one household pool serves every member (e.g. a shared home item). */
  readonly shareable: boolean;
  readonly optionality: Optionality;
  readonly provenanceIds: readonly string[];
}

export interface InventoryItemInput {
  readonly productTypeSlug: string;
  readonly dimensions: string | null;
  readonly rulingStyle: string | null;
  readonly color: string | null;
  readonly quantity: number;
  readonly condition: ItemCondition;
  readonly provenanceIds: readonly string[];
}

/** Replenishment reserve per product type (midyear re-buy buffer). */
export interface ReserveRule {
  readonly productTypeSlug: string;
  readonly units: number;
  /** Where the number came from — reserves are assumptions, never facts. */
  readonly basis: "model_constant" | "fixture_assumption" | "user_input";
}

export interface NetRequiredLine {
  readonly key: string;
  readonly productTypeSlug: string;
  readonly dimensions: string | null;
  readonly rulingStyle: string | null;
  readonly color: string | null;
  /** 'required' if ANY contributing member requires it; else 'optional'. */
  readonly optionality: Optionality;
  readonly shareable: boolean;
  /** true when members disagreed on shareability; summed conservatively. */
  readonly mixedShareability: boolean;
  readonly grossRequiredUnits: number;
  /** Condition-weighted; may be fractional. */
  readonly usableInventoryUnits: number;
  readonly reserveUnits: number;
  /** max(0, gross - usable - reserve); may be fractional. */
  readonly netRequiredUnits: number;
  /** ceil(netRequiredUnits) — what the basket actually shops for. */
  readonly unitsToBuy: number;
  readonly perMember: readonly {
    readonly memberOrdinal: number;
    readonly requiredUnits: number;
  }[];
  readonly provenanceIds: readonly string[];
}

export function mergeKey(
  productTypeSlug: string,
  dimensions: string | null,
  rulingStyle: string | null,
  color: string | null,
): string {
  const part = (v: string | null): string => v ?? "*";
  return `${productTypeSlug}|${part(dimensions)}|${part(rulingStyle)}|${part(color)}`;
}

/**
 * §1.5 pre-merge gate: unresolved or review-pending items never enter the
 * merge. Returns the eligible rows plus the suppressed rows with reasons
 * (the suppression engine renders them; see suppression.ts).
 */
export function partitionMergeInputs<
  T extends { readonly productTypeSlug: string | null; readonly needsReview: boolean },
>(
  items: readonly T[],
): {
  eligible: (T & { readonly productTypeSlug: string })[];
  suppressed: { readonly item: T; readonly reason: "unresolved_product_variant" }[];
} {
  const eligible: (T & { readonly productTypeSlug: string })[] = [];
  const suppressed: { item: T; reason: "unresolved_product_variant" }[] = [];
  for (const item of items) {
    if (item.productTypeSlug === null || item.needsReview) {
      suppressed.push({ item, reason: "unresolved_product_variant" });
    } else {
      eligible.push(item as T & { productTypeSlug: string });
    }
  }
  return { eligible, suppressed };
}

/** Net-required math across members, inventory, and reserves. */
export function computeNetRequired(
  requirements: readonly MemberRequirementInput[],
  inventory: readonly InventoryItemInput[],
  reserves: readonly ReserveRule[] = [],
): NetRequiredLine[] {
  for (const req of requirements) {
    if (!Number.isInteger(req.requiredUnits) || req.requiredUnits <= 0) {
      throw new RangeError(
        `requiredUnits must be a positive integer; got ${req.requiredUnits} ` +
          `for ${req.productTypeSlug}`,
      );
    }
  }
  const reserveBySlug = new Map(reserves.map((r) => [r.productTypeSlug, r.units]));

  const groups = new Map<string, MemberRequirementInput[]>();
  for (const req of requirements) {
    const key = mergeKey(req.productTypeSlug, req.dimensions, req.rulingStyle, req.color);
    const list = groups.get(key);
    if (list) list.push(req);
    else groups.set(key, [req]);
  }

  const usableByKey = new Map<
    string,
    { units: number; provenanceIds: (readonly string[])[] }
  >();
  for (const item of inventory) {
    const key = mergeKey(item.productTypeSlug, item.dimensions, item.rulingStyle, item.color);
    const weighted = item.quantity * CONDITION_FACTORS[item.condition];
    const entry = usableByKey.get(key) ?? { units: 0, provenanceIds: [] };
    entry.units += weighted;
    entry.provenanceIds.push(item.provenanceIds);
    usableByKey.set(key, entry);
  }

  const lines: NetRequiredLine[] = [];
  for (const [key, members] of groups) {
    const first = members[0]!;
    const allShareable = members.every((m) => m.shareable);
    const anyShareable = members.some((m) => m.shareable);
    const mixedShareability = anyShareable && !allShareable;
    // One child can legitimately contribute two requirement rows for the same
    // line (a teacher list plus a PTA list). Coalesce by member BEFORE the
    // math: otherwise the receipt renders the same child twice with different
    // numbers ("Child 1: 4" / "Child 1: 2"), and for a shareable line the
    // max() below would take one list's figure instead of that child's total.
    const unitsByMember = new Map<number, number>();
    for (const m of members) {
      unitsByMember.set(m.memberOrdinal, (unitsByMember.get(m.memberOrdinal) ?? 0) + m.requiredUnits);
    }
    const perMemberUnits = [...unitsByMember.entries()]
      .map(([memberOrdinal, requiredUnits]) => ({ memberOrdinal, requiredUnits: round(requiredUnits, 4) }))
      .sort((a, b) => a.memberOrdinal - b.memberOrdinal);
    const gross = allShareable
      ? Math.max(...perMemberUnits.map((m) => m.requiredUnits))
      : perMemberUnits.reduce((s, m) => s + m.requiredUnits, 0);
    const inv = usableByKey.get(key);
    const usable = round(inv?.units ?? 0, 4);
    const reserve = reserveBySlug.get(first.productTypeSlug) ?? 0;
    const net = round(Math.max(0, gross - usable - reserve), 4);
    lines.push({
      key,
      productTypeSlug: first.productTypeSlug,
      dimensions: first.dimensions,
      rulingStyle: first.rulingStyle,
      color: first.color,
      optionality: members.some((m) => m.optionality === "required")
        ? "required"
        : "optional",
      shareable: allShareable,
      mixedShareability,
      grossRequiredUnits: gross,
      usableInventoryUnits: usable,
      reserveUnits: reserve,
      netRequiredUnits: net,
      unitsToBuy: Math.ceil(net),
      perMember: perMemberUnits,
      provenanceIds: unionProvenance(
        ...members.map((m) => m.provenanceIds),
        ...(inv?.provenanceIds ?? []),
      ),
    });
  }
  return lines.sort((a, b) => compareStrings(a.key, b.key));
}

/**
 * Required spend counts only optionality === 'required' lines (handoff 04
 * §8: optional items never inflate a required-spend number).
 */
export function requiredSpendLines(
  lines: readonly NetRequiredLine[],
): NetRequiredLine[] {
  return lines.filter((l) => l.optionality === "required");
}
