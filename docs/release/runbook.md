# Deploy runbook — fixture-mode validation beta

- Owner: release-qa (Phase 12). Reviewed against `wrangler.jsonc`,
  `src/index.ts` (composition root), `migrations/`, and
  `docs/compliance/licensing-register.md`.
- Posture being deployed: the §0 fixture-mode validation beta. Every live
  source is OFF (`config/flags.ts`), live Turnstile/Stripe/OCR are
  throwing stubs by construction, all product/price/recall/tax data is
  labeled fixture data, and every page carries the fixture ribbon.
- Environment honesty: the fixture beta was deployed to
  `https://backtoacademy.com` on 2026-08-05. D1, KV, R2, and Queue bindings
  are live; the data-source, Turnstile, Stripe, and OCR caveats above remain.

## 0. Preconditions (all must be true — see docs/release/launch-checklist.md)

1. `docs/release/launch-checklist.md` items 1–6 cleared. In particular:
   `config/brand.ts` carries the real name/wordmark, a registered
   (non-.example) domain, and a formed legal entity — `npm test` includes
   the release-blocker posture and reviewers must re-check it; the
   congruence gate's BLOCKED-ENV lines have real-device results.
2. `npm run verify` green at HEAD (lint + typecheck + 821 tests / 57
   files), `npm run test:a11y` 65/65, `npm run test:e2e` 14/14.
3. A Cloudflare account with Workers Paid (Queues requires it), and a
   repo admin able to set repository variables/secrets.

## 1. Provision real bindings (one-time; completed 2026-08-05)

The committed `wrangler.jsonc` carries the live D1 and KV IDs. The named R2
bucket and Queue are also provisioned. These commands remain the recovery
reference if the account ever needs to be rebuilt:

```sh
# D1 (relational store)
npx wrangler d1 create k8-planner-fixture          # -> database_id into wrangler.jsonc
# KV (SWR cache envelopes, source health, flag overrides, rate-limit buckets)
npx wrangler kv namespace create SOURCE_KV         # -> id into wrangler.jsonc
# R2 (transient upload buffer ONLY — hard TTL enforced in code)
npx wrangler r2 bucket create k8-planner-upload-buffer-fixture
# Queues (ingestion-refresh contract)
npx wrangler queues create ingestion-refresh
```

Then apply migrations to the REMOTE database, in order, up only:

```sh
npx wrangler d1 migrations apply k8-planner-fixture --remote
# expect 0001_provenance ... 0008_brands_hardening, 8 applied
```

Notes:
- R2 lifecycle rules have day granularity; the 900-second TTL is enforced
  in code (`src/parsing/upload-buffer.ts`). The live bucket also has the
  `expire-all-after-one-day` lifecycle rule as a defense-in-depth sweep.
- No Durable Objects are provisioned — §2 reserves DO for live
  family-collaboration sessions, which do not exist in this beta.

## 2. Credentials and repository variables

| Item | Where | Beta posture |
|---|---|---|
| `LHCI_ENABLED=true` | GitHub repository variable | REQUIRED at launch — activates the Lighthouse budget job (config proven runnable in Phase 11/12) |
| Browser-suites CI job | `.github/workflows/ci.yml` | Flip from `continue-on-error: true` to required at launch (launch item 6) |
| Turnstile site/secret keys | Cloudflare dashboard + Worker secret | NOT wired in the beta: fixture mode uses the fixture verifier (a labeled pass token); the LIVE verifier is a throwing stub. Real keys land only with the live-mode compliance sign-off (launch item 4) |
| Stripe webhook secret | Worker secret | Same posture: fixture-verified webhooks only; live checkout throws by construction until Phase 10-style review of the first real payment path |
| Live source credentials/licenses | per `docs/compliance/licensing-register.md` | Every `liveSources.*` flag stays OFF; a flip without a Permitted-fetch ruling in the register FAILS the test suite (`tests/compliance-licensing.test.ts`) |

## 3. Deploy

```sh
npm run verify                 # must be green before any deploy
npm run build                  # generates dist/ static pages (SEO surfaces)
npx wrangler deploy --dry-run  # sanity: bundle + bindings resolve
npx wrangler deploy            # deploys Worker + Static Assets (public/)
```

Custom domain: attach the registered domain from `config/brand.ts` as a
Workers custom domain. The name lives ONLY in that file; nothing in the
deploy needs to repeat it.

## 4. Post-deploy verification (every deploy)

Run in order against the deployed origin `$ORIGIN`:

```sh
# 1. Health + posture: fixtureMode must be true in this beta
curl -s $ORIGIN/healthz            # {"ok":true,...,"fixtureMode":true}

# 2. Crawl surface
curl -s -o /dev/null -w "%{http_code}\n" $ORIGIN/            # 200
curl -s $ORIGIN/robots.txt | head -3
curl -s $ORIGIN/sitemap.xml | head -3

# 3. Safety intercept (the §1.2-critical path) renders alert-first
curl -s "$ORIGIN/safety?upc=FIXTURE-UPC-0007" | grep -c "banner-recall"   # >= 1

# 4. Anonymous journey smoke: the E2E suite against the deployed origin
#    (baseURL override; journey 2 stays local-only — it seeds KV):
#    edit playwright.e2e.config.ts use.baseURL or run the three journeys
#    manually per docs/release/congruence-gate.md SS6 table.

# 5. Lighthouse spot check on the live origin (mobile defaults):
npx lighthouse $ORIGIN/ --output=json --output-path=./post-deploy-home.json
# budgets: perf>=0.90 a11y>=0.95 bp>=0.95 seo>=0.95 CLS<0.1 LCP<2500ms
```

Then the human checks (10 minutes): home five-second test on a real
phone; paste a sample list end to end; check a recalled fixture UPC; open
/account and run export + delete; confirm the fixture ribbon is present
on every page.

## 5. Rollback

Workers keep prior versions; rollback is immediate and does not touch
data:

```sh
npx wrangler deployments list           # find the previous deployment id
npx wrangler rollback [version-id]      # restores the previous Worker + assets
```

Database rollback — every migration has a byte-reviewed down file in
`migrations/down/` (wrangler reads only the top level, so downs are
applied manually, NEWEST FIRST):

```sh
# roll back 0008 only (example):
npx wrangler d1 execute k8-planner-fixture --remote --file=migrations/down/0008_brands_hardening.sql
# full teardown order: 0008, 0007, 0006, 0005, 0004, 0003, 0002, 0001
```

Rules:
- Never roll back a migration that a still-deployed Worker version
  depends on — roll back the Worker first, then the schema.
- D1 sessions/households are user data (§1.7): schema rollback that drops
  user tables is a data-loss event; prefer Worker rollback + forward fix.
  `tests/schema.test.ts` proves each down file reverses its up cleanly.
- KV entries are caches and flag overrides only — safe to delete
  (`cache:*` refreshes from adapters; `health:*` rebuilds). Deleting
  `ratelimit:*` resets abuse buckets; acceptable.
- R2 objects are transient upload buffers with in-code TTL — never
  restored, never rolled back.

## 6. Incident basics

| Symptom | First moves |
|---|---|
| Error rates / blank pages | `npx wrangler tail` (logs are an allowlisted-field JSON stream — no PII by construction); roll back the Worker (above); check /healthz |
| Source trouble (stale badges everywhere) | /admin/status shows per-source freshness, circuit state, degradation — this is designed behavior, not an outage: stale data serves with badges, never an error page |
| A real product recall lands mid-season | No action needed for display (recall data enters via the pipeline and renders above everything by construction) — but in fixture mode the CPSC feed is OFF; a real recall response requires the live-source go-live in the licensing register |
| Suspected PII in logs | Logging is allowlist-only (`src/api/logging.ts`, tested); if a field slipped in, that is a build failure class — hotfix the allowlist test first |
| Abuse of upload/alerts | KV `ratelimit:*` buckets are live (5/min token buckets); Turnstile is fixture-grade in the beta — if abused, this is the trigger to accelerate launch item 4 (real Turnstile), not to weaken rate limits |
| Legal/takedown contact | The registered agent of the legal entity in `config/brand.ts` (UNSET until launch item 1 clears — a reason it blocks release) |

## Deployment record (2026-08-05)

What could be executed here was executed:

- `npx wrangler d1 migrations apply k8-planner-fixture --local` — 8/8
  migrations apply cleanly (re-run during both browser suites' web-server
  boot, plus the journey-2 dedicated persist dir every run).
- `npm run build` — 3 static pages + assets into dist/.
- `npx wrangler deploy --dry-run` — bundle builds and all five bindings
  (DB, SOURCE_KV, UPLOAD_BUFFER, INGESTION_QUEUE, FIXTURE_MODE) resolve.
- Remote D1 migrations: 8/8 applied; no migrations pending.
- Live Worker version `5a4a853e-79e5-4894-96ce-2f17840f1826` deployed with
  apex and `www` Custom Domains plus one Queue producer and consumer.
- Rollback pair mechanics: `tests/schema.test.ts` applies every up/down/up
  cycle against D1 as part of the 821-test verification suite.
- Live checks passed for health, fixture disclosure, static assets, canonical
  redirect, anonymous intake/confirm/plan persistence, R2 cleanup, and Queue
  registration. See `docs/release/backtoacademy-launch-runbook.md`.
