-- Migration 0006 — offers, source_health
-- (Phase 2, ingestion-engineer; shapes contracted in src/contracts/offer.ts
-- and src/contracts/source.ts; deferred from Phase 1 by design — handoff 02
-- decision 12.)
--
-- offers: latest known price/stock for a RESOLVED variant at a retailer —
-- the landed-cost input for the >=3-retailer basket comparison (Phase 4).
-- §1.1 HARD RULE: no commission, affiliate-economics, payout, or referral
-- column may EVER be added to this migration's tables; the schema guard in
-- tests/schema.test.ts scans every column name. Feed adapters emit
-- pre-resolution OfferCandidates (no table); only entity-resolved candidates
-- persist here, so unresolved offers can never surface in comparison (§1.5).
--
-- source_health: circuit-breaker state + per-source licensing flags for the
-- four SourceIds in config/flags.ts. The licensing columns record what each
-- source's terms permit (fetch/cache/persist/display) — compliance-officer
-- builds the Phase 10 register from these plus src/ingestion/registry.ts.
-- Reversed by: migrations/down/0006_offers_source_health.sql

CREATE TABLE offers (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants (id),
  retailer_id TEXT NOT NULL REFERENCES retailers (id),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD')),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN (
    'in_stock', 'out_of_stock', 'limited', 'unknown'
  )),
  -- NULL = shipping unknown; §1.5 suppresses/downgrades landed-cost claims
  -- that depend on unknown shipping. Price observation/retrieval times live
  -- on the provenance row (§1.4), which staleness checks join against.
  shipping_cents INTEGER CHECK (shipping_cents >= 0),
  -- Plain product deep link. Phase 9 link decoration must never feed ranking.
  deep_link_url TEXT,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Latest-only: one offer per (variant, retailer); refreshes update in place.
  UNIQUE (variant_id, retailer_id)
) STRICT;

CREATE INDEX idx_offers_variant ON offers (variant_id);
CREATE INDEX idx_offers_retailer ON offers (retailer_id);

-- One row per registered source (config/flags.ts SourceId — the CHECK list
-- mirrors src/contracts/source.ts SOURCE_IDS; the vocabulary-mirror test
-- keeps them from drifting). Circuit semantics per CircuitBreakerConfig:
-- closed -> open after failure_threshold consecutive failures -> half_open
-- probe after cooldown_seconds -> closed on success / open on failure.
CREATE TABLE source_health (
  source_id TEXT PRIMARY KEY CHECK (source_id IN (
    'nces_ccd', 'cpsc_recalls', 'state_tax_holidays', 'affiliate_feeds'
  )),
  circuit_state TEXT NOT NULL DEFAULT 'closed' CHECK (circuit_state IN (
    'closed', 'open', 'half_open'
  )),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  opened_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  -- Machine-readable failure note; empty string = none. Never a stack trace,
  -- never request/response bodies (which could carry third-party content).
  last_error TEXT NOT NULL DEFAULT '',
  -- Licensing flag (what this source's terms permit). Defaults deny-all;
  -- registration code must set them explicitly from the registry.
  license_basis TEXT NOT NULL CHECK (license_basis IN (
    'synthetic_fixture', 'us_government_open_data',
    'state_public_records', 'commercial_contract_required'
  )),
  license_allows_live_fetch INTEGER NOT NULL DEFAULT 0 CHECK (license_allows_live_fetch IN (0, 1)),
  license_allows_cache INTEGER NOT NULL DEFAULT 0 CHECK (license_allows_cache IN (0, 1)),
  license_allows_persist INTEGER NOT NULL DEFAULT 0 CHECK (license_allows_persist IN (0, 1)),
  license_allows_display INTEGER NOT NULL DEFAULT 0 CHECK (license_allows_display IN (0, 1)),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;
