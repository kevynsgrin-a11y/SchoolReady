# HANDOFF 11 — compliance-officer — Phase 10

## 1. Inputs consumed

- `CLAUDE.md` §0 (NOT #5: no children's account product; brand isolation;
  launch posture), §1.6 (banned claims), §1.7 (PII never persists), §2 stack.
- `docs/handoffs/10-monetization-engineer-9.md` §8 (binding: monetized-
  surface inventory, disclosure placement contract, licensing/network
  posture to verify-and-record, MUST NOTs, 761/52 baseline).
- `docs/handoffs/gates/phase-5-gate.md` (P5-1 closed rationale; P5-4
  queued brands hardening — discharged here).
- `src/ingestion/registry.ts` + `src/contracts/source.ts` (licensing flags —
  the register's raw material), `config/flags.ts` (liveSources all OFF).
- `src/api/{routes,http,store,session,contracts,logging,rate-limit}.ts`,
  `src/ui/{server.ts,screens/account.ts,copy/en.ts}`,
  `src/monetization/networks.ts`, `src/parsing/upload-buffer.ts`,
  `migrations/0002,0003,0007`, `tests/api-policy.test.ts`,
  `tests-workers/api-helpers.ts`, `docs/handoffs/TEMPLATE.md`.

## 2. Decisions made

1. **The deletion endpoint is `DELETE /api/session`, NOT `/api/account`.**
   The phase brief named `/api/account`; the Phase 5 structural test ("no
   route knows what an account is") rejects any route pattern containing
   `account`, and weakening that §0 test to admit an account-shaped surface
   would be exactly the drift it exists to stop. Deleting the session IS
   deleting everything (a session is the only handle that exists), and the
   UI still surfaces it on the `/account` screen (a UI-only path). Spirit
   preserved, structure preserved. Alternative (regex carve-out) rejected.
2. **Register is markdown + machine check, both directions.**
   `tests/compliance-register.test.ts` parses the register: exactly one
   entry per `SOURCE_REGISTRATIONS` key (no missing, no phantom), seven
   permission rulings each (fetch/cache/store/transform/display/index/
   alert), basis + go-live precondition per source, and the
   Fetch/Cache/Store/Display rulings must AGREE with the code-level
   licensing booleans — the register cannot drift from the code it governs.
   A live-flagged source without a Permitted fetch ruling fails the test
   (register-before-live, armed for the future flip).
3. **Privacy policy + disclaimers live on `/account`, not a new route.**
   A new HTML route would require the P8-3 co-update across the pinned SEO
   route map and workers sweeps for pure prose. `/account` is already the
   "alerts and privacy" surface; the full plain-language policy (PRIVACY),
   the four disclaimer categories (DISCLAIMERS), the export link, and the
   delete form render there as content sections, commercial section still
   last. Rendered-page assertions in `tests/compliance-privacy.test.ts`.
4. **One-pass purge is table-driven with a provenance sweep.**
   `store.purgeHousehold` walks a single FK-safe table list
   (`HOUSEHOLD_DATA_TABLES`), collects per-user provenance ids first,
   counts rows from the database (never estimates), deletes children-first,
   then deletes the per-user provenance records. Global taxonomy
   (product_types, brands + seed provenance) is shared vocabulary and
   survives — asserted, not assumed. The handler also drops KV rate-limit
   buckets keyed by every one of the household's token hashes (KvLike
   gained an OPTIONAL `delete` so minimal test doubles stay valid).
5. **Banned-claims additions are DEFERRED with a migration note.** Review
   of all Phase 10 copy found no need the current seven do not cover; the
   candidate addition ("risk-free") is recorded for the orchestrator
   because `tests/claude-md.test.ts` requires every `BANNED_CLAIMS` entry
   to appear verbatim in CLAUDE.md, and CLAUDE.md may not be edited by this
   agent. Migration path when sanctioned: orchestrator adds the string to
   CLAUDE.md (outside the LOCKED §1 text) in the same change that appends
   it to `config/banned-claims.ts`; the lint and its seeded-violation tests
   auto-inherit — no other file changes. Meanwhile the compliance docs
   (outside the lint roots) are scanned for banned claims by
   `tests/compliance-register.test.ts`.
6. **P5-4 discharged via rebuild-in-place migration 0008** (SQLite cannot
   ADD CHECK): bounded id/name lengths, non-empty fields, lowercase
   `[a-z0-9 -]` merge key — consistent with `BRAND_LEXICON` slugs while
   admitting the documented punctuation-collapsed merge form. Paired down
   migration restores the byte-exact 0002 definition; up-down-up stays
   byte-identical (proven by the existing Phase 1 suite). data-architect
   concurrence presumed from the Phase 5 gate ledger, as sanctioned.
7. **FTC copy finalized against 16 CFR Part 255 + the FTC online-disclosure
   guidance**: clear and conspicuous, plain language, names the material
   connection ("this site earns a commission from the retailer"), states
   the §1.1 independence promise, placed adjacently by construction
   (Phase 9's atomic renderer). The literal sentence the workers sweep
   asserts ("Checkout is switched off in this validation beta") is kept.
8. **`config/brand.ts` untouched: `legalEntity` stays UNSET.** No legal
   entity exists; inventing one is prohibited. release-qa blocks on it by
   design — that block is correct and intentional.

## 3. Artifacts produced

Created:
- `docs/compliance/licensing-register.md` (all 4 sources + affiliate-
  network posture + §0 NOT #1 non-sources section)
- `docs/compliance/coppa-posture.md` (claims with code/test citations)
- `migrations/0008_brands_hardening.sql` + `migrations/down/0008_brands_hardening.sql`
- `tests/compliance-register.test.ts` (17), `tests/compliance-schema.test.ts` (7),
  `tests/compliance-privacy.test.ts` (12), `tests-workers/compliance-deletion.test.ts` (7)

Modified (each sanctioned):
- `src/api/contracts.ts` — `ExportData`, `SessionPurgeData`.
- `src/api/routes.ts` — `aggregateLists` extraction (behavior-identical),
  `handleExport`, `handleSessionDelete`, two ROUTES rows.
- `src/api/store.ts` — `listMembers`, `listEntitlements`,
  `HOUSEHOLD_DATA_TABLES`, `purgeHousehold`.
- `src/api/http.ts` — `RoutePolicy.method` gains `"DELETE"`.
- `src/api/logging.ts` — `rowsDeleted` added to the field allowlist.
- `src/ingestion/swr-cache.ts` — optional `KvLike.delete` + MemoryKv impl.
- `src/ui/copy/en.ts` — MONETIZATION finalized (comment + disclosure
  string); ACCOUNT export/delete strings; new PRIVACY + DISCLAIMERS blocks.
- `src/ui/screens/account.ts` — privacy policy, disclaimers, export link,
  delete form sections (commercial section still last).
- `src/ui/server.ts` — `callApi` accepts DELETE; `POST /account/delete`
  (purge + cookie expiry + 303).
- `tests/api-policy.test.ts` — EXTENDED (sanctioned co-update): two new
  pinned routes; `ExportData`/`SessionPurgeData` classified. No existing
  assertion weakened.

Untouched: `CLAUDE.md`, `.claude/agents/`, `config/brand.ts`,
`config/banned-claims.ts`, `config/flags.ts`, `docs/design/`, prior
handoffs, migrations 0001–0007, `src/algorithms/`, `src/monetization/`,
`src/seo/`, `src/parsing/` (read-only), `src/ui/slots.ts`, all other
Phase 0–9 tests, `scripts/`, `.github/`, `wrangler.jsonc`, `public/`.

## 4. Contracts exported

```ts
// src/api/contracts.ts
interface ExportData {          // GET /api/export (category "session")
  exportedAt; householdState; members[{ordinal, gradeLevel, provenanceIds}];
  lists[{listId, schoolYear, gradeLevel, intakeMethod, verificationStatus,
         memberOrdinals, requirements: RequirementSummary[]}];
  inventory: InventorySummary[]; alerts[...]; entitlements[...];
}
interface SessionPurgeData { purged: true; rowsDeleted: number }
// DELETE /api/session (category "session") -> SessionPurgeData; idempotent.

// src/api/store.ts
purgeHousehold(db, householdId) -> Promise<number>  // counted rows, one pass
// HOUSEHOLD_DATA_TABLES: a NEW user-data table MUST be added there or the
// workers deletion test's sqlite_master walk fails the purge proof.

// UI markers (frontend/accessibility may rely on):
// <form action="/account/delete" method="post"> — the purge control
// <a href="/api/export"> — machine-readable export
// Copy blocks: PRIVACY, DISCLAIMERS in src/ui/copy/en.ts (both lint roots)
```

## 5. Invariants touched

- **§1.7 — deletion/export half now ENFORCED.** Workers acceptance test:
  seeds every user-data table (+ Season Pass via the real fixture webhook,
  + a bystander household), proves export completeness against direct D1
  queries and export minimality (no token hash, no bystander data), then
  ONE `DELETE /api/session` and a sqlite_master walk proving every tracer
  id (rows AND per-user provenance AND the KV rate-limit bucket) is gone
  while the bystander and global taxonomy survive. 0008 adds the schema
  backstop behind P5-1's two application layers.
- **§1.2 — untouched and re-verified**: account screen keeps the
  commercial section last; `scanRenderedPage` returns zero findings on the
  new page (node); no new route is monetizable; nothing gated.
- **§1.4** — export data flows through the response provenance gate; every
  exported node cites resolvable provenance.
- **§1.6/§1.8** — all new copy sits under both lint roots; compliance docs
  additionally scanned for banned claims by the register test (docs/ is
  outside the lint roots).
- **§0** — no account surface (route pattern test still holds, and the
  deletion route was named to keep it); brand literal appears nowhere in
  the new files; legalEntity untouched.
- **§1.1** — not touched: no monetization/algorithms module modified; the
  independence closures are unchanged.

## 6. Acceptance evidence

Commands run 2026-08-04, all exit 0:

```
npm run verify
  eslint .                          clean
  lint-banned-claims: OK (7 claims checked across 2 root(s))
  lint-no-emoji: OK (2 root(s) scanned)
  tsc x3                            clean
  Test Files  56 passed (56)
       Tests  804 passed (804)
```

804 = 761 Phase 9 baseline (none weakened) + 43 new: register/COPPA 17,
brands-hardening schema 7, privacy/disclaimer/FTC render 12, workers
deletion/export/UI-wiring 7 (the api-policy extensions grow existing
tests' pinned lists, adding no test count). Acceptance criteria mapped:

- **Register covers every registered source** — both-directions
  enumeration + flag-agreement tests (compliance-register).
- **Deletion removes all user data in one pass, proven by scanning all
  tables** — workers suite: sqlite_master-discovered dump contains none of
  15+ tracer ids after one DELETE call; rowsDeleted >= 21; bystander rows
  proven surviving (supply_lists rows compared by id + dump-containment
  check across all tables; corrected per gate finding P10-1 — the earlier
  "byte-identical" wording overstated the comparison scope); idempotent
  second call reports 0.
- **Export returns everything user-linked and nothing else** — D1
  cross-check per table; token hash and bystander ids absent.
- **Banned-claims lint fails a seeded violation** — Phase 0 suite intact
  and green; list unchanged (see §2.5 for the deferred addition).

## 7. Known gaps and risks

- **`legalEntity` remains `UNSET`** in `config/brand.ts` (only permitted
  location). Deliberate: no entity exists; release-qa must keep blocking
  launch on it. When an entity forms, compliance-officer updates that one
  field and re-reviews the privacy policy's operator references.
- **Banned-claims addition deferred** (§2.5): "risk-free" recommended;
  requires an orchestrator CLAUDE.md touch that this agent may not make.
- **Every register go-live column is currently Denied for fetch** — that
  is the launch posture, not an oversight; each flip needs the per-source
  precondition met and a register edit (test-enforced agreement).
- **Docs are outside the lint roots** (`npm run lint` scans src+public);
  mitigated by the register test's banned-claims scan over both compliance
  docs — new compliance docs must be added to that test's file list.
- **`DELETE /api/session` and `POST /account/delete` are not in the Phase
  8/9 pinned route sweeps** (those pin HTML GET routes; the new POST
  redirects). The deletion suite covers both ends; if a later phase adds
  GET renders around them, the P8-3 co-update rule applies.
- **KV purge relies on optional `KvLike.delete`** — present on real KV and
  MemoryKv; a custom KvLike double without it silently skips the bucket
  drop (buckets are content-free counters keyed by a dead credential
  hash). The workers test pins the real-KV behavior.
- **The privacy policy states "no automatic expiry" for session data** —
  true today. If a retention TTL for dormant households ever lands, update
  `PRIVACY.retentionSession` in the same change.

## 8. Instructions to next agent

**accessibility-qa (Phase 11):**

- New interactive surfaces to audit on `/account`: the delete form (native
  form + button, `aria-label` via `form()`), the export link-button pair,
  and the longer policy/disclaimer sections (h2/h3 hierarchy inside
  composer sections — verify heading order in the rendered page, axe run).
- The delete action is destructive with NO confirmation step (plain POST).
  If you add a confirmation affordance, it must not become confirm-shaming
  (rule-E scan will catch phrasing) and must keep the form functional
  without JS.
- MUST NOT: reorder account sections (commercial stays last — composer
  throws), reword PRIVACY/DISCLAIMERS/MONETIZATION copy without a
  compliance re-review note in your handoff (accuracy is load-bearing),
  or add any confirmation copy with urgency phrasing.
- Baseline for `npm run verify` is now **804 tests / 56 files**.

**release-qa (Phase 12):**

- BLOCK launch while `config/brand.ts` `legalEntity` is UNSET and `domain`
  is `.example` — both blocks are by design; only compliance-officer
  replaces the entity string, only in that file.
- Go-live checklist per source is the register's "Go-live precondition"
  lines; the register test will fail any live flag flip that outruns a
  register edit — treat that failure as a compliance stop, not a test bug.
- The one-pass deletion proof (`tests-workers/compliance-deletion.test.ts`)
  is a release gate: any new user-data table must appear in
  `HOUSEHOLD_DATA_TABLES` and the export, or that suite fails — do not
  waive it.
- MUST NOT ASSUME: that the deferred banned-claims addition happened (see
  §7); that docs are lint-covered (they are test-covered instead); that
  `/api/export` output is stable API surface for third parties — it is a
  user-facing data-rights export, versioned only by `exportedAt`.
