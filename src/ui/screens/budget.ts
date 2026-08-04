/**
 * Budget dashboard: required spend only (optional never inflates a total,
 * §1.5 discipline carried from the merge), and cost expressed as the RANGE
 * across the basket frontier — never one store presented as the answer.
 */
import type { BasketData, ChecklistData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import type { Screen } from "../components/chrome";
import { linkButton } from "../components/forms";
import { budgetBar, moneyCents, sumRuleTotal } from "../components/ledger";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { BUDGET, PLAN } from "../copy/en";
import { lineDisplayName } from "./plan";

export interface BudgetData {
  checklist: ApiOk<ChecklistData>;
  basket: ApiOk<BasketData> | null;
}

export type BudgetScreenState = ScreenState<BudgetData>;

function requiredUnitsBlock(checklist: ApiOk<ChecklistData>): Html {
  const required = checklist.data.lines.filter((l) => l.optionality === "required");
  const rows = required.map((line) =>
    renderFact({
      provenanceIds: line.provenanceIds,
      provenance: checklist.provenance,
      withLine: false,
      render: () =>
        html`<div class="ledger-line"><span class="ledger-label">${lineDisplayName(line)}</span><span class="ledger-value">${line.unitsToBuy}</span></div>`,
    }),
  );
  const total = required.reduce((sum, l) => sum + l.unitsToBuy, 0);
  return html`<div class="ledger">${joinHtml(rows)}<div class="ledger-line sum-rule"><span class="ledger-label">${PLAN.toBuyLine}</span><span class="ledger-value ledger-total-value">${total}</span></div></div>`;
}

function frontierBlock(basket: ApiOk<BasketData>): Html {
  const pareto = basket.data.basket;
  if (pareto === null || !pareto.feasible || pareto.frontier.length === 0) {
    return html`<p>${BUDGET.noBasket}</p>${linkButton({ label: BUDGET.goBasket, href: "/plan/basket", icon: "store", variant: "secondary" })}`;
  }
  const costs = pareto.frontier.map((o) => o.landedCostCents);
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const bars = pareto.frontier.map((option) =>
    renderFact({
      provenanceIds: option.provenanceIds,
      provenance: basket.provenance,
      withLine: false,
      render: () =>
        budgetBar({
          label: `${option.retailerSlugs.join(" + ")}${option.costComplete ? "" : " *"}`,
          value: moneyCents(option.landedCostCents),
          fraction: max === 0 ? 0 : option.landedCostCents / max,
        }),
    }),
  );
  const incomplete = pareto.frontier.some((o) => !o.costComplete);
  return html`<p>${BUDGET.frontierRange(pareto.frontier.length)}</p>${joinHtml(bars)}${sumRuleTotal({
    label: BUDGET.rangeLabel,
    value: `${moneyCents(min)} to ${moneyCents(max)}`,
  })}${incomplete ? html`<p class="text-data-s muted">${BUDGET.costIncompleteMark}</p>` : null}`;
}

export function renderBudget(state: BudgetScreenState): Screen {
  const base = {
    title: BUDGET.title,
    description: BUDGET.lead,
    activeNav: "budget" as const,
    container: "plan" as const,
  };
  const sections = foldState(state, { loadingRows: 4, withLedger: true }, (envelope) => {
    const { checklist, basket } = envelope.data;
    if (checklist.data.lines.length === 0) {
      return [
        {
          kind: "content" as const,
          body: html`<p class="lead">${BUDGET.empty}</p>${linkButton({ label: BUDGET.emptyCta, href: "/intake", icon: "clipboard-paste" })}`,
        },
      ];
    }
    const optionalCount = checklist.data.lines.filter((l) => l.optionality === "optional").length;
    return [
      {
        kind: "required_items" as const,
        body: html`${envelopeChrome(checklist)}<h2>${BUDGET.requiredSpendTitle}</h2>${requiredUnitsBlock(checklist)}${
          optionalCount > 0 ? html`<p class="muted">${BUDGET.optionalNote(optionalCount)}</p>` : null
        }`,
      },
      {
        kind: "price_change" as const,
        body: html`<h2>${BUDGET.frontierTitle}</h2>${
          basket ? html`${envelopeChrome(basket)}${frontierBlock(basket)}` : html`<p>${BUDGET.noBasket}</p>${linkButton({ label: BUDGET.goBasket, href: "/plan/basket", icon: "store", variant: "secondary" })}`
        }`,
      },
    ];
  });
  return { ...base, sections: [intro(BUDGET.title, BUDGET.lead), ...sections] };
}
