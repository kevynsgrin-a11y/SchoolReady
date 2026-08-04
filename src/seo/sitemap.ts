/**
 * Sitemap + robots.txt generation — Phase 8 (seo-architect).
 *
 * The sitemap emits ONLY routes a cookieless crawler may index (the
 * route-metadata map's index / index_anonymous_only policies), plus any
 * programmatic candidate that clears the quality gate AND has unexpired
 * trend evidence. Noindex routes are excluded 100% — tests/seo-sitemap
 * asserts the exclusion against the map, and the workers suite asserts it
 * against the served file.
 *
 * Deliberately absent: <lastmod>, <changefreq>, <priority>. We will not
 * stamp a modification time we did not observe or invent a crawl-frequency
 * number ("never invent a number" — CLAUDE.md process rule).
 *
 * robots.txt disallows ONLY /api/ (JSON endpoints with no noindex
 * mechanism). Noindex HTML routes are intentionally NOT disallowed: a
 * crawler must be able to fetch them to see their noindex directive — a
 * Disallow would hide the directive and leave bare URLs indexable.
 */
import type { ProvenanceRecord } from "../contracts/provenance";
import { canonicalOrigin } from "./config";
import type { ExistingPage, ProgrammaticPageEvidence } from "./quality-gate";
import { evaluateQualityGate } from "./quality-gate";
import { indexablePaths, resolveProgrammaticPolicy } from "./route-metadata";
import { trendPageStatus } from "./trend-expiry";

export interface ProgrammaticCandidate {
  readonly evidence: ProgrammaticPageEvidence;
  /** Trend provenance when the page is trend-backed; null otherwise. */
  readonly trendProvenance: readonly ProvenanceRecord[] | null;
}

export interface SitemapInput {
  /** Programmatic pages proposed for inclusion (each must clear the gate). */
  readonly programmatic?: readonly ProgrammaticCandidate[];
  /** Already-shipped pages the duplication check compares against. */
  readonly existingPages?: readonly ExistingPage[];
  /** Clock for gate freshness + trend expiry; required if programmatic. */
  readonly nowMs?: number;
}

/** Absolute URLs the sitemap will contain, in map order. */
export function sitemapUrls(input: SitemapInput = {}): string[] {
  const origin = canonicalOrigin();
  const urls = indexablePaths().map((path) => `${origin}${path}`);
  const candidates = input.programmatic ?? [];
  if (candidates.length > 0 && input.nowMs === undefined) {
    throw new Error("sitemapUrls: programmatic candidates require nowMs for the quality gate");
  }
  for (const candidate of candidates) {
    const gate = evaluateQualityGate(
      candidate.evidence,
      input.existingPages ?? [],
      input.nowMs ?? 0,
    );
    const trend =
      candidate.trendProvenance === null
        ? null
        : trendPageStatus(candidate.trendProvenance, input.nowMs ?? 0);
    const policy = resolveProgrammaticPolicy({ gate, trend });
    if (policy.robots === "index,follow") urls.push(`${origin}${candidate.evidence.route}`);
  }
  return urls;
}

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function generateSitemapXml(input: SitemapInput = {}): string {
  const entries = sitemapUrls(input)
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

export function generateRobotsTxt(): string {
  const origin = canonicalOrigin();
  return [
    "User-agent: *",
    "Disallow: /api/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}
