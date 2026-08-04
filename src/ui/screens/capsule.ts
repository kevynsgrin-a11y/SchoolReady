/**
 * Clothing capsule planner. Results are ALWAYS ranges (never one number),
 * every assumption is labeled with its basis, and the unconfirmable-policy
 * state (§1.5) is a designed state: with no confirmed dress code the filter
 * is off and says so. Eraser Pink appears here as a tinted module header —
 * background tint only (direction §1).
 */
import type { CapsuleData } from "../../api/contracts";
import { GARMENT_CATEGORIES, CLIMATE_BANDS } from "../../algorithms/capsule";
import type { GarmentCategory, ClimateBand } from "../../algorithms/capsule";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { button, checkbox, field, form, select, textInput } from "../components/forms";
import { moneyCents, sumRuleTotal } from "../components/ledger";
import { assumptionsList } from "../components/status";
import { renderFact, suppressionNotice } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { CAPSULE } from "../copy/en";

export type CapsuleScreenState =
  | { kind: "form" }
  | ScreenState<CapsuleData>;

const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  tops: CAPSULE.categoryTops,
  bottoms: CAPSULE.categoryBottoms,
  outer_layer: CAPSULE.categoryOuter,
  socks: CAPSULE.categorySocks,
};

const CLIMATE_LABELS: Record<ClimateBand, string> = {
  hot: CAPSULE.climateHot,
  temperate: CAPSULE.climateTemperate,
  cold: CAPSULE.climateCold,
};

function capsuleForm(): Html {
  return form({
    action: "/capsule",
    ariaLabel: CAPSULE.title,
    body: [
      html`<fieldset><legend>${CAPSULE.formLegend}</legend>${joinHtml([
        field({
          id: "cap-category",
          label: CAPSULE.category,
          control: select({
            id: "cap-category",
            name: "category",
            options: GARMENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
          }),
        }),
        field({
          id: "cap-climate",
          label: CAPSULE.climate,
          control: select({
            id: "cap-climate",
            name: "climateBand",
            options: CLIMATE_BANDS.map((c) => ({ value: c, label: CLIMATE_LABELS[c] })),
          }),
        }),
        field({
          id: "cap-wash",
          label: CAPSULE.washDays,
          control: textInput({ id: "cap-wash", name: "daysBetweenWashes", type: "number", min: 1, max: 30, required: true, inputmode: "numeric" }),
        }),
        field({
          id: "cap-reserve",
          label: CAPSULE.reserveDays,
          control: textInput({ id: "cap-reserve", name: "reserveDays", type: "number", min: 0, max: 14, required: true, inputmode: "numeric" }),
        }),
        field({
          id: "cap-existing",
          label: CAPSULE.usableExisting,
          control: textInput({ id: "cap-existing", name: "usableExisting", type: "number", min: 0, max: 99, required: true, inputmode: "numeric" }),
        }),
        checkbox({ id: "cap-uniform", name: "uniformRequired", label: CAPSULE.uniformRequired, value: "on" }),
      ])}</fieldset>`,
      // [P12-1/P12-2 correction] Optional price + timing inputs: with a price
      // and wear days the engine returns cost per wear; with the deadline and
      // delivery fields it returns the buy-now-vs-wait check. All optional,
      // all volunteered per request, never persisted (§1.7).
      html`<fieldset><legend>${CAPSULE.priceLegend}</legend><p class="field-hint">${CAPSULE.priceLegendHint}</p>${joinHtml([
        field({
          id: "cap-price",
          label: CAPSULE.price,
          control: textInput({ id: "cap-price", name: "priceDollars", type: "number", min: 0.01, max: 10000, step: "0.01", inputmode: "decimal" }),
        }),
        field({
          id: "cap-wear-days",
          label: CAPSULE.seasonWearDays,
          control: textInput({ id: "cap-wear-days", name: "seasonWearDays", type: "number", min: 1, max: 366, inputmode: "numeric" }),
        }),
        field({
          id: "cap-needed",
          label: CAPSULE.daysUntilNeeded,
          control: textInput({ id: "cap-needed", name: "daysUntilNeeded", type: "number", min: 1, max: 365, inputmode: "numeric" }),
        }),
        field({
          id: "cap-delivery",
          label: CAPSULE.deliveryDays,
          control: textInput({ id: "cap-delivery", name: "typicalDeliveryDays", type: "number", min: 1, max: 90, inputmode: "numeric" }),
        }),
        field({
          id: "cap-upc",
          label: CAPSULE.upc,
          hint: CAPSULE.upcHint,
          control: textInput({ id: "cap-upc", name: "upc", type: "text", pattern: "[A-Za-z0-9-]{4,32}", hinted: true }),
        }),
      ])}</fieldset>`,
      button({ label: CAPSULE.submit, icon: "shirt" }),
    ],
  });
}

/**
 * [P12-1 correction] Cost per wear as a computed money fact: Sum Rule ledger
 * (direction §5 — operands above, single rule, result beneath) with the
 * wears basis rendered as labeled assumptions. Guard-checked through
 * renderFact; the enclosing category card renders the shared §1.4
 * provenance line (render-guard withLine contract).
 */
function costPerWearBlock(
  cpw: NonNullable<CapsuleData["lines"][number]["costPerWear"]>,
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  return renderFact({
    provenanceIds: cpw.provenanceIds,
    provenance,
    withLine: false,
    render: () => {
      // Whole-cent money display of the engine's 2 dp cents values; the
      // exact wears basis renders in the assumptions list below.
      const min = moneyCents(Math.round(cpw.perWearCentsRange.min));
      const max = moneyCents(Math.round(cpw.perWearCentsRange.max));
      return html`<div class="capsule-cost-per-wear">${sumRuleTotal({
        label: CAPSULE.costPerWearTitle,
        value: CAPSULE.costPerWearValue(min, max),
        rows: [
          { label: CAPSULE.costPerWearPriceRow, value: moneyCents(cpw.priceCents) },
          {
            label: CAPSULE.costPerWearWearsRow,
            value: `${cpw.projectedWearsRange.min} to ${cpw.projectedWearsRange.max}`,
          },
        ],
      })}${assumptionsList(CAPSULE.costPerWearBasisTitle, cpw.assumptions)}</div>`;
    },
  });
}

function capsuleLine(
  line: CapsuleData["lines"][number],
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  return renderFact({
    provenanceIds: line.provenanceIds,
    provenance,
    render: () =>
      html`<div class="card"><div class="capsule-card-header"><h3>${icon("shirt", { size: 20 })} ${CATEGORY_LABELS[line.category]} (${CLIMATE_LABELS[line.climateBand]})</h3></div><p class="text-data">${CAPSULE.rangeUnits(
        line.unitsRange.min,
        line.unitsRange.max,
      )}</p><p class="text-data-s muted">${CAPSULE.rewears(line.rewearsAssumed.min, line.rewearsAssumed.max)}</p>${
        line.dressCodeNotes.length > 0
          ? html`<ul>${joinHtml(line.dressCodeNotes.map((n) => html`<li class="text-data-s">${n}</li>`))}</ul>`
          : suppressionNotice(CAPSULE.dressCodeOff)
      }${assumptionsList(CAPSULE.formLegend, line.assumptions)}${
        line.costPerWear ? costPerWearBlock(line.costPerWear, provenance) : null
      }</div>`,
  });
}

function timingBlock(
  timing: NonNullable<CapsuleData["timing"]>,
  provenance: Parameters<typeof renderFact>[0]["provenance"],
): Html {
  const label =
    timing.timing === "buy_now"
      ? CAPSULE.timingBuyNow
      : timing.timing === "insufficient_data"
        ? CAPSULE.timingInsufficient
        : CAPSULE.timingWait;
  return renderFact({
    provenanceIds: timing.provenanceIds,
    provenance,
    render: () =>
      html`<h2>${CAPSULE.timingTitle}</h2><p><strong>${label}</strong></p><p class="text-data-s">${timing.reason}</p><p class="text-data-s muted">${timing.disclaimer}</p>`,
  });
}

export function renderCapsule(state: CapsuleScreenState): Screen {
  const base = {
    title: CAPSULE.title,
    description: CAPSULE.lead,
    activeNav: "capsule" as const,
    container: "plan" as const,
  };
  if (state.kind === "form") {
    return {
      ...base,
      sections: [intro(CAPSULE.title, CAPSULE.lead), { kind: "form", body: capsuleForm() }],
    };
  }
  const sections = foldState(state, { loadingRows: 3 }, (envelope) => {
    if (envelope.data.lines.length === 0) {
      return [{ kind: "form" as const, body: html`<p>${CAPSULE.empty}</p>${capsuleForm()}` }];
    }
    return [
      {
        kind: "dress_code_restriction" as const,
        body: html`${envelopeChrome(envelope)}${joinHtml(
          envelope.data.lines.map((l) => capsuleLine(l, envelope.provenance)),
        )}`,
      },
      ...(envelope.data.timing
        ? [{ kind: "deadline" as const, body: timingBlock(envelope.data.timing, envelope.provenance) }]
        : []),
      { kind: "form" as const, body: capsuleForm() },
    ];
  });
  return { ...base, sections: [intro(CAPSULE.title, CAPSULE.lead), ...sections] };
}
