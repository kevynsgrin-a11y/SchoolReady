/**
 * CPSC recall feed adapter (SourceId 'cpsc_recalls').
 *
 * Raw rows use the CPSC Recall REST API field shape (RecallID, RecallNumber,
 * RecallDate, Title, Description, URL, LastPublishDate, Products[],
 * Hazards[], Remedies[]) so the eventual live implementation normalizes
 * through the same code path as fixtures. ConsumerContact is NOT part of the
 * consumed shape — contact-shaped data never enters (§1.7 posture).
 *
 * Fixture posture: sample recalls are clearly synthetic (RecallID
 * 'FIXTURE-...', titles marked '(Fixture Sample)', example.com URLs) and
 * normalize to isSynthetic=true.
 */
import type { Flags } from "../../../config/flags";
import type { Recall, RecallProduct } from "../../contracts/recall";
import type {
  Clock,
  FixtureDocument,
  IngestionBatch,
  SourceAdapter,
} from "../types";
import { isoFromMs } from "../types";
import { assertFixtureDocument, provenanceFromFixture } from "../provenance";
import { createLiveStub } from "./live-stub";

/** CPSC Recall REST API field shape (subset we consume). */
export interface CpscRecallRow {
  RecallID: string;
  RecallNumber: string;
  /** ISO date. */
  RecallDate: string;
  LastPublishDate: string | null;
  Title: string;
  Description: string;
  URL: string;
  /** null = CPSC did not state a unit count (we never invent one). */
  NumberOfUnits: number | null;
  Products: Array<{
    Name: string;
    Description: string;
    Model: string | null;
    UPC: string | null;
  }>;
  Hazards: Array<{ Name: string }>;
  Remedies: Array<{ Name: string }>;
}

/** A recall plus its product lines — matched to catalog variants in Phase 4. */
export interface RecallBundle {
  recall: Recall;
  products: RecallProduct[];
}

export function createCpscFixtureAdapter(
  doc: FixtureDocument<CpscRecallRow>,
  clock: Clock,
): SourceAdapter<RecallBundle> {
  return {
    sourceId: "cpsc_recalls",
    mode: "fixture",
    fetchBatch(): Promise<IngestionBatch<RecallBundle>> {
      assertFixtureDocument(doc, "cpsc_recalls");
      const now = isoFromMs(clock());
      const records = doc.records.map((row) => {
        const provenance = provenanceFromFixture(
          doc.provenance,
          `recall-${row.RecallID}`,
          clock,
        );
        const recallId = `recall:fixture:${row.RecallID}`;
        const recall: Recall = {
          id: recallId,
          cpscRecallId: row.RecallID,
          recallNumber: row.RecallNumber,
          recallDate: row.RecallDate,
          lastPublishDate: row.LastPublishDate,
          title: row.Title,
          description: row.Description,
          cpscUrl: row.URL,
          hazardDescription: row.Hazards.map((h) => h.Name).join("; "),
          remedyDescription: row.Remedies.map((r) => r.Name).join("; "),
          unitsAffected: row.NumberOfUnits,
          isSynthetic: true,
          provenanceId: provenance.id,
          createdAt: now,
        };
        const products: RecallProduct[] = row.Products.map((p, pi) => ({
          id: `${recallId}:product-${pi + 1}`,
          recallId,
          name: p.Name,
          description: p.Description,
          model: p.Model,
          upc: p.UPC,
          provenanceId: provenance.id,
          createdAt: now,
        }));
        return { record: { recall, products }, provenance };
      });
      return Promise.resolve({ sourceId: "cpsc_recalls", fetchedAt: now, records });
    },
  };
}

export function createCpscAdapter(
  flags: Flags,
  doc: FixtureDocument<CpscRecallRow>,
  clock: Clock,
): SourceAdapter<RecallBundle> {
  return flags.liveSources.cpsc_recalls
    ? createLiveStub<RecallBundle>("cpsc_recalls")
    : createCpscFixtureAdapter(doc, clock);
}
