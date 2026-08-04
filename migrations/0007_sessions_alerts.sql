-- Migration 0007 — api_sessions, alert_subscriptions (Phase 5, backend-api)
--
-- api_sessions: the anonymous-first session model (§0). A session is an
-- OPAQUE token (stored only as a SHA-256 hash — the raw token lives in the
-- user's cookie and nowhere else) optionally linked to an anonymous
-- household. §1.7 HARD RULES: no name, email, phone, IP, user-agent, or any
-- identity column exists or may ever be added; a session is a random id and
-- nothing more. Accounts are OPTIONAL and NEVER required: every core
-- endpoint works with only this anonymous session (§5 acceptance;
-- no-dark-patterns gate) — there is deliberately NO accounts table.
--
-- alert_subscriptions: anonymous in-app alert subscriptions (recall /
-- price-change / deadline / list-correction watches) scoped to the
-- household. Deliberately NO delivery-channel column (email/phone are
-- §1.7-banned); alerts surface in-app when the household returns. The
-- alert_kind CHECK vocabulary mirrors ALERT_KINDS in src/api/contracts.ts.
-- Reversed by: migrations/down/0007_sessions_alerts.sql

CREATE TABLE api_sessions (
  -- SHA-256 hex of the opaque cookie token. Never the token itself.
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  household_id TEXT REFERENCES households (id),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_api_sessions_household ON api_sessions (household_id);

CREATE TABLE alert_subscriptions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households (id),
  alert_kind TEXT NOT NULL CHECK (alert_kind IN (
    'recall', 'price_change', 'deadline', 'list_correction'
  )),
  -- Optional scope narrowing; NULL = the whole household plan.
  product_type_id TEXT REFERENCES product_types (id),
  list_id TEXT REFERENCES supply_lists (id),
  provenance_id TEXT NOT NULL REFERENCES provenance (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idx_alert_subscriptions_household ON alert_subscriptions (household_id);
