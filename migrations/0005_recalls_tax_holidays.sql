-- Migration 0005 — recalls, recall_products, tax_holidays, tax_holiday_categories
-- (Phase 2, ingestion-engineer; shapes contracted in src/contracts/recall.ts
-- and src/contracts/tax-holiday.ts; deferred from Phase 1 by design — handoff
-- 02 decision 12.)
--
-- recalls / recall_products follow the CPSC Recall REST API field families
-- (RecallID, RecallNumber, RecallDate, Title, Description, URL,
-- LastPublishDate, Products[].Name/Description/Model/UPC). ConsumerContact is
-- deliberately NOT modeled: it carries phone/email strings (§1.7). We store
-- the deep link (cpsc_url) and interoperate — never republish whole notices.
-- Recall-to-catalog matching is Phase 4; unmatched recalls are suppressed
-- from product claims, never guessed (§1.5).
--
-- tax_holidays are state-scoped date windows with per-category price caps.
-- §1.7: geography stops at the state; no finer location column may be added.
-- Fixture posture: is_synthetic=1 rows come from clearly-labeled fixture
-- files; their provenance carries reduced confidence + limitations.
-- Reversed by: migrations/down/0005_recalls_tax_holidays.sql

CREATE TABLE recalls (
  id TEXT PRIMARY KEY,
  -- CPSC RecallID, stored as text. Fixture rows use a FIXTURE- prefix so a
  -- synthetic id can never be mistaken for a real CPSC identifier.
  cpsc_recall_id TEXT NOT NULL UNIQUE,
  -- CPSC RecallNumber ('26-101'); fixture rows use an FX- prefix.
  recall_number TEXT NOT NULL,
  -- ISO dates (announcement / last publish).
  recall_date TEXT NOT NULL,
  last_publish_date TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Deep link to the recall notice (interoperate/deep-link only).
  cpsc_url TEXT NOT NULL,
  -- Concatenated CPSC Hazards[].Name / Remedies[].Name strings.
  hazard_description TEXT NOT NULL DEFAULT '',
  remedy_description TEXT NOT NULL DEFAULT '',
  -- CPSC NumberOfUnits when stated; NULL = not stated (never invented).
  units_affected INTEGER CHECK (units_affected >= 0),
  is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic IN (0, 1)),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_recalls_recall_date ON recalls (recall_date);

-- One row per recalled product line (CPSC Products[]). UPC feeds the Phase 4
-- match against product_identifiers; name/model similarity is secondary and
-- ambiguity suppresses rather than guesses (§1.5).
CREATE TABLE recall_products (
  id TEXT PRIMARY KEY,
  recall_id TEXT NOT NULL REFERENCES recalls (id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model TEXT,
  upc TEXT,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_recall_products_recall ON recall_products (recall_id);
CREATE INDEX idx_recall_products_upc ON recall_products (upc);

CREATE TABLE tax_holidays (
  id TEXT PRIMARY KEY,
  -- USPS two-letter state code (§1.7: geography stops here).
  state TEXT NOT NULL CHECK (length(state) = 2),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  -- Inclusive ISO-date window.
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  -- Deep link to the authoritative state revenue page (never mirrored).
  info_url TEXT,
  is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic IN (0, 1)),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (starts_on <= ends_on),
  UNIQUE (state, year, starts_on)
) STRICT;

CREATE INDEX idx_tax_holidays_state ON tax_holidays (state);

-- Per-category eligibility with an optional per-item price cap.
-- NULL price_cap_cents = the category has no cap during the window.
CREATE TABLE tax_holiday_categories (
  id TEXT PRIMARY KEY,
  holiday_id TEXT NOT NULL REFERENCES tax_holidays (id),
  holiday_category TEXT NOT NULL CHECK (holiday_category IN (
    'clothing', 'footwear', 'school_supplies', 'computers', 'backpacks', 'other'
  )),
  price_cap_cents INTEGER CHECK (price_cap_cents > 0),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (holiday_id, holiday_category)
) STRICT;

CREATE INDEX idx_tax_holiday_categories_holiday ON tax_holiday_categories (holiday_id);
