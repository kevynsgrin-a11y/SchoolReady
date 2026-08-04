# Data-licensing register — Phase 10 (compliance-officer)

Single source of truth for what this product may do with each registered
data source. Machine-checked: `tests/compliance-register.test.ts` enumerates
`SOURCE_REGISTRATIONS` in `src/ingestion/registry.ts` against this file —
every registered source must have a section here, every section here must
correspond to a registered source, and the Fetch/Cache/Store/Display rulings
must agree with the code-level licensing flags. **A source without a current
register entry stays in fixture mode** (CLAUDE.md launch posture; every
`liveSources` flag defaults OFF in `config/flags.ts`).

Ruling vocabulary: **Permitted** / **Denied**. Seven permissions are ruled on
per source:

- **Fetch** — live network requests to the source.
- **Cache** — bounded KV stale-while-revalidate envelopes.
- **Store** — normalized rows persisted in D1 (always with §1.4 provenance).
- **Transform** — normalization/derivation, recorded in
  `provenance.transform_version`.
- **Display** — rendering to users (always through the §1.4 render guard).
- **Index** — exposure on search-indexable surfaces (SEO map,
  `src/seo/route-metadata.ts`).
- **Alert** — use in in-app alert evaluation (`alert_subscriptions`).

## Registered data sources

### `nces_ccd` — NCES Common Core of Data school directory

Provider: National Center for Education Statistics (US Dept. of Education).

| Permission | Ruling |
|---|---|
| Fetch (live) | Denied until go-live preconditions below are met (`liveSources.nces_ccd` is OFF) |
| Cache | Permitted — bounded KV SWR envelopes only |
| Store | Permitted — directory identity only (name, district, state, city, grade span); never a supply list (§0 NOT #1) |
| Transform | Permitted — directory normalization; version recorded in `provenance.transform_version` |
| Display | Permitted — with attribution to NCES/US Dept. of Education |
| Index | Denied for now — no school-directory surface exists in the SEO route map; re-rule with seo-architect before any school page ships |
| Alert | Denied — directory data feeds no alert kind |

- Basis: `us_government_open_data` (public-domain US federal data)
- Go-live precondition: flip `liveSources.nces_ccd` + re-confirm current CCD
  file terms and retrieval cadence + update this row with the confirmation
  date + circuit breaker verified against the live endpoint + scope-guardian
  gate sign-off. Until then: `fixture:nces-ccd-2026-v1` only.

### `cpsc_recalls` — CPSC recall feed

Provider: US Consumer Product Safety Commission (SaferProducts REST).

| Permission | Ruling |
|---|---|
| Fetch (live) | Denied until go-live preconditions below are met (`liveSources.cpsc_recalls` is OFF) |
| Cache | Permitted — bounded KV SWR; staleness badged after threshold |
| Store | Permitted — structured recall facts only; `ConsumerContact` fields are never ingested (contact-shaped data, §1.7 posture) |
| Transform | Permitted — recall/product normalization; version recorded in provenance |
| Display | Permitted — with attribution ("public domain, retrieved as dated") and a deep link to the official CPSC notice on every match |
| Index | Denied — `/safety` is noindex in every context (SEO map); recall pages must never become programmatic SEO inventory |
| Alert | Permitted — the `recall` alert kind is the primary alert use case; recall warnings are §1.2-protected content and always render first |

- Basis: `us_government_open_data` (public-domain US federal safety data)
- Go-live precondition: flip `liveSources.cpsc_recalls` + record the
  SaferProducts endpoint/version in use + verify the ConsumerContact
  exclusion against the live payload shape + circuit breaker verified +
  scope-guardian gate sign-off. Until then: `fixture:cpsc-recalls-2026-v1`.

### `state_tax_holidays` — State sales-tax-holiday calendar

Provider: state departments of revenue (per-state statutory public records).

| Permission | Ruling |
|---|---|
| Fetch (live) | Denied until go-live preconditions below are met, PER STATE (`liveSources.state_tax_holidays` is OFF) |
| Cache | Permitted — bounded KV SWR envelopes |
| Store | Permitted — holiday windows and category caps with per-state provenance |
| Transform | Permitted — calendar normalization; version recorded in provenance |
| Display | Permitted — with attribution and the standing caveat: fixture/unverified calendars render as unverified estimates, never promises (§1.5) |
| Index | Permitted with caveats — `/deals` is an indexable tool surface; displayed calendars must carry their verification status and provenance in the rendered page |
| Alert | Permitted — the `deadline` alert kind may use verified windows; unverified windows must not fire alerts |

- Basis: `state_public_records`
- Go-live precondition: PER-STATE source vetting recorded in this register
  (source URL, statutory basis, verification date) before that state's data
  flips live; `liveSources.state_tax_holidays` flip + circuit breaker
  verified + scope-guardian gate sign-off. Until then:
  `fixture:tax-holidays-2026-v1`.

### `affiliate_feeds` — Retailer product feeds

Provider: retail affiliate networks — **no contract exists**.

| Permission | Ruling |
|---|---|
| Fetch (live) | Denied — no feed contract; deny-all licensing in code |
| Cache | Denied — nothing licensed to hold |
| Store | Denied — nothing licensed to persist |
| Transform | Denied — no licensed input exists to transform |
| Display | Denied — only the clearly-synthetic fixture retailers/prices render in this beta |
| Index | Denied — permanently for offer data: no Offer/Product structured data ever ships (SEO handoff 09), and tool surfaces stay ad-free |
| Alert | Denied for live data — `price_change` alerts run on labeled fixture data only until a contract lands and this row is re-ruled |

- Basis: `commercial_contract_required`
- Go-live precondition: executed network/feed contract + compliance review
  of the feed's terms (cache/store/display rights, attribution, takedown) +
  §1.1 commission-independence and §1.5 conflict-suppression tests still
  green + FTC disclosure copy live-reviewed (see below) + scope-guardian
  gate sign-off. Until then: `fixture:retailer-offers-2026-v1`.

## Affiliate-network posture (Phase 9 monetized surfaces)

Verified against the repository on 2026-08-04 (handoff 10 §8 instruction:
"verify and record"):

- **No affiliate agreement, no network membership, no payment-processor
  account exists or is claimed.** Both registered networks in
  `src/monetization/networks.ts` (`fixture-network-alpha`,
  `fixture-network-beta`) are labeled synthetic test doubles; every
  publisher tag is a `fixture-tag-*` value; no real affiliate ID exists
  anywhere in the repository.
- **Zero affiliate links render on any shipped route** (proven by the §1.2
  route sweep, `tests-workers/monetization-routes.test.ts`); the decoration
  pipeline exists test-proven only. Decoration happens at render time —
  decorated URLs never replace the neutral `deepLinkUrl` at rest (§1.5).
- **Zero ad slots are mounted** (`MOUNTED_SLOTS = []`, enforced by
  `src/monetization/ad-rules.ts` and swept in tests).
- **One upsell exists**: the Season Pass block, last section of the
  alerts-and-privacy page, checkout disabled in both modes
  (`beginSeasonPassCheckout` throws; live Stripe is a throwing stub).
  Purchases flow only through the fixture-verified webhook.
- **Nothing requires a takedown to stay truthful.** The `/item/:slug`
  no-payment disclosure (`ITEM.disclosureNone`) remains accurate.
- FTC disclosure copy is FINAL as of Phase 10 (`src/ui/copy/en.ts`
  `MONETIZATION`); standard applied is recorded in the block comment and in
  handoff 11. The first live link requires a fresh review.

## Not sources, by design (§0 NOT #1)

TeacherLists, district PDFs, and school-hosted supply lists are **not
sources and can never become sources**: the registry's closed `dataKind`
vocabulary has no member for list content, no adapter or table exists for
it, and `tests/ingestion-registry.test.ts` enforces the vocabulary. The
product interoperates and deep-links only.

User uploads (photos/PDFs of a family's own list) are user content, not a
licensed source: processed ephemerally under the hard TTL in
`src/parsing/upload-buffer.ts` and never stored, indexed, or redistributed
(§1.7; see `docs/compliance/coppa-posture.md`).
