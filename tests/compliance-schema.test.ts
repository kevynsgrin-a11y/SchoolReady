/**
 * Phase 10 (compliance-officer) — migration 0008 brands hardening (gate
 * finding P5-4): the brands table now rejects, AT THE SCHEMA LEVEL, values
 * the two application layers (parseManualIntake lexicon check +
 * store.ensureBrand refusal) already refuse — defense in depth for the one
 * global table a user-supplied slug can reach (§1.7). Reversibility and the
 * provenance-FK/PII/economics guards are covered by tests/schema.test.ts,
 * which discovers the rebuilt table from the live schema.
 */
import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { applyAllUp, openDb } from "./helpers/migrations";
import { BRAND_LEXICON } from "../src/parsing/lexicon";

function migratedDb(): DatabaseSync {
  const db = openDb();
  applyAllUp(db);
  db.prepare(
    `INSERT INTO provenance (id, source, source_type, observed_at, retrieved_at, confidence)
     VALUES ('p1', 'fixture:compliance-test', 'fixture', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z', 1.0)`,
  ).run();
  return db;
}

const insertBrand = (db: DatabaseSync, id: string, name: string, normalized: string): void => {
  db.prepare(
    `INSERT INTO brands (id, name, normalized_name, provenance_id) VALUES (?, ?, ?, 'p1')`,
  ).run(id, name, normalized);
};

describe("migration 0008 — brands CHECK/length constraints (P5-4)", () => {
  it("accepts every real lexicon brand slug in the store.ensureBrand shape", () => {
    const db = migratedDb();
    for (const brand of BRAND_LEXICON) {
      insertBrand(db, `brand:${brand.slug}`, brand.slug, brand.slug);
    }
    db.close();
  });

  it("still accepts the documented merge-key form (lowercase with spaces)", () => {
    const db = migratedDb();
    insertBrand(db, "b1", "Fixture Brand", "fixture brand");
    db.close();
  });

  it("rejects an over-length name and an over-length normalized_name", () => {
    const db = migratedDb();
    expect(() => insertBrand(db, "b-long", "x".repeat(65), "xlong")).toThrow(/CHECK/i);
    expect(() => insertBrand(db, "b-long2", "ok", "y".repeat(65))).toThrow(/CHECK/i);
    db.close();
  });

  it("rejects empty strings for name and normalized_name", () => {
    const db = migratedDb();
    expect(() => insertBrand(db, "b-empty", "", "ok")).toThrow(/CHECK/i);
    expect(() => insertBrand(db, "b-empty2", "ok", "")).toThrow(/CHECK/i);
    db.close();
  });

  it("rejects a cased or free-charset normalized_name (merge key must be lowercase)", () => {
    const db = migratedDb();
    expect(() => insertBrand(db, "b-cased", "Elmers", "Elmers")).toThrow(/CHECK/i);
    expect(() => insertBrand(db, "b-punct", "ok", "elmer's")).toThrow(/CHECK/i);
    expect(() => insertBrand(db, "b-inject", "ok", "drop table; brands")).toThrow(/CHECK/i);
    db.close();
  });

  it("rejects an over-length id (opaque ids stay bounded)", () => {
    const db = migratedDb();
    expect(() => insertBrand(db, `brand:${"z".repeat(80)}`, "ok", "zok")).toThrow(/CHECK/i);
    db.close();
  });

  it("keeps the UNIQUE merge key and NOT NULL provenance FK behavior", () => {
    const db = migratedDb();
    insertBrand(db, "brand:mead", "mead", "mead");
    expect(() => insertBrand(db, "brand:mead2", "mead again", "mead")).toThrow(/UNIQUE/i);
    expect(() =>
      db.prepare(
        `INSERT INTO brands (id, name, normalized_name, provenance_id)
         VALUES ('b-fk', 'ok', 'okfk', 'prov-missing')`,
      ).run(),
    ).toThrow(/FOREIGN KEY/i);
    db.close();
  });
});
