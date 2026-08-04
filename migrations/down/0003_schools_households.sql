-- Down migration for 0003_schools_households. Drops in reverse dependency
-- order. Requires 0004's down to have run first (lists reference these).
DROP INDEX IF EXISTS idx_entitlements_household;
DROP TABLE entitlements;
DROP INDEX IF EXISTS idx_household_members_household;
DROP TABLE household_members;
DROP TABLE households;
DROP INDEX IF EXISTS idx_schools_state;
DROP TABLE schools;
