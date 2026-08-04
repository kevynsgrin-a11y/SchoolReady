/**
 * Phase 3 on the real workerd runtime: the UPLOAD_BUFFER R2 binding behaves
 * as the transient, hard-TTL buffer the contract promises, and a full
 * PII-seeded upload cycle leaves ZERO PII in any persistence surface —
 * the R2 bucket is scanned (empty) and EVERY row of EVERY D1 table is
 * serialized and scanned for the seeded values (SS1.7).
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  R2UploadBuffer,
  UPLOAD_BUFFER_TTL_SECONDS,
  createFixtureOcrEngine,
  parseUploadIntake,
} from "../src/parsing";
import type { OcrFixtureRow, ParseLogEvent, R2Like } from "../src/parsing";
import type { FixtureDocument } from "../src/ingestion/types";

const T0 = Date.parse("2026-08-04T12:00:00.000Z");
const bucket = env.UPLOAD_BUFFER as unknown as R2Like;

const SEEDED = [
  "Zephyrine",
  "Quatermain",
  "Pumpernickel",
  "4127",
  "Maplewood",
  "75001",
  "youth medium",
  "47.50",
];

const PII_TEXT = [
  "Student Name: Zephyrine Quatermain",
  "Teacher: Mrs. Pumpernickel, Room 4127",
  "Drop off at 4821 Maplewood Avenue, TX 75001",
  "PE shirt, youth medium",
  "Budget: $47.50 total",
  "2 boxes #2 pencils, sharpened",
  "wired earbuds, no Bluetooth",
].join("\n");

const ocrDoc: FixtureDocument<OcrFixtureRow> = {
  _fixture: true,
  fixtureSet: "fixture:ocr-workers-pii-v1",
  description: "Synthetic OCR replay with seeded PII for the workers-runtime SS1.7 cycle.",
  generatedAt: "2026-08-04T00:00:00.000Z",
  provenance: {
    source: "fixture:ocr-workers-pii-v1",
    sourceType: "fixture",
    observedAt: "2026-08-04T00:00:00.000Z",
    geography: "US",
    transformVersion: "none",
    confidence: 1,
    limitations: "Synthetic fixture OCR output with seeded PII (test-only).",
  },
  records: [
    {
      objectKey: "uploads/workers-pii",
      contentType: "image/png",
      pages: [{ pageNumber: 1, text: PII_TEXT, meanConfidence: 0.92 }],
      meanConfidence: 0.92,
    },
  ],
};

describe("UPLOAD_BUFFER binding (real R2) — transient with hard TTL", () => {
  it("round-trips bytes and metadata under the uploads/ prefix", async () => {
    const buffer = new R2UploadBuffer(bucket, () => T0);
    const bytes = new TextEncoder().encode("workers fixture upload");
    const meta = await buffer.put("uploads/rt", bytes, "image/png");
    expect(meta.expiresAt).toBe(
      new Date(T0 + UPLOAD_BUFFER_TTL_SECONDS * 1000).toISOString(),
    );
    const got = await buffer.get("uploads/rt");
    expect(got).not.toBeNull();
    expect(new TextDecoder().decode(got!.bytes)).toBe("workers fixture upload");
    await buffer.delete("uploads/rt");
    expect(await buffer.list()).toEqual([]);
  });

  it("enforces the hard TTL in code even though R2 lifecycle is day-granular", async () => {
    let now = T0;
    const buffer = new R2UploadBuffer(bucket, () => now);
    await buffer.put("uploads/ttl", new Uint8Array([1, 2, 3]), "application/pdf");
    now = T0 + UPLOAD_BUFFER_TTL_SECONDS * 1000; // boundary: expired
    expect(await buffer.get("uploads/ttl")).toBeNull();
    // Deletion verified against the real bucket, not assumed:
    const { objects } = await bucket.list({ prefix: "uploads/" });
    expect(objects.map((o) => o.key)).toEqual([]);
  });
});

describe("zero-PII upload cycle on workerd (SS1.7) — R2 and D1 scanned", () => {
  it("leaves no seeded value in R2, in D1, in logs, or in the outcome", async () => {
    const buffer = new R2UploadBuffer(bucket, () => T0);
    await buffer.put(
      "uploads/workers-pii",
      new TextEncoder().encode(PII_TEXT),
      "image/png",
    );
    const logEvents: ParseLogEvent[] = [];
    const outcome = await parseUploadIntake(
      {
        intakeId: "workers-pii-1",
        objectKey: "uploads/workers-pii",
        buffer,
        ocr: createFixtureOcrEngine(ocrDoc),
      },
      { clock: () => T0, logger: (e) => logEvents.push(e) },
    );

    // The parse worked: real items with their hard constraints intact.
    const slugs = outcome.items.map((i) => i.draft.productTypeSlug);
    expect(slugs).toContain("no2-pencil");
    expect(slugs).toContain("earbuds");

    // 1. R2: the upload is gone (scanned, not assumed).
    const { objects } = await bucket.list({ prefix: "uploads/" });
    expect(objects).toEqual([]);

    // 2. D1: serialize every row of every table and scan for seeded values.
    const { results: tables } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'`,
    ).all<{ name: string }>();
    expect(tables.length).toBeGreaterThan(10); // the scan covers a real schema
    let persisted = "";
    for (const { name } of tables) {
      const { results } = await env.DB.prepare(`SELECT * FROM "${name}"`).all();
      persisted += JSON.stringify({ table: name, rows: results });
    }
    for (const value of SEEDED) {
      expect(persisted.includes(value), `D1 leaked "${value}"`).toBe(false);
      expect(
        JSON.stringify(logEvents).includes(value),
        `log output leaked "${value}"`,
      ).toBe(false);
      expect(
        JSON.stringify(outcome).includes(value),
        `parse outcome leaked "${value}"`,
      ).toBe(false);
    }

    // 3. The redaction report carries categories only.
    expect(outcome.redaction.categoriesHit).toEqual([
      "address",
      "budget_amount",
      "child_name",
      "classroom_id",
      "exact_size",
      "teacher_name",
    ]);
  });
});
