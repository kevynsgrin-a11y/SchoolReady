/**
 * §1.2 route-tree scanner — Phase 9 (monetization-engineer). This is the
 * layout-level rule from CLAUDE.md §1.2 encoded against RENDERED output:
 *
 *   No ad slot, sponsored unit, upsell, or interstitial may render between
 *   a user and: a required list item, a safety/recall warning, a dress-code
 *   restriction, a list correction, a price change, an assistance resource,
 *   or a shopping deadline.
 *
 * The page composer already throws on a bad section ORDER at render time
 * (src/ui/slots.ts assertSlotPlacement/assertSafetyFirst). This scanner is
 * the outside proof over the final HTML — it catches what a section-order
 * assert cannot: a commercial unit EMBEDDED inside or above protected
 * content in the byte stream, a missing/footnote disclosure, an
 * interstitial, or dark-pattern markup. Tests run it over every route in
 * the server's route table across representative states.
 *
 * Rules (each seeded with a failing counterexample in tests):
 *  A. No commercial section (`ad_slot`, `disclosure`) opens before the last
 *     protected section — strictly stronger than assertSlotPlacement, which
 *     constrains only `ad_slot`.
 *  B. No commercial unit marker (ad-slot container, affiliate link, upsell
 *     unit) appears inside a protected section, or anywhere in the byte
 *     stream above the last protected section.
 *  C. Any interstitial/dialog markup on a page carrying protected content
 *     is a violation regardless of position (overlays sit "between" by
 *     definition).
 *  D. Every affiliate link has its adjacent disclosure (checkDisclosureCoverage).
 *  E. No dark-pattern marker anywhere (src/monetization/dark-patterns.ts).
 */
import { CRITICAL_SECTION_KINDS, COMMERCIAL_SECTION_KINDS } from "../ui/slots";
import type { SectionKind } from "../ui/slots";
import { checkDisclosureCoverage } from "./disclosure";
import { findDarkPatterns } from "./dark-patterns";

/** Byte markers of concrete commercial units in rendered markup. */
export const COMMERCIAL_UNIT_MARKERS = [
  'class="ad-slot"',
  'class="affiliate-link"',
  "data-upsell=",
] as const;

/** Markers of interstitial/overlay units (none may exist on protected pages). */
export const INTERSTITIAL_MARKERS = ["<dialog", "data-interstitial"] as const;

export interface ScanFinding {
  readonly rule: "commercial_section_order" | "commercial_unit_position" | "interstitial" | "disclosure_coverage" | "dark_pattern";
  readonly detail: string;
}

interface SectionOpen {
  readonly kind: SectionKind;
  readonly at: number;
}

const SECTION_OPEN_RE = /<section class="page-section section-([a-z_]+)"/g;

function sectionOpens(page: string): SectionOpen[] {
  return [...page.matchAll(SECTION_OPEN_RE)].map((m) => ({
    kind: m[1] as SectionKind,
    at: m.index,
  }));
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

/** Scans one fully rendered HTML page; empty result = compliant. */
export function scanRenderedPage(page: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const sections = sectionOpens(page);
  const criticalOpens = sections.filter((s) =>
    (CRITICAL_SECTION_KINDS as readonly string[]).includes(s.kind),
  );
  const lastCriticalAt =
    criticalOpens.length > 0 ? criticalOpens[criticalOpens.length - 1]!.at : -1;

  // Rule A — commercial sections must open after ALL protected sections.
  for (const s of sections) {
    if (!(COMMERCIAL_SECTION_KINDS as readonly string[]).includes(s.kind)) continue;
    if (lastCriticalAt !== -1 && s.at < lastCriticalAt) {
      findings.push({
        rule: "commercial_section_order",
        detail: `a "${s.kind}" section (offset ${s.at}) opens before protected content (last protected section opens at ${lastCriticalAt})`,
      });
    }
  }

  // Rule B — concrete commercial units: never inside a protected section,
  // never above the last protected section in the byte stream.
  for (const marker of COMMERCIAL_UNIT_MARKERS) {
    for (const at of indicesOf(page, marker)) {
      const enclosing = [...sections].reverse().find((s) => s.at < at);
      if (
        enclosing !== undefined &&
        (CRITICAL_SECTION_KINDS as readonly string[]).includes(enclosing.kind)
      ) {
        findings.push({
          rule: "commercial_unit_position",
          detail: `commercial unit ${marker} (offset ${at}) renders inside a protected "${enclosing.kind}" section`,
        });
        continue;
      }
      if (lastCriticalAt !== -1 && at < lastCriticalAt) {
        findings.push({
          rule: "commercial_unit_position",
          detail: `commercial unit ${marker} (offset ${at}) renders above protected content (last protected section opens at ${lastCriticalAt})`,
        });
      }
    }
  }

  // Rule C — interstitials never share a page with protected content.
  if (lastCriticalAt !== -1) {
    for (const marker of INTERSTITIAL_MARKERS) {
      if (page.includes(marker)) {
        findings.push({
          rule: "interstitial",
          detail: `interstitial marker ${marker} on a page carrying protected content`,
        });
      }
    }
  }

  // Rule D — 100% adjacent disclosure on affiliate links.
  for (const violation of checkDisclosureCoverage(page).violations) {
    findings.push({ rule: "disclosure_coverage", detail: violation });
  }

  // Rule E — dark-pattern sweep (§5).
  for (const id of findDarkPatterns(page)) {
    findings.push({ rule: "dark_pattern", detail: `dark-pattern marker "${id}" present` });
  }

  return findings;
}
