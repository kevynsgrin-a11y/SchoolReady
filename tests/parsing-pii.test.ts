/**
 * SS1.7 — PII never persists. A full upload cycle (buffer -> OCR -> redaction
 * -> parse -> review payload) and a paste cycle are run with SEEDED PII of
 * every category CLAUDE.md names: child name, teacher name, classroom ID,
 * address, exact size, household budget — plus contact and gift recipient.
 * Afterwards, EVERY surface that outlives the cycle is serialized and scanned
 * for the seeded values:
 *   1. the upload buffer (must be empty — deletion verified, not assumed),
 *   2. every captured log event,
 *   3. the entire ParseOutcome (items, drafts, provenance, review payload),
 *   4. the redaction report (categories and counts ONLY, never values).
 * The workers-runtime twin (tests-workers/parsing-upload-r2.test.ts) repeats
 * the cycle against real R2 and scans every D1 table row.
 */
import { describe, expect, it } from "vitest";
import {
  MemoryUploadBuffer,
  PII_CATEGORIES,
  createFixtureOcrEngine,
  parsePasteIntake,
  parseUploadIntake,
  redactPii,
} from "../src/parsing";
import type { OcrFixtureRow, ParseLogEvent } from "../src/parsing";
import type { FixtureDocument } from "../src/ingestion/types";

const T0 = Date.parse("2026-08-04T12:00:00.000Z");

/**
 * Seeded PII values, one per category, chosen to be unmistakable in a scan
 * (no overlap with product vocabulary, timestamps, or confidences).
 */
const SEEDED = {
  child_name: ["Zephyrine", "Quatermain"],
  teacher_name: ["Pumpernickel"],
  classroom_id: ["4127"],
  address: ["4821", "Maplewood", "75001"],
  exact_size: ["13.5", "youth medium"],
  budget_amount: ["47.50"],
  gift_recipient: ["Willabelle"],
  contact: ["867-5309", "quartermaster@example.net"],
} as const;
const ALL_SEEDED = Object.values(SEEDED).flat();

/** The intake text a parent might actually upload/paste, PII included. */
const PII_TEXT = [
  "Student Name: Zephyrine Quatermain",
  "Teacher: Mrs. Pumpernickel, Room 4127",
  "Drop off at 4821 Maplewood Avenue, TX 75001",
  "sneakers, shoe size 13.5",
  "PE shirt, youth medium",
  "Budget: $47.50 total",
  "gift for Grandma Willabelle",
  "Questions? Call 555-867-5309 or quartermaster@example.net",
  "2 boxes #2 pencils, sharpened",
  "one 1.5-inch heavy-duty binder",
  "wired earbuds, no Bluetooth",
].join("\n");

function scan(surfaceName: string, serialized: string): void {
  for (const value of ALL_SEEDED) {
    expect(
      serialized.includes(value),
      `${surfaceName} leaked seeded PII value "${value}"`,
    ).toBe(false);
  }
}

describe("zero-PII upload cycle (SS1.7 enforcement test from CLAUDE.md)", () => {
  const ocrDoc: FixtureDocument<OcrFixtureRow> = {
    _fixture: true,
    fixtureSet: "fixture:ocr-pii-cycle-v1",
    description: "Synthetic OCR replay carrying seeded PII for the SS1.7 cycle test.",
    generatedAt: "2026-08-04T00:00:00.000Z",
    provenance: {
      source: "fixture:ocr-pii-cycle-v1",
      sourceType: "fixture",
      observedAt: "2026-08-04T00:00:00.000Z",
      geography: "US",
      transformVersion: "none",
      confidence: 1,
      limitations: "Synthetic fixture OCR output with seeded PII (test-only).",
    },
    records: [
      {
        objectKey: "uploads/pii-cycle",
        contentType: "image/png",
        pages: [{ pageNumber: 1, text: PII_TEXT, meanConfidence: 0.92 }],
        meanConfidence: 0.92,
      },
    ],
  };

  it("after a full cycle, no persistence surface or log carries a seeded value", async () => {
    const buffer = new MemoryUploadBuffer(() => T0);
    await buffer.put(
      "uploads/pii-cycle",
      new TextEncoder().encode(PII_TEXT),
      "image/png",
    );
    const logEvents: ParseLogEvent[] = [];
    const outcome = await parseUploadIntake(
      {
        intakeId: "pii-cycle-1",
        objectKey: "uploads/pii-cycle",
        buffer,
        ocr: createFixtureOcrEngine(ocrDoc),
      },
      { clock: () => T0, logger: (e) => logEvents.push(e) },
    );

    // 1. The upload buffer is empty — the bytes are gone, verified.
    expect(await buffer.list()).toEqual([]);

    // 2. Logs were emitted (the capture is real) and carry no seeded value.
    expect(logEvents.length).toBeGreaterThanOrEqual(3);
    expect(logEvents.map((e) => e.event)).toContain("upload_buffer_deleted");
    scan("log output", JSON.stringify(logEvents));

    // 3. The full outcome — parsed items, drafts, provenance, review payload
    //    (everything any later phase could persist or render) — is clean.
    scan("parse outcome", JSON.stringify(outcome));

    // 4. The list items themselves survived the redaction.
    const slugs = outcome.items.map((i) => i.draft.productTypeSlug);
    expect(slugs).toContain("no2-pencil");
    expect(slugs).toContain("binder");
    expect(slugs).toContain("earbuds");
  });

  it("the redaction report names categories and counts, never values", async () => {
    const buffer = new MemoryUploadBuffer(() => T0);
    await buffer.put(
      "uploads/pii-cycle",
      new TextEncoder().encode(PII_TEXT),
      "image/png",
    );
    const outcome = await parseUploadIntake(
      {
        intakeId: "pii-cycle-2",
        objectKey: "uploads/pii-cycle",
        buffer,
        ocr: createFixtureOcrEngine(ocrDoc),
      },
      { clock: () => T0 },
    );
    const { redaction } = outcome;
    // Every seeded category was hit...
    expect(redaction.categoriesHit).toEqual(
      [...(Object.keys(SEEDED) as (keyof typeof SEEDED)[])].sort(),
    );
    expect(redaction.redactionCount).toBeGreaterThanOrEqual(8);
    // ...and the report's own serialization contains ONLY category tokens.
    const serialized = JSON.stringify(redaction);
    scan("redaction report", serialized);
    for (const category of redaction.categoriesHit) {
      expect(PII_CATEGORIES).toContain(category);
    }
  });
});

describe("zero-PII paste cycle (same boundary, no buffer)", () => {
  it("redacts at intake so PII never reaches items, review, or logs", () => {
    const logEvents: ParseLogEvent[] = [];
    const outcome = parsePasteIntake(
      { intakeId: "pii-paste-1", text: PII_TEXT },
      { clock: () => T0, logger: (e) => logEvents.push(e) },
    );
    scan("paste outcome", JSON.stringify(outcome));
    scan("paste log output", JSON.stringify(logEvents));
    // Redacted PII-only lines become skipped noise, never items: only the
    // three real list lines survive as items.
    expect(outcome.items.length).toBe(3);
    expect(outcome.review.skippedLineCount).toBe(8);
  });

  it("review originalText shows redaction tokens in place of values", () => {
    const outcome = parsePasteIntake(
      { intakeId: "pii-paste-2", text: "1 backpack, size 13.5" },
      { clock: () => T0 },
    );
    expect(outcome.items).toHaveLength(1);
    const original = outcome.review.items.map((i) => i.originalText).join("\n");
    expect(original).toContain("[redacted:exact_size]");
    scan("review originalText", original);
  });
});

describe("redactPii unit behavior", () => {
  it("replaces each seeded value with its category token", () => {
    const { text, report } = redactPii(PII_TEXT);
    scan("redacted text", text);
    for (const category of Object.keys(SEEDED)) {
      expect(text).toContain(`[redacted:${category}]`);
    }
    expect(report.redactionCount).toBe(
      Object.values(report.counts).reduce((a, b) => a + b, 0),
    );
  });

  it("leaves product dimensions alone — only person-shaped sizes redact", () => {
    const { text } = redactPii("one 1.5-inch heavy-duty binder");
    expect(text).toBe("one 1.5-inch heavy-duty binder");
  });
});
