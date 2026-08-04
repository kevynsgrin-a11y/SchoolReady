# COPPA posture — Phase 10 (compliance-officer)

This product is a tool **for parents and caregivers**, not a child-directed
service. The posture below is CLAUDE.md §0 ("Not a children's account
product") made auditable: every claim cites the code and the automated test
that enforces it. `tests/compliance-register.test.ts` verifies every cited
path exists, so this document cannot silently rot.

## 1. No child accounts — no accounts at all

There are no child logins because there are no logins. The service is
anonymous-first: a session is an opaque random token whose SHA-256 hash is
the only thing stored, optionally linked to an anonymous household.

- Code: `src/api/session.ts` (token-hash-only sessions);
  `migrations/0007_sessions_alerts.sql` (deliberately NO accounts table; no
  name/email/phone/IP/user-agent column exists or may be added).
- Tests: `tests/api-policy.test.ts` ("no route knows what an account is" —
  no route pattern may mention account/login/signup/password/oauth);
  `tests-workers/api-journey.test.ts` (full plan journey end to end with
  zero account creation).
- Note: the Phase 10 deletion endpoint is deliberately `DELETE
  /api/session`, not `/api/account`, so the structural no-account test keeps
  holding (`src/api/routes.ts`).

## 2. No child-directed data collection

No data is collected from a child, and no data about an identifiable child
can be entered, stored, or logged.

- Household members are **ordinals only** ("Child 1", "Child 2") with an
  optional structural grade. There is no name field — schema-level: the
  `household_members` table has no label/name column precisely because a
  free-text label would be filled with child names.
  - Code: `migrations/0003_schools_households.sql`; `src/api/store.ts`
    (`ensureMember` writes ordinal + grade only).
  - Tests: `tests/schema.test.ts` (§1.7 PII column-pattern scan over the
    live schema, incl. FK-discovered household-linked tables).
- Uploaded list photos/PDFs are processed ephemerally under a 15-minute
  hard TTL and deleted in a `finally` block; child names, teacher names,
  and room numbers are redacted before anything renders back.
  - Code: `src/parsing/upload-buffer.ts` (`UPLOAD_BUFFER_TTL_SECONDS`);
    the parsing redaction pipeline in `src/parsing/`.
  - Tests: `tests/parsing-pii.test.ts`;
    `tests-workers/parsing-upload-r2.test.ts` (real R2 cycle, zero
    residue); `tests/parsing-upload-buffer.test.ts`.
- Free text cannot persist: intake fields are controlled-vocabulary only,
  the brand slug channel is double-checked against the lexicon (gate
  finding P5-1), and migration `migrations/0008_brands_hardening.sql` adds
  the schema-level backstop.
  - Tests: `tests-workers/api-endpoints.test.ts` (zero-PII cycle with full
    D1 dump); `tests/compliance-schema.test.ts` (0008 constraints).
- Logging is allowlist-based: there is no API to log free text.
  - Code: `src/api/logging.ts`. Tests: `tests/api-modules.test.ts`.
- Deletion and export exist and are complete: `GET /api/export` returns
  everything session-linked; `DELETE /api/session` removes it all in one
  pass, proven by a sqlite_master walk.
  - Code: `src/api/store.ts` (`purgeHousehold`), `src/api/routes.ts`.
  - Tests: `tests-workers/compliance-deletion.test.ts`.

## 3. No targeted advertising — to under-13 audiences or anyone

- Zero ad slots are mounted anywhere in this beta (`MOUNTED_SLOTS = []`),
  and slots are structurally restricted to not-yet-existing editorial
  surfaces. Code: `src/monetization/ad-rules.ts`, `src/ui/slots.ts`.
  Tests: `tests-workers/monetization-routes.test.ts` (route sweep),
  `tests/monetization-route-scan.test.ts`.
- No targeting substrate exists: the schema stores no demographics, no
  interests, no identity, no contact channel (`tests/schema.test.ts`), and
  §1.7 data never reaches third parties because nothing is sent to third
  parties at all (no third-party script, pixel, or SDK ships; the §1.2
  scan sweeps rendered pages).
- The only commercial mechanics are contextual and identical for everyone:
  a Season Pass that gates ad-free extras ONLY (never core content —
  byte-equality proven) and, in the future, disclosed affiliate links.
  Neither uses audience data; there is none.

## 4. Why COPPA's operator obligations are not triggered (and the posture anyway)

The service is directed to parents (general audience), does not knowingly
collect personal information from children, and provides no child-facing
interactive features (no child account, profile, chat, or upload channel
attributable to a child). We do not rely on that alone: the §1.7 design
means that even a child using the tool cannot create personal information
to collect — there is no field for a name, contact detail, or address, and
the ephemeral upload path strips person-names before display and deletes
the bytes.

**Standing rule for future work (binding):** any feature implying a child
login, child-directed collection, or ad targeting is rejected at review
(CLAUDE.md §0 NOT #5). Features that would give a child an addressable
identity (e.g., named profiles, sharing links per child, class rosters)
route through compliance-officer before design.

## 5. Disclosure surfaces

The plain-language privacy policy (including the children's clause) renders
on the alerts-and-privacy page from `src/ui/copy/en.ts` (`PRIVACY`), under
both content lints. FTC affiliate-disclosure copy is finalized in the
`MONETIZATION` block of the same file.
