/**
 * True basket comparison — §0 capability 3 as UI. Serves the FULL Pareto
 * result: the frontier and four labeled views, never one "answer"; the
 * words for a single winner do not exist in this copy. Landed costs carry
 * the accountant's double rule (direction §5.1); tax caveats render WITH
 * the tax numbers; recalled-offer suppressions render as a safety banner
 * ABOVE everything (slots.ts enforces the ordering).
 */
import type { BasketData, SuppressionNote } from "../../api/contracts";
import type { BasketOption } from "../../algorithms/basket";
import type { ProvenanceRecord } from "../../contracts/provenance";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import type { PageSection } from "../slots";
import { button, field, form, linkButton, textInput } from "../components/forms";
import { outOfStockBadge, recalledBadge } from "../components/badges";
import { moneyCents, packMathChip, sumRuleTotal } from "../components/ledger";
import { assumptionsList } from "../components/status";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { BASKET } from "../copy/en";
import { getLexiconEntry } from "../../parsing/lexicon";

export type BasketScreenState = ScreenState<BasketData>;

export const BASKET_VIEWS = [
  { key: "lowest-cost", prop: "lowestCost", label: BASKET.viewLowestCost },
  { key: "fewest-stops", prop: "fewestStops", label: BASKET.viewFewestStops },
  { key: "fastest", prop: "fastest", label: BASKET.viewFastest },
  { key: "highest-confidence", prop: "highestConfidence", label: BASKET.viewHighestConfidence },
] as const;
export type BasketViewKey = (typeof BASKET_VIEWS)[number]["key"];

const itemName = (itemKey: string): string => {
  const slug = itemKey.split("|")[0] ?? itemKey;
  return getLexiconEntry(slug)?.displayName ?? slug;
};

function optionSummary(option: BasketOption, provenance: Record<string, ProvenanceRecord>): Html {
  return renderFact({
    provenanceIds: option.provenanceIds,
    provenance,
    withLine: false,
    render: () =>
      html`<div class="ledger"><div class="ledger-line"><span class="ledger-label">${BASKET.stops(option.stops)} (${option.retailerSlugs.join(", ")})</span><span class="ledger-value">${
        option.deliveryDaysKnown && option.deliveryDaysMax !== null
          ? BASKET.deliveryDays(option.deliveryDaysMax)
          : BASKET.deliveryUnknown
      }</span></div>${
        option.lowConfidenceCount > 0
          ? html`<div class="ledger-line"><span class="ledger-label">${BASKET.lowConfidence(option.lowConfidenceCount)}</span><span class="ledger-value"></span></div>`
          : null
      }<div class="ledger-line sum-rule"><span class="ledger-label">${BASKET.landedCost}</span><span class="ledger-value ledger-total-value double-rule">${moneyCents(option.landedCostCents)}</span></div>${
        option.costComplete ? null : html`<p class="row-detail">${BASKET.costIncomplete}</p>`
      }</div>`,
  });
}

function retailerColumn(option: BasketOption, retailerSlug: string): Html {
  const lines = option.lines.filter((l) => l.retailerSlug === retailerSlug);
  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotalCents, 0);
  const tax = lines.reduce((sum, l) => sum + l.taxCents, 0);
  const rows = lines.map((line) => {
    const packCount = line.packsToBuy > 0 ? Math.round(line.unitsPurchased / line.packsToBuy) : 0;
    return html`<div class="ledger-line"><span class="ledger-label">${itemName(line.itemKey)} ${
      line.packsToBuy > 1 || packCount > 1
        ? packMathChip({ packs: line.packsToBuy, packCount, units: line.unitsPurchased })
        : null
    }</span><span class="ledger-value">${moneyCents(line.lineSubtotalCents)}</span></div>`;
  });
  return html`<div class="retailer-column"><p class="retailer-name">${icon("store", { size: 20 })}${BASKET.perRetailer(retailerSlug)}</p><div class="ledger">${joinHtml(rows)}${sumRuleTotal(
    {
      label: BASKET.landedCost,
      value: moneyCents(subtotal + tax),
      final: true,
      rows: [{ label: BASKET.itemsSubtotal, value: moneyCents(subtotal) }, { label: BASKET.tax, value: moneyCents(tax) }],
    },
  )}</div></div>`;
}

function expandedOption(
  option: BasketOption,
  provenance: Record<string, ProvenanceRecord>,
): Html {
  return renderFact({
    provenanceIds: option.provenanceIds,
    provenance,
    render: () =>
      html`<div class="basket-grid">${joinHtml(
        option.retailerSlugs.map((slug) => retailerColumn(option, slug)),
      )}</div>${
        option.taxCaveats.length > 0
          ? html`<h3>${BASKET.taxCaveatsTitle}</h3><ul>${joinHtml(option.taxCaveats.map((c) => html`<li class="text-data-s">${c}</li>`))}</ul>`
          : null
      }${sumRuleTotal({
        label: BASKET.landedCost,
        value: moneyCents(option.landedCostCents),
        final: true,
        rows: [
          { label: BASKET.itemsSubtotal, value: moneyCents(option.itemsSubtotalCents) },
          { label: BASKET.tax, value: moneyCents(option.taxCents) },
          { label: BASKET.shipping, value: moneyCents(option.shippingCents) },
        ],
      })}${option.costComplete ? null : html`<p class="row-detail">${BASKET.costIncomplete}</p>`}`,
  });
}

function controls(activeView: BasketViewKey | null, daysUntilNeeded: number | null): Html {
  const viewLinks = BASKET_VIEWS.map(
    (v) =>
      html`<a class="tab${v.key === activeView ? " tab-active" : ""}" href="/plan/basket?view=${v.key}"${
        v.key === activeView ? html` aria-current="page"` : null
      }>${v.label}</a>`,
  );
  return html`<p>${BASKET.viewExplainer}</p><div class="basket-views" role="navigation" aria-label="Basket views">${joinHtml(viewLinks)}</div>${form(
    {
      action: "/plan/basket",
      method: "get",
      ariaLabel: BASKET.deadlineForm,
      body: [
        field({
          id: "basket-days",
          label: BASKET.deadlineForm,
          control: textInput({
            id: "basket-days",
            name: "days",
            type: "number",
            min: 1,
            max: 120,
            inputmode: "numeric",
            value: daysUntilNeeded === null ? undefined : String(daysUntilNeeded),
          }),
        }),
        activeView ? html`<input type="hidden" name="view" value="${activeView}">` : null,
        button({ label: BASKET.deadlineApply, icon: "calendar-days", variant: "secondary" }),
      ],
    },
  )}`;
}

const recallNotes = (notes: readonly SuppressionNote[]): SuppressionNote[] =>
  notes.filter((n) => n.decision.findings.some((f) => f.reason === "recalled_or_under_review"));

export function renderBasket(
  state: BasketScreenState,
  options: { view: BasketViewKey | null; daysUntilNeeded: number | null },
): Screen {
  const base = {
    title: BASKET.title,
    description: BASKET.lead,
    activeNav: "basket" as const,
    container: "compare" as const,
  };
  const sections = foldState(state, { loadingRows: 4, withLedger: true }, (envelope) => {
    const data = envelope.data;
    const out: PageSection[] = [];

    // Recalled offers: safety warnings render ABOVE everything else.
    const recalls = recallNotes(envelope.suppressions);
    if (recalls.length > 0) {
      out.push({
        kind: "safety_warning",
        body: html`<div class="banner banner-recall" role="alert">${icon("octagon-alert", { size: 24 })}<div class="banner-content"><p class="banner-title">${recalledBadge()}</p><ul class="plain-list">${joinHtml(
          recalls.map(
            (n) =>
              html`<li>${n.subject}: ${n.decision.findings.map((f) => f.detail).join("; ")}</li>`,
          ),
        )}</ul></div></div>`,
      });
    }

    if (data.basket === null) {
      out.push({
        kind: "content",
        body: html`<p class="lead">${BASKET.emptyNothingToBuy}</p>${linkButton({ label: BASKET.emptyNoPlan, href: "/intake", variant: "secondary", icon: "clipboard-paste" })}`,
      });
      return out;
    }

    const basket = data.basket;
    out.push({ kind: "content", body: envelopeChrome(envelope) });

    if (!basket.feasible) {
      out.push({
        kind: "required_items",
        body: html`<p class="lead">${BASKET.infeasible}</p><h3>${BASKET.unfulfillableTitle}</h3><ul>${joinHtml(
          basket.unfulfillableItems.map(
            (u) => html`<li>${itemName(u.itemKey)}: <span class="text-data-s">${u.detail}</span></li>`,
          ),
        )}</ul>`,
      });
      return out;
    }

    out.push({ kind: "content", body: controls(options.view, options.daysUntilNeeded) });

    const activeProp = BASKET_VIEWS.find((v) => v.key === options.view)?.prop ?? null;
    const activeOption = activeProp ? basket.views[activeProp] : null;
    if (activeOption) {
      out.push({ kind: "required_items", body: expandedOption(activeOption, envelope.provenance) });
    }

    out.push({
      kind: "required_items",
      body: html`<h2>${BASKET.frontierTitle(basket.frontier.length)}</h2>${joinHtml(
        basket.frontier.map((o) => html`<div class="card">${optionSummary(o, envelope.provenance)}</div>`),
      )}`,
    });

    if (data.coveredLineKeys.length > 0) {
      out.push({
        kind: "content",
        body: html`<p class="muted">${BASKET.coveredTitle(data.coveredLineKeys.length)}</p>`,
      });
    }
    if (data.optionalLineKeysExcluded.length > 0) {
      out.push({
        kind: "content",
        body: html`<p class="muted">${BASKET.optionalExcludedTitle(data.optionalLineKeysExcluded.length)}</p>`,
      });
    }

    const exclusions = [
      ...basket.excludedOffers.map((e) => ({
        key: e.offerKey,
        detail: e.detail,
        soldOut: e.detail.includes("out of stock"),
      })),
      ...data.itemMatches.flatMap((m) =>
        m.excluded.map((e) => ({
          key: e.candidateKey,
          detail: e.disqualifiers.map((d) => d.detail).join("; "),
          soldOut: false,
        })),
      ),
    ];
    if (exclusions.length > 0) {
      out.push({
        kind: "content",
        body: html`<details><summary class="text-label">${BASKET.excludedTitle}</summary><ul class="plain-list">${joinHtml(
          exclusions.map(
            (e) =>
              html`<li class="list-row"><span class="row-ordinal"></span><span class="text-data-s">${e.key}: ${e.detail}</span><span class="row-badges">${
                e.soldOut ? outOfStockBadge() : null
              }</span></li>`,
          ),
        )}</ul></details>`,
      });
    }

    out.push({ kind: "content", body: assumptionsList(BASKET.assumptionsTitle, envelope.assumptions) });
    return out;
  });
  return { ...base, sections: [intro(BASKET.title, BASKET.lead), ...sections] };
}
