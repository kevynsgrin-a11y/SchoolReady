-- Migration 0002 — product catalog + identity graph + entity resolution
-- brands, product_types, products, product_variants, retailers,
-- product_identifiers (GTIN/UPC/EAN/ISBN/MPN/retailer SKU), and
-- entity_resolution_edges (the ER evidence graph).
--
-- §1.1 HARD RULE: every table in this migration feeds match/basket ranking.
-- No commission, affiliate-economics, payout, or referral column may EVER be
-- added here. Enforced by tests/schema.test.ts (column-name guard).
-- Fixture posture: all rows come from fixtures until live feeds are licensed;
-- provenance.source_type distinguishes them.
-- Reversed by: migrations/down/0002_catalog.sql

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Merge key: lowercased, punctuation/whitespace-collapsed brand name.
  normalized_name TEXT NOT NULL UNIQUE,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Canonical product-type taxonomy ('glue-stick', 'composition-notebook').
-- Requirements point here, never at free text; the parser (Phase 3) maps
-- raw list lines onto these types.
CREATE TABLE product_types (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'writing', 'paper', 'organization', 'art', 'tech',
    'clothing', 'hygiene', 'classroom_shared', 'other'
  )),
  default_unit TEXT NOT NULL DEFAULT 'each' CHECK (default_unit IN (
    'each', 'pack', 'box', 'set', 'pair', 'ream',
    'dozen', 'roll', 'bottle', 'tube', 'stick'
  )),
  default_durability TEXT NOT NULL CHECK (default_durability IN (
    'consumable', 'durable'
  )),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Abstract product: a brand's product line of a canonical type.
-- brand_id NULL = generic/unbranded.
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  product_type_id TEXT NOT NULL REFERENCES product_types (id),
  brand_id TEXT REFERENCES brands (id),
  name TEXT NOT NULL,
  model_line TEXT,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Sellable variant: the size/color/pack/material configuration a retailer
-- actually lists. 'size' is a PRODUCT attribute ('1 in', '8 oz', '24 ct') —
-- never a person's clothing/shoe size (§1.7; exact child sizes never persist
-- anywhere in this schema).
CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products (id),
  -- Entity resolution: cluster representative after merge. NULL until
  -- resolved. Representative rows point at themselves.
  canonical_variant_id TEXT REFERENCES product_variants (id),
  resolution_status TEXT NOT NULL DEFAULT 'unresolved' CHECK (
    resolution_status IN ('unresolved', 'resolved', 'ambiguous')
  ),
  size TEXT,
  color TEXT,
  pack_count INTEGER CHECK (pack_count > 0),
  dimensions TEXT,
  material TEXT,
  ruling_style TEXT CHECK (ruling_style IN (
    'wide_ruled', 'college_ruled', 'graph', 'primary_ruled', 'dotted', 'unruled'
  )),
  mpn TEXT,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_product_variants_product ON product_variants (product_id);
CREATE INDEX idx_product_variants_canonical ON product_variants (canonical_variant_id);

-- Retailers for the >=3-retailer basket comparison. Deliberately minimal and
-- deliberately WITHOUT any economics column: §1.1.
CREATE TABLE retailers (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Identity graph: external identifiers attached to a variant. GTIN-family
-- identifiers are global (retailer_id NULL); 'retailer_sku' is scoped to the
-- retailer that issued it. The CHECK ties the two together.
CREATE TABLE product_identifiers (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants (id),
  id_type TEXT NOT NULL CHECK (id_type IN (
    'gtin14', 'upc_a', 'ean13', 'isbn13', 'mpn', 'retailer_sku'
  )),
  id_value TEXT NOT NULL,
  retailer_id TEXT REFERENCES retailers (id),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK ((id_type = 'retailer_sku') = (retailer_id IS NOT NULL))
) STRICT;

CREATE INDEX idx_product_identifiers_variant ON product_identifiers (variant_id);
-- SQLite UNIQUE treats NULLs as distinct, so global and retailer-scoped
-- uniqueness need partial indexes.
CREATE UNIQUE INDEX uq_identifier_global
  ON product_identifiers (id_type, id_value) WHERE retailer_id IS NULL;
CREATE UNIQUE INDEX uq_identifier_retailer
  ON product_identifiers (id_type, id_value, retailer_id) WHERE retailer_id IS NOT NULL;

-- Entity-resolution evidence graph. Documented model (handoff 02 §4):
--   1. exact_identifier: shared GTIN-family identifier -> score 1.0 edge.
--   2. normalized_attributes: same brand + type + size/pack/color under
--      normalization -> scored candidate.
--   3. model_inference: fuzzy title/attribute model -> scored candidate,
--      never auto-accepted.
--   4. operator_review: human decision; the only method that can flip
--      'ambiguous' to 'accepted'/'rejected'.
-- Variants stay resolution_status='unresolved'/'ambiguous' until an accepted
-- edge path assigns a canonical_variant_id; §1.5 suppresses unresolved
-- variants from user-facing comparison.
CREATE TABLE entity_resolution_edges (
  id TEXT PRIMARY KEY,
  variant_a_id TEXT NOT NULL REFERENCES product_variants (id),
  variant_b_id TEXT NOT NULL REFERENCES product_variants (id),
  relation TEXT NOT NULL CHECK (relation IN (
    'same_item', 'pack_variant_of', 'substitutable_for'
  )),
  method TEXT NOT NULL CHECK (method IN (
    'exact_identifier', 'normalized_attributes', 'model_inference', 'operator_review'
  )),
  score REAL NOT NULL CHECK (score >= 0.0 AND score <= 1.0),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed', 'accepted', 'rejected'
  )),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (variant_a_id <> variant_b_id),
  UNIQUE (variant_a_id, variant_b_id, relation)
) STRICT;

CREATE INDEX idx_er_edges_variant_a ON entity_resolution_edges (variant_a_id);
CREATE INDEX idx_er_edges_variant_b ON entity_resolution_edges (variant_b_id);
