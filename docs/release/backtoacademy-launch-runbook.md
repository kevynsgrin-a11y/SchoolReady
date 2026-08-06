# Launch runbook — backtoacademy.com

Owner: repository owner. Updated 2026-08-05 after provisioning the live
Cloudflare infrastructure.

## Deployment posture

This is a public **fixture-mode validation beta**, not a live-data production
release. The UI must keep the fixture ribbon visible. School, product, retailer,
tax-holiday, and recall data remain synthetic; no live-source flag may be
enabled until its licensing and compliance preconditions are recorded in
`docs/compliance/licensing-register.md`.

Turnstile and Stripe live paths are also intentionally disabled. Their current
implementations are throwing stubs, so adding dashboard secrets alone would not
enable them. The upload and alert paths use labeled fixture pass tokens, and
checkout remains unavailable.

## Provisioned Cloudflare resources

- Worker: `k8-planner`
- Custom domains: `backtoacademy.com`, `www.backtoacademy.com` (the Worker
  redirects `www` to the HTTPS apex)
- D1: `k8-planner-fixture`
  (`d467a443-5b38-4995-85ff-d26899ff3fb5`)
- KV: `SOURCE_KV` (`d3d1313129604e5d83be2de8a8fffe74`)
- Queue: `ingestion-refresh` (producer and consumer bindings)
- R2: `k8-planner-upload-buffer-fixture`; the bucket uses a one-day lifecycle
  rule as defense in depth while application code deletes uploads immediately
  after processing and enforces a 15-minute TTL.

`config/brand.ts` intentionally keeps `legalEntity` as
`"UNSET — no legal entity formed"`; an agent must not invent a legal person.

## Manual release

From an authenticated checkout:

```sh
npm ci
npm run verify
npm run build
npx wrangler d1 migrations apply k8-planner-fixture --remote
npx wrangler deploy
```

Wrangler creates/updates the two Custom Domains declared in `wrangler.jsonc`.
The D1 migration command is intentionally explicit: `wrangler deploy` does not
apply D1 migrations automatically.

## CI release

The `deploy` job in `.github/workflows/ci.yml` is gated by the repository
variable `DEPLOY_ENABLED=true` and these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The workflow currently releases from `main` after `verify`. Keep the API token
scoped to Workers Scripts, Workers KV Storage, Workers R2 Storage, D1, Queues,
and the `backtoacademy.com` Workers Routes permission.

## Post-deploy verification

1. `https://backtoacademy.com/healthz` returns HTTP 200, `ok: true`, and
   `fixtureMode: true`.
2. `https://backtoacademy.com/` returns HTTP 200 with the fixture ribbon.
3. `https://www.backtoacademy.com/<path>?<query>` returns a permanent 308 to
   the equivalent HTTPS apex URL.
4. Static assets load with HTTP 200.
5. A synthetic pasted-list journey creates a session and plan using D1.
6. The Queue shows one producer and one consumer; R2 is empty after an upload
   attempt completes or fails.

## Rollback

Use `wrangler rollback` or select the last-known-good version under
**Workers & Pages → k8-planner → Deployments**. Database rollback SQL is stored
under `migrations/down/`; inspect data impact before applying any down migration.

## Remaining release gates

Public deployment does not clear the legal-entity, human assistive-technology,
real-device/cross-browser, live-source licensing, CI browser-suite, Turnstile,
or Stripe gates in `docs/release/launch-checklist.md`.
