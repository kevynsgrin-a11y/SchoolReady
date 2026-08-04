/**
 * Phase 8 — sitemap generator (acceptance criterion 2): the sitemap emits
 * ONLY indexable routes; 100% of noindex routes are excluded. Programmatic
 * candidates enter only through the quality gate + trend expiry. robots.txt
 * never Disallows a noindexed HTML route (the directive must stay visible).
 */
import { describe, expect, it } from "vitest";
import { canonicalOrigin } from "../src/seo/config";
import {
  indexablePaths,
  nonIndexablePaths,
  resolveRobots,
} from "../src/seo/route-metadata";
import type { ProgrammaticCandidate } from "../src/seo/sitemap";
import { generateRobotsTxt, generateSitemapXml, sitemapUrls } from "../src/seo/sitemap";
import { SEO_QUALITY_GATE } from "../src/seo/config";
import { T0_ISO, record } from "./helpers/ui";

const NOW = Date.parse(T0_ISO);
const origin = canonicalOrigin();

const verifiedFresh = record({
  id: "prov:test:gov",
  sourceType: "government_feed",
  observedAt: "2026-08-01T00:00:00.000Z",
});

const passingCandidate: ProgrammaticCandidate = {
  evidence: {
    route: "/guides/passing-test",
    title: "passing candidate",
    bodyText:
      "Distinct sourced content about pack-size conversion math, replacement cadence, " +
      "and dated evidence with provenance lines on every figure in the walkthrough.",
    populatedFieldCount: SEO_QUALITY_GATE.minPopulatedFields + 1,
    provenance: [verifiedFresh],
  },
  trendProvenance: [record({ id: "prov:test:trend", sourceType: "government_feed", observedAt: T0_ISO })],
};

describe("sitemap — only indexable routes", () => {
  it("contains exactly the indexable paths when no programmatic pages are offered", () => {
    expect(sitemapUrls()).toEqual(indexablePaths().map((path) => `${origin}${path}`));
  });

  it("excludes 100% of noindex/programmatic-mapped routes (acceptance)", () => {
    const xml = generateSitemapXml();
    for (const path of nonIndexablePaths()) {
      expect(xml, `noindex route ${path} leaked into the sitemap`).not.toContain(
        `<loc>${origin}${path}</loc>`,
      );
    }
  });

  it("every <loc> it emits resolves to index,follow for a cookieless crawler", () => {
    const xml = generateSitemapXml();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      const path = loc.slice(origin.length);
      expect(
        resolveRobots(path, { method: "GET", hasSession: false }).robots,
        `sitemap contains ${path}, which a crawler may not index`,
      ).toBe("index,follow");
    }
  });

  it("well-formed urlset with escaped locs and no invented lastmod/priority", () => {
    const xml = generateSitemapXml();
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).not.toContain("<lastmod>");
    expect(xml).not.toContain("<changefreq>");
    expect(xml).not.toContain("<priority>");
  });
});

describe("sitemap — programmatic candidates pass through the gate", () => {
  it("admits a candidate that clears the gate with fresh trend evidence", () => {
    const xml = generateSitemapXml({ programmatic: [passingCandidate], nowMs: NOW });
    expect(xml).toContain(`<loc>${origin}/guides/passing-test</loc>`);
  });

  it("rejects a deliberately thin candidate", () => {
    const thin: ProgrammaticCandidate = {
      evidence: {
        route: "/guides/thin-test",
        title: "thin",
        bodyText: "Short shell.",
        populatedFieldCount: 0,
        provenance: [],
      },
      trendProvenance: null,
    };
    const xml = generateSitemapXml({ programmatic: [thin], nowMs: NOW });
    expect(xml).not.toContain("/guides/thin-test");
  });

  it("rejects a candidate whose trend evidence has expired into review", () => {
    const expired: ProgrammaticCandidate = {
      ...passingCandidate,
      trendProvenance: [
        record({ sourceType: "government_feed", observedAt: "2026-01-01T00:00:00.000Z" }),
      ],
    };
    const xml = generateSitemapXml({ programmatic: [expired], nowMs: NOW });
    expect(xml).not.toContain("/guides/passing-test");
  });

  it("refuses programmatic candidates without a clock (gate cannot run)", () => {
    expect(() => sitemapUrls({ programmatic: [passingCandidate] })).toThrow(/nowMs/);
  });
});

describe("robots.txt", () => {
  it("points at the sitemap on the configured origin and blocks only /api/", () => {
    const robots = generateRobotsTxt();
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect(robots).toContain("Disallow: /api/");
  });

  it("never Disallows a noindexed HTML route — the directive must stay crawlable", () => {
    const robots = generateRobotsTxt();
    for (const path of nonIndexablePaths()) {
      expect(robots).not.toContain(`Disallow: ${path}`);
    }
  });
});
