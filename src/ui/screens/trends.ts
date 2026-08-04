/**
 * Worth-it / trend radar. §1.3 as UI: a label NEVER renders without its
 * confidence and family-by-family evidence; the trending badge carries its
 * signal-family count inside the label; insufficient evidence is the
 * default, first-class, honest state — not an error.
 */
import type { TrendData } from "../../api/contracts";
import { SIGNAL_FAMILIES } from "../../algorithms/trend";
import { getLexiconEntry } from "../../parsing/lexicon";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { linkButton } from "../components/forms";
import {
  coolingBadge,
  insufficientEvidenceBadge,
  trendingBadge,
} from "../components/badges";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { BADGES, TRENDS } from "../copy/en";

/**
 * §1.3 spec constant (CLAUDE.md invariant 3): nothing is labeled trending
 * without >= 3 independent signal families. Mirrored from the trend
 * engine's classification rule; tests/ui-screens.test.ts pins the mirror.
 */
export const MIN_ORGANIC_FAMILIES_FOR_TREND = 3;

export type TrendsScreenState = ScreenState<{ cards: TrendData[] }>;

export function trendLabelChip(data: TrendData): Html {
  switch (data.label) {
    case "viral":
      return trendingBadge(data.organicPassingFamilies.length, SIGNAL_FAMILIES.length);
    case "cooling":
      return coolingBadge();
    case "paid_campaign_driven":
      return html`<span class="badge badge-trending chip-outline" data-badge="paid-campaign">${icon("megaphone", { size: 14, stroke: 1.75 })}<span class="badge-label">${BADGES.paidCampaign}</span></span>`;
    case "locally_popular":
      return html`<span class="badge badge-trending chip-outline" data-badge="locally-popular">${icon("store", { size: 14, stroke: 1.75 })}<span class="badge-label">${BADGES.locallyPopular}</span></span>`;
    case "insufficient_evidence":
      return insufficientEvidenceBadge();
  }
}

function evidenceTable(data: TrendData): Html {
  const rows = data.familyEvaluations.map(
    (f) =>
      html`<tr><td>${f.family.replace(/_/g, " ")}</td><td>${f.samples}</td><td>${
        f.decayedZ === null ? "" : f.decayedZ
      }</td><td>${f.sponsoredShare}</td><td>${f.passes ? TRENDS.familyPasses : TRENDS.familyFails}${
        f.failureReasons.length > 0
          ? html`<div class="text-data-s muted">${f.failureReasons.join("; ")}</div>`
          : null
      }</td></tr>`,
  );
  return html`<table class="evidence-table"><caption class="visually-hidden">${TRENDS.cardEvidence}</caption><thead><tr><th scope="col">family</th><th scope="col">samples</th><th scope="col">decayed z</th><th scope="col">sponsored share</th><th scope="col">verdict</th></tr></thead><tbody>${joinHtml(rows)}</tbody></table>`;
}

/** One product's full evidence card (§1.3 bundle: label + confidence + families). */
export function trendCard(
  data: TrendData,
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  const displayName = getLexiconEntry(data.productSlug)?.displayName ?? data.productSlug;
  return renderFact({
    provenanceIds: data.provenanceIds,
    provenance,
    render: () =>
      html`<div class="card" data-trend-card="${data.productSlug}"><h3>${displayName} ${trendLabelChip(data)}</h3><p class="text-data-s">${TRENDS.confidence}: ${data.confidence}</p>${
        data.label === "insufficient_evidence"
          ? html`<p>${TRENDS.insufficientBody(data.organicPassingFamilies.length, MIN_ORGANIC_FAMILIES_FOR_TREND)}</p>`
          : null
      }<h4 class="text-overline">${TRENDS.cardEvidence}</h4>${evidenceTable(data)}${
        data.reasons.length > 0
          ? html`<details><summary class="text-label">${TRENDS.reasonsTitle}</summary><ul>${joinHtml(
              data.reasons.map((r) => html`<li class="text-data-s">${r}</li>`),
            )}</ul></details>`
          : null
      }<p><a href="/item/${data.productSlug}">${TRENDS.detailLink}</a></p></div>`,
  });
}

export function renderTrends(state: TrendsScreenState): Screen {
  const base = {
    title: TRENDS.title,
    description: TRENDS.lead(MIN_ORGANIC_FAMILIES_FOR_TREND),
    activeNav: "trends" as const,
    container: "plan" as const,
  };
  const sections = foldState(state, { loadingRows: 3 }, (envelope) => {
    if (envelope.data.cards.length === 0) {
      return [
        {
          kind: "content" as const,
          body: html`<p class="lead">${TRENDS.empty}</p>${linkButton({ label: TRENDS.emptyCta, href: "/intake", icon: "clipboard-paste" })}`,
        },
      ];
    }
    return [
      {
        kind: "content" as const,
        body: html`${envelopeChrome(envelope)}${joinHtml(
          envelope.data.cards.map((c) => trendCard(c, envelope.provenance)),
        )}`,
      },
    ];
  });
  return {
    ...base,
    sections: [intro(TRENDS.title, TRENDS.lead(MIN_ORGANIC_FAMILIES_FOR_TREND)), ...sections],
  };
}
