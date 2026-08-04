/**
 * Envelope-status components: stale-source badges (meta.sources), §1.5
 * suppression notes (badges on named subjects, never hidden), and labeled
 * assumptions — assumptions render as ASSUMPTIONS, never as facts.
 */
import type { Assumption } from "../../algorithms/types";
import type { SourceStatus, SuppressionNote } from "../../api/contracts";
import type { Html } from "../html";
import { html, joinHtml, raw } from "../html";
import { icon } from "../icons";
import { staleBadge } from "./badges";
import { suppressionNotice } from "../render-guard";
import { SUPPRESSION } from "../copy/en";

/** Stale-source badges for any envelope (meta.sources drives it). */
export function sourceStatusBadges(sources: readonly SourceStatus[]): Html {
  const stale = sources.filter((s) => s.stale && s.storedAt !== null);
  if (stale.length === 0) return raw("");
  return html`<div class="source-status">${joinHtml(
    stale.map((s) => staleBadge(s.storedAt!.slice(0, 10))),
  )}</div>`;
}

/** §1.5: every downgraded/suppressed subject renders its finding visibly. */
export function suppressionList(notes: readonly SuppressionNote[]): Html {
  if (notes.length === 0) return raw("");
  const items = notes.flatMap((note) =>
    note.decision.findings.map(
      (finding) =>
        html`<li>${suppressionNotice(
          `${SUPPRESSION.reasonLabels[finding.reason] ?? finding.reason} (${finding.detail})`,
        )}</li>`,
    ),
  );
  return html`<section class="suppressions" aria-label="${SUPPRESSION.heading}"><h2 class="suppressions-heading">${SUPPRESSION.heading}</h2><ul class="plain-list">${joinHtml(items)}</ul></section>`;
}

/** Labeled assumptions (basis shown). Never styled as computed facts. */
export function assumptionsList(title: string, assumptions: readonly Assumption[]): Html {
  if (assumptions.length === 0) return raw("");
  const seen = new Set<string>();
  const items: Html[] = [];
  for (const a of assumptions) {
    const key = `${a.name}:${a.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(
      html`<li class="assumption">${icon("circle-help", { size: 14, stroke: 1.75 })}<span class="assumption-name">${a.name.replace(/_/g, " ")}:</span> <span class="assumption-value">${a.value}</span> <span class="assumption-basis">[${a.basis.replace(/_/g, " ")}]</span></li>`,
    );
  }
  return html`<section class="assumptions"><h3 class="assumptions-heading">${title}</h3><ul class="plain-list">${joinHtml(items)}</ul></section>`;
}
