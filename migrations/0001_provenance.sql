-- Migration 0001 — provenance (§1.4)
-- The universal provenance record. Every user-facing fact in every other
-- table carries a NOT NULL FK to this table; a fact without provenance does
-- not render. All ten §1.4 fields are columns here:
--   1 source                  2 source type
--   3 observation/effective date (observed_at)
--   4 retrieval timestamp (retrieved_at)
--   5 geography               6 transform/model version
--   7 freshness               8 confidence
--   9 limitations            10 correction status
-- Reversed by: migrations/down/0001_provenance.sql
-- Timestamps are ISO-8601 UTC TEXT throughout the schema.

CREATE TABLE provenance (
  id TEXT PRIMARY KEY,
  -- (1) Where the fact came from. Namespaced identifier, e.g.
  -- 'user:manual-entry', 'user:upload-parse', 'fixture:catalog-2026-v1',
  -- 'feed:cpsc_recalls'. Never a person's name.
  source TEXT NOT NULL,
  -- (2) The kind of source, from a closed vocabulary.
  source_type TEXT NOT NULL CHECK (source_type IN (
    'user_entry', 'user_upload', 'fixture', 'government_feed',
    'retailer_feed', 'licensed_api', 'model_inference', 'operator_curation'
  )),
  -- (3) When the underlying fact was observed or became effective.
  observed_at TEXT NOT NULL,
  -- (4) When we retrieved/recorded it.
  retrieved_at TEXT NOT NULL,
  -- (5) Geographic scope of the fact: 'US' or ISO 3166-2 region ('US-TX').
  geography TEXT NOT NULL DEFAULT 'US',
  -- (6) Version of the transform/model that produced the stored form,
  -- e.g. 'none', 'list-parser@0.1.0'. 'none' = stored verbatim.
  transform_version TEXT NOT NULL DEFAULT 'none',
  -- (7) Freshness classification at last evaluation. Ingestion (Phase 2)
  -- re-evaluates against circuit-breaker staleness thresholds; §1.5 requires
  -- suppression/downgrade on 'stale'/'expired'.
  freshness TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness IN (
    'fresh', 'aging', 'stale', 'expired'
  )),
  -- (8) Confidence 0.0-1.0 that the stored fact is accurate as recorded.
  confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  -- (9) Human-readable caveats. Empty string = none declared (still explicit).
  limitations TEXT NOT NULL DEFAULT '',
  -- (10) Correction lifecycle. §1.5: 'under_review' facts are suppressed or
  -- downgraded; 'retracted' facts never render.
  correction_status TEXT NOT NULL DEFAULT 'none' CHECK (correction_status IN (
    'none', 'corrected', 'retracted', 'under_review'
  )),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_provenance_source_type ON provenance (source_type);
CREATE INDEX idx_provenance_freshness ON provenance (freshness);
CREATE INDEX idx_provenance_correction_status ON provenance (correction_status);
