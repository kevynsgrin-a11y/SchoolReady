/**
 * Disclosure component — Phase 9 (monetization-engineer).
 *
 * FTC posture (compliance-officer refines copy in Phase 10): a disclosure
 * renders ADJACENT to 100% of monetized links — inside the same inline unit,
 * immediately after the anchor. Footnote-only disclosure is a violation by
 * construction: `renderMonetizedLink` is the ONLY exported way to produce
 * the affiliate-link marker, and it emits the anchor + disclosure pair
 * atomically. `checkDisclosureCoverage` re-proves the property from rendered
 * output (tests run it over every route render).
 *
 * Monetized anchors carry rel="sponsored noopener" so search engines and
 * assistive tech see the paid nature too (SEO handoff 09 §8: no Offer/
 * Product structured data may ever accompany these).
 */
import type { Html } from "../ui/html";
import { html } from "../ui/html";
import { MONETIZATION } from "../ui/copy/en";
import type { MonetizedLink } from "./links";

/** Marker classes — the route-tree scan and coverage checker key on these. */
export const MONETIZED_UNIT_CLASS = "monetized-link";
export const AFFILIATE_LINK_CLASS = "affiliate-link";
export const DISCLOSURE_CLASS = "affiliate-disclosure";

/**
 * The one and only affiliate-link renderer: anchor and adjacent disclosure
 * are a single atomic unit. There is no variant without the disclosure.
 */
export function renderMonetizedLink(link: MonetizedLink, label: string): Html {
  return html`<span class="${MONETIZED_UNIT_CLASS}"><a class="${AFFILIATE_LINK_CLASS}" data-network="${link.networkId}" rel="sponsored noopener" href="${link.url}">${label} ${MONETIZATION.affiliateLinkSuffix}</a> <span class="${DISCLOSURE_CLASS}">${MONETIZATION.affiliateDisclosure}</span></span>`;
}

export interface DisclosureCoverage {
  readonly links: number;
  readonly disclosures: number;
  /** Empty = 100% coverage. Each entry names the failing link position. */
  readonly violations: readonly string[];
}

const indicesOf = (page: string, needle: string): number[] => {
  const out: number[] = [];
  let at = page.indexOf(needle);
  while (at !== -1) {
    out.push(at);
    at = page.indexOf(needle, at + needle.length);
  }
  return out;
};

/**
 * Layout-level coverage check over RENDERED markup: for the i-th affiliate
 * link there must be an i-th disclosure that (a) follows it, (b) precedes
 * the next affiliate link, and (c) sits in the same page section (crossing
 * a `</section>` boundary means footnote placement, which is forbidden).
 */
export function checkDisclosureCoverage(page: string): DisclosureCoverage {
  const links = indicesOf(page, `class="${AFFILIATE_LINK_CLASS}"`);
  const disclosures = indicesOf(page, `class="${DISCLOSURE_CLASS}"`);
  const violations: string[] = [];
  for (let i = 0; i < links.length; i += 1) {
    const linkAt = links[i]!;
    const disclosureAt = disclosures[i];
    if (disclosureAt === undefined || disclosureAt < linkAt) {
      violations.push(`affiliate link #${i + 1} (offset ${linkAt}) has no following disclosure`);
      continue;
    }
    const nextLinkAt = links[i + 1];
    if (nextLinkAt !== undefined && disclosureAt > nextLinkAt) {
      violations.push(
        `affiliate link #${i + 1} (offset ${linkAt}) is not followed by its own disclosure before the next link`,
      );
      continue;
    }
    if (page.slice(linkAt, disclosureAt).includes("</section>")) {
      violations.push(
        `affiliate link #${i + 1} (offset ${linkAt}) is disclosed only outside its section (footnote-style) — adjacency required`,
      );
    }
  }
  return { links: links.length, disclosures: disclosures.length, violations };
}
