/**
 * Affiliate link service — Phase 9 (monetization-engineer).
 *
 * Takes a NEUTRAL deep link (src/contracts/offer.ts deepLinkUrl — plain
 * product URL, no economics) plus a retailer slug, and produces an outbound
 * link decorated with the retailer's network tag. Pure function of its
 * inputs; the input URL is never mutated.
 *
 * HARD RULES (each enforced by a test):
 *  - Decoration is one-way presentation: nothing here is importable from
 *    src/algorithms/ or src/api/ (tests/algorithms-independence.test.ts
 *    proves both directions structurally). Ranking never sees a tag.
 *  - A retailer without a network config yields a PLAIN link — never a
 *    guessed tag. A null deep link yields NO link — never a fabricated URL.
 *  - A monetized link may only reach markup through
 *    renderMonetizedLink (src/monetization/disclosure.ts), which emits the
 *    adjacent disclosure atomically. There is no disclosure-less renderer.
 */
import type { AffiliateNetworkConfig } from "./networks";
import { networkForRetailer } from "./networks";

export interface OutboundLinkInput {
  /** Neutral product deep link from the offer record; null = unknown. */
  readonly deepLinkUrl: string | null;
  readonly retailerSlug: string;
}

export type OutboundLink =
  | {
      readonly kind: "monetized";
      /** Deep link with the network tag appended. */
      readonly url: string;
      readonly networkId: string;
      readonly retailerSlug: string;
      /** Always true in this build: every configured network is a fixture. */
      readonly fixture: true;
    }
  | { readonly kind: "plain"; readonly url: string; readonly retailerSlug: string }
  | { readonly kind: "none"; readonly retailerSlug: string };

function tagUrl(deepLinkUrl: string, network: AffiliateNetworkConfig): string | null {
  let url: URL;
  try {
    url = new URL(deepLinkUrl);
  } catch {
    return null; // unparseable input -> caller falls back to plain handling
  }
  // Only http(s) product URLs are ever decorated.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.searchParams.set(network.tagParam, network.tag);
  return url.toString();
}

/** Decorates a neutral deep link for outbound use. Pure; never throws. */
export function decorateOutboundLink(input: OutboundLinkInput): OutboundLink {
  if (input.deepLinkUrl === null || input.deepLinkUrl.length === 0) {
    return { kind: "none", retailerSlug: input.retailerSlug };
  }
  const network = networkForRetailer(input.retailerSlug);
  if (network === null) {
    return { kind: "plain", url: input.deepLinkUrl, retailerSlug: input.retailerSlug };
  }
  const tagged = tagUrl(input.deepLinkUrl, network);
  if (tagged === null) {
    return { kind: "plain", url: input.deepLinkUrl, retailerSlug: input.retailerSlug };
  }
  return {
    kind: "monetized",
    url: tagged,
    networkId: network.networkId,
    retailerSlug: input.retailerSlug,
    fixture: true,
  };
}

export type MonetizedLink = Extract<OutboundLink, { kind: "monetized" }>;
