/**
 * Supply checklist + mobile in-store mode. One-hand reach: the progress bar
 * and mode toggle live in a sticky bottom bar; every check target is >=44px;
 * check-off state persists in localStorage (public/assets/app.js) so the
 * screen works offline and survives connection loss (service worker caches
 * this route). Crossing off draws the check-strike (direction §5).
 *
 * [P12-4] §6 J1: the printable checklist is STORE-GROUPED. When the API
 * ships a grouping (read from the labeled lowest-cost frontier view of the
 * Pareto basket — a view, never "the" answer), lines render under one
 * heading per store trip in the option's deterministic visit order, with
 * the basis label and its §1.4 provenance line; lines outside the basket
 * (optional or inventory-covered) sit under an honest no-store group. No
 * grouping -> the flat list plus the honest ungrouped note (§1.5); a
 * grouping whose provenance cannot resolve renders its suppression reason
 * and falls back to the flat list — never a guessed store assignment.
 */
import type { ChecklistData } from "../../api/contracts";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { linkButton } from "../components/forms";
import { requiredBadge, optionalBadge } from "../components/badges";
import { guardFact, provenanceLine, renderFact, suppressionNotice } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro, isoDate } from "./shared";
import { CHECKLIST, COMMON } from "../copy/en";
import { lineDisplayName } from "./plan";

export type ChecklistScreenState = ScreenState<ChecklistData>;

export interface ChecklistOptions {
  storeMode: boolean;
}

function checkRow(
  line: ChecklistData["lines"][number],
  index: number,
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  // [A11y — Phase 11] <li> wraps the guard call so a refusal notice is a
  // valid list child (see plan.ts planLine). data-line-key stays on the row
  // element app.js targets via closest("[data-line-key]").
  return html`<li class="fact-row">${renderFact({
    provenanceIds: line.provenanceIds,
    provenance,
    withLine: false,
    render: () =>
      html`<div class="check-row" data-line-key="${line.key}"><input class="checkbox" type="checkbox" id="check-${index}" data-check-item><label for="check-${index}"><span class="row-name">${lineDisplayName(line)}</span></label><div class="row-badges"><span class="text-data">${CHECKLIST.itemToBuy(line.unitsToBuy)}</span>${
        line.optionality === "required" ? requiredBadge() : optionalBadge()
      }</div></div>`,
  })}</li>`;
}

/** A line plus its stable index (checkbox ids stay unique across groups). */
type IndexedLine = { line: ChecklistData["lines"][number]; index: number };

function rowList(
  entries: readonly IndexedLine[],
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  return html`<ul class="list-rows">${joinHtml(
    entries.map(({ line, index }) => checkRow(line, index, provenance)),
  )}</ul>`;
}

/**
 * Store-grouped body: one section per trip (visit order = the option's
 * deterministic retailer order), then the honest no-store group. Sections
 * carry break-inside:avoid so groups survive print pagination.
 */
function groupedRows(
  data: ChecklistData,
  grouping: NonNullable<ChecklistData["grouping"]>,
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  const indexed: IndexedLine[] = data.lines.map((line, index) => ({ line, index }));
  // Defensive: any retailer on a line but missing from the grouping's trip
  // list still gets a heading (deterministic, appended after the known trips).
  const extraRetailers = [
    ...new Set(
      indexed
        .map(({ line }) => line.retailerSlug)
        .filter((r): r is string => r !== null && !grouping.retailerSlugs.includes(r)),
    ),
  ].sort();
  const storeSections = [...grouping.retailerSlugs, ...extraRetailers]
    .map((retailer) => ({
      retailer,
      entries: indexed.filter(({ line }) => line.retailerSlug === retailer),
    }))
    .filter((group) => group.entries.length > 0)
    .map(
      (group) =>
        html`<section class="checklist-store-group"><h2 class="checklist-store">${icon("store", { size: 20 })}${CHECKLIST.storeTrip(group.retailer)}</h2>${rowList(group.entries, provenance)}</section>`,
    );
  const unassigned = indexed.filter(({ line }) => line.retailerSlug === null);
  const noStoreSection =
    unassigned.length > 0
      ? html`<section class="checklist-store-group"><h2 class="checklist-store">${CHECKLIST.noStoreHeading}</h2><p class="row-detail">${CHECKLIST.noStoreNote}</p>${rowList(unassigned, provenance)}</section>`
      : null;
  return html`${joinHtml(storeSections)}${noStoreSection}`;
}

export function renderChecklist(state: ChecklistScreenState, options: ChecklistOptions): Screen {
  const base = {
    title: CHECKLIST.title,
    description: CHECKLIST.lead,
    activeNav: "checklist" as const,
    container: "plan" as const,
    bodyClass: options.storeMode ? "store-mode" : undefined,
  };
  const sections = foldState(state, { loadingRows: 6 }, (envelope) => {
    const data = envelope.data;
    if (data.lines.length === 0) {
      return [
        {
          kind: "content" as const,
          body: html`<p class="lead">${CHECKLIST.empty}</p>${linkButton({ label: CHECKLIST.emptyCta, href: "/intake", icon: "clipboard-paste" })}`,
        },
      ];
    }
    const flatRows = rowList(
      data.lines.map((line, index) => ({ line, index })),
      envelope.provenance,
    );
    // [P12-4] Grouping is itself a fact (store assignments from priced
    // offers): it renders only through the §1.4 guard, WITH the basis label
    // and provenance line; refusal renders the reason and the flat list.
    const grouping = data.grouping ?? null;
    let listBody: Html;
    if (grouping !== null) {
      const verdict = guardFact(grouping.provenanceIds, envelope.provenance);
      listBody = verdict.ok
        ? html`<p class="checklist-grouping text-data-s">${CHECKLIST.groupedBy}</p>${provenanceLine(verdict.records)}${groupedRows(data, grouping, envelope.provenance)}`
        : html`${suppressionNotice(verdict.reason)}${flatRows}`;
    } else {
      listBody = html`<p class="checklist-grouping text-data-s muted">${CHECKLIST.ungrouped}</p>${flatRows}`;
    }
    const total = data.lines.length;
    return [
      {
        kind: "required_items" as const,
        body: html`${envelopeChrome(envelope)}<p class="text-data-s muted">${CHECKLIST.generatedAt(isoDate(data.generatedAt))}</p><div id="checklist-rows" data-checklist>${listBody}</div>`,
      },
      {
        kind: "navigation" as const,
        body: html`<div class="checklist-bar"><span id="checklist-progress" aria-live="polite" data-total="${total}" data-template="${CHECKLIST.progressTemplate}">${CHECKLIST.progress(0, total)}</span><span class="row-badges">${
          options.storeMode
            ? linkButton({ label: CHECKLIST.fullMode, href: "/plan/checklist", variant: "secondary" })
            : linkButton({ label: CHECKLIST.storeMode, href: "/plan/checklist?mode=store", variant: "secondary" })
        }<button type="button" class="button button-secondary" data-print hidden>${icon("printer", { size: 20 })}<span>${COMMON.print}</span></button></span></div><p class="text-data-s muted" id="offline-ready" hidden>${CHECKLIST.offlineReady}</p>`,
      },
    ];
  });
  const introSection = options.storeMode
    ? { kind: "content" as const, body: html`<h1>${CHECKLIST.title}</h1>` }
    : intro(CHECKLIST.title, CHECKLIST.lead);
  return { ...base, sections: [introSection, ...sections] };
}
