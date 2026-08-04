/**
 * Phase 2 tables + KV binding on the real workerd runtime: migrations 0005/
 * 0006 apply on the D1 engine, the §1.4 provenance FK rejects unprovenanced
 * writes to the new tables, and the SOURCE_KV namespace round-trips
 * source-health snapshots and SWR cache envelopes with the documented key
 * prefixes.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Phase 2 tables on the real D1 engine", () => {
  it("migrations created the recalls/tax/offers/source_health tables", async () => {
    const { results } = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    for (const t of [
      "recalls",
      "recall_products",
      "tax_holidays",
      "tax_holiday_categories",
      "offers",
      "source_health",
    ]) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });

  it("rejects an unprovenanced recall at write time (§1.4)", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, provenance_id)
         VALUES ('r1', 'FIXTURE-990001', 'FX-26-101', '2026-07-10', 'Fixture Recall (Fixture Sample)', 'https://example.com/fixture', 'missing')`,
      ).run(),
    ).rejects.toThrow(/FOREIGN KEY/i);
  });

  it("accepts provenanced Phase 2 facts across the full chain", async () => {
    await env.DB.prepare(
      `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
       VALUES ('p2', 'fixture:workers-ingestion-test', 'fixture', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1.0)`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, provenance_id)
       VALUES ('r2', 'FIXTURE-990002', 'FX-26-102', '2026-07-11', 'Fixture Recall Two (Fixture Sample)', 'https://example.com/fixture2', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO tax_holidays (id, state, year, starts_on, ends_on, provenance_id)
       VALUES ('th1', 'TX', 2026, '2026-08-07', '2026-08-09', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO product_types (id, slug, name, category, default_durability, provenance_id)
       VALUES ('pt1', 'glue-stick', 'Glue stick', 'art', 'consumable', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO products (id, product_type_id, name, provenance_id)
       VALUES ('pr1', 'pt1', 'Fixture Glue Stick', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO product_variants (id, product_id, provenance_id)
       VALUES ('v1', 'pr1', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO retailers (id, slug, name, provenance_id)
       VALUES ('rt1', 'fixture-mart', 'Fixture Mart', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO offers (id, variant_id, retailer_id, price_cents, availability, provenance_id)
       VALUES ('o1', 'v1', 'rt1', 199, 'in_stock', 'p2')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO source_health (source_id, circuit_state, license_basis, provenance_id)
       VALUES ('cpsc_recalls', 'closed', 'us_government_open_data', 'p2')`,
    ).run();
    const row = await env.DB.prepare(
      `SELECT circuit_state FROM source_health WHERE source_id = 'cpsc_recalls'`,
    ).first<{ circuit_state: string }>();
    expect(row?.circuit_state).toBe("closed");
  });
});

describe("SOURCE_KV namespace (real workerd KV)", () => {
  it("round-trips a source-health snapshot under the health: prefix", async () => {
    const snapshot = {
      sourceId: "cpsc_recalls",
      circuitState: "closed",
      consecutiveFailures: 0,
    };
    await env.SOURCE_KV.put("health:cpsc_recalls", JSON.stringify(snapshot));
    const raw = await env.SOURCE_KV.get("health:cpsc_recalls");
    expect(JSON.parse(raw!)).toEqual(snapshot);
  });

  it("round-trips an SWR cache envelope under the cache: prefix", async () => {
    const envelope = {
      storedAt: "2026-08-04T00:00:00.000Z",
      payload: { records: [] },
    };
    await env.SOURCE_KV.put("cache:state_tax_holidays", JSON.stringify(envelope));
    const raw = await env.SOURCE_KV.get("cache:state_tax_holidays");
    expect(JSON.parse(raw!)).toEqual(envelope);
  });
});
