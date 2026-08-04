/**
 * Household setup: anonymous children (ordinals only, §1.7), coarse state
 * for tax math, and the existing-inventory audit (§0 capability 2 input).
 */
import type { InventoryData, SessionData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import { PRODUCT_LEXICON, getLexiconEntry } from "../../parsing/lexicon";
import { ITEM_CONDITIONS } from "../../contracts/household";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { button, field, form, select, textInput } from "../components/forms";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { HOUSEHOLD } from "../copy/en";

export interface HouseholdData {
  session: SessionData;
  inventory: InventoryData;
}

export type HouseholdScreenState = ScreenState<HouseholdData>;

const CONDITION_LABELS: Record<(typeof ITEM_CONDITIONS)[number], string> = {
  new: HOUSEHOLD.conditionNew,
  usable: HOUSEHOLD.conditionUsable,
  worn_out: HOUSEHOLD.conditionWornOut,
};

function inventoryForm(): ReturnType<typeof form> {
  return form({
    action: "/household/inventory",
    ariaLabel: HOUSEHOLD.inventoryTitle,
    body: [
      field({
        id: "inv-product",
        label: HOUSEHOLD.inventoryProduct,
        control: select({
          id: "inv-product",
          name: "productTypeSlug",
          options: PRODUCT_LEXICON.map((e) => ({ value: e.slug, label: e.displayName })),
        }),
      }),
      field({
        id: "inv-quantity",
        label: HOUSEHOLD.inventoryQuantity,
        control: textInput({ id: "inv-quantity", name: "quantity", type: "number", min: 1, max: 999, value: "1", required: true, inputmode: "numeric" }),
      }),
      field({
        id: "inv-condition",
        label: HOUSEHOLD.inventoryCondition,
        control: select({
          id: "inv-condition",
          name: "condition",
          options: ITEM_CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] })),
        }),
      }),
      button({ label: HOUSEHOLD.inventoryAdd, icon: "circle-plus" }),
    ],
  });
}

function membersSection(session: SessionData): ReturnType<typeof html> {
  if (session.memberOrdinals.length === 0) {
    return html`<h2>${HOUSEHOLD.membersTitle}</h2><p>${HOUSEHOLD.membersEmpty}</p>`;
  }
  return html`<h2>${HOUSEHOLD.membersTitle}</h2><ul class="plain-list">${joinHtml(
    session.memberOrdinals.map(
      (o) => html`<li class="list-row"><span class="row-ordinal">${o}.</span><span>${icon("backpack", { size: 20 })} ${HOUSEHOLD.memberLabel(o)}</span><span></span></li>`,
    ),
  )}</ul>`;
}

export function renderHousehold(state: HouseholdScreenState): Screen {
  const base = {
    title: HOUSEHOLD.title,
    description: HOUSEHOLD.lead,
    activeNav: "household" as const,
    container: "flow" as const,
  };
  const sections = foldState(state, { loadingRows: 4 }, (envelope: ApiOk<HouseholdData>) => {
    const { session, inventory } = envelope.data;
    const stateBlock = html`<p class="muted">${HOUSEHOLD.stateLead}</p><p class="text-data">${
      session.householdState === null
        ? HOUSEHOLD.stateUnset
        : HOUSEHOLD.stateCurrent(session.householdState)
    }</p>`;
    const inventoryRows =
      inventory.items.length === 0
        ? html`<p>${HOUSEHOLD.inventoryEmpty}</p>`
        : html`<p class="muted">${HOUSEHOLD.inventoryListed(inventory.items.length)}</p><ul class="plain-list">${joinHtml(
            inventory.items.map(
              (item, i) =>
                // [A11y — Phase 11] <li> wraps the guard call so a refusal
                // notice is a valid list child (see plan.ts planLine).
                html`<li class="fact-row">${renderFact({
                  provenanceIds: item.provenanceIds,
                  provenance: envelope.provenance,
                  withLine: false,
                  render: () =>
                    html`<div class="list-row"><span class="row-ordinal">${i + 1}.</span><span>${
                      getLexiconEntry(item.productTypeSlug)?.displayName ?? item.productTypeSlug
                    }</span><span class="text-data">${item.quantity} (${CONDITION_LABELS[item.condition]})</span></div>`,
                })}</li>`,
            ),
          )}</ul>`;
    return [
      { kind: "content" as const, body: html`${envelopeChrome(envelope)}${membersSection(session)}` },
      { kind: "content" as const, body: html`<h2>${HOUSEHOLD.stateTitle}</h2>${stateBlock}` },
      {
        kind: "form" as const,
        body: html`<h2>${HOUSEHOLD.inventoryTitle}</h2>${inventoryRows}${inventoryForm()}`,
      },
    ];
  });
  return { ...base, sections: [intro(HOUSEHOLD.title, HOUSEHOLD.lead), ...sections] };
}
