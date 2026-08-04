-- Down migration for 0007_sessions_alerts.sql — drops the Phase 5 session
-- and alert tables (reverse dependency order).

DROP INDEX IF EXISTS idx_alert_subscriptions_household;
DROP TABLE IF EXISTS alert_subscriptions;
DROP INDEX IF EXISTS idx_api_sessions_household;
DROP TABLE IF EXISTS api_sessions;
