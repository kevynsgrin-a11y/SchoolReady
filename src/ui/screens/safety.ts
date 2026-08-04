/**
 * Recall / safety center. Layout rule made structural: recall warnings are
 * `safety_warning` sections and render above every other section kind —
 * slots.ts throws on any layout that puts commercial content above them.
 * CPSC data is credited with its retrieval date (§1.4 provenance line).
 */
import type { RecallCheckData, RecallEntry, RecallsData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import type { ProvenanceRecord } from "../../contracts/provenance";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import type { Screen } from "../components/chrome";
import type { PageSection } from "../slots";
import { button, field, form, textInput } from "../components/forms";
import { recallBanner } from "../components/banners";
import { linkButton } from "../components/forms";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { SAFETY } from "../copy/en";

export interface SafetyData {
  recalls: ApiOk<RecallsData>;
  /** Present when the user submitted a UPC check. */
  check: ApiOk<RecallCheckData> | null;
}

export type SafetyScreenState = ScreenState<SafetyData>;

/** GS1 barcode digit range (EAN-8 through GTIN-14) — single source for the
 *  input's pattern AND its visible format hint (WCAG 3.3.2/3.3.3). */
const UPC_DIGITS = { min: 8, max: 14 } as const;

function upcForm(): Html {
  return form({
    action: "/safety",
    method: "get",
    ariaLabel: SAFETY.checkLegend,
    body: [
      html`<fieldset><legend>${SAFETY.checkLegend}</legend>${field({
        id: "upc",
        label: SAFETY.checkLabel,
        hint: SAFETY.checkHint(UPC_DIGITS.min, UPC_DIGITS.max),
        control: textInput({
          id: "upc",
          name: "upc",
          inputmode: "numeric",
          pattern: `[0-9]{${UPC_DIGITS.min},${UPC_DIGITS.max}}`,
          required: true,
          hinted: true,
        }),
      })}${button({ label: SAFETY.checkSubmit, icon: "search" })}</fieldset>`,
    ],
  });
}

function recallEntry(entry: RecallEntry, provenance: Record<string, ProvenanceRecord>): Html {
  return renderFact({
    provenanceIds: entry.provenanceIds,
    provenance,
    render: () =>
      html`<div class="card"><h3>${entry.recall.title}</h3><p><strong>${SAFETY.hazard}:</strong> ${entry.recall.hazardDescription}</p><p><strong>${SAFETY.remedy}:</strong> ${entry.recall.remedyDescription}</p>${
        entry.products.length > 0
          ? html`<ul>${joinHtml(entry.products.map((p) => html`<li class="text-data-s">${p.name}${p.upc ? html` (UPC ${p.upc})` : null}</li>`))}</ul>`
          : null
      }<p><a href="${entry.recall.cpscUrl}">${entry.recall.recallNumber}</a></p></div>`,
  });
}

export function renderSafety(state: SafetyScreenState): Screen {
  const base = {
    title: SAFETY.title,
    description: SAFETY.lead,
    activeNav: "safety" as const,
    container: "plan" as const,
  };
  const sections = foldState(state, { loadingRows: 3 }, (envelope) => {
    const { recalls, check } = envelope.data;
    const out: PageSection[] = [];

    if (check) {
      out.push({
        kind: "safety_warning",
        body:
          check.data.matches.length > 0
            ? recallBanner({
                title: SAFETY.matches(check.data.matches.length),
                body: html`${joinHtml(check.data.matches.map((m) => recallEntry(m, check.provenance)))}<p>${SAFETY.credit}</p>`,
              })
            : html`<div class="card"><p>${SAFETY.noMatch}</p>${envelopeChrome(check)}</div>`,
      });
    }

    out.push({
      kind: "safety_warning",
      body: html`${envelopeChrome(recalls)}<h2>${SAFETY.listTitle}</h2>${
        recalls.data.recalls.length === 0
          ? html`<p>${SAFETY.listEmpty}</p>`
          : joinHtml(recalls.data.recalls.map((r) => recallEntry(r, recalls.provenance)))
      }<p class="text-data-s muted">${SAFETY.credit}</p>`,
    });

    out.push({ kind: "form", body: upcForm() });
    out.push({
      kind: "assistance_resource",
      body: linkButton({ label: SAFETY.alertCta, href: "/account", variant: "secondary", icon: "bell" }),
    });
    return out;
  });
  return { ...base, sections: [intro(SAFETY.title, SAFETY.lead), ...sections] };
}
