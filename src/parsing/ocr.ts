/**
 * OCR engine interface for the photo/PDF upload path.
 *
 * Fixture posture (SS0 launch posture): the ONLY working implementation
 * replays clearly-labeled fixture OCR outputs; the live engine is a throwing
 * stub containing no network code at all (same pattern as Phase 2's
 * createLiveStub). A real OCR integration lands later behind a feature flag
 * in config/flags.ts plus compliance review — nothing here changes when it
 * does, because both engines emit the same OcrResult and everything
 * downstream (redaction -> normalization -> review) is shared.
 */
import type { FixtureDocument } from "../ingestion/types";

export interface OcrPage {
  pageNumber: number;
  text: string;
  /** Mean recognition confidence for the page, 0.0-1.0. Never fabricated. */
  meanConfidence: number;
}

export interface OcrRequest {
  objectKey: string;
  contentType: string;
  /** Raw upload bytes from the transient buffer (never persisted). */
  bytes: Uint8Array;
}

export interface OcrResult {
  objectKey: string;
  engineVersion: string;
  pages: OcrPage[];
  /** Overall mean confidence — scales requirement sourceConfidence (<1.0). */
  meanConfidence: number;
}

export interface OcrEngine {
  readonly mode: "fixture" | "live";
  readonly engineVersion: string;
  recognize(request: OcrRequest): Promise<OcrResult>;
}

export class OcrDisabledError extends Error {
  constructor() {
    super(
      "Live OCR is disabled: Phase 3 ships no OCR implementation and no OCR " +
        "feature flag exists yet in config/flags.ts (SS0 launch posture — " +
        "every live integration lands behind a flag with licensing review). " +
        "No network request was made. Use the fixture engine " +
        "(createFixtureOcrEngine).",
    );
    this.name = "OcrDisabledError";
  }
}

export class OcrFixtureError extends Error {
  constructor(reason: string) {
    super(`Fixture OCR engine rejected input: ${reason}`);
    this.name = "OcrFixtureError";
  }
}

/** Fixture replay row: labeled OCR output for one upload object key. */
export interface OcrFixtureRow {
  objectKey: string;
  contentType: string;
  pages: OcrPage[];
  meanConfidence: number;
}

const FIXTURE_OCR_VERSION = "fixture-ocr@1.0.0";

/**
 * Replays labeled fixture OCR outputs. Refuses documents that are not
 * explicitly `_fixture: true` with fixture-typed provenance — the same
 * labeling gate the ingestion adapters enforce (never a plausible
 * fabrication).
 */
export function createFixtureOcrEngine(
  doc: FixtureDocument<OcrFixtureRow>,
): OcrEngine {
  if (doc._fixture !== true || doc.provenance.sourceType !== "fixture") {
    throw new OcrFixtureError(
      "fixture OCR document is not labeled _fixture:true with fixture-typed provenance",
    );
  }
  if (!doc.fixtureSet.startsWith("fixture:") || doc.provenance.source !== doc.fixtureSet) {
    throw new OcrFixtureError(
      `fixture set "${doc.fixtureSet}" must be 'fixture:'-namespaced and match provenance.source`,
    );
  }
  return {
    mode: "fixture",
    engineVersion: FIXTURE_OCR_VERSION,
    recognize(request: OcrRequest): Promise<OcrResult> {
      const row = doc.records.find((r) => r.objectKey === request.objectKey);
      if (!row) {
        return Promise.reject(
          new OcrFixtureError(
            `no labeled fixture OCR output for object key "${request.objectKey}"`,
          ),
        );
      }
      return Promise.resolve({
        objectKey: row.objectKey,
        engineVersion: FIXTURE_OCR_VERSION,
        pages: row.pages,
        meanConfidence: row.meanConfidence,
      });
    },
  };
}

/** The live engine is a stub: no fetch code exists to accidentally enable. */
export function createLiveOcrStub(): OcrEngine {
  return {
    mode: "live",
    engineVersion: "live-ocr@disabled",
    recognize(): Promise<never> {
      return Promise.reject(new OcrDisabledError());
    },
  };
}
