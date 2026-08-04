-- Migration 0008 — brands table hardening (Phase 10, compliance-officer).
-- Discharges gate finding P5-4 (docs/handoffs/gates/phase-5-gate.md): the
-- brands table had no schema-level CHECK/length cap; enforcement was two
-- tested application layers (parseManualIntake lexicon check +
-- store.ensureBrand refusal). data-architect concurrence is presumed from
-- the Phase 5 gate ledger ("Queued: data-architect adds a schema-hardening
-- migration at its next migration round"); conventions follow
-- migrations/0002_catalog.sql (STRICT, provenance FK, paired down file).
--
-- Constraints are consistent with the parsing lexicon's brand slugs
-- (src/parsing/lexicon.ts BRAND_LEXICON: lowercase [a-z0-9-]) while still
-- admitting the documented merge-key form for normalized_name ("lowercased,
-- punctuation/whitespace-collapsed"), so spaces remain legal. §1.1 note:
-- this migration adds NO columns; the no-economics column guard
-- (tests/schema.test.ts) continues to apply to the rebuilt table.
--
-- SQLite cannot ALTER TABLE ... ADD CHECK, so the table is rebuilt in place
-- (create -> copy -> drop -> rename). Tables are empty at beta migration
-- time; the copy step keeps the pattern production-safe regardless.
-- Reversed by: migrations/down/0008_brands_hardening.sql

CREATE TABLE brands_next (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  -- Merge key: lowercased, punctuation/whitespace-collapsed brand name.
  -- Hardened (P5-4): bounded length and a lowercase-only charset, so a
  -- cased or free-charset value cannot land here even if both
  -- application-layer checks were somehow bypassed (§1.7 defense in depth).
  normalized_name TEXT NOT NULL UNIQUE CHECK (
    length(normalized_name) BETWEEN 1 AND 64
    AND normalized_name NOT GLOB '*[^a-z0-9 -]*'
  ),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO brands_next (id, name, normalized_name, provenance_id, created_at)
  SELECT id, name, normalized_name, provenance_id, created_at FROM brands;

DROP TABLE brands;

ALTER TABLE brands_next RENAME TO brands;
