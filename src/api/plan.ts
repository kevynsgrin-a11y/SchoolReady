/**
 * Plan pipeline (Phase 5) — the exact order handoff 05 §8 mandates:
 *
 *   confirmed requirements -> computeNetRequired -> rankCandidates per line
 *   (match gate + score) -> filterRecalledOffers -> optimizeBasket
 *
 * (partitionMergeInputs ran upstream: only user-CONFIRMED, slug-resolved
 * items ever persist, so nothing review-pending can reach this module —
 * asserted again here defensively.)
 *
 * P4-3: `matchScore` on every BasketOfferInput comes from rankCandidates and
 * NOTHING in this module re-ranks outside weightedObjectiveCents — the
 * basket response is optimizeBasket's output verbatim, byte-identity-tested.
 * §1.1: no economics input exists anywhere in this flow.
 */
import type {
  MemberRequirementInput,
  InventoryItemInput,
  NetRequiredLine,
} from "../algorithms/net-required";
import { computeNetRequired, partitionMergeInputs, requiredSpendLines } from "../algorithms/net-required";
import type { MatchRequirementInput } from "../algorithms/match";
import { rankCandidates } from "../algorithms/match";
import type {
  BasketContext,
  BasketItemInput,
  TaxHolidayWindowInput,
} from "../algorithms/basket";
import { DEFAULT_BASKET_LAMBDAS } from "../algorithms/basket";
import type { RecallAwareOffer, RecallProductRef } from "../algorithms/suppression";
import {
  combineFindings,
  evaluateListStatus,
  evaluatePriceStockAge,
  filterRecalledOffers,
} from "../algorithms/suppression";
import type { Assumption } from "../algorithms/types";
import type { BrandRequirement, VerificationStatus } from "../contracts/requirement";
import type { Optionality } from "../contracts/requirement";
import type { RulingStyle } from "../contracts/product";
import { sanitizeProhibitedSubstitutions } from "../contracts/constraint";
import type { ConstraintCode } from "../contracts/constraint";
import type { SuppressionNote, ItemMatchReport } from "./contracts";
import type { RequirementJoinRow, InventoryJoinRow } from "./store";
import { brandSlugFromId } from "./store";
import type { DerivedCandidate } from "./catalog";

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

/** Per-merge-key metadata the basket needs beyond NetRequiredLine. */
export interface LineMeta {
  brandRequirement: BrandRequirement;
  brandSlug: string | null;
  prohibitedSubstitutions: readonly ConstraintCode[];
}

export interface MergeComputation {
  lines: NetRequiredLine[];
  lineMeta: Map<string, LineMeta>;
  listFindings: { listId: string; decision: ReturnType<typeof combineFindings> }[];
  provenanceIds: string[];
}

const BRAND_STRICTNESS: Record<BrandRequirement, number> = {
  required: 2,
  preferred: 1,
  generic_allowed: 0,
};

const lineKeyOf = (row: RequirementJoinRow): string => {
  const part = (v: string | null): string => v ?? "*";
  return `${row.product_type_slug}|${part(row.dimensions)}|${part(row.ruling_style)}|${part(row.color)}`;
};

/** Pure merge over joined rows (unit-testable without D1). */
export function computeMergePlan(
  rows: readonly RequirementJoinRow[],
  inventory: readonly InventoryJoinRow[],
): MergeComputation {
  // Defensive §1.5 gate: persisted rows are always slug-resolved and
  // user-confirmed, but the merge NEVER trusts that silently.
  const { eligible } = partitionMergeInputs(
    rows.map((row) => ({ row, productTypeSlug: row.product_type_slug, needsReview: false })),
  );

  const listFindings = new Map<string, VerificationStatus>();
  for (const row of rows) {
    listFindings.set(row.list_id, row.verification_status as VerificationStatus);
  }

  const requirements: MemberRequirementInput[] = eligible.map(({ row }) => ({
    memberOrdinal: row.ordinal,
    productTypeSlug: row.product_type_slug,
    dimensions: row.dimensions,
    rulingStyle: row.ruling_style,
    color: row.color,
    requiredUnits: row.quantity * (row.pack_count ?? 1),
    // Conservative default: nothing is assumed household-shareable (§1.5 —
    // over-buying is visible; a guessed shared pool is not).
    shareable: false,
    optionality: row.optionality as Optionality,
    provenanceIds: [row.provenance_id],
  }));

  const inventoryInputs: InventoryItemInput[] = inventory.map((item) => ({
    productTypeSlug: item.product_type_slug,
    dimensions: null,
    rulingStyle: null,
    color: null,
    quantity: item.quantity,
    condition: item.condition,
    provenanceIds: [item.provenance_id],
  }));

  const lines = computeNetRequired(requirements, inventoryInputs);

  const lineMeta = new Map<string, LineMeta>();
  for (const { row } of eligible) {
    const key = lineKeyOf(row);
    const constraints = sanitizeProhibitedSubstitutions(
      row.prohibited_substitutions ? (JSON.parse(row.prohibited_substitutions) as string[]) : [],
    );
    const brandRequirement = row.brand_requirement as BrandRequirement;
    const existing = lineMeta.get(key);
    if (!existing) {
      lineMeta.set(key, {
        brandRequirement,
        brandSlug: brandSlugFromId(row.required_brand_id),
        prohibitedSubstitutions: constraints,
      });
    } else {
      const mergedConstraints = sanitizeProhibitedSubstitutions([
        ...new Set([...existing.prohibitedSubstitutions, ...constraints]),
      ]);
      const stricter =
        BRAND_STRICTNESS[brandRequirement] > BRAND_STRICTNESS[existing.brandRequirement];
      lineMeta.set(key, {
        brandRequirement: stricter ? brandRequirement : existing.brandRequirement,
        brandSlug: stricter ? brandSlugFromId(row.required_brand_id) : existing.brandSlug,
        prohibitedSubstitutions: mergedConstraints,
      });
    }
  }

  const findings = [...listFindings.entries()].map(([listId, verificationStatus]) => ({
    listId,
    decision: combineFindings([evaluateListStatus({ verificationStatus })]),
  }));

  const provenanceIds = [
    ...new Set([
      ...requirements.flatMap((r) => r.provenanceIds),
      ...inventoryInputs.flatMap((i) => i.provenanceIds),
    ]),
  ].sort();

  return { lines, lineMeta, listFindings: findings, provenanceIds };
}

/* ------------------------------------------------------------------ */
/* Basket input derivation                                             */
/* ------------------------------------------------------------------ */

export interface BasketDerivationArgs {
  merge: MergeComputation;
  candidatesBySlug: Map<string, DerivedCandidate[]>;
  recallRefs: readonly RecallProductRef[];
  holidays: readonly TaxHolidayWindowInput[];
  state: string | null;
  salesTaxRate: number;
  salesTaxBasis: Assumption;
  purchaseDate: string;
  daysUntilNeeded: number | null;
  /** Injected clock value (epoch ms) for staleness checks. */
  nowMs: number;
}

export interface BasketDerivation {
  items: BasketItemInput[];
  offers: RecallAwareOffer[];
  ctx: BasketContext;
  itemMatches: ItemMatchReport[];
  suppressions: SuppressionNote[];
  coveredLineKeys: string[];
  optionalLineKeysExcluded: string[];
}

/**
 * Deterministic derivation of optimizeBasket inputs. The route calls
 * `optimizeBasket(d.items, d.offers, d.ctx)` and serializes the result
 * VERBATIM — the byte-identity test re-runs this function and compares.
 */
export function deriveBasketInputs(args: BasketDerivationArgs): BasketDerivation {
  const suppressions: SuppressionNote[] = [];
  const itemMatches: ItemMatchReport[] = [];
  const items: BasketItemInput[] = [];
  const preRecallOffers: RecallAwareOffer[] = [];

  const required = requiredSpendLines(args.merge.lines);
  const optionalLineKeysExcluded = args.merge.lines
    .filter((l) => l.optionality === "optional")
    .map((l) => l.key);
  const coveredLineKeys = required.filter((l) => l.unitsToBuy === 0).map((l) => l.key);
  const shoppingLines = required.filter((l) => l.unitsToBuy > 0);

  for (const line of shoppingLines) {
    const meta = args.merge.lineMeta.get(line.key) ?? {
      brandRequirement: "generic_allowed" as BrandRequirement,
      brandSlug: null,
      prohibitedSubstitutions: [] as ConstraintCode[],
    };
    const req: MatchRequirementInput = {
      productTypeSlug: line.productTypeSlug,
      requiredUnits: line.unitsToBuy,
      color: line.color,
      // Material is not part of the merge key; left unspecified rather than
      // guessed from one member's row (§1.5) — it then never dilutes a score.
      material: null,
      rulingStyle: line.rulingStyle as RulingStyle | null,
      dimensions: line.dimensions,
      brandRequirement: meta.brandRequirement,
      brandSlug: meta.brandSlug,
      prohibitedSubstitutions: meta.prohibitedSubstitutions,
    };

    const all = args.candidatesBySlug.get(line.productTypeSlug) ?? [];
    const freshEnough: DerivedCandidate[] = [];
    for (const cand of all) {
      const finding = evaluatePriceStockAge({ retrievedAtMs: cand.retrievedAtMs }, args.nowMs);
      if (finding !== null) {
        suppressions.push({
          subject: `offer:${cand.candidate.candidateKey}`,
          decision: combineFindings([finding]),
        });
        if (finding.action === "suppress") continue;
      }
      freshEnough.push(cand);
    }

    const ranking = rankCandidates(req, freshEnough.map((c) => c.candidate));
    itemMatches.push({
      itemKey: line.key,
      eligibleCount: ranking.eligible.length,
      excluded: ranking.excluded.map((r) => ({
        candidateKey: r.candidateKey,
        disqualifiers: [...r.disqualifiers],
      })),
    });

    items.push({
      itemKey: line.key,
      productTypeSlug: line.productTypeSlug,
      unitsToBuy: line.unitsToBuy,
      taxCategory: freshEnough[0]?.taxCategory ?? null,
    });

    for (const eligible of ranking.eligible) {
      const cand = freshEnough.find((c) => c.candidate.candidateKey === eligible.candidateKey)!;
      preRecallOffers.push({
        offerKey: cand.candidate.candidateKey,
        itemKey: line.key,
        retailerSlug: cand.retailerSlug,
        packCount: cand.packCount,
        priceCents: cand.priceCents,
        availability: cand.availability,
        shippingCents: cand.shippingCents,
        // P4-3: the match gate's score, never a caller-invented default.
        matchScore: eligible.score,
        estimatedDeliveryDays: cand.estimatedDeliveryDays,
        shipsToStates: cand.shipsToStates,
        provenanceIds: cand.provenanceIds,
        upc: cand.upc,
      });
    }
  }

  // Recall filtering BEFORE optimization — always, on every basket (§1.5).
  const recallFilter = filterRecalledOffers(preRecallOffers, args.recallRefs);
  for (const suppressed of recallFilter.suppressed) {
    suppressions.push({
      subject: `offer:${suppressed.offerKey}`,
      decision: combineFindings([suppressed.finding]),
    });
  }

  const ctx: BasketContext = {
    state: args.state,
    salesTaxRate: args.salesTaxRate,
    salesTaxBasis: args.salesTaxBasis,
    purchaseDate: args.purchaseDate,
    holidays: args.holidays,
    daysUntilNeeded: args.daysUntilNeeded,
    lambdas: DEFAULT_BASKET_LAMBDAS,
  };

  return {
    items,
    offers: [...recallFilter.allowed],
    ctx,
    itemMatches,
    suppressions,
    coveredLineKeys,
    optionalLineKeysExcluded,
  };
}
