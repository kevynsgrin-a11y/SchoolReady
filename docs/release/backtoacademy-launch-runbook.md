# Launch runbook — backtoacademy.com

Owner: repository owner. Written 2026-08-04, after the repository owner
purchased the live domain through Cloudflare Registrar and instructed
autonomous deployment. `config/brand.ts` already carries the real domain
and working name as of this commit.

## What is already done (no action needed)

- `config/brand.ts` — real domain, working name/wordmark, support email.
  `legalEntity` is deliberately still `"UNSET — no legal entity formed"` —
  no agent may invent a legal person; that string is item 1 in the
  checklist below and must come from you.
- `.github/workflows/ci.yml` has a `deploy` job, off by default, gated on
  a `DEPLOY_ENABLED` repository variable (same on/off pattern already used
  for `LHCI_ENABLED`). It runs on every push to `main` that already passed
  `verify`, applies D1 migrations, then runs `wrangler deploy`.
- `wrangler.jsonc` is fully configured except for two dashboard-generated
  IDs (the D1 database and the KV namespace — R2 and the Queue are
  identified by name, already matching the config), which nothing in this
  environment can create (no Cloudflare account access exists here).
  Everything below fills those in.

## What this environment could not do, and why

This session has no Cloudflare account access, no `wrangler login` session,
no Stripe or Turnstile credentials, and no ability to click through a web
dashboard — it only has API access to this GitHub repository. Steps 1–5
below require a real Cloudflare account and must be done by you (or your
browser-driving agent) in a web browser. Every step is written as literal
clicks; nothing here requires the command line.

**Read "What you will NOT get from this deploy" at the bottom before
starting** — it changes what "done" means for step 5.

---

## Step 1 — Confirm the domain is an active Cloudflare zone

1. Go to `https://dash.cloudflare.com/` and log in.
2. In the left sidebar, click **Websites** (or the account home — the zone
   list).
3. Confirm `backtoacademy.com` is listed with status **Active**. Since you
   purchased it through Cloudflare Registrar, this should already be true;
   if it shows "Pending Nameservers" or similar, resolve that first
   (Cloudflare-purchased domains are usually active immediately).
4. Click into the `backtoacademy.com` zone and note the **Account** it
   lives under (shown top-left) — you'll pick this same account in every
   step below.

## Step 2 — Create a scoped API token

1. Click your profile icon (top-right) → **My Profile**.
2. Left sidebar → **API Tokens**.
3. Click **Create Token**.
4. Click **Create Custom Token** (bottom of the templates list) → **Get
   started**.
5. **Token name**: `backtoacademy-deploy`.
6. Under **Permissions**, add these six rows (click **+ Add more** after
   each one you add):
   - `Account` — `Workers Scripts` — `Edit`
   - `Account` — `Workers KV Storage` — `Edit`
   - `Account` — `Workers R2 Storage` — `Edit`
   - `Account` — `D1` — `Edit`
   - `Account` — `Queues` — `Edit`
   - `Zone` — `Workers Routes` — `Edit` (not exercised by anything below
     today — Step 6's custom domain is a dashboard click, not an API
     call — included now so the same token still works if a future
     change adds a `routes` entry to `wrangler.jsonc`; it's scoped to the
     one zone below either way)
7. Under **Account Resources**: select **Include** → your account (the one
   from Step 1).
8. Under **Zone Resources**: select **Include** → **Specific zone** →
   `backtoacademy.com`.
9. Click **Continue to summary**, then **Create Token**.
10. **Copy the token value shown on screen now — Cloudflare will not show
    it again.** Paste it somewhere safe temporarily; you'll paste it into
    GitHub in Step 6.
11. On the same account page, go to the account **Overview** page (left
    sidebar, top) and copy the **Account ID** shown in the right-hand
    sidebar. You'll need this in Step 6 too.

## Step 3 — Create the D1 database, KV namespace, and R2 bucket

Do these in the Cloudflare dashboard, in the account from Step 1. Use the
**exact names below** — they must byte-for-byte match `wrangler.jsonc`, so
that only the generated *IDs* need to be pasted back in (no other file
edits needed).

**D1 database**
1. Left sidebar → **Workers & Pages** → **D1 SQL Database** (or search
   "D1" in the dashboard search bar).
2. Click **Create Database**.
3. Name: `k8-planner-fixture` (yes — literally that, to match the existing
   config; despite the name, this holds real anonymous session/list data
   once live, it is not disposable).
4. Click **Create**.
5. On the database's page, copy the **Database ID** shown near the top
   (a UUID). Save it for Step 5.

**KV namespace**
1. Left sidebar → **Workers & Pages** → **KV**.
2. Click **Create a namespace**.
3. Name: anything memorable, e.g. `backtoacademy-source-kv` (only the ID
   is wired into the app, not this display name).
4. Click **Add**.
5. Copy the **Namespace ID** shown in the list. Save it for Step 5.

**R2 bucket**
1. Left sidebar → **R2 Object Storage**. If this is the account's first R2
   bucket, Cloudflare will prompt you to enable R2 (still free tier for
   this workload's tiny transient-upload usage) — accept.
2. Click **Create bucket**.
3. Name: `k8-planner-upload-buffer-fixture` (must match `wrangler.jsonc`
   exactly).
4. Leave defaults (Standard storage, automatic location). Click **Create
   bucket**. R2 buckets have no dashboard-generated ID to copy — the name
   itself is the identifier, and it already matches the config.

**Queue**
1. Left sidebar → **Queues**.
2. Click **Create queue**.
3. Name: `ingestion-refresh` (must match `wrangler.jsonc` exactly).
4. Click **Create**. No ID to copy here either.

## Step 4 — Edit `wrangler.jsonc` with the two real IDs

You do this directly in GitHub's browser file editor — no local checkout
needed.

1. Go to
   `https://github.com/kevynsgrin-a11y/SchoolReady/blob/main/wrangler.jsonc`
   (use whichever branch is currently your production branch if `main`
   hasn't been merged to yet).
2. Click the **pencil icon** (Edit this file) near the top-right of the
   file view.
3. Find the `"d1_databases"` block. Replace the placeholder
   `"database_id": "00000000-0000-0000-0000-000000000000"` value with the
   **Database ID** you copied in Step 3.
4. Find the `"kv_namespaces"` block. Replace the placeholder
   `"id": "00000000000000000000000000000000"` value with the **Namespace
   ID** you copied in Step 3.
5. Leave `database_name`, `bucket_name`, and the queue `"queue"` values
   untouched — they already match what you created.
6. Scroll to the bottom, add a commit message like "Add production
   Cloudflare resource IDs", select **Commit directly to the `main`
   branch** (or open a PR if you'd rather review it — either works, but
   the deploy job in Step 7 only fires on pushes to `main`), and click
   **Commit changes**.

## Step 5 — Add GitHub secrets and turn the deploy job on

1. Go to
   `https://github.com/kevynsgrin-a11y/SchoolReady/settings/secrets/actions`.
2. Under **Repository secrets**, click **New repository secret**.
   - Name: `CLOUDFLARE_API_TOKEN` — Value: the token from Step 2.10. Click
     **Add secret**.
3. Click **New repository secret** again.
   - Name: `CLOUDFLARE_ACCOUNT_ID` — Value: the account ID from Step 2.11.
     Click **Add secret**.
4. Click the **Variables** tab (next to Secrets, same page).
5. Click **New repository variable**.
   - Name: `DEPLOY_ENABLED` — Value: `true`. Click **Add variable**.
6. (Optional, recommended, zero extra cost) While here, add one more
   variable: Name `LHCI_ENABLED`, Value `true` — this turns on the
   Lighthouse budget check in CI too; it was proven green locally in
   Phase 11/12.

The next push to `main` (your Step 4 commit already was one) will trigger
the `deploy` job automatically. If you want to fire it immediately without
waiting:

7. Go to the **Actions** tab →  click **CI** in the left workflow list →
   click **Run workflow** (top-right dropdown) → branch `main` → **Run
   workflow**.
8. Click into the running workflow, watch the `deploy` job. It should go
   green in 1–2 minutes.

## Step 6 — Attach the custom domain

1. Go to **Workers & Pages** in the Cloudflare dashboard → click on the
   `k8-planner` worker (it now exists after Step 5's deploy).
2. Click the **Settings** tab → **Domains & Routes**.
3. Click **Add** → **Custom Domain**.
4. Type `backtoacademy.com` → click **Add Domain**.
5. Repeat for `www.backtoacademy.com` if you want the `www` prefix to work
   too (optional — Cloudflare will offer to set up a redirect).
6. Cloudflare provisions the DNS record and SSL certificate automatically;
   this usually takes under a minute since the zone is already on
   Cloudflare.

## Step 7 — Verify it's live

1. Visit `https://backtoacademy.com/healthz` — expect
   `{"ok":true,"service":"<your working name>","fixtureMode":true}`.
2. Visit `https://backtoacademy.com/` — the homepage should load with the
   fixture-mode ribbon visible near the top (this is intentional — see
   below).
3. Click through the intake flow with a pasted list to confirm the Worker
   can read/write D1 and R2 (create a fixture-mode plan end to end).

---

## What you will NOT get from this deploy — read before telling anyone it's "live"

This ships the code exactly as built and gated through all 12 phases. Two
things do **not** change just because it's on a real domain:

1. **All product data stays synthetic (fixture mode), unconditionally.**
   `config/flags.ts` hardcodes `fixtureMode: true` in code, not from any
   environment variable — the `FIXTURE_MODE` var in `wrangler.jsonc` is
   currently inert. This means: school directory search, CPSC recall
   checks, and retailer prices/offers are all synthetic fixture data, not
   real data, regardless of this deploy. The app is honest about this — it
   renders a visible fixture-mode ribbon on every page — but a real recall
   check on this deployment does **not** check the real CPSC database. If
   you want real data, that is meaningful follow-on engineering work per
   source (wiring live adapters behind the existing flags, obtaining and
   licensing each feed per `docs/compliance/licensing-register.md`'s
   go-live preconditions) — not something this deploy step does or should
   silently paper over.
2. **Turnstile bot-protection and Stripe payments are not implemented,
   not just unconfigured.** Both live verifiers
   (`src/api/turnstile.ts`, `src/api/stripe.ts`) are throwing stubs by
   design — there is no fetch/crypto code to enable even with real keys.
   Concretely: upload and alert-subscribe endpoints currently self-issue a
   fixture pass token server-side (so real users can still use them —
   nothing is broken), but that means there is **no real bot/abuse
   protection on a public URL today**. Season Pass checkout is honestly
   disabled in the UI ("not available yet" — no broken button, no
   silent failure). Wiring real Turnstile/Stripe is its own development
   phase (implement the live verifiers, add Worker secrets for the real
   keys, re-run the Phase 9 paywall/dark-pattern regression suites against
   the live path, get a compliance-officer review) — do not add Stripe or
   Turnstile dashboard credentials yet; there is nowhere for them to go in
   the code today.

## Remaining launch-checklist items (unaffected by this deploy)

See `docs/release/launch-checklist.md` for the full list with owners.
Deploying does not discharge: legal entity (item 1, still open), the human
assistive-technology pass (item 2), real-device/cross-browser testing
(item 3), per-source licensing sign-offs before any live data flag flips
(item 4), and flipping `browser-suites` from non-blocking to required in
branch protection once you've watched it pass a few times on `main`
(item 6, `Settings → Branches → main → Edit → Require status checks →
add browser-suites`).

## Rollback

If a deploy misbehaves: `docs/release/runbook.md` has the general
rollback procedure (`wrangler rollback`, migration `down/` pairs). The
fastest stop-gap from the dashboard: **Workers & Pages → k8-planner →
Deployments tab → find the last-known-good deployment → "..." menu →
Rollback to this deployment.**

## Nice-to-have, optional, zero cost

- **`support@backtoacademy.com` inbox**: Cloudflare dashboard → your zone
  → **Email** → **Email Routing** → **Enable Email Routing** → add a
  destination address (your real inbox) → create a routing rule
  `support@backtoacademy.com` → forwards to your address. Free, takes
  under two minutes, no mail server needed.
