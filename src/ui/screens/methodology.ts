/**
 * Methodology — the audit trail as a page. Every numeral here is imported
 * from the engine's own constants (thresholds, field counts, family
 * counts); nothing is typed in as a literal, so the page cannot drift from
 * the code it describes.
 */
import { DEFAULT_SUPPRESSION_THRESHOLDS, SUPPRESSION_REASONS } from "../../algorithms/suppression";
import { SIGNAL_FAMILIES } from "../../algorithms/trend";
import { html, joinHtml } from "../html";
import type { Screen } from "../components/chrome";
import { CORE_ACCESS_NOTICE } from "../../api/contracts";
import { METHODOLOGY, SUPPRESSION } from "../copy/en";
import { MIN_ORGANIC_FAMILIES_FOR_TREND } from "./trends";

/** The ten §1.4 provenance fields (contracts/provenance.ts ProvenanceRecord). */
const PROVENANCE_FIELD_COUNT = 10;

export function renderMethodology(): Screen {
  const downgradeHours = Math.round(
    DEFAULT_SUPPRESSION_THRESHOLDS.priceStockDowngradeAfterSeconds / 3600,
  );
  const suppressDays = Math.round(
    DEFAULT_SUPPRESSION_THRESHOLDS.priceStockSuppressAfterSeconds / 86_400,
  );
  const reasons = SUPPRESSION_REASONS.map(
    (r) => html`<li>${SUPPRESSION.reasonLabels[r] ?? r.replace(/_/g, " ")}</li>`,
  );
  const body = html`
<h2>${METHODOLOGY.parsingTitle}</h2><p>${METHODOLOGY.parsingBody}</p>
<h2>${METHODOLOGY.netTitle}</h2><p>${METHODOLOGY.netBody}</p>
<h2>${METHODOLOGY.basketTitle}</h2><p>${METHODOLOGY.basketBody}</p>
<h2>${METHODOLOGY.trendTitle}</h2><p>${METHODOLOGY.trendBody(
    MIN_ORGANIC_FAMILIES_FOR_TREND,
    SIGNAL_FAMILIES.length,
  )}</p>
<h2>${METHODOLOGY.suppressionTitle}</h2><p>${METHODOLOGY.suppressionBody}</p><ul>${joinHtml(reasons)}</ul>
<h2>${METHODOLOGY.provenanceTitle}</h2><p>${METHODOLOGY.provenanceBody(PROVENANCE_FIELD_COUNT)}</p>
<h2>${METHODOLOGY.stalenessTitle}</h2><p>${METHODOLOGY.stalenessBody(downgradeHours, suppressDays)}</p>
<h2>${METHODOLOGY.recallTitle}</h2><p>${METHODOLOGY.recallBody}</p>
<h2>${METHODOLOGY.moneyTitle}</h2><p>${METHODOLOGY.moneyBody}</p><p class="muted">${CORE_ACCESS_NOTICE}</p>`;
  return {
    title: METHODOLOGY.title,
    description: METHODOLOGY.lead,
    activeNav: "methodology",
    container: "flow",
    sections: [
      { kind: "content", body: html`<h1>${METHODOLOGY.title}</h1><p class="lead">${METHODOLOGY.lead}</p>` },
      { kind: "content", body },
    ],
  };
}
