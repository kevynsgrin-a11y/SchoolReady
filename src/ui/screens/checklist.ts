/**
 * Supply checklist + mobile in-store mode. One-hand reach: the progress bar
 * and mode toggle live in a sticky bottom bar; every check target is >=44px;
 * check-off state persists in localStorage (public/assets/app.js) so the
 * screen works offline and survives connection loss (service worker caches
 * this route). Crossing off draws the check-strike (direction §5).
 */
import type { ChecklistData } from "../../api/contracts";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { linkButton } from "../components/forms";
import { requiredBadge, optionalBadge } from "../components/badges";
import { renderFact } from "../render-guard";
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
  return renderFact({
    provenanceIds: line.provenanceIds,
    provenance,
    withLine: false,
    render: () =>
      html`<li class="check-row" data-line-key="${line.key}"><input class="checkbox" type="checkbox" id="check-${index}" data-check-item><label for="check-${index}"><span class="row-name">${lineDisplayName(line)}</span></label><div class="row-badges"><span class="text-data">${CHECKLIST.itemToBuy(line.unitsToBuy)}</span>${
        line.optionality === "required" ? requiredBadge() : optionalBadge()
      }</div></li>`,
  });
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
    const rows = joinHtml(data.lines.map((line, i) => checkRow(line, i, envelope.provenance)));
    const total = data.lines.length;
    return [
      {
        kind: "required_items" as const,
        body: html`${envelopeChrome(envelope)}<p class="text-data-s muted">${CHECKLIST.generatedAt(isoDate(data.generatedAt))}</p><ul class="list-rows" id="checklist-rows" data-checklist>${rows}</ul>`,
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
