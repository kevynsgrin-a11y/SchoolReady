/**
 * CPSC recall contracts (Phase 2, ingestion-engineer; consumed by the safety
 * layer in Phases 4-5 — §0 capability 5).
 *
 * Shape follows the CPSC Recall REST API (SaferProducts.gov) field families:
 * RecallID/RecallNumber/RecallDate/Title/Description/URL/LastPublishDate plus
 * the Products[] array (Name/Description/Model/UPC). ConsumerContact is
 * deliberately NOT modeled — it carries phone/email strings (§1.7 keeps
 * contact-shaped data out of our tables); we deep-link to the CPSC page
 * instead.
 *
 * Fixture posture: isSynthetic=true rows come from clearly-labeled fixture
 * files (provenance.sourceType='fixture'); live rows land only once
 * liveSources.cpsc_recalls is ON.
 */
import type { IsoTimestamp, WithProvenance } from "./provenance";

export interface Recall extends WithProvenance {
  id: string;
  /** CPSC RecallID (stored as text). Fixture rows use a FIXTURE- prefix. */
  cpscRecallId: string;
  /** CPSC RecallNumber ('26-101'). Fixture rows use an FX- prefix. */
  recallNumber: string;
  /** ISO date the recall was announced. */
  recallDate: string;
  lastPublishDate: string | null;
  title: string;
  description: string;
  /** Deep link to the recall notice (interoperate, never republish whole). */
  cpscUrl: string;
  /** Concatenated hazard names from the CPSC Hazards[] array. */
  hazardDescription: string;
  /** Concatenated remedy names from the CPSC Remedies[] array. */
  remedyDescription: string;
  /** CPSC NumberOfUnits when stated; null = not stated (never invented). */
  unitsAffected: number | null;
  isSynthetic: boolean;
  createdAt: IsoTimestamp;
}

/**
 * One recalled product line from the CPSC Products[] array. Matching to
 * catalog variants (via UPC -> product_identifiers, then name/model
 * similarity) is algorithm-engineer's (Phase 4); unmatched or ambiguous
 * matches are suppressed per §1.5, never guessed.
 */
export interface RecallProduct extends WithProvenance {
  id: string;
  recallId: string;
  name: string;
  description: string;
  model: string | null;
  upc: string | null;
  createdAt: IsoTimestamp;
}
