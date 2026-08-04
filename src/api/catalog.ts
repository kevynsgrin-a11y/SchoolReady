/**
 * Fixture catalog derivation — joins the retailer feed (Phase 2 fixture)
 * with the synthetic entity-resolution fixture so the basket pipeline can
 * build MATCH CANDIDATES without guessing attributes from feed titles.
 *
 * §1.5: an offer whose (retailerSlug, sku) has no RESOLVED mapping is
 * excluded with a visible reason (unresolved_product_variant) — never
 * guessed into comparison. §1.1: nothing here carries or derives any
 * economics field; candidates flow into rankCandidates (Phase 4) untouched.
 */
import type { Assumption } from "../algorithms/types";
import type { MatchCandidateInput } from "../algorithms/match";
import type { RulingStyle } from "../contracts/product";
import type { AvailabilityStatus } from "../contracts/offer";
import type { OfferCandidate } from "../contracts/offer";
import type { ProvenanceRecord } from "../contracts/provenance";
import type {
  Clock,
  FixtureDocument,
  IngestedRecord,
  SourceEnvelope,
} from "../ingestion/types";
import { provenanceFromFixture } from "../ingestion/provenance";

/* ------------------------------------------------------------------ */
/* Fixture row shapes (fixtures/catalog, fixtures/retailers, tax rates) */
/* ------------------------------------------------------------------ */

export interface VariantResolutionRow {
  retailerSlug: string;
  sku: string;
  upc: string | null;
  productTypeSlug: string;
  brandSlug: string | null;
  color: string | null;
  material: string | null;
  rulingStyle: RulingStyle | null;
  dimensions: string | null;
  packCount: number;
  attributeTokens: string[];
  classTokens: string[];
  /** Tax-holiday category; null = unknown -> holiday never applied (§1.5). */
  taxCategory: string | null;
  resolutionStatus: "unresolved" | "resolved" | "ambiguous";
}

export interface RetailerLogisticsRow {
  retailerSlug: string;
  /** Labeled fixture assumption; null = unknown (priced as uncertainty). */
  estimatedDeliveryDays: number | null;
  /** null = no declared restriction. */
  shipsToStates: string[] | null;
}

export interface TaxRateRow {
  state: string;
  rate: number;
}

export interface TrendSignalRow {
  productSlug: string;
  family: string;
  geography: string;
  sponsoredShare: number;
  values: number[];
  latestObservedAt: string;
}

export interface PriceHistoryRow {
  upc: string;
  retailerSlug: string;
  observedAt: string;
  priceCents: number;
  packCount: number;
}

/* ------------------------------------------------------------------ */
/* Candidate derivation                                                */
/* ------------------------------------------------------------------ */

/** One shoppable candidate: match input + the offer facts behind it. */
export interface DerivedCandidate {
  candidate: MatchCandidateInput;
  productTypeSlug: string;
  retailerSlug: string;
  upc: string | null;
  priceCents: number;
  availability: AvailabilityStatus;
  shippingCents: number | null;
  packCount: number;
  taxCategory: string | null;
  estimatedDeliveryDays: number | null;
  shipsToStates: readonly string[] | null;
  /** Epoch ms the price/stock fact was retrieved (staleness input, §1.5). */
  retrievedAtMs: number;
  provenanceIds: readonly string[];
}

export interface CandidateDerivation {
  bySlug: Map<string, DerivedCandidate[]>;
  /** Offers excluded because no resolved variant mapping exists (§1.5). */
  unresolvedOffers: { offerKey: string; reason: string }[];
  assumptions: Assumption[];
  provenance: Record<string, ProvenanceRecord>;
}

const variantKey = (retailerSlug: string, sku: string): string =>
  `${retailerSlug}:${sku}`;

export function deriveCandidates(
  offerRecords: readonly IngestedRecord<OfferCandidate>[],
  catalogDoc: FixtureDocument<VariantResolutionRow>,
  logisticsDoc: FixtureDocument<RetailerLogisticsRow>,
  clock: Clock,
): CandidateDerivation {
  const provenance: Record<string, ProvenanceRecord> = {};
  const resolutionByKey = new Map<string, VariantResolutionRow>();
  for (const row of catalogDoc.records) {
    resolutionByKey.set(variantKey(row.retailerSlug, row.sku), row);
  }
  const logisticsBySlug = new Map<string, RetailerLogisticsRow>();
  const assumptions: Assumption[] = [];
  for (const row of logisticsDoc.records) {
    logisticsBySlug.set(row.retailerSlug, row);
    assumptions.push({
      name: `delivery_days_${row.retailerSlug}`,
      value:
        row.estimatedDeliveryDays === null
          ? "unknown (priced as uncertainty, never assumed)"
          : `${row.estimatedDeliveryDays} day(s)`,
      basis: "fixture_assumption",
    });
  }

  const bySlug = new Map<string, DerivedCandidate[]>();
  const unresolvedOffers: { offerKey: string; reason: string }[] = [];

  for (const { record: offer, provenance: offerProv } of offerRecords) {
    const key = variantKey(offer.retailerSlug, offer.sku);
    const resolution = resolutionByKey.get(key);
    if (!resolution || resolution.resolutionStatus !== "resolved") {
      unresolvedOffers.push({
        offerKey: key,
        reason: resolution
          ? `variant resolution status is ${resolution.resolutionStatus}`
          : "no variant resolution exists for this offer",
      });
      continue;
    }
    const variantProv = provenanceFromFixture(
      catalogDoc.provenance,
      `variant-${offer.retailerSlug}-${offer.sku}`,
      clock,
    );
    const logistics = logisticsBySlug.get(offer.retailerSlug) ?? null;
    const logisticsProv = provenanceFromFixture(
      logisticsDoc.provenance,
      `logistics-${offer.retailerSlug}`,
      clock,
    );
    provenance[offerProv.id] = offerProv;
    provenance[variantProv.id] = variantProv;
    provenance[logisticsProv.id] = logisticsProv;

    const derived: DerivedCandidate = {
      candidate: {
        candidateKey: key,
        productTypeSlug: resolution.productTypeSlug,
        brandSlug: resolution.brandSlug,
        color: resolution.color,
        material: resolution.material,
        rulingStyle: resolution.rulingStyle,
        dimensions: resolution.dimensions,
        packCount: resolution.packCount,
        attributeTokens: resolution.attributeTokens,
        classTokens: resolution.classTokens,
        provenanceIds: [offerProv.id, variantProv.id],
      },
      productTypeSlug: resolution.productTypeSlug,
      retailerSlug: offer.retailerSlug,
      upc: offer.upc,
      priceCents: offer.priceCents,
      availability: offer.availability,
      shippingCents: offer.shippingCents,
      packCount: resolution.packCount,
      taxCategory: resolution.taxCategory,
      estimatedDeliveryDays: logistics?.estimatedDeliveryDays ?? null,
      shipsToStates: logistics?.shipsToStates ?? null,
      retrievedAtMs: Date.parse(offerProv.retrievedAt),
      provenanceIds: [offerProv.id, variantProv.id, logisticsProv.id],
    };
    const bucket = bySlug.get(resolution.productTypeSlug);
    if (bucket) bucket.push(derived);
    else bySlug.set(resolution.productTypeSlug, [derived]);
  }

  return { bySlug, unresolvedOffers, assumptions, provenance };
}

/* ------------------------------------------------------------------ */
/* Sales tax                                                           */
/* ------------------------------------------------------------------ */

export interface SalesTaxLookup {
  rate: number;
  assumption: Assumption;
  provenance: ProvenanceRecord | null;
}

/**
 * State sales-tax rate from the fixture placeholder table. Unknown state ->
 * rate 0 with a VISIBLE assumption that tax is not estimated (§1.5: the gap
 * is labeled, never silently filled).
 */
export function lookupSalesTax(
  state: string | null,
  taxRatesDoc: FixtureDocument<TaxRateRow>,
  clock: Clock,
): SalesTaxLookup {
  if (state !== null) {
    const row = taxRatesDoc.records.find((r) => r.state === state);
    if (row) {
      const prov = provenanceFromFixture(taxRatesDoc.provenance, `rate-${row.state}`, clock);
      return {
        rate: row.rate,
        assumption: {
          name: "sales_tax_rate",
          value: `${row.rate} (state ${row.state}; fixture placeholder, estimate-grade, excludes local surtaxes)`,
          basis: "fixture_assumption",
        },
        provenance: prov,
      };
    }
  }
  return {
    rate: 0,
    assumption: {
      name: "sales_tax_rate",
      value:
        state === null
          ? "no state provided; sales tax NOT estimated (totals exclude tax)"
          : `no fixture rate for state ${state}; sales tax NOT estimated (totals exclude tax)`,
      basis: "fixture_assumption",
    },
    provenance: null,
  };
}

/* ------------------------------------------------------------------ */
/* Source envelope helpers                                             */
/* ------------------------------------------------------------------ */

/** Provenance dictionary from a source envelope's records. */
export function envelopeProvenance<T>(
  envelope: SourceEnvelope<T>,
): Record<string, ProvenanceRecord> {
  const out: Record<string, ProvenanceRecord> = {};
  for (const { provenance } of envelope.records) out[provenance.id] = provenance;
  return out;
}
