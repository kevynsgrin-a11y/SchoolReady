/**
 * Provenance construction + the §1.4 write-time gate (Phase 2).
 *
 * Adapters build one full ProvenanceRecord per emitted record from the
 * fixture document's template (fixture path) or the feed response metadata
 * (live path, later). assertBatchProvenance() is the write-time rejection:
 * a record without a complete provenance record never reaches the cache or
 * (in later phases) D1 — where the NOT NULL FK repeats the same rule.
 */
import {
  CORRECTION_STATUSES,
  FRESHNESS_LEVELS,
  SOURCE_TYPES,
} from "../contracts/provenance";
import type { ProvenanceRecord } from "../contracts/provenance";
import type { SourceId } from "../../config/flags";
import type {
  Clock,
  FixtureDocument,
  FixtureProvenanceTemplate,
  IngestionBatch,
} from "./types";
import { isoFromMs, ProvenanceRejectionError } from "./types";

/**
 * Labeling gate for the fixture path: adapters refuse any document that is
 * not explicitly `_fixture: true` with a fixture-typed provenance template,
 * so unlabeled data can never enter as fixture data.
 */
export function assertFixtureDocument<TRaw>(
  doc: FixtureDocument<TRaw>,
  sourceId: SourceId,
): void {
  if (doc._fixture !== true || doc.provenance.sourceType !== "fixture") {
    throw new ProvenanceRejectionError(
      sourceId,
      "fixture document is not labeled _fixture:true with fixture-typed provenance",
    );
  }
  if (!doc.fixtureSet.startsWith("fixture:") || doc.provenance.source !== doc.fixtureSet) {
    throw new ProvenanceRejectionError(
      sourceId,
      `fixture set "${doc.fixtureSet}" must be 'fixture:'-namespaced and match provenance.source`,
    );
  }
}

/**
 * Build the full ten-field §1.4 record for one fixture-sourced fact.
 * `geographyOverride` narrows the template's geography for state-scoped
 * facts ('US-TX'); ids are deterministic within a fixture set.
 */
export function provenanceFromFixture(
  template: FixtureProvenanceTemplate,
  recordKey: string,
  clock: Clock,
  geographyOverride?: string,
): ProvenanceRecord {
  const now = isoFromMs(clock());
  return {
    id: `prov:${template.source}:${recordKey}`,
    source: template.source,
    sourceType: template.sourceType,
    observedAt: template.observedAt,
    retrievedAt: now,
    geography: geographyOverride ?? template.geography,
    transformVersion: template.transformVersion,
    freshness: "fresh",
    confidence: template.confidence,
    limitations: template.limitations,
    correctionStatus: "none",
    createdAt: now,
  };
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

/** Field-level completeness check for one provenance record. */
export function provenanceDefect(p: ProvenanceRecord | undefined | null): string | null {
  if (!p) return "record carries no provenance";
  if (!isNonEmptyString(p.id)) return "provenance.id missing";
  if (!isNonEmptyString(p.source)) return "provenance.source missing";
  if (!(SOURCE_TYPES as readonly string[]).includes(p.sourceType))
    return `provenance.sourceType invalid: ${String(p.sourceType)}`;
  if (!isNonEmptyString(p.observedAt)) return "provenance.observedAt missing";
  if (!isNonEmptyString(p.retrievedAt)) return "provenance.retrievedAt missing";
  if (!isNonEmptyString(p.geography)) return "provenance.geography missing";
  if (!isNonEmptyString(p.transformVersion)) return "provenance.transformVersion missing";
  if (!(FRESHNESS_LEVELS as readonly string[]).includes(p.freshness))
    return `provenance.freshness invalid: ${String(p.freshness)}`;
  if (typeof p.confidence !== "number" || p.confidence < 0 || p.confidence > 1)
    return "provenance.confidence out of range";
  if (typeof p.limitations !== "string") return "provenance.limitations missing";
  if (!(CORRECTION_STATUSES as readonly string[]).includes(p.correctionStatus))
    return `provenance.correctionStatus invalid: ${String(p.correctionStatus)}`;
  return null;
}

/**
 * §1.4 write-time gate. Throws ProvenanceRejectionError if any record in the
 * batch lacks a complete provenance record. In fixture mode it additionally
 * requires sourceType === 'fixture', so fixture-path data can never
 * masquerade as live data.
 */
export function assertBatchProvenance<T>(
  batch: IngestionBatch<T>,
  opts: { fixtureMode: boolean },
): void {
  batch.records.forEach((entry, index) => {
    const defect = provenanceDefect(entry.provenance);
    if (defect) {
      throw new ProvenanceRejectionError(batch.sourceId, `record ${index}: ${defect}`);
    }
    if (opts.fixtureMode && entry.provenance.sourceType !== "fixture") {
      throw new ProvenanceRejectionError(
        batch.sourceId,
        `record ${index}: sourceType "${entry.provenance.sourceType}" is not ` +
          `"fixture" while fixture mode is ON — fixture-path data must be ` +
          `labeled fixture (never a plausible fabrication)`,
      );
    }
  });
}
