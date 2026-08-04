/**
 * Phase 3 on the real workerd runtime: the UPLOAD_BUFFER R2 binding behaves
 * as the transient, hard-TTL buffer the contract promises, and a full
 * PII-seeded upload cycle leaves ZERO PII in any persistence surface —
 * the R2 bucket is scanned (empty) and EVERY row of EVERY D1 table is
 * serialized and scanned for the seeded values (SS1.7).
 *
 * Phase 5 extensions (gate conditions P3-2 + P3-3): the seeded set and text
 * now MATCH the node suite (tests/parsing-pii.test.ts) in full, and the
 * cycle continues through the Phase 5 API persistence path — the confirmed
 * requirements are written to D1 through POST /api/lists/confirm (controlled
 * vocabulary only; no column fed from originalText or ReviewPayload text) —
 * before every table row is re-scanned.
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
import { makeClient, dumpAllTables } from "./api-helpers";

const T0 = Date.parse("2026-08-04T12:00:00.000Z");
const bucket = env.UPLOAD_BUFFER as unknown as R2Like;

/** P3-3: the FULL node-suite seeded set (tests/parsing-pii.test.ts SEEDED). */
const SEEDED = [
  "Zephyrine",
  "Quatermain",
  "Pumpernickel",
  "4127",
  "4821",
  "Maplewood",
  "75001",
  "13.5",
  "youth medium",
  "47.50",
  "Willabelle",
  "867-5309",
  "quartermaster@example.net",
];

/** P3-3: the FULL node-suite intake text (tests/parsing-pii.test.ts PII_TEXT). */
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
    expect(slugs).toContain("binder");
    expect(slugs).toContain("earbuds");

    // P3-2: continue the cycle over the Phase 5 D1 persistence path — the
    // user confirms the review and the API writes requirement rows built
    // from CONTROLLED-VOCABULARY draft fields only.
    const client = makeClient({ idPrefix: "pii5" });
    const confirm = await client.call("POST", "/api/lists/confirm", {
      body: {
        intakeId: outcome.intakeId,
        intakeMethod: "upload",
        schoolYear: "2026-2027",
        memberOrdinal: 1,
        items: outcome.items
          .filter((i) => !i.needsReview && i.draft.productTypeSlug !== null)
          .map((i) => ({
            productTypeSlug: i.draft.productTypeSlug,
            quantity: i.draft.quantity,
            unit: i.draft.unit,
            packCount: i.draft.packCount,
            dimensions: i.draft.dimensions,
            material: i.draft.material,
            color: i.draft.color,
            rulingStyle: i.draft.rulingStyle,
            brandRequirement: i.draft.brandRequirement,
            requiredBrandSlug: i.draft.requiredBrandSlug,
            optionality: i.draft.optionality,
            prohibitedSubstitutions: i.draft.prohibitedSubstitutions,
            sourceConfidence: i.draft.sourceConfidence,
          })),
      },
    });
    expect(confirm.status).toBe(201);
    // The three resolvable items persisted, hard constraints intact.
    expect(confirm.body.data.requirements).toHaveLength(3);
    const persistedEarbuds = confirm.body.data.requirements.find(
      (r: { productTypeSlug: string }) => r.productTypeSlug === "earbuds",
    );
    expect(persistedEarbuds.prohibitedSubstitutions).toEqual([
      "no_bluetooth",
      "wired_required",
    ]);

    // 1. R2: the upload is gone (scanned, not assumed).
    const { objects } = await bucket.list({ prefix: "uploads/" });
    expect(objects).toEqual([]);

    // 2. D1: serialize every row of every table — NOW INCLUDING the Phase 5
    //    writes (api_sessions, households, supply_lists, requirements, ...)
    //    — and scan for the seeded values.
    const { results: tables } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_%' ESCAPE '\\'`,
    ).all<{ name: string }>();
    expect(tables.length).toBeGreaterThan(10); // the scan covers a real schema
    const requirementCount = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM requirements`,
    ).first<{ n: number }>();
    expect(requirementCount!.n).toBeGreaterThanOrEqual(3); // the scan covers real writes
    const persisted = await dumpAllTables();
    const apiSurfaces = JSON.stringify(client.envelopes) + JSON.stringify(client.logs);
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
      expect(apiSurfaces.includes(value), `API surface leaked "${value}"`).toBe(false);
    }

    // 3. The redaction report carries categories only — P3-3: the full
    //    node-suite category list, all eight.
    expect(outcome.redaction.categoriesHit).toEqual([
      "address",
      "budget_amount",
      "child_name",
      "classroom_id",
      "contact",
      "exact_size",
      "gift_recipient",
      "teacher_name",
    ]);
  });
});
