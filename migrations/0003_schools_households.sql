-- Migration 0003 — schools, households, household_members, entitlements
--
-- §1.7 HARD RULES applied here:
--   * households are anonymous-first: an opaque id, coarse geography (state),
--     nothing else. No name, email, address, phone, or budget column exists.
--   * household_members carry an ordinal ('Child 1') and structural grade
--     reference ONLY. No name column, no birthdate, no sizes.
--   * schools carry public institutional identity at state/city granularity;
--     no street address column (kept out to make the §1.7 address scan
--     unambiguous; tax-holiday eligibility is state-scoped).
-- §0 NOT #1: schools here are synthetic fixtures (is_synthetic=1) or, later,
-- NCES CCD directory rows. This table never stores a school's supply list.
-- Reversed by: migrations/down/0003_schools_households.sql

CREATE TABLE schools (
  id TEXT PRIMARY KEY,
  -- NCES CCD school identifier once the live source is licensed; NULL for
  -- synthetic fixture schools.
  nces_school_id TEXT UNIQUE,
  name TEXT NOT NULL,
  district_name TEXT,
  -- USPS two-letter state code. Drives sales-tax-holiday eligibility scope.
  state TEXT NOT NULL CHECK (length(state) = 2),
  city TEXT,
  grade_low TEXT NOT NULL CHECK (grade_low IN (
    'K', '1', '2', '3', '4', '5', '6', '7', '8'
  )),
  grade_high TEXT NOT NULL CHECK (grade_high IN (
    'K', '1', '2', '3', '4', '5', '6', '7', '8'
  )),
  is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic IN (0, 1)),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_schools_state ON schools (state);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  -- Optional coarse geography for tax estimation. A state is not an address;
  -- no finer location field may be added without a compliance-officer review.
  state TEXT CHECK (length(state) = 2),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- One row per child for multi-child merge. Identified to the user as
-- 'Child <ordinal>' — deliberately no label/name column, because a free-text
-- label WOULD be filled with child names (§1.7).
CREATE TABLE household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id),
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  grade_level TEXT CHECK (grade_level IN (
    'K', '1', '2', '3', '4', '5', '6', '7', '8'
  )),
  school_id TEXT REFERENCES schools (id),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (household_id, ordinal)
) STRICT;

CREATE INDEX idx_household_members_household ON household_members (household_id);

-- Season Pass entitlements (Stripe one-time; Phase 9 wires payments).
-- external_payment_ref is an opaque processor reference — never card data,
-- never an amount (household budgets are §1.7-banned). Entitlements gate
-- features; they NEVER feed match/basket/worth-it ranking (§1.1).
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id),
  kind TEXT NOT NULL CHECK (kind IN ('season_pass')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'expired', 'refunded', 'revoked'
  )),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  external_payment_ref TEXT,
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_entitlements_household ON entitlements (household_id);
