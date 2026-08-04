/**
 * Phase 8 — programmatic quality gate (acceptance criterion 1): a
 * deliberately thin page is REJECTED in code, not by editorial judgment.
 * Also proves the verified-source, freshness, and duplication checks, and
 * that the shipped static templates are not near-duplicates of each other.
 */
import { describe, expect, it } from "vitest";
import { SEO_QUALITY_GATE } from "../src/seo/config";
import type { ProgrammaticPageEvidence } from "../src/seo/quality-gate";
import {
  contentSimilarity,
  evaluateQualityGate,
  shingleSet,
  verifiedRecords,
} from "../src/seo/quality-gate";
import { staticPages } from "../src/ui/static-site";
import { T0_ISO, record } from "./helpers/ui";

const NOW = Date.parse(T0_ISO);

const verifiedProv = record({
  id: "prov:test:gov",
  source: "test:government-source",
  sourceType: "government_feed",
  observedAt: "2026-08-01T00:00:00.000Z",
});

const RICH_BODY =
  "Grade-band supply planning walks through quantity math per subject, pack-size " +
  "conversion between retailer counts and list counts, replacement cadence over a " +
  "school year, and which requirements districts most often mark optional. Every " +
  "figure cites its dated source record and renders with its provenance line.";

const richPage: ProgrammaticPageEvidence = {
  route: "/guides/rich-test",
  title: "rich test page",
  bodyText: RICH_BODY,
  populatedFieldCount: SEO_QUALITY_GATE.minPopulatedFields + 2,
  provenance: [verifiedProv],
};

describe("quality gate — thresholds live in config", () => {
  it("exposes positive numeric thresholds", () => {
    expect(SEO_QUALITY_GATE.minVerifiedSources).toBeGreaterThan(0);
    expect(SEO_QUALITY_GATE.minPopulatedFields).toBeGreaterThan(0);
    expect(SEO_QUALITY_GATE.maxEvidenceAgeDays).toBeGreaterThan(0);
    expect(SEO_QUALITY_GATE.maxTemplateSimilarity).toBeGreaterThan(0);
    expect(SEO_QUALITY_GATE.maxTemplateSimilarity).toBeLessThanOrEqual(1);
  });

  it("fixture is NOT a verified source type — synthetic data cannot earn an index", () => {
    expect(SEO_QUALITY_GATE.verifiedSourceTypes).not.toContain("fixture");
    expect(verifiedRecords([record({ sourceType: "fixture" })])).toEqual([]);
  });
});

describe("quality gate — a deliberately thin page is rejected (acceptance)", () => {
  it("rejects the thin page with every failed check named", () => {
    const thinPage: ProgrammaticPageEvidence = {
      route: "/guides/thin-test",
      title: "thin",
      bodyText: "A short shell with no data behind it.",
      populatedFieldCount: 1,
      provenance: [],
    };
    const result = evaluateQualityGate(thinPage, [], NOW);
    expect(result.pass).toBe(false);
    if (result.pass) throw new Error("unreachable");
    const checks = result.failures.map((f) => f.check);
    expect(checks).toContain("verified_source");
    expect(checks).toContain("min_fields");
    expect(checks).toContain("freshness");
  });

  it("rejects a fixture-only page on the verified-source check", () => {
    const result = evaluateQualityGate(
      { ...richPage, provenance: [record({ sourceType: "fixture" })] },
      [],
      NOW,
    );
    expect(result.pass).toBe(false);
    if (result.pass) throw new Error("unreachable");
    expect(result.failures.map((f) => f.check)).toContain("verified_source");
  });

  it("rejects evidence older than the freshness window", () => {
    const stale = record({
      id: "prov:test:stale",
      sourceType: "government_feed",
      observedAt: "2026-06-01T00:00:00.000Z", // 64 days before T0
    });
    const result = evaluateQualityGate({ ...richPage, provenance: [stale] }, [], NOW);
    expect(result.pass).toBe(false);
    if (result.pass) throw new Error("unreachable");
    expect(result.failures.map((f) => f.check)).toContain("freshness");
  });

  it("fresh unverified evidence cannot mask a stale verified source (P8-1)", () => {
    const staleVerified = record({
      id: "prov:test:stale-gov",
      sourceType: "government_feed",
      observedAt: "2026-06-01T00:00:00.000Z", // 64 days before T0 — stale
    });
    const freshFixture = record({
      id: "prov:test:fresh-fixture",
      sourceType: "fixture",
      observedAt: "2026-08-03T00:00:00.000Z", // 1 day before T0 — fresh
    });
    const freshUserEntry = record({
      id: "prov:test:fresh-user",
      sourceType: "user_entry",
      observedAt: "2026-08-03T00:00:00.000Z",
    });
    const result = evaluateQualityGate(
      { ...richPage, provenance: [staleVerified, freshFixture, freshUserEntry] },
      [],
      NOW,
    );
    expect(result.pass).toBe(false);
    if (result.pass) throw new Error("unreachable");
    // verified_source passes (one verified record) — freshness must still
    // fail, because the only VERIFIED record is stale.
    expect(result.failures.map((f) => f.check)).not.toContain("verified_source");
    expect(result.failures.map((f) => f.check)).toContain("freshness");
  });

  it("rejects retracted/under-review sources even when fresh", () => {
    const retracted = record({ sourceType: "government_feed", correctionStatus: "retracted" });
    const result = evaluateQualityGate({ ...richPage, provenance: [retracted] }, [], NOW);
    expect(result.pass).toBe(false);
  });

  it("rejects a near-duplicate of an existing page", () => {
    const result = evaluateQualityGate(
      { ...richPage, route: "/guides/near-duplicate" },
      [{ route: "/guides/rich-test", bodyText: RICH_BODY }],
      NOW,
    );
    expect(result.pass).toBe(false);
    if (result.pass) throw new Error("unreachable");
    expect(result.failures.map((f) => f.check)).toContain("duplication");
  });

  it("admits a sourced, fresh, populated, distinct page", () => {
    expect(evaluateQualityGate(richPage, [], NOW)).toEqual({ pass: true });
  });
});

describe("similarity — near-duplicate detection", () => {
  it("identical text scores 1 and disjoint text scores 0", () => {
    expect(contentSimilarity(RICH_BODY, RICH_BODY)).toBe(1);
    expect(
      contentSimilarity(
        "alpha beta gamma delta epsilon zeta",
        "one two three four five six seven",
      ),
    ).toBe(0);
  });

  it("shingles are word n-grams, case- and punctuation-insensitive", () => {
    expect(shingleSet("The QUICK, brown fox!", 3)).toEqual(
      new Set(["the quick brown", "quick brown fox"]),
    );
  });

  it("no near-duplicate templates ship: static pages stay under the ceiling", () => {
    const mainText = (page: string): string => {
      const start = page.indexOf("<main");
      const end = page.indexOf("</main>");
      expect(start).toBeGreaterThan(-1);
      return page.slice(start, end).replace(/<[^>]+>/g, " ");
    };
    const pages = staticPages().map((p) => ({ path: p.path, text: mainText(p.html) }));
    expect(pages.length).toBeGreaterThan(1);
    for (let i = 0; i < pages.length; i += 1) {
      for (let j = i + 1; j < pages.length; j += 1) {
        const similarity = contentSimilarity(pages[i]!.text, pages[j]!.text);
        expect(
          similarity,
          `${pages[i]!.path} vs ${pages[j]!.path} similarity ${similarity.toFixed(2)}`,
        ).toBeLessThan(SEO_QUALITY_GATE.maxTemplateSimilarity);
      }
    }
  });
});
