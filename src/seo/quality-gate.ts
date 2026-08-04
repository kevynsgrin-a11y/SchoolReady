/**
 * Programmatic quality gate — Phase 8 (seo-architect).
 *
 * No programmatic page generates unless it clears every minimum-data
 * threshold in SEO_QUALITY_GATE (src/seo/config.ts). The gate is CODE, not
 * editorial judgment: a template that wants to ship a page must pass its
 * evidence through evaluateQualityGate and refuse to generate on failure.
 * The sitemap generator applies the same gate, so a page that slips past a
 * template bug still cannot enter the crawl surface.
 *
 * Checks, in order:
 *   1. verified_source  — at least minVerifiedSources provenance records of
 *      a verified source type, not expired, not retracted/under review.
 *   2. min_fields       — the template populated at least minPopulatedFields
 *      data-backed fields (thin shells never ship).
 *   3. freshness        — the newest VERIFIED supporting evidence is at most
 *      maxEvidenceAgeDays old (same verified-record filter as check 1; a
 *      fresh fixture/user_entry record cannot mask a stale verified source).
 *   4. duplication      — word-shingle Jaccard similarity against every
 *      existing page stays below maxTemplateSimilarity.
 */
import type { ProvenanceRecord } from "../contracts/provenance";
import type { SeoQualityGateConfig } from "./config";
import { SEO_QUALITY_GATE } from "./config";

export interface ProgrammaticPageEvidence {
  /** Route the page would ship at, e.g. "/guides/example-topic". */
  readonly route: string;
  readonly title: string;
  /** Rendered visible text of the page body (tags stripped). */
  readonly bodyText: string;
  /** Count of data-backed fields the template actually populated. */
  readonly populatedFieldCount: number;
  /** Provenance behind the page's facts (§1.4 records). */
  readonly provenance: readonly ProvenanceRecord[];
}

export interface ExistingPage {
  readonly route: string;
  readonly bodyText: string;
}

export type QualityGateCheck =
  | "verified_source"
  | "min_fields"
  | "freshness"
  | "duplication";

export interface QualityGateFailure {
  readonly check: QualityGateCheck;
  readonly detail: string;
}

export type QualityGateResult =
  | { readonly pass: true }
  | { readonly pass: false; readonly failures: readonly QualityGateFailure[] };

const DAY_MS = 86_400_000;

/** Provenance records that can stand behind an indexable page. */
export function verifiedRecords(
  provenance: readonly ProvenanceRecord[],
  config: SeoQualityGateConfig = SEO_QUALITY_GATE,
): ProvenanceRecord[] {
  return provenance.filter(
    (record) =>
      config.verifiedSourceTypes.includes(record.sourceType) &&
      record.freshness !== "expired" &&
      (record.correctionStatus === "none" || record.correctionStatus === "corrected"),
  );
}

/** Lowercased word tokens with punctuation stripped. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Word k-gram shingle set for near-duplicate detection. */
export function shingleSet(text: string, width: number = SEO_QUALITY_GATE.shingleWidth): Set<string> {
  const words = tokens(text);
  const shingles = new Set<string>();
  if (words.length === 0) return shingles;
  if (words.length < width) {
    shingles.add(words.join(" "));
    return shingles;
  }
  for (let i = 0; i + width <= words.length; i += 1) {
    shingles.add(words.slice(i, i + width).join(" "));
  }
  return shingles;
}

/** Jaccard similarity of two texts' shingle sets, in [0, 1]. */
export function contentSimilarity(
  a: string,
  b: string,
  width: number = SEO_QUALITY_GATE.shingleWidth,
): number {
  const setA = shingleSet(a, width);
  const setB = shingleSet(b, width);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const shingle of setA) if (setB.has(shingle)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

/**
 * The gate. Returns every failure (not just the first) so a rejected
 * template can log exactly what it lacked.
 */
export function evaluateQualityGate(
  candidate: ProgrammaticPageEvidence,
  existingPages: readonly ExistingPage[],
  nowMs: number,
  config: SeoQualityGateConfig = SEO_QUALITY_GATE,
): QualityGateResult {
  const failures: QualityGateFailure[] = [];

  const verified = verifiedRecords(candidate.provenance, config);
  if (verified.length < config.minVerifiedSources) {
    failures.push({
      check: "verified_source",
      detail: `${verified.length} verified source record(s); the gate requires ${config.minVerifiedSources} (verified types: ${config.verifiedSourceTypes.join(", ")})`,
    });
  }

  if (candidate.populatedFieldCount < config.minPopulatedFields) {
    failures.push({
      check: "min_fields",
      detail: `${candidate.populatedFieldCount} populated field(s); the gate requires ${config.minPopulatedFields}`,
    });
  }

  // Freshness is judged over the SAME verified records that stand behind the
  // page (gate finding P8-1): evidence that cannot satisfy the
  // verified_source check cannot refresh the page's clock either.
  const newestObservedMs = verified.reduce<number | null>((newest, record) => {
    const observed = Date.parse(record.observedAt);
    if (Number.isNaN(observed)) return newest;
    return newest === null ? observed : Math.max(newest, observed);
  }, null);
  if (newestObservedMs === null) {
    failures.push({ check: "freshness", detail: "no dated verified evidence backs this page" });
  } else {
    const ageDays = (nowMs - newestObservedMs) / DAY_MS;
    if (ageDays > config.maxEvidenceAgeDays) {
      failures.push({
        check: "freshness",
        detail: `newest evidence is ${Math.floor(ageDays)} day(s) old; the freshness window is ${config.maxEvidenceAgeDays} day(s)`,
      });
    }
  }

  for (const existing of existingPages) {
    if (existing.route === candidate.route) continue;
    const similarity = contentSimilarity(candidate.bodyText, existing.bodyText, config.shingleWidth);
    if (similarity >= config.maxTemplateSimilarity) {
      failures.push({
        check: "duplication",
        detail: `similarity ${similarity.toFixed(2)} against ${existing.route} is at or above the ${config.maxTemplateSimilarity} ceiling`,
      });
    }
  }

  return failures.length === 0 ? { pass: true } : { pass: false, failures };
}
