/**
 * Season Pass webhook verification (Stripe one-time payment — §2).
 *
 * Fixture posture: the fixture verifier accepts a clearly-labeled fixture
 * signature and a `_fixture: true` normalized event body; the live verifier
 * is a THROWING STUB (no stripe SDK, no signature crypto, no network), so
 * live payments cannot be wired accidentally. Entitlements written from a
 * verified event gate ad-free extras ONLY (§1.2 precursor) — nothing in the
 * core plan flow reads them.
 */
import type { SeasonPassWebhookBody } from "./contracts";

export const FIXTURE_STRIPE_SIGNATURE = "fixture-stripe-signature-v1";
export const STRIPE_SIGNATURE_HEADER = "x-webhook-signature";

export type WebhookVerification =
  | { ok: true; event: SeasonPassWebhookBody }
  | { ok: false; reason: "missing_signature" | "bad_signature" | "malformed_event" };

export interface StripeWebhookVerifier {
  readonly mode: "fixture" | "live";
  verify(rawBody: string, signature: string | null): Promise<WebhookVerification>;
}

const isEvent = (v: unknown): v is SeasonPassWebhookBody => {
  if (v === null || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    e["_fixture"] === true &&
    typeof e["eventId"] === "string" &&
    (e["eventType"] === "season_pass.purchased" || e["eventType"] === "season_pass.refunded") &&
    typeof e["householdRef"] === "string" &&
    typeof e["paymentRef"] === "string" &&
    typeof e["validFrom"] === "string" &&
    typeof e["validUntil"] === "string"
  );
};

export function createFixtureStripeVerifier(): StripeWebhookVerifier {
  return {
    mode: "fixture",
    verify(rawBody: string, signature: string | null): Promise<WebhookVerification> {
      if (signature === null || signature.length === 0) {
        return Promise.resolve({ ok: false, reason: "missing_signature" });
      }
      if (signature !== FIXTURE_STRIPE_SIGNATURE) {
        return Promise.resolve({ ok: false, reason: "bad_signature" });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return Promise.resolve({ ok: false, reason: "malformed_event" });
      }
      if (!isEvent(parsed)) {
        return Promise.resolve({ ok: false, reason: "malformed_event" });
      }
      return Promise.resolve({ ok: true, event: parsed });
    },
  };
}

export class StripeDisabledError extends Error {
  constructor() {
    super(
      "Live Stripe webhook verification is disabled: the fixture-mode beta " +
        "ships no signing secret and no signature crypto. No network request " +
        "was made. Use the fixture verifier (createFixtureStripeVerifier).",
    );
    this.name = "StripeDisabledError";
  }
}

/** The live verifier is a stub: no crypto/SDK code exists to enable. */
export function createLiveStripeStub(): StripeWebhookVerifier {
  return {
    mode: "live",
    verify(): Promise<never> {
      return Promise.reject(new StripeDisabledError());
    },
  };
}
