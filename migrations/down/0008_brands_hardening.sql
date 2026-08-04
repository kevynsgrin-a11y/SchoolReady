-- Down migration for 0008_brands_hardening.sql — rebuilds the brands table
-- with its original migrations/0002_catalog.sql definition (no CHECK/length
-- constraints), copying rows back. Same create -> copy -> drop -> rename
-- pattern as the up file.

CREATE TABLE brands_prev (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Merge key: lowercased, punctuation/whitespace-collapsed brand name.
  normalized_name TEXT NOT NULL UNIQUE,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO brands_prev (id, name, normalized_name, provenance_id, created_at)
  SELECT id, name, normalized_name, provenance_id, created_at FROM brands;

DROP TABLE brands;

ALTER TABLE brands_prev RENAME TO brands;
