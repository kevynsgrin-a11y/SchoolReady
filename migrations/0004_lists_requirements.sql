-- Migration 0004 — supply_lists, list_assignments, requirements, inventory_items
--
-- §0 NOT #1: supply_lists hold USER-ENTERED or USER-UPLOADED requirements
-- only. We never scrape, cache, republish, or mirror TeacherLists, district
-- PDFs, or school-hosted lists; there is no column for a source URL of a
-- school-hosted list and no table that stores third-party list documents.
-- §1.7: no raw list text persists (upload parsing is ephemeral, Phase 3);
-- deliberately no free-text title column — grade + school + child ordinal
-- identify a list without inviting child/teacher names.
-- Reversed by: migrations/down/0004_lists_requirements.sql

CREATE TABLE supply_lists (
  id TEXT PRIMARY KEY,
  -- NULL until an anonymous session claims/associates a household.
  household_id TEXT REFERENCES households (id),
  school_id TEXT REFERENCES schools (id),
  -- e.g. '2026-2027'.
  school_year TEXT NOT NULL CHECK (
    school_year GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]'
  ),
  grade_level TEXT CHECK (grade_level IN (
    'K', '1', '2', '3', '4', '5', '6', '7', '8'
  )),
  intake_method TEXT NOT NULL CHECK (intake_method IN (
    'paste', 'manual', 'upload'
  )),
  -- §1.5 suppression input: stale/unverified lists render downgraded.
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    verification_status IN ('unverified', 'user_confirmed', 'stale')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'draft', 'active', 'archived'
  )),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_supply_lists_household ON supply_lists (household_id);
CREATE INDEX idx_supply_lists_school ON supply_lists (school_id);

-- Which child (anonymous ordinal member) a list applies to; many-to-many so
-- shared lists (one list, two siblings at the same school) merge correctly.
CREATE TABLE list_assignments (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES supply_lists (id),
  household_member_id TEXT NOT NULL REFERENCES household_members (id),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (list_id, household_member_id)
) STRICT;

CREATE INDEX idx_list_assignments_list ON list_assignments (list_id);
CREATE INDEX idx_list_assignments_member ON list_assignments (household_member_id);

-- The requirement schema (brief §4 Phase 1). One row per normalized line
-- item on a supply list. Every contractual field is a column:
--   canonical product type -> product_type_id
--   quantity/unit/pack     -> quantity, unit, pack_count
--   dimensions/material/color/ruling -> dimensions, material, color, ruling_style
--   brand requirement      -> brand_requirement (+ required_brand_id)
--   scope                  -> scope_type, scope_grade, scope_subject, scope_slot
--   consumable-vs-durable  -> durability
--   optional-vs-required   -> optionality
--   prohibited substitutions -> prohibited_substitutions (JSON array)
--   source, source confidence -> source_kind, source_confidence (+ provenance)
CREATE TABLE requirements (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES supply_lists (id),
  product_type_id TEXT NOT NULL REFERENCES product_types (id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL DEFAULT 'each' CHECK (unit IN (
    'each', 'pack', 'box', 'set', 'pair', 'ream',
    'dozen', 'roll', 'bottle', 'tube', 'stick'
  )),
  -- Units per pack when unit is a multi-count packaging ('pack of 12').
  pack_count INTEGER CHECK (pack_count > 0),
  -- Normalized product-dimension descriptor ('1 in', '9x12 in'). A product
  -- attribute — never a person's measurement (§1.7).
  dimensions TEXT,
  material TEXT,
  color TEXT,
  ruling_style TEXT CHECK (ruling_style IN (
    'wide_ruled', 'college_ruled', 'graph', 'primary_ruled', 'dotted', 'unruled'
  )),
  brand_requirement TEXT NOT NULL DEFAULT 'generic_allowed' CHECK (
    brand_requirement IN ('required', 'preferred', 'generic_allowed')
  ),
  required_brand_id TEXT REFERENCES brands (id),
  -- Scope: STRUCTURAL references only (§1.7). Teacher/classroom scope is an
  -- anonymous per-list slot ordinal ('teacher slot 1'); never a person's
  -- name, never a school-issued classroom identifier.
  scope_type TEXT NOT NULL DEFAULT 'list' CHECK (scope_type IN (
    'list', 'grade', 'subject', 'teacher', 'classroom'
  )),
  scope_grade TEXT CHECK (scope_grade IN (
    'K', '1', '2', '3', '4', '5', '6', '7', '8'
  )),
  scope_subject TEXT CHECK (scope_subject IN (
    'general', 'math', 'ela', 'science', 'social_studies',
    'art', 'music', 'pe', 'world_language', 'technology'
  )),
  scope_slot INTEGER CHECK (scope_slot > 0),
  durability TEXT NOT NULL CHECK (durability IN ('consumable', 'durable')),
  optionality TEXT NOT NULL DEFAULT 'required' CHECK (
    optionality IN ('required', 'optional')
  ),
  -- JSON array of short normalized restriction strings, e.g.
  -- '["no_rolling_backpacks","no_character_prints"]'. Parser (Phase 3) MUST
  -- sanitize to the controlled vocabulary — never raw list prose.
  prohibited_substitutions TEXT,
  -- How this row entered the system + parser extraction confidence 0.0-1.0.
  -- Full source detail (transform version, retrieval time) lives on the
  -- provenance row; these two are the requirement-level §4-contract fields.
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'paste', 'manual', 'upload', 'fixture'
  )),
  source_confidence REAL NOT NULL CHECK (
    source_confidence >= 0.0 AND source_confidence <= 1.0
  ),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (brand_requirement = 'generic_allowed' OR required_brand_id IS NOT NULL),
  CHECK (scope_type <> 'grade' OR scope_grade IS NOT NULL),
  CHECK (scope_type <> 'subject' OR scope_subject IS NOT NULL),
  CHECK (scope_type NOT IN ('teacher', 'classroom') OR scope_slot IS NOT NULL)
) STRICT;

CREATE INDEX idx_requirements_list ON requirements (list_id);
CREATE INDEX idx_requirements_product_type ON requirements (product_type_id);

-- Existing-inventory audit (§0 capability 2): what the household already
-- owns, at product-type granularity with optional variant precision.
-- Deliberately no free-text notes column (PII surface).
CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id),
  product_type_id TEXT NOT NULL REFERENCES product_types (id),
  variant_id TEXT REFERENCES product_variants (id),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  condition TEXT NOT NULL DEFAULT 'usable' CHECK (condition IN (
    'new', 'usable', 'worn_out'
  )),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_inventory_items_household ON inventory_items (household_id);
CREATE INDEX idx_inventory_items_product_type ON inventory_items (product_type_id);
