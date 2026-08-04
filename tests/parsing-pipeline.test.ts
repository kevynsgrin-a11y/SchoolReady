/**
 * Pipeline-level guarantees: SS1.4 provenance on every parsed requirement
 * (with intake-method sourceType), extraction confidence semantics (< 1.0
 * for any OCR/text extraction; 1.0 only for direct structured entry), OCR
 * fixture-labeling gates, low-OCR review forcing, and the channel rule that
 * NOTHING in the parsing path performs network I/O (fetch poisoned).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provenanceDefect } from "../src/ingestion/provenance";
import {
  MemoryUploadBuffer,
  OcrDisabledError,
  OcrFixtureError,
  PARSER_TRANSFORM_VERSION,
  createFixtureOcrEngine,
  createLiveOcrStub,
  parseManualIntake,
  parsePasteIntake,
  parseUploadIntake,
} from "../src/parsing";
import type { OcrFixtureRow } from "../src/parsing";
import type { FixtureDocument } from "../src/ingestion/types";

const T0 = Date.parse("2026-08-04T12:00:00.000Z");
const clock = () => T0;

// SS0 NOT #1 / no-network: any fetch attempt in the parsing path is a bug.
const realFetch = globalThis.fetch;
let fetchAttempts = 0;
beforeAll(() => {
  globalThis.fetch = (() => {
    fetchAttempts += 1;
    throw new Error("network access attempted in the parsing path");
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

function ocrDoc(rows: OcrFixtureRow[]): FixtureDocument<OcrFixtureRow> {
  return {
    _fixture: true,
    fixtureSet: "fixture:ocr-pipeline-test-v1",
    description: "Synthetic OCR replay rows for pipeline tests.",
    generatedAt: "2026-08-04T00:00:00.000Z",
    provenance: {
      source: "fixture:ocr-pipeline-test-v1",
      sourceType: "fixture",
      observedAt: "2026-08-04T00:00:00.000Z",
      geography: "US",
      transformVersion: "none",
      confidence: 1,
      limitations: "Synthetic fixture OCR output.",
    },
    records: rows,
  };
}

describe("SS1.4 — provenance on every parsed requirement, per intake method", () => {
  it("paste items carry user_entry provenance with the parser version", () => {
    const outcome = parsePasteIntake(
      { intakeId: "prov-paste", text: "2 glue sticks\n1 backpack, no wheels" },
      { clock },
    );
    expect(outcome.items.length).toBe(2);
    for (const item of outcome.items) {
      expect(provenanceDefect(item.provenance)).toBeNull();
      expect(item.provenance.sourceType).toBe("user_entry");
      expect(item.provenance.source).toBe("user:paste-intake");
      expect(item.provenance.transformVersion).toBe(PARSER_TRANSFORM_VERSION);
      expect(item.provenance.geography).toBe("US");
      expect(item.provenance.confidence).toBe(item.draft.sourceConfidence);
      expect(item.provenance.limitations).toMatch(/user confirms/i);
      expect(item.draft.sourceKind).toBe("paste");
      // Text extraction is never certainty (handoff 03 SS8).
      expect(item.draft.sourceConfidence).toBeLessThan(1);
    }
  });

  it("manual items carry user_entry provenance, transform 'none', confidence 1", () => {
    const outcome = parseManualIntake(
      {
        intakeId: "prov-manual",
        items: [
          {
            productTypeSlug: "no2-pencil",
            quantity: 2,
            unit: "box",
            prohibitedSubstitutions: ["presharpened_required"],
          },
        ],
      },
      { clock },
    );
    const item = outcome.items[0]!;
    expect(provenanceDefect(item.provenance)).toBeNull();
    expect(item.provenance.sourceType).toBe("user_entry");
    expect(item.provenance.source).toBe("user:manual-entry");
    expect(item.provenance.transformVersion).toBe("none"); // verbatim entry
    expect(item.draft.sourceKind).toBe("manual");
    // Direct structured user assertion — not extraction — may be 1.0.
    expect(item.draft.sourceConfidence).toBe(1);
    expect(item.draft.prohibitedSubstitutions).toEqual(["presharpened_required"]);
  });

  it("upload items carry user_upload provenance, OCR-composed transform, confidence < 1", async () => {
    const buffer = new MemoryUploadBuffer(clock);
    await buffer.put("uploads/prov", new Uint8Array([1]), "image/png");
    const outcome = await parseUploadIntake(
      {
        intakeId: "prov-upload",
        objectKey: "uploads/prov",
        buffer,
        ocr: createFixtureOcrEngine(
          ocrDoc([
            {
              objectKey: "uploads/prov",
              contentType: "image/png",
              pages: [
                { pageNumber: 1, text: "2 boxes #2 pencils, sharpened", meanConfidence: 0.9 },
              ],
              meanConfidence: 0.9,
            },
          ]),
        ),
      },
      { clock },
    );
    const item = outcome.items[0]!;
    expect(provenanceDefect(item.provenance)).toBeNull();
    expect(item.provenance.sourceType).toBe("user_upload");
    expect(item.provenance.source).toBe("user:upload-intake");
    expect(item.provenance.transformVersion).toBe(
      `${PARSER_TRANSFORM_VERSION}+fixture-ocr@1.0.0`,
    );
    expect(item.provenance.limitations).toMatch(/processed\s+ephemerally and deleted/i);
    expect(item.draft.sourceKind).toBe("upload");
    // OCR extraction confidence is scaled ONCE by the page's confidence
    // (0.95 extraction * 0.9 page, rounded to 2 places) — never 1.0.
    expect(item.draft.sourceConfidence).toBeLessThan(1);
    expect(item.draft.sourceConfidence).toBe(0.86);
    // The hard constraint survived the OCR path too.
    expect(item.draft.prohibitedSubstitutions).toEqual(["presharpened_required"]);
  });

  it("a low-confidence OCR page forces review on its items (SS1.5)", async () => {
    const buffer = new MemoryUploadBuffer(clock);
    await buffer.put("uploads/blurry", new Uint8Array([1]), "image/png");
    const outcome = await parseUploadIntake(
      {
        intakeId: "prov-blurry",
        objectKey: "uploads/blurry",
        buffer,
        ocr: createFixtureOcrEngine(
          ocrDoc([
            {
              objectKey: "uploads/blurry",
              contentType: "image/png",
              pages: [{ pageNumber: 1, text: "2 glue sticks", meanConfidence: 0.6 }],
              meanConfidence: 0.6,
            },
          ]),
        ),
      },
      { clock },
    );
    const item = outcome.items[0]!;
    expect(item.ambiguityFlags).toContain("low_ocr_confidence");
    expect(item.needsReview).toBe(true);
    expect(item.draft.sourceConfidence).toBe(0.57);
  });
});

describe("OCR engines (fixture posture — SS0)", () => {
  it("the live OCR stub rejects with the disabled error and never fetches", async () => {
    await expect(
      createLiveOcrStub().recognize({
        objectKey: "uploads/x",
        contentType: "image/png",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(OcrDisabledError);
  });

  it("the fixture engine refuses unlabeled documents", () => {
    const doc = ocrDoc([]);
    expect(() =>
      createFixtureOcrEngine({ ...doc, _fixture: false as unknown as true }),
    ).toThrow(OcrFixtureError);
    expect(() =>
      createFixtureOcrEngine({ ...doc, fixtureSet: "unlabeled-set" }),
    ).toThrow(/'fixture:'-namespaced/);
  });

  it("the fixture engine refuses unknown object keys instead of inventing text", async () => {
    const engine = createFixtureOcrEngine(ocrDoc([]));
    await expect(
      engine.recognize({
        objectKey: "uploads/unknown",
        contentType: "image/png",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toThrow(/no labeled fixture OCR output/);
  });
});

describe("no network I/O anywhere in the parsing path", () => {
  it("zero fetch attempts were made across this suite", () => {
    expect(fetchAttempts).toBe(0);
  });
});
