/**
 * Phase 9 — monetization units: fixture-only affiliate networks, neutral
 * deep-link decoration (never fabricated, never guessed), the atomic
 * link+disclosure component with its coverage checker, editorial-only
 * ad-slot rules with the ad-free entitlement gate, the honest Season Pass
 * surface, and the dark-pattern marker sweep (§5).
 */
import { describe, expect, it } from "vitest";
import {
  AFFILIATE_NETWORKS,
  RETAILER_NETWORK_MAP,
  getNetwork,
  networkForRetailer,
} from "../src/monetization/networks";
import { decorateOutboundLink } from "../src/monetization/links";
import type { MonetizedLink } from "../src/monetization/links";
import {
  AFFILIATE_LINK_CLASS,
  DISCLOSURE_CLASS,
  checkDisclosureCoverage,
  renderMonetizedLink,
} from "../src/monetization/disclosure";
import {
  AdPlacementError,
  EDITORIAL_ROUTE_PREFIX,
  MOUNTED_SLOTS,
  assertMountAllowed,
  assertMountTable,
  editorialAdSections,
  isEditorialSurface,
  slotsForSurface,
} from "../src/monetization/ad-rules";
import {
  SeasonPassCheckoutDisabledError,
  beginSeasonPassCheckout,
  seasonPassSurface,
} from "../src/monetization/season-pass";
import { DARK_PATTERN_MARKERS, findDarkPatterns } from "../src/monetization/dark-patterns";
import { AD_SLOT_REGISTRY, SlotPlacementError } from "../src/ui/slots";
import { renderSections } from "../src/ui/components/chrome";
import { MONETIZATION } from "../src/ui/copy/en";
import { html } from "../src/ui/html";

const NEUTRAL_URL = "https://example.com/fixture/fixture-mart/FXM-GLUE-06?variant=6pk";

describe("affiliate networks — fixture-only registry", () => {
  it("every network is fixture-mode with a clearly-labeled fixture tag (no real IDs)", () => {
    expect(AFFILIATE_NETWORKS.length).toBeGreaterThan(0);
    for (const network of AFFILIATE_NETWORKS) {
      expect(network.mode).toBe("fixture");
      expect(network.tag.startsWith("fixture-tag-")).toBe(true);
      expect(network.tagParam.length).toBeGreaterThan(0);
    }
  });

  it("every mapped retailer resolves to a registered network", () => {
    for (const [retailer, networkId] of Object.entries(RETAILER_NETWORK_MAP)) {
      expect(getNetwork(networkId), `${retailer} -> ${networkId}`).toBeDefined();
      expect(networkForRetailer(retailer)?.networkId).toBe(networkId);
    }
  });

  it("an unmapped retailer has no network — never guessed", () => {
    expect(networkForRetailer("some-unmapped-retailer")).toBeNull();
  });
});

describe("link service — decoration without fabrication", () => {
  it("decorates a neutral deep link with the retailer network's tag param", () => {
    const link = decorateOutboundLink({ deepLinkUrl: NEUTRAL_URL, retailerSlug: "fixture-mart" });
    expect(link.kind).toBe("monetized");
    const monetized = link as MonetizedLink;
    const url = new URL(monetized.url);
    expect(url.searchParams.get("aff_tag")).toBe("fixture-tag-alpha-0001");
    expect(url.searchParams.get("variant")).toBe("6pk"); // original params preserved
    expect(url.origin + url.pathname).toBe("https://example.com/fixture/fixture-mart/FXM-GLUE-06");
    expect(monetized.fixture).toBe(true);
    expect(monetized.networkId).toBe("fixture-network-alpha");
  });

  it("per-network tagging: a different retailer gets ITS network's param and tag", () => {
    const link = decorateOutboundLink({
      deepLinkUrl: "https://example.com/fixture/fixture-supply-co/FSC-A-118",
      retailerSlug: "fixture-supply-co",
    });
    expect(link.kind).toBe("monetized");
    const url = new URL((link as MonetizedLink).url);
    expect(url.searchParams.get("partner_ref")).toBe("fixture-tag-beta-0001");
    expect(url.searchParams.has("aff_tag")).toBe(false);
  });

  it("a retailer without a network yields the untouched plain link", () => {
    const link = decorateOutboundLink({ deepLinkUrl: NEUTRAL_URL, retailerSlug: "unmapped-mart" });
    expect(link).toEqual({ kind: "plain", url: NEUTRAL_URL, retailerSlug: "unmapped-mart" });
  });

  it("a null or empty deep link yields NO link — a URL is never fabricated", () => {
    expect(decorateOutboundLink({ deepLinkUrl: null, retailerSlug: "fixture-mart" }).kind).toBe("none");
    expect(decorateOutboundLink({ deepLinkUrl: "", retailerSlug: "fixture-mart" }).kind).toBe("none");
  });

  it("unparseable or non-http deep links fall back to plain, untouched", () => {
    expect(decorateOutboundLink({ deepLinkUrl: "not a url", retailerSlug: "fixture-mart" })).toEqual({
      kind: "plain",
      url: "not a url",
      retailerSlug: "fixture-mart",
    });
    expect(
      decorateOutboundLink({ deepLinkUrl: "javascript:alert(1)", retailerSlug: "fixture-mart" }),
    ).toEqual({ kind: "plain", url: "javascript:alert(1)", retailerSlug: "fixture-mart" });
  });

  it("never mutates its input", () => {
    const input = { deepLinkUrl: NEUTRAL_URL, retailerSlug: "fixture-mart" };
    const copy = { ...input };
    decorateOutboundLink(input);
    expect(input).toEqual(copy);
  });
});

describe("disclosure component — adjacent to 100% of monetized links", () => {
  const monetized = decorateOutboundLink({
    deepLinkUrl: NEUTRAL_URL,
    retailerSlug: "fixture-mart",
  }) as MonetizedLink;

  it("renderMonetizedLink emits anchor + disclosure as one atomic unit", () => {
    const markup = renderMonetizedLink(monetized, "Fixture Mart").__html;
    expect(markup).toContain(`class="${AFFILIATE_LINK_CLASS}"`);
    expect(markup).toContain(`class="${DISCLOSURE_CLASS}"`);
    expect(markup).toContain('rel="sponsored noopener"');
    expect(markup).toContain(MONETIZATION.affiliateLinkSuffix);
    expect(markup.indexOf(AFFILIATE_LINK_CLASS)).toBeLessThan(markup.indexOf(DISCLOSURE_CLASS));
    const coverage = checkDisclosureCoverage(markup);
    expect(coverage.links).toBe(1);
    expect(coverage.violations).toEqual([]);
  });

  it("a rendered affiliate link WITHOUT an adjacent disclosure fails coverage", () => {
    const bare = `<section><a class="${AFFILIATE_LINK_CLASS}" href="x">shop</a></section>`;
    const coverage = checkDisclosureCoverage(bare);
    expect(coverage.violations).toHaveLength(1);
    expect(coverage.violations[0]).toContain("no following disclosure");
  });

  it("footnote-only disclosure (outside the link's section) fails coverage", () => {
    const footnote =
      `<section><a class="${AFFILIATE_LINK_CLASS}" href="x">shop</a></section>` +
      `<section><span class="${DISCLOSURE_CLASS}">note</span></section>`;
    const coverage = checkDisclosureCoverage(footnote);
    expect(coverage.violations).toHaveLength(1);
    expect(coverage.violations[0]).toContain("footnote-style");
  });

  it("one disclosure cannot cover two links", () => {
    const unit = renderMonetizedLink(monetized, "Fixture Mart").__html;
    const second = `<a class="${AFFILIATE_LINK_CLASS}" href="y">also shop</a>`;
    const coverage = checkDisclosureCoverage(`<section>${unit}${second}</section>`);
    expect(coverage.links).toBe(2);
    expect(coverage.disclosures).toBe(1);
    expect(coverage.violations).toHaveLength(1);
  });

  it("multiple atomic units interleave cleanly — 100% coverage holds", () => {
    const page = `<section>${renderMonetizedLink(monetized, "A").__html}${
      renderMonetizedLink(monetized, "B").__html
    }</section>`;
    expect(checkDisclosureCoverage(page).violations).toEqual([]);
  });
});

describe("ad-slot rules — editorial surfaces only, entitlement-suppressible", () => {
  it("zero slots are mounted in this beta (the shipped mount table is empty)", () => {
    expect(MOUNTED_SLOTS).toEqual([]);
    expect(() => assertMountTable()).not.toThrow();
  });

  it("only the registry's editorial surfaces qualify", () => {
    expect(isEditorialSurface("editorial_article")).toBe(true);
    expect(isEditorialSurface("editorial_guide_footer")).toBe(true);
    for (const surface of ["plan", "safety", "checkout", "account", "editorial_", ""]) {
      expect(isEditorialSurface(surface), surface).toBe(false);
    }
  });

  it("slotsForSurface returns registry slots for editorial surfaces, none otherwise", () => {
    const article = slotsForSurface("editorial_article", null);
    expect(article.map((s) => s.id)).toEqual(["editorial-inline-rect"]);
    expect(slotsForSurface("editorial_guide_footer", null).map((s) => s.id)).toEqual([
      "editorial-footer-leaderboard",
    ]);
    for (const surface of ["plan", "safety", "basket", "account", "not_a_surface"]) {
      expect(slotsForSurface(surface, null)).toEqual([]);
      expect(slotsForSurface(surface, { adFreeExtras: false })).toEqual([]);
    }
  });

  it("the ad-free entitlement suppresses slots even on editorial surfaces", () => {
    expect(slotsForSurface("editorial_article", { adFreeExtras: true })).toEqual([]);
    expect(slotsForSurface("editorial_guide_footer", { adFreeExtras: true })).toEqual([]);
    expect(editorialAdSections("editorial_article", { adFreeExtras: true })).toEqual([]);
  });

  it("assertMountAllowed rejects non-editorial surfaces, unknown slots, mismatches, and non-editorial routes", () => {
    expect(() =>
      assertMountAllowed({ slotId: "editorial-inline-rect", surface: "plan" as never, route: `${EDITORIAL_ROUTE_PREFIX}x` }),
    ).toThrow(AdPlacementError);
    expect(() =>
      assertMountAllowed({ slotId: "no-such-slot", surface: "editorial_article", route: `${EDITORIAL_ROUTE_PREFIX}x` }),
    ).toThrow(AdPlacementError);
    expect(() =>
      assertMountAllowed({
        slotId: "editorial-footer-leaderboard",
        surface: "editorial_article",
        route: `${EDITORIAL_ROUTE_PREFIX}x`,
      }),
    ).toThrow(AdPlacementError);
    expect(() =>
      assertMountAllowed({ slotId: "editorial-inline-rect", surface: "editorial_article", route: "/plan" }),
    ).toThrow(AdPlacementError);
  });

  it("a legal synthetic editorial mount passes and returns the fixed-size spec", () => {
    const spec = assertMountAllowed({
      slotId: "editorial-inline-rect",
      surface: "editorial_article",
      route: `${EDITORIAL_ROUTE_PREFIX}synthetic-guide`,
    });
    expect(spec).toBe(AD_SLOT_REGISTRY[0]);
    expect(spec.widthPx).toBe(300);
    expect(spec.heightPx).toBe(250);
  });

  it("editorial ad sections compose ONLY after protected content (composer throws otherwise)", () => {
    const ads = editorialAdSections("editorial_article", null);
    expect(ads).toHaveLength(1);
    expect(() =>
      renderSections([{ kind: "content", body: html`<p>guide body</p>` }, ...ads]),
    ).not.toThrow();
    expect(() =>
      renderSections([...ads, { kind: "deadline", body: html`<p>shopping deadline</p>` }]),
    ).toThrow(SlotPlacementError);
  });
});

describe("Season Pass surface — honest checkout, ad-free-extras only", () => {
  const activeEntitlements = {
    seasonPass: {
      status: "active",
      validUntil: "2027-08-01T00:00:00.000Z",
      provenanceIds: ["prov:ent:1"],
    },
    gates: { adFreeExtras: true },
  };

  it("an active pass surfaces its expiry and the ad-free gate", () => {
    const surface = seasonPassSurface(activeEntitlements, true);
    expect(surface).toEqual({
      kind: "active",
      validUntil: "2027-08-01T00:00:00.000Z",
      provenanceIds: ["prov:ent:1"],
      adFree: true,
    });
  });

  it("no pass -> checkout_unavailable in BOTH modes (no payment path exists)", () => {
    const none = { seasonPass: null, gates: { adFreeExtras: false } };
    expect(seasonPassSurface(none, true)).toEqual({ kind: "checkout_unavailable", mode: "fixture" });
    expect(seasonPassSurface(none, false)).toEqual({ kind: "checkout_unavailable", mode: "live" });
  });

  it("a non-active pass row is not an active surface", () => {
    const expired = {
      seasonPass: { status: "expired", validUntil: "2025-08-01T00:00:00.000Z", provenanceIds: [] },
      gates: { adFreeExtras: false },
    };
    expect(seasonPassSurface(expired, true).kind).toBe("checkout_unavailable");
  });

  it("beginSeasonPassCheckout throws by construction — no accidental live payments", () => {
    expect(() => beginSeasonPassCheckout()).toThrow(SeasonPassCheckoutDisabledError);
  });
});

describe("dark-pattern markers (§5)", () => {
  it("each marker catches its seeded violation", () => {
    const seeds: Record<string, string> = {
      countdown: '<div class="deal countdown" data-remaining="59">00:59</div>',
      fabricated_scarcity: "<p>Only 3 left in stock — selling fast</p>",
      urgency_theatrics: "<p>Hurry, this offer ends tonight</p>",
      prechecked_consent:
        '<input type="checkbox" name="marketing-consent" value="yes" checked><span>Email me deals</span>',
      confirm_shaming: '<a href="/close">No thanks, I do not want to save money</a>',
    };
    for (const marker of DARK_PATTERN_MARKERS) {
      const seed = seeds[marker.id];
      expect(seed, `seed missing for ${marker.id}`).toBeDefined();
      expect(findDarkPatterns(seed!), marker.id).toContain(marker.id);
    }
  });

  it("honest commerce copy trips nothing", () => {
    const clean = `<p>${MONETIZATION.passExplainer}</p><p>${MONETIZATION.affiliateDisclosure}</p><input type="checkbox" name="line-check" checked>`;
    expect(findDarkPatterns(clean)).toEqual([]);
  });
});
