# GA4 analytics posture — local deployment candidate

Status: implemented and locally testable; not deployed by this change.

This document records the bounded Google Analytics design for the fixture
beta. It does not authorize a Worker deployment, a Google provider-setting
change, or a live Analytics query.

## Public configuration

- Analytics account: `404244598`
- Property: `549418711`
- Web stream: `15418917216`
- Measurement ID: `G-MLJL08H3M2`
- Source of truth: `config/analytics.ts`

The measurement ID is public browser configuration, not a credential. No
OAuth client secret, refresh token, API token, or service-account material is
present in this repository or required by the browser tag.

## Collection boundary

The integration uses basic consent behavior:

1. Raw HTML contains only the same-origin `/assets/analytics.js` controller.
2. The controller defaults all Consent Mode v2 fields to `denied`.
3. It makes no provider request before an explicit visitor opt-in.
4. A Global Privacy Control or Do Not Track signal keeps analytics off and
   disables the allow control.
5. The server emits the measurement ID only when the resolved robots policy
   is exactly `index,follow`.
6. Personalized pages carrying the anonymous saved-plan session are
   `noindex`, so they receive no measurement ID and cannot load the tag.
7. The page location and referrer are reduced to origin plus path. Query
   strings and fragments are never passed in tag configuration.
8. The integration sets no user ID, user property, plan value, household
   field, list content, or custom event.

The first-party analytics cookies use a dedicated prefix, expire after 90
days, and do not renew on every page view. Revoking consent sends a denied
consent update and expires cookies with that prefix. The preference itself is
stored locally in the browser and can be changed through the footer control.

## Advertising boundary

These values remain denied or disabled even after analytics consent:

- `ad_storage`
- `ad_user_data`
- `ad_personalization`
- `allow_google_signals`
- `allow_ad_personalization_signals`

No Google Ads tag, remarketing configuration, targeted advertising, or
cross-product identity is introduced.

## User-facing disclosure

`src/ui/copy/en.ts` and the rendered privacy surface disclose:

- that analytics is optional and off by default;
- the Google Analytics recipient;
- the public-page-only boundary;
- the URL sanitization boundary;
- the general data categories received after consent;
- the 90-day non-renewing cookie lifetime;
- the permanent advertising-signal restrictions; and
- the footer preference control.

Plan data remains outside the provider boundary.

## Automated evidence

`tests/analytics-consent.test.ts` proves:

- one local controller and no provider URL in raw HTML;
- the measurement ID appears only on eligible public renders;
- no provider request occurs before consent;
- all consent fields default to denied;
- one opt-in loads one tag;
- query strings and fragments are removed;
- advertising features remain disabled;
- ineligible pages cannot load the provider after consent;
- browser privacy signals override a stored grant; and
- revocation expires only the dedicated analytics cookies.

`tests/compliance-privacy.test.ts` locks the provider disclosure and plan-data
boundary into the rendered privacy page.

## Required deployment gate

Before any deployment, the owner must separately authorize all of the
following as one bounded release:

1. Privacy/compliance review of the exact rendered copy and consent flow.
2. A clean local `npm run verify`, `npm run build`, browser accessibility
   suite, browser end-to-end suite, and dry-run Worker bundle.
3. A staging or preview network inspection proving zero requests to Google
   before consent and zero requests on a saved-plan page.
4. A post-consent inspection proving one tag load with sanitized page
   location and no plan values or user identifiers.
5. Production deployment with an identified source commit and rollback
   version.
6. A separately authorized, bounded realtime verification only after the
   deployment is live.

Until that gate is approved and executed, the live site remains unchanged.
