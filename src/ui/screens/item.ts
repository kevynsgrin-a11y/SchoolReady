/**
 * Item detail: evidence + freshness + the affiliate-disclosure slot.
 * The disclosure section is a REQUIRED designed element (Phase 9 fills it
 * when paid links exist); in this beta it truthfully states that nothing is
 * paid. Recall status renders above everything else when a match exists.
 */
import type { RecallCheckData, TrendData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import { getLexiconEntry } from "../../parsing/lexicon";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import type { PageSection } from "../slots";
import { recallBanner } from "../components/banners";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { ITEM, SAFETY, TRENDS } from "../copy/en";
import { MIN_ORGANIC_FAMILIES_FOR_TREND, trendCard } from "./trends";

export interface ItemDetailData {
  productSlug: string;
  trend: ApiOk<TrendData> | null;
  /** Non-null only when the catalog knows a UPC to check (beta: it rarely does). */
  recallCheck: ApiOk<RecallCheckData> | null;
}

export type ItemScreenState = ScreenState<ItemDetailData>;

export function renderItem(state: ItemScreenState, productSlug: string): Screen {
  const entry = getLexiconEntry(productSlug);
  const displayName = entry?.displayName ?? productSlug;
  const base = {
    title: `${displayName}: ${ITEM.titleSuffix}`,
    description: TRENDS.lead(MIN_ORGANIC_FAMILIES_FOR_TREND),
    activeNav: "trends" as const,
    container: "plan" as const,
  };
  let banner: PageSection | null = null;
  const sections = foldState(state, { loadingRows: 3 }, (envelope) => {
    const data = envelope.data;
    const out: PageSection[] = [];

    // Recall status first — above evidence and any commercial content.
    if (data.recallCheck && data.recallCheck.data.matches.length > 0) {
      const check = data.recallCheck.data;
      banner = {
        kind: "safety_warning",
        body: recallBanner({
          title: SAFETY.matches(check.matches.length),
          body: html`<ul class="plain-list">${joinHtml(
            check.matches.map(
              (m) =>
                // [A11y — Phase 11] <li> wraps the guard call so the fact,
                // its provenance line, and a refusal are valid list children
                // (see plan.ts planLine).
                html`<li>${renderFact({
                  provenanceIds: m.provenanceIds,
                  provenance: data.recallCheck!.provenance,
                  render: () => html`<strong>${m.recall.title}</strong>`,
                })}</li>`,
            ),
          )}</ul><p>${SAFETY.credit}</p>`,
        }),
      };
    } else {
      out.push({
        kind: "safety_warning",
        body: html`<h2>${ITEM.recallTitle}</h2><p>${ITEM.recallNoUpc}</p><p><a href="/safety">${ITEM.recallCheckLink}</a></p>`,
      });
    }

    if (data.trend) {
      out.push({
        kind: "content",
        body: html`<h2>${ITEM.trendTitle}</h2>${envelopeChrome(data.trend)}${trendCard(
          data.trend.data,
          data.trend.provenance,
        )}`,
      });
    } else {
      out.push({ kind: "content", body: html`<p>${ITEM.unknownProduct}</p>` });
    }

    out.push({
      kind: "disclosure",
      body: html`<h2>${icon("megaphone", { size: 20 })} ${ITEM.disclosureTitle}</h2><p>${ITEM.disclosureNone}</p>`,
    });
    return out;
  });
  // A live recall banner tops the page — above the title, above everything.
  const ordered: PageSection[] = banner
    ? [banner, intro(displayName, ITEM.titleSuffix), ...sections]
    : [intro(displayName, ITEM.titleSuffix), ...sections];
  return { ...base, sections: ordered };
}
