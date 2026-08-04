/**
 * Typed API errors. Messages are static or built from field NAMES only —
 * never from request content, so an error can never echo PII (§1.7).
 */
import type { ApiErrorCode } from "./contracts";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (): ApiError =>
  new ApiError("not_found", 404, "no such endpoint");

export const methodNotAllowed = (): ApiError =>
  new ApiError("method_not_allowed", 405, "method not allowed for this endpoint");

export const invalidRequest = (detail: string): ApiError =>
  new ApiError("invalid_request", 400, detail);

export const validationFailed = (detail: string): ApiError =>
  new ApiError("validation_failed", 422, detail);

export const sessionRequired = (): ApiError =>
  new ApiError(
    "session_required",
    400,
    "this endpoint needs an anonymous session cookie (no account is ever required)",
  );

export const rateLimited = (retryAfterSeconds: number): ApiError =>
  new ApiError(
    "rate_limited",
    429,
    "rate limit exceeded; retry later",
    retryAfterSeconds,
  );
