/**
 * §1.4 render guard — the UI half of invariant 4.
 *
 * A fact renders ONLY through renderFact(); the guard refuses when the fact
 * cannot cite a complete, resolvable, non-expired, non-retracted provenance
 * record, and renders the SUPPRESSION REASON in its place — never a guess,
 * never silence (§1.5). The API half (Phase 5 provenance gate) keeps
 * unprovenanced facts out of envelopes; this half keeps any that slip
 * through — or any UI-composed fact — off the screen.
 *
 * The provenance line itself is a designed, visible element (direction §7):
 * a fact that passes the guard renders WITH its source line, so provenance
 * and freshness are visible wherever a fact is.
 */
import type { ProvenanceRecord } from "../contracts/provenance";
import type { Html } from "./html";
import { html, joinHtml, raw } from "./html";
import { icon } from "./icons";
import { PROVENANCE, SUPPRESSION } from "./copy/en";

export type GuardRefusalCode =
  | "missing_provenance"
  | "unresolved_provenance"
  | "incomplete_record"
  | "expired"
  | "retracted"
  | "under_review";

export interface GuardOk {
  ok: true;
  records: readonly ProvenanceRecord[];
}

export interface GuardRefusal {
  ok: false;
  code: GuardRefusalCode;
  /** User-facing suppression reason (rendered in place of the fact). */
  reason: string;
}

export type GuardResult = GuardOk | GuardRefusal;

const REFUSAL_COPY: Record<GuardRefusalCode, string> = {
  missing_provenance: SUPPRESSION.missingProvenance,
  unresolved_provenance: SUPPRESSION.unresolvedProvenance,
  incomplete_record: SUPPRESSION.incompleteRecord,
  expired: SUPPRESSION.expired,
  retracted: SUPPRESSION.retracted,
  under_review: SUPPRESSION.underReview,
};

const refuse = (code: GuardRefusalCode): GuardRefusal => ({
  ok: false,
  code,
  reason: REFUSAL_COPY[code],
});

/** The ten §1.4 fields every record must carry to render (plus id). */
const REQUIRED_STRING_FIELDS = [
  "id",
  "source",
  "sourceType",
  "observedAt",
  "retrievedAt",
  "geography",
  "transformVersion",
  "freshness",
  "correctionStatus",
] as const;

function recordComplete(record: ProvenanceRecord): boolean {
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = record[field];
    if (typeof value !== "string" || value.length === 0) return false;
  }
  // Limitations must be PRESENT (empty string means "none declared").
  if (typeof record.limitations !== "string") return false;
  if (typeof record.confidence !== "number" || record.confidence < 0 || record.confidence > 1) {
    return false;
  }
  return true;
}

/**
 * Decides whether a fact may render. Refusal codes are ordered by severity:
 * a missing citation beats record-level problems.
 */
export function guardFact(
  provenanceIds: readonly string[] | undefined | null,
  provenance: Readonly<Record<string, ProvenanceRecord>>,
): GuardResult {
  if (!provenanceIds || provenanceIds.length === 0) return refuse("missing_provenance");
  const records: ProvenanceRecord[] = [];
  for (const id of provenanceIds) {
    const record = provenance[id];
    if (!record) return refuse("unresolved_provenance");
    if (!recordComplete(record)) return refuse("incomplete_record");
    if (record.correctionStatus === "retracted") return refuse("retracted");
    if (record.correctionStatus === "under_review") return refuse("under_review");
    if (record.freshness === "expired") return refuse("expired");
    records.push(record);
  }
  return { ok: true, records };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const isoDate = (iso: string): string => iso.slice(0, 10);
const isoMinute = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const pct = (confidence: number): string => `${Math.round(confidence * 100)}%`;

/** The visible §1.4 provenance line (direction §7 pattern, data-s Graphite). */
export function provenanceLine(records: readonly ProvenanceRecord[]): Html {
  const first = records[0];
  if (!first) return raw("");
  const extra = records.length - 1;
  const dot = raw(" &middot; ");
  return html`<p class="provenance-line">${icon("history", { size: 14, stroke: 1.75 })}<span>${first.source}</span>${dot}<span>${first.sourceType.replace(/_/g, " ")}</span>${dot}<span>${PROVENANCE.observed} ${isoDate(first.observedAt)}</span>${dot}<span>${PROVENANCE.retrieved} ${isoMinute(first.retrievedAt)}</span>${dot}<span>${PROVENANCE.confidence} ${pct(first.confidence)}</span>${
    first.correctionStatus === "corrected"
      ? html`${dot}<span class="provenance-corrected">${PROVENANCE.correctionCorrected}</span>`
      : null
  }${extra > 0 ? html`${dot}<span>${PROVENANCE.moreSources(extra)}</span>` : null}${
    first.limitations.length > 0
      ? html`<span class="provenance-limitations">${PROVENANCE.limitations}: ${first.limitations}</span>`
      : null
  }</p>`;
}

/** The designed refusal state: reason instead of fact, stale-amber chrome. */
export function suppressionNotice(reason: string): Html {
  return html`<div class="suppression-notice" role="note">${icon("clock-alert", {
    size: 14,
    stroke: 1.75,
  })}<span>${reason}</span></div>`;
}

export interface RenderFactArgs {
  provenanceIds: readonly string[] | undefined | null;
  provenance: Readonly<Record<string, ProvenanceRecord>>;
  /** Called ONLY when the guard passes; receives the resolved records. */
  render: (records: readonly ProvenanceRecord[]) => Html;
  /**
   * Whether to append the visible provenance line (default true). Callers
   * that group several facts under ONE line set this false on members and
   * render the shared line themselves — still guard-checked per fact.
   */
  withLine?: boolean;
}

/**
 * THE fact renderer. Refusal renders the suppression reason, not the fact,
 * and never calls `render` — tests/ui-render-guard.test.ts proves both.
 */
export function renderFact(args: RenderFactArgs): Html {
  const verdict = guardFact(args.provenanceIds, args.provenance);
  if (!verdict.ok) return suppressionNotice(verdict.reason);
  const body = args.render(verdict.records);
  if (args.withLine === false) return body;
  return joinHtml([body, provenanceLine(verdict.records)]);
}
