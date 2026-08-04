/**
 * Screen-state model. Loading / ready / rate-limited / error are structural
 * states of a screen; empty, stale, partial, conflicting-source, expired,
 * sold-out, and recalled are DATA conditions inside a ready envelope and are
 * rendered by components (badges, banners, suppression notices, the render
 * guard) — the state matrix in the Phase 7 handoff maps both layers.
 */
import type { ApiErrorCode, ApiOk, ApiResponseBody } from "../api/contracts";

export type ScreenState<T> =
  | { kind: "loading" }
  | { kind: "ready"; envelope: ApiOk<T> }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "error"; code: ApiErrorCode; message: string };

/** The non-ready variants — shared across every screen's state union. */
export type FailureState =
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "error"; code: ApiErrorCode; message: string };

export function failureState(body: Extract<ApiResponseBody<unknown>, { ok: false }>): FailureState {
  if (body.error.code === "rate_limited") {
    return { kind: "rate_limited", retryAfterSeconds: body.error.retryAfterSeconds ?? null };
  }
  return { kind: "error", code: body.error.code, message: body.error.message };
}

export function stateFromResponse<T>(body: ApiResponseBody<T>): ScreenState<T> {
  if (body.ok) return { kind: "ready", envelope: body };
  return failureState(body);
}
