/**
 * Affiliate network registry — Phase 9 (monetization-engineer).
 *
 * FIXTURE POSTURE: no affiliate relationship exists in this validation beta.
 * Every entry here is a clearly-labeled synthetic network with a
 * `fixture-tag-` publisher tag so the decoration pipeline is testable end to
 * end without a single real affiliate ID in the repository. Live network
 * configs land only with credentials + a compliance-officer-reviewed
 * disclosure (Phase 10) — and they land HERE, nowhere else.
 *
 * §1.1 boundary: this module (and everything under src/monetization/) is
 * structurally unreachable from src/algorithms/ and src/api/ — enforced by
 * tests/algorithms-independence.test.ts. Link decoration is presentation
 * only; it can never feed a match score, worth-it score, or basket
 * optimization.
 */

export type NetworkMode = "fixture";

export interface AffiliateNetworkConfig {
  readonly networkId: string;
  /** The only mode that exists in this build. Live networks are a Phase 10+ change. */
  readonly mode: NetworkMode;
  /** Query parameter the network reads the publisher tag from. */
  readonly tagParam: string;
  /** Clearly-labeled synthetic tag — never a real publisher/affiliate ID. */
  readonly tag: `fixture-tag-${string}`;
  readonly description: string;
}

/**
 * Synthetic networks mirroring the fixture retailers in
 * fixtures/product-feeds/offers.fixture.json. Tag values are labeled fixtures.
 */
export const AFFILIATE_NETWORKS: readonly AffiliateNetworkConfig[] = [
  {
    networkId: "fixture-network-alpha",
    mode: "fixture",
    tagParam: "aff_tag",
    tag: "fixture-tag-alpha-0001",
    description: "Synthetic network for fixture-mart and fixture-depot deep links (beta test double).",
  },
  {
    networkId: "fixture-network-beta",
    mode: "fixture",
    tagParam: "partner_ref",
    tag: "fixture-tag-beta-0001",
    description: "Synthetic network for fixture-supply-co deep links (beta test double).",
  },
] as const;

/**
 * retailerSlug -> networkId. A retailer without an entry has NO monetized
 * link: the link service returns the neutral deep link untouched. Never
 * guess a network; never fabricate a tag.
 */
export const RETAILER_NETWORK_MAP: Readonly<Record<string, string>> = {
  "fixture-mart": "fixture-network-alpha",
  "fixture-depot": "fixture-network-alpha",
  "fixture-supply-co": "fixture-network-beta",
};

export function getNetwork(networkId: string): AffiliateNetworkConfig | undefined {
  return AFFILIATE_NETWORKS.find((n) => n.networkId === networkId);
}

export function networkForRetailer(retailerSlug: string): AffiliateNetworkConfig | null {
  const networkId = RETAILER_NETWORK_MAP[retailerSlug];
  if (networkId === undefined) return null;
  return getNetwork(networkId) ?? null;
}
