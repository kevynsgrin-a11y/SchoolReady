# Fixture datasets (synthetic — Phase 2, ingestion-engineer)

Every file in this directory is SYNTHETIC data for the fixture-mode
validation beta (CLAUDE.md §0 launch posture). Nothing here is real market,
school, safety, or tax data:

- Every document is wrapped in `{ "_fixture": true, "fixtureSet":
  "fixture:<set>-<version>", "provenance": { "sourceType": "fixture", ... } }`.
  Adapters (src/ingestion/adapters/) refuse documents without that labeling.
- Schools are invented ("Meadow Valley Elementary (Fixture)") and normalize
  with `ncesSchoolId: null`, `isSynthetic: true`.
- Recalls follow the CPSC REST field shape but use FIXTURE-/FX- prefixed
  identifiers, "(Fixture Sample)" titles, and example.com URLs.
- The tax-holiday calendar is modeled on typical statutory structure but is
  NOT verified against any state revenue department; its provenance carries
  reduced confidence and explicit limitations.
- Retailer feeds use invented retailers ("Fixture Mart"), FIXTURE- prefixed
  SKUs/UPCs, and fixture prices. No feed contract exists; live handling is
  unlicensed (deny-all in src/ingestion/registry.ts).

The repo lint scripts exclude `fixtures/` by path, so tests/fixtures.test.ts
re-applies the §1.6 banned-claims and §1.8 no-emoji rules to every string in
these files (gate finding SG-4), and additionally asserts the labeling wrapper
and the absence of supply-list-shaped content (§0 NOT #1) and PII-shaped keys
(§1.7).
