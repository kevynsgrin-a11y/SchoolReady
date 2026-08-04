-- Down migration for 0001_provenance. Applied only after every later
-- migration's down has run (reverse order); nothing may reference provenance.
DROP INDEX IF EXISTS idx_provenance_correction_status;
DROP INDEX IF EXISTS idx_provenance_freshness;
DROP INDEX IF EXISTS idx_provenance_source_type;
DROP TABLE provenance;
