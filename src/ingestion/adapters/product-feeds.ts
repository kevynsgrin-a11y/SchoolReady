/**
 * Retailer product feed adapter (SourceId 'affiliate_feeds').
 *
 * Emits pre-entity-resolution OfferCandidates: retailer + SKU + price/stock,
 * NO variant reference. Mapping candidates onto product_variants (and only
 * then into the offers table) is entity resolution, Phase 4 — unresolved
 * candidates are suppressed from comparison (§1.5), never guessed.
 *
 * §1.1 HARD RULE: the consumed feed shape contains no commission,
 * payout, or referral field, and no such field may ever be added — feed
 * economics can never reach ranking inputs through this adapter.
 *
 * Fixture posture: no feed contract exists (registry licensing is deny-all
 * for live handling), so fixture feeds carry clearly synthetic retailers
 * ("Fixture Mart"), FIXTURE- prefixed SKUs/UPCs, and fixture-labeled prices.
 */
import type { Flags } from "../../../config/flags";
import type {
  AvailabilityStatus,
  Currency,
  OfferCandidate,
} from "../../contracts/offer";
import type {
  Clock,
  FixtureDocument,
  IngestionBatch,
  SourceAdapter,
} from "../types";
import { isoFromMs } from "../types";
import { assertFixtureDocument, provenanceFromFixture } from "../provenance";
import { createLiveStub } from "./live-stub";

/** Normalized feed line shape (fixture and, later, live map onto this). */
export interface ProductFeedRow {
  retailerSlug: string;
  retailerName: string;
  sku: string;
  title: string;
  upc: string | null;
  priceCents: number;
  currency: Currency;
  availability: AvailabilityStatus;
  shippingCents: number | null;
  deepLinkUrl: string | null;
}

export function createProductFeedFixtureAdapter(
  doc: FixtureDocument<ProductFeedRow>,
  clock: Clock,
): SourceAdapter<OfferCandidate> {
  return {
    sourceId: "affiliate_feeds",
    mode: "fixture",
    fetchBatch(): Promise<IngestionBatch<OfferCandidate>> {
      assertFixtureDocument(doc, "affiliate_feeds");
      const now = isoFromMs(clock());
      const records = doc.records.map((row) => {
        const provenance = provenanceFromFixture(
          doc.provenance,
          `offer-${row.retailerSlug}-${row.sku}`,
          clock,
        );
        const candidate: OfferCandidate = {
          retailerSlug: row.retailerSlug,
          retailerName: row.retailerName,
          sku: row.sku,
          title: row.title,
          upc: row.upc,
          priceCents: row.priceCents,
          currency: row.currency,
          availability: row.availability,
          shippingCents: row.shippingCents,
          deepLinkUrl: row.deepLinkUrl,
        };
        return { record: candidate, provenance };
      });
      return Promise.resolve({
        sourceId: "affiliate_feeds",
        fetchedAt: now,
        records,
      });
    },
  };
}

export function createProductFeedAdapter(
  flags: Flags,
  doc: FixtureDocument<ProductFeedRow>,
  clock: Clock,
): SourceAdapter<OfferCandidate> {
  return flags.liveSources.affiliate_feeds
    ? createLiveStub<OfferCandidate>("affiliate_feeds")
    : createProductFeedFixtureAdapter(doc, clock);
}
