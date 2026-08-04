/**
 * Turnstile verification (§2: Turnstile on upload/account/alerts).
 *
 * Fixture posture (§0 launch posture): the ONLY working implementation is a
 * fixture verifier that accepts the labeled fixture token; the live verifier
 * is a THROWING STUB containing no fetch code at all, so live Turnstile can
 * never be called until a later phase lands it behind a flag with review.
 */

export interface TurnstileVerdict {
  ok: boolean;
  /** Machine-readable failure reason; null when ok. */
  reason: "missing_token" | "invalid_token" | null;
}

export interface TurnstileVerifier {
  readonly mode: "fixture" | "live";
  verify(token: string | null): Promise<TurnstileVerdict>;
}

/** The one token the fixture verifier accepts (clearly labeled, test-only). */
export const FIXTURE_TURNSTILE_PASS_TOKEN = "fixture-turnstile-pass";

export function createFixtureTurnstileVerifier(): TurnstileVerifier {
  return {
    mode: "fixture",
    verify(token: string | null): Promise<TurnstileVerdict> {
      if (token === null || token.length === 0) {
        return Promise.resolve({ ok: false, reason: "missing_token" });
      }
      if (token === FIXTURE_TURNSTILE_PASS_TOKEN) {
        return Promise.resolve({ ok: true, reason: null });
      }
      return Promise.resolve({ ok: false, reason: "invalid_token" });
    },
  };
}

export class TurnstileDisabledError extends Error {
  constructor() {
    super(
      "Live Turnstile verification is disabled: the fixture-mode beta ships " +
        "no live siteverify call and no secret key. No network request was " +
        "made. Use the fixture verifier (createFixtureTurnstileVerifier).",
    );
    this.name = "TurnstileDisabledError";
  }
}

/** The live verifier is a stub: no fetch code exists to accidentally enable. */
export function createLiveTurnstileStub(): TurnstileVerifier {
  return {
    mode: "live",
    verify(): Promise<never> {
      return Promise.reject(new TurnstileDisabledError());
    },
  };
}
