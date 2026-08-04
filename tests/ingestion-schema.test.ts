/**
 * Phase 2 schema tests for migrations 0005/0006 (recalls, recall_products,
 * tax_holidays, tax_holiday_categories, offers, source_health).
 *
 * The Phase 1 discovery suites automatically extend to these tables
 * (provenance FK, PII guard, economics guard, reversibility); this file adds
 * the table-specific constraint battery and keeps the new SQL CHECK
 * vocabularies mirrored 1:1 with src/contracts.
 */
import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import {
  applyAllUp,
  loadMigrations,
  openDb,
} from "./helpers/migrations";
import {
  AVAILABILITY_STATUSES,
  CIRCUIT_STATES,
  CURRENCIES,
  LICENSE_BASES,
  SOURCE_IDS,
  TAX_HOLIDAY_CATEGORIES,
} from "../src/contracts";

function newMigratedDb(): DatabaseSync {
  const db = openDb();
  applyAllUp(db);
  return db;
}

function seed(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
     VALUES ('p1', 'fixture:ingestion-schema-test', 'fixture', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1.0)`,
  ).run();
}

function seedCatalog(db: DatabaseSync): void {
  seed(db);
  db.prepare(
    `INSERT INTO product_types (id, slug, name, category, default_durability, provenance_id)
     VALUES ('pt1', 'glue-stick', 'Glue stick', 'art', 'consumable', 'p1')`,
  ).run();
  db.prepare(
    `INSERT INTO products (id, product_type_id, name, provenance_id)
     VALUES ('pr1', 'pt1', 'Fixture Glue Stick', 'p1')`,
  ).run();
  db.prepare(
    `INSERT INTO product_variants (id, product_id, provenance_id)
     VALUES ('v1', 'pr1', 'p1')`,
  ).run();
  db.prepare(
    `INSERT INTO retailers (id, slug, name, provenance_id)
     VALUES ('rt1', 'fixture-mart', 'Fixture Mart', 'p1')`,
  ).run();
}

describe("recalls — CPSC-shaped storage constraints", () => {
  it("accepts a valid synthetic recall with product lines, rejects one without provenance", () => {
    const db = newMigratedDb();
    expect(() =>
      db.prepare(
        `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, provenance_id)
         VALUES ('r1', 'FIXTURE-990001', 'FX-26-101', '2026-07-10', 'Fixture Recall (Fixture Sample)', 'https://example.com/fixture', 'nope')`,
      ).run(),
    ).toThrow(/FOREIGN KEY/i);
    seed(db);
    db.prepare(
      `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, provenance_id)
       VALUES ('r1', 'FIXTURE-990001', 'FX-26-101', '2026-07-10', 'Fixture Recall (Fixture Sample)', 'https://example.com/fixture', 'p1')`,
    ).run();
    db.prepare(
      `INSERT INTO recall_products (id, recall_id, name, upc, provenance_id)
       VALUES ('rp1', 'r1', 'Fixture Water Bottle', 'FIXTURE-UPC-0007', 'p1')`,
    ).run();
    db.close();
  });

  it("rejects duplicate CPSC recall ids and negative unit counts", () => {
    const db = newMigratedDb();
    seed(db);
    db.prepare(
      `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, provenance_id)
       VALUES ('r1', 'FIXTURE-990001', 'FX-26-101', '2026-07-10', 'Fixture Recall (Fixture Sample)', 'https://example.com/fixture', 'p1')`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, provenance_id)
         VALUES ('r2', 'FIXTURE-990001', 'FX-26-102', '2026-07-11', 'Fixture Recall Two (Fixture Sample)', 'https://example.com/fixture2', 'p1')`,
      ).run(),
    ).toThrow(/UNIQUE/i);
    expect(() =>
      db.prepare(
        `INSERT INTO recalls (id, cpsc_recall_id, recall_number, recall_date, title, cpsc_url, units_affected, provenance_id)
         VALUES ('r3', 'FIXTURE-990003', 'FX-26-103', '2026-07-12', 'Fixture Recall Three (Fixture Sample)', 'https://example.com/fixture3', -5, 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe("tax_holidays — window and category constraints", () => {
  function insertHoliday(db: DatabaseSync): void {
    db.prepare(
      `INSERT INTO tax_holidays (id, state, year, starts_on, ends_on, provenance_id)
       VALUES ('th1', 'TX', 2026, '2026-08-07', '2026-08-09', 'p1')`,
    ).run();
  }

  it("accepts a valid state window with capped and uncapped categories", () => {
    const db = newMigratedDb();
    seed(db);
    insertHoliday(db);
    db.prepare(
      `INSERT INTO tax_holiday_categories (id, holiday_id, holiday_category, price_cap_cents, provenance_id)
       VALUES ('thc1', 'th1', 'clothing', 10000, 'p1')`,
    ).run();
    db.prepare(
      `INSERT INTO tax_holiday_categories (id, holiday_id, holiday_category, provenance_id)
       VALUES ('thc2', 'th1', 'computers', 'p1')`,
    ).run();
    db.close();
  });

  it("rejects inverted windows, bad states, unknown categories, and duplicate category rows", () => {
    const db = newMigratedDb();
    seed(db);
    expect(() =>
      db.prepare(
        `INSERT INTO tax_holidays (id, state, year, starts_on, ends_on, provenance_id)
         VALUES ('bad', 'TX', 2026, '2026-08-09', '2026-08-07', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO tax_holidays (id, state, year, starts_on, ends_on, provenance_id)
         VALUES ('bad', 'TEX', 2026, '2026-08-07', '2026-08-09', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    insertHoliday(db);
    expect(() =>
      db.prepare(
        `INSERT INTO tax_holiday_categories (id, holiday_id, holiday_category, provenance_id)
         VALUES ('bad', 'th1', 'groceries', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.prepare(
      `INSERT INTO tax_holiday_categories (id, holiday_id, holiday_category, provenance_id)
       VALUES ('thc1', 'th1', 'clothing', 'p1')`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO tax_holiday_categories (id, holiday_id, holiday_category, provenance_id)
         VALUES ('thc-dup', 'th1', 'clothing', 'p1')`,
      ).run(),
    ).toThrow(/UNIQUE/i);
    db.close();
  });
});

describe("offers — latest-only price rows for resolved variants", () => {
  it("accepts a valid offer and enforces one offer per (variant, retailer)", () => {
    const db = newMigratedDb();
    seedCatalog(db);
    db.prepare(
      `INSERT INTO offers (id, variant_id, retailer_id, price_cents, availability, shipping_cents, provenance_id)
       VALUES ('o1', 'v1', 'rt1', 199, 'in_stock', 0, 'p1')`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO offers (id, variant_id, retailer_id, price_cents, provenance_id)
         VALUES ('o2', 'v1', 'rt1', 249, 'p1')`,
      ).run(),
    ).toThrow(/UNIQUE/i);
    db.close();
  });

  it("rejects negative prices, unknown availability, and non-USD currency", () => {
    const db = newMigratedDb();
    seedCatalog(db);
    expect(() =>
      db.prepare(
        `INSERT INTO offers (id, variant_id, retailer_id, price_cents, provenance_id)
         VALUES ('bad', 'v1', 'rt1', -1, 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO offers (id, variant_id, retailer_id, price_cents, availability, provenance_id)
         VALUES ('bad', 'v1', 'rt1', 199, 'maybe', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO offers (id, variant_id, retailer_id, price_cents, currency, provenance_id)
         VALUES ('bad', 'v1', 'rt1', 199, 'EUR', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe("source_health — breaker state + licensing flags", () => {
  it("accepts a registered source and rejects unknown ids, states, and bases", () => {
    const db = newMigratedDb();
    seed(db);
    db.prepare(
      `INSERT INTO source_health (source_id, circuit_state, license_basis, provenance_id)
       VALUES ('cpsc_recalls', 'closed', 'us_government_open_data', 'p1')`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO source_health (source_id, circuit_state, license_basis, provenance_id)
         VALUES ('teacherlists', 'closed', 'synthetic_fixture', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO source_health (source_id, circuit_state, license_basis, provenance_id)
         VALUES ('nces_ccd', 'melted', 'us_government_open_data', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    expect(() =>
      db.prepare(
        `INSERT INTO source_health (source_id, circuit_state, license_basis, provenance_id)
         VALUES ('nces_ccd', 'closed', 'finders_keepers', 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });

  it("licensing permission columns are strict 0/1 flags", () => {
    const db = newMigratedDb();
    seed(db);
    expect(() =>
      db.prepare(
        `INSERT INTO source_health (source_id, circuit_state, license_basis, license_allows_cache, provenance_id)
         VALUES ('nces_ccd', 'closed', 'us_government_open_data', 2, 'p1')`,
      ).run(),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe("vocabulary mirror — Phase 2 SQL CHECK lists match src/contracts", () => {
  const allSql = loadMigrations()
    .map((m) => m.up)
    .join("\n");

  function extractInLists(column: string): string[][] {
    const re = new RegExp(String.raw`\b${column}\s+IN\s*\(([^)]*)\)`, "g");
    return [...allSql.matchAll(re)].map((m) =>
      [...m[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!),
    );
  }

  function expectVocab(column: string, expected: readonly string[]): void {
    const lists = extractInLists(column);
    expect(lists.length, `no CHECK ... IN found for "${column}"`).toBeGreaterThan(0);
    for (const list of lists) {
      expect(list, `CHECK vocabulary drift on "${column}"`).toEqual([...expected]);
    }
  }

  it("offer vocabularies match", () => {
    expectVocab("availability", AVAILABILITY_STATUSES);
    expectVocab("currency", CURRENCIES);
  });

  it("tax-holiday category vocabulary matches", () => {
    expectVocab("holiday_category", TAX_HOLIDAY_CATEGORIES);
  });

  it("source-health vocabularies match (source ids stay in lockstep with flags)", () => {
    expectVocab("source_id", SOURCE_IDS);
    expectVocab("circuit_state", CIRCUIT_STATES);
    expectVocab("license_basis", LICENSE_BASES);
  });
});
