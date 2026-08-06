/**
 * Shared screen plumbing: consistent rate-limited and error sections
 * (errors say what went wrong and how to fix it — voice §10), envelope
 * chrome (stale-source badges, suppression notes, assumptions), and small
 * formatting helpers.
 */
import type { ApiErrorCode, ApiOk } from "../../api/contracts";
import type { Html } from "../html";
import { html, joinHtml, raw } from "../html";
import { icon } from "../icons";
import type { PageSection } from "../slots";
import type { ScreenState } from "../state";
import { skeletonScreen } from "../components/skeleton";
import { sourceStatusBadges, suppressionList } from "../components/status";
import { COMMON, ERRORS } from "../copy/en";

const ERROR_COPY: Partial<Record<ApiErrorCode, string>> = {
  validation_failed: ERRORS.validation,
  upload_unavailable: ERRORS.uploadUnavailable,
  upload_unreadable: ERRORS.uploadUnreadable,
  provenance_gate_failure: ERRORS.provenanceSuppressed,
  basket_search_space_exceeded: ERRORS.basketTooLarge,
  not_found: ERRORS.notFound,
};

export function errorSection(code: ApiErrorCode): PageSection {
  return {
    kind: "content",
    body: html`<div class="card" role="alert">${icon("circle-alert", { size: 24 })}<p>${
      ERROR_COPY[code] ?? ERRORS.generic
    }</p><p><a href="">${COMMON.retry}</a></p></div>`,
  };
}

export function rateLimitedSection(retryAfterSeconds: number | null): PageSection {
  return {
    kind: "content",
    body: html`<div class="card" role="alert">${icon("clock-alert", { size: 24 })}<p>${ERRORS.rateLimited(
      retryAfterSeconds,
    )}</p></div>`,
  };
}

export function loadingSection(rows: number, withLedger = false): PageSection {
  return { kind: "content", body: skeletonScreen({ rows, withLedger }) };
}

/** Stale badges + §1.5 notes for a ready envelope (renders "" when clean). */
export function envelopeChrome(envelope: ApiOk<unknown>): Html {
  return joinHtml([
    sourceStatusBadges(envelope.meta.sources),
    suppressionList(envelope.suppressions),
  ]);
}

/**
 * Standard screen-state fold: loading/rate-limited/error handled here, the
 * ready branch delegated. Screens with richer intros compose manually.
 */
export function foldState<T>(
  state: ScreenState<T>,
  args: { loadingRows: number; withLedger?: boolean },
  onReady: (envelope: ApiOk<T>) => PageSection[],
): PageSection[] {
  switch (state.kind) {
    case "loading":
      return [loadingSection(args.loadingRows, args.withLedger ?? false)];
    case "rate_limited":
      return [rateLimitedSection(state.retryAfterSeconds)];
    case "error":
      return [errorSection(state.code)];
    case "ready":
      return onReady(state.envelope);
  }
}

export function intro(title: string, lead: string): PageSection {
  return {
    kind: "content",
    body: html`<h1>${title}</h1><p class="lead">${lead}</p>`,
  };
}

export const isoDate = (iso: string): string => iso.slice(0, 10);

export function emptyHtml(): Html {
  return raw("");
}
