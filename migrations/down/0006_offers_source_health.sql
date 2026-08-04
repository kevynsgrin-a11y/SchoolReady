-- Down migration for 0006_offers_source_health. Drops in reverse dependency
-- order.
DROP TABLE source_health;
DROP INDEX IF EXISTS idx_offers_retailer;
DROP INDEX IF EXISTS idx_offers_variant;
DROP TABLE offers;
