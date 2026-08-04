/**
 * Season Pass surface logic — Phase 9 (monetization-engineer).
 *
 * Wiring: the account screen reads GET /api/entitlements (Phase 5 contract)
 * and folds the result through `seasonPassSurface` below; purchases and
 * refunds arrive ONLY via POST /api/webhooks/stripe with the Phase 5
 * fixture-verified event (src/api/stripe.ts). This module mirrors that
 * file's posture exactly: the checkout entry point EXISTS on the account
 * screen, but no checkout-session code exists to enable — fixture mode says
 * so honestly, and live mode throws by construction, so a real payment can
 * never be wired accidentally.
 *
 * §1.2: the pass gates `adFreeExtras` ONLY. Required list data, safety and
 * recall warnings, dress-code restrictions, corrections, price changes,
 * assistance resources, and deadlines are identical with and without it —
 * proven byte-for-byte in tests-workers/monetization-routes.test.ts.
 *
 * §5 (no dark patterns): the entry point renders no countdown, no scarcity,
 * no pre-checked consent, no confirm-shaming — see src/monetization/
 * dark-patterns.ts for the marker sweep run over every rendered route.
 *
 * Types are STRUCTURAL slices of the Phase 5 contracts on purpose: importing
 * src/api/contracts.ts would pull src/algorithms/* type modules into this
 * package's import closure and muddy the §1.1 boundary proof.
 */

/** Structural slice of Phase 5 EntitlementsData (src/api/contracts.ts). */
export interface EntitlementsLike {
  readonly seasonPass: {
    readonly status: string;
    readonly validUntil: string;
    readonly provenanceIds: readonly string[];
  } | null;
  readonly gates: { readonly adFreeExtras: boolean };
}

export type SeasonPassSurfaceState =
  | {
      readonly kind: "active";
      readonly validUntil: string;
      readonly provenanceIds: readonly string[];
      readonly adFree: boolean;
    }
  | { readonly kind: "checkout_unavailable"; readonly mode: "fixture" | "live" };

/** Folds the entitlements envelope into the account screen's pass block state. */
export function seasonPassSurface(
  entitlements: EntitlementsLike,
  fixtureMode: boolean,
): SeasonPassSurfaceState {
  if (entitlements.seasonPass !== null && entitlements.seasonPass.status === "active") {
    return {
      kind: "active",
      validUntil: entitlements.seasonPass.validUntil,
      provenanceIds: entitlements.seasonPass.provenanceIds,
      adFree: entitlements.gates.adFreeExtras,
    };
  }
  return { kind: "checkout_unavailable", mode: fixtureMode ? "fixture" : "live" };
}

export class SeasonPassCheckoutDisabledError extends Error {
  constructor() {
    super(
      "Season Pass checkout is disabled: no Stripe checkout-session code " +
        "exists in this build (mirrors src/api/stripe.ts — the live webhook " +
        "verifier is also a throwing stub). No network request was made. " +
        "Entitlements are granted only through the fixture-verified webhook.",
    );
    this.name = "SeasonPassCheckoutDisabledError";
  }
}

/**
 * The checkout action behind the account-screen entry point. Throws in every
 * mode of this build — payments cannot be taken until Stripe credentials,
 * checkout-session code, and the Phase 10 compliance review all land.
 */
export function beginSeasonPassCheckout(): never {
  throw new SeasonPassCheckoutDisabledError();
}
