/**
 * Router plumbing: route table types, matching, the response envelope
 * builder (with the §1.4 provenance gate inline), and error mapping.
 *
 * Route POLICY is data, not code, so tests can assert §1.2 structurally:
 * every route carries its category and its gating posture, and no route in
 * a protected category (required list data, safety, deadlines) may be
 * entitlement-gated — enforced by tests/api-policy.test.ts on the SHIPPED
 * table, and by the router refusing to register such a route at all.
 */
import type { Assumption } from "../algorithms/types";
import type { ProvenanceRecord } from "../contracts/provenance";
import { isoFromMs } from "../ingestion/types";
import type { ApiDeps } from "./deps";
import type {
  ApiErr,
  ApiErrorCode,
  ApiOk,
  ResponseMeta,
  SourceStatus,
  SuppressionNote,
} from "./contracts";
import { TURNSTILE_HEADER } from "./contracts";
import { ApiError, rateLimited } from "./errors";
import { assertResponseProvenance, ProvenanceGateError } from "./provenance-gate";
import type { SessionContext } from "./session";
import { buildSessionCookie, ensureSession, readSession } from "./session";
import { checkRateLimit, RATE_LIMIT_RULES } from "./rate-limit";
import { ManualEntryValidationError } from "../parsing/types";
import { UploadUnavailableError } from "../parsing/pipeline";
import { OcrFixtureError } from "../parsing/ocr";
import { BasketSearchSpaceError } from "../algorithms/basket";
import { LiveSourceDisabledError } from "../ingestion/types";
import { TurnstileDisabledError } from "./turnstile";
import { StripeDisabledError } from "./stripe";

/**
 * §1.2 route categories. PROTECTED_CATEGORIES may never be entitlement-gated
 * and never require anything beyond the anonymous session.
 */
export const ROUTE_CATEGORIES = [
  "core_required_data",
  "safety",
  "deadline",
  "evidence",
  "session",
  "payments",
  "extras",
] as const;
export type RouteCategory = (typeof ROUTE_CATEGORIES)[number];

export const PROTECTED_CATEGORIES: readonly RouteCategory[] = [
  "core_required_data",
  "safety",
  "deadline",
];

export interface RoutePolicy {
  /** DELETE exists for exactly one surface: the §1.7 one-pass data purge. */
  method: "GET" | "POST" | "DELETE";
  /** Path pattern, e.g. '/api/trend/:slug'. */
  pattern: string;
  category: RouteCategory;
  /** none = stateless; read = use session if present; ensure = create one. */
  session: "none" | "read" | "ensure";
  turnstile: boolean;
  rateLimit: keyof typeof RATE_LIMIT_RULES | null;
  /** §1.2: gates ad-free extras only; must be false on protected categories. */
  entitlementGated: boolean;
}

export interface RouteContext {
  request: Request;
  url: URL;
  deps: ApiDeps;
  params: Record<string, string>;
  session: SessionContext | null;
}

export interface RouteResult {
  status?: number;
  data: unknown;
  provenance?: Record<string, ProvenanceRecord>;
  suppressions?: SuppressionNote[];
  assumptions?: Assumption[];
  sources?: SourceStatus[];
}

export interface RouteDef extends RoutePolicy {
  handler(ctx: RouteContext): Promise<RouteResult>;
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter((p) => p.length > 0);
  const pathParts = path.split("/").filter((p) => p.length > 0);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const pat = patternParts[i]!;
    const part = pathParts[i]!;
    if (pat.startsWith(":")) params[pat.slice(1)] = decodeURIComponent(part);
    else if (pat !== part) return null;
  }
  return params;
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

function meta(deps: ApiDeps, sources: SourceStatus[]): ResponseMeta {
  return {
    generatedAt: isoFromMs(deps.clock()),
    fixtureMode: deps.flags.fixtureMode,
    sources,
  };
}

function jsonResponse(body: unknown, status: number, setCookie: string | null): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (setCookie) headers.append("set-cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function okEnvelope(deps: ApiDeps, result: RouteResult): ApiOk<unknown> {
  const provenance = result.provenance ?? {};
  // §1.4 gate: a response that would ship a provenance-less fact throws here
  // and is suppressed by the router instead of shipped.
  assertResponseProvenance(result.data, provenance);
  return {
    ok: true,
    data: result.data,
    provenance,
    suppressions: result.suppressions ?? [],
    assumptions: result.assumptions ?? [],
    meta: meta(deps, result.sources ?? []),
  };
}

function errEnvelope(
  deps: ApiDeps,
  code: ApiErrorCode,
  message: string,
  retryAfterSeconds?: number,
): ApiErr {
  return {
    ok: false,
    error: retryAfterSeconds === undefined ? { code, message } : { code, message, retryAfterSeconds },
    meta: meta(deps, []),
  };
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof ManualEntryValidationError) {
    // Quoted segments can carry request content — redact them so a
    // validation error can never echo user text (§1.7).
    return new ApiError(
      "validation_failed",
      422,
      err.message.replace(/"[^"]*"/g, '"[redacted]"'),
    );
  }
  if (err instanceof UploadUnavailableError) {
    return new ApiError("upload_unavailable", 410, err.message);
  }
  if (err instanceof OcrFixtureError) {
    // Fixture-mode uploads only parse where a labeled OCR replay exists.
    return new ApiError(
      "upload_unreadable",
      422,
      "no fixture OCR output exists for this upload (fixture-mode beta; live OCR is disabled)",
    );
  }
  if (err instanceof BasketSearchSpaceError) {
    return new ApiError("basket_search_space_exceeded", 422, err.message);
  }
  if (
    err instanceof LiveSourceDisabledError ||
    err instanceof TurnstileDisabledError ||
    err instanceof StripeDisabledError
  ) {
    return new ApiError("live_integration_disabled", 503, err.message);
  }
  if (err instanceof ProvenanceGateError) {
    // §1.5: suppress the response rather than ship an unprovenanced fact.
    // The gate's own detail is internal; nothing from the data leaks.
    return new ApiError(
      "provenance_gate_failure",
      500,
      "response suppressed: a fact could not cite complete provenance",
    );
  }
  // Generic 500: static message only — never err.message (could echo input).
  return new ApiError("internal_error", 500, "internal error");
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export class RoutePolicyError extends Error {
  constructor(detail: string) {
    super(`route policy violation: ${detail}`);
    this.name = "RoutePolicyError";
  }
}

/** Refuses tables that would gate protected content behind an entitlement. */
export function assertRoutePolicies(routes: readonly RouteDef[]): void {
  for (const route of routes) {
    if (route.entitlementGated && PROTECTED_CATEGORIES.includes(route.category)) {
      throw new RoutePolicyError(
        `${route.method} ${route.pattern} is category "${route.category}" and must never be entitlement-gated (SS1.2)`,
      );
    }
  }
}

export function createRouter(routes: readonly RouteDef[]) {
  assertRoutePolicies(routes);

  return async function handle(request: Request, deps: ApiDeps): Promise<Response> {
    const startedAt = deps.clock();
    const url = new URL(request.url);
    const path = url.pathname;

    const pathMatches = routes.filter((r) => matchPattern(r.pattern, path) !== null);
    if (pathMatches.length === 0) {
      return jsonResponse(errEnvelope(deps, "not_found", "no such endpoint"), 404, null);
    }
    const route = pathMatches.find((r) => r.method === request.method);
    if (!route) {
      return jsonResponse(
        errEnvelope(deps, "method_not_allowed", "method not allowed for this endpoint"),
        405,
        null,
      );
    }
    const params = matchPattern(route.pattern, path)!;

    let session: SessionContext | null = null;
    let status: number;
    let setCookie: string | null = null;
    let body: unknown;
    try {
      if (route.session === "ensure") {
        session = await ensureSession(request, deps);
      } else if (route.session === "read") {
        session = await readSession(request, deps);
      }
      if (session?.setCookieToken) {
        setCookie = buildSessionCookie(session.setCookieToken);
      }

      if (route.turnstile) {
        const verdict = await deps.turnstile.verify(request.headers.get(TURNSTILE_HEADER));
        if (!verdict.ok) {
          throw new ApiError(
            verdict.reason === "missing_token" ? "turnstile_required" : "turnstile_failed",
            403,
            verdict.reason === "missing_token"
              ? "a Turnstile token is required on this endpoint"
              : "Turnstile verification failed",
          );
        }
      }

      if (route.rateLimit !== null) {
        const subject = session?.tokenHash ?? "anonymous";
        const decision = await checkRateLimit(
          deps.kv,
          RATE_LIMIT_RULES[route.rateLimit],
          subject,
          deps.clock,
        );
        if (!decision.allowed) throw rateLimited(decision.retryAfterSeconds);
      }

      if (route.entitlementGated) {
        // No shipped route sets this on a protected category (asserted
        // above); a future extras route resolves its entitlement here.
        if (session === null) {
          throw new ApiError("session_required", 400, "extras need a session");
        }
      }

      const result = await route.handler({ request, url, deps, params, session });
      status = result.status ?? 200;
      body = okEnvelope(deps, result);
    } catch (err) {
      const apiErr = toApiError(err);
      status = apiErr.status;
      body = errEnvelope(deps, apiErr.code, apiErr.message, apiErr.retryAfterSeconds);
    }

    deps.logger.log("api_request", {
      route: route.pattern,
      method: route.method,
      status,
      durationMs: deps.clock() - startedAt,
      sessionPresent: session !== null,
    });
    const response = jsonResponse(body, status, setCookie);
    if (status === 429) {
      const err = body as ApiErr;
      if (err.error.retryAfterSeconds !== undefined) {
        response.headers.set("retry-after", String(err.error.retryAfterSeconds));
      }
    }
    return response;
  };
}
