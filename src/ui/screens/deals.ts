/**
 * Deals / sales-tax-holiday calendar. Honest by construction: fixture
 * calendars are UNVERIFIED, so every window renders with its caveat and the
 * suppression stance (§1.5) — no date is promised. Windows surface through
 * the basket envelope's assumptions/caveats; a dedicated verified-calendar
 * endpoint is a recorded Phase 5 follow-up (handoff §7).
 */
import type { BasketData, SessionData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import { html, joinHtml } from "../html";
import type { Screen } from "../components/chrome";
import { linkButton } from "../components/forms";
import { assumptionsList } from "../components/status";
import { suppressionNotice } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { DEALS } from "../copy/en";

export interface DealsData {
  session: SessionData | null;
  basket: ApiOk<BasketData> | null;
}

export type DealsScreenState = ScreenState<DealsData>;

export function renderDeals(state: DealsScreenState): Screen {
  const base = {
    title: DEALS.title,
    description: DEALS.lead,
    activeNav: "deals" as const,
    container: "flow" as const,
  };
  const sections = foldState(state, { loadingRows: 2 }, (envelope) => {
    const { session, basket } = envelope.data;
    if (!session || session.householdState === null) {
      return [
        {
          kind: "deadline" as const,
          body: html`<p class="lead">${DEALS.noState}</p>${linkButton({ label: DEALS.setState, href: "/household", variant: "secondary", icon: "backpack" })}`,
        },
      ];
    }
    if (basket === null) {
      return [{ kind: "deadline" as const, body: html`<p class="lead">${DEALS.empty}</p>` }];
    }
    const taxCaveats = new Set<string>();
    const options = basket.data.basket?.options ?? [];
    for (const option of options) for (const caveat of option.taxCaveats) taxCaveats.add(caveat);
    const holidayAssumptions = basket.assumptions.filter(
      (a) => a.name.includes("tax") || a.name.includes("holiday"),
    );
    return [
      {
        kind: "deadline" as const,
        body: html`${envelopeChrome(basket)}${
          taxCaveats.size === 0
            ? html`<p class="lead">${DEALS.empty}</p>`
            : html`<h2>${DEALS.caveatsTitle}</h2>${joinHtml(
                [...taxCaveats].map((c) => suppressionNotice(c)),
              )}<p>${DEALS.windowApplied}</p><p><a href="/plan/basket">${DEALS.basketLink}</a></p>`
        }${assumptionsList(DEALS.caveatsTitle, holidayAssumptions)}`,
      },
    ];
  });
  return { ...base, sections: [intro(DEALS.title, DEALS.lead), ...sections] };
}
