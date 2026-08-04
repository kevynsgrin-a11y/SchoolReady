/**
 * Alerts / privacy / export / delete. There is no account — the copy says
 * so plainly. Alerts are in-app and channel-less (§1.7: no email/phone
 * column even exists). Core-access notice renders verbatim from the API
 * contract so the §1.2 posture is user-visible.
 */
import type { AlertsData, EntitlementsData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import { ALERT_KINDS } from "../../api/contracts";
import type { AlertKind } from "../../api/contracts";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { button, field, form, linkButton, select } from "../components/forms";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { ACCOUNT } from "../copy/en";

export interface AccountData {
  alerts: ApiOk<AlertsData>;
  entitlements: ApiOk<EntitlementsData>;
}

export type AccountScreenState = ScreenState<AccountData>;

const ALERT_LABELS: Record<AlertKind, string> = {
  recall: ACCOUNT.alertRecall,
  price_change: ACCOUNT.alertPrice,
  deadline: ACCOUNT.alertDeadline,
  list_correction: ACCOUNT.alertCorrection,
};

function alertsBlock(alerts: ApiOk<AlertsData>): ReturnType<typeof html> {
  const listed =
    alerts.data.subscriptions.length === 0
      ? html`<p>${ACCOUNT.alertsEmpty}</p>`
      : html`<p class="muted">${ACCOUNT.alertsListed(alerts.data.subscriptions.length)}</p><ul class="plain-list">${joinHtml(
          alerts.data.subscriptions.map((sub, i) =>
            renderFact({
              provenanceIds: sub.provenanceIds,
              provenance: alerts.provenance,
              withLine: false,
              render: () =>
                html`<li class="list-row"><span class="row-ordinal">${i + 1}.</span><span>${icon("bell", { size: 20 })} ${ALERT_LABELS[sub.alertKind]}</span><span class="text-data-s muted">${sub.productTypeSlug ?? ""}</span></li>`,
            }),
          ),
        )}</ul>`;
  return html`<h2>${ACCOUNT.alertsTitle}</h2><p>${ACCOUNT.alertsLead}</p>${listed}${form({
    action: "/account/alerts",
    ariaLabel: ACCOUNT.alertsTitle,
    body: [
      field({
        id: "alert-kind",
        label: ACCOUNT.alertKind,
        control: select({
          id: "alert-kind",
          name: "alertKind",
          options: ALERT_KINDS.map((k) => ({ value: k, label: ALERT_LABELS[k] })),
        }),
      }),
      button({ label: ACCOUNT.alertSubmit, icon: "bell" }),
    ],
  })}`;
}

export function renderAccount(state: AccountScreenState): Screen {
  const base = {
    title: ACCOUNT.title,
    description: ACCOUNT.lead,
    activeNav: "account" as const,
    container: "flow" as const,
  };
  const sections = foldState(state, { loadingRows: 3 }, (envelope) => {
    const { alerts, entitlements } = envelope.data;
    return [
      { kind: "assistance_resource" as const, body: html`${envelopeChrome(alerts)}${alertsBlock(alerts)}` },
      {
        kind: "content" as const,
        body: html`<h2>${ACCOUNT.privacyTitle}</h2><p>${ACCOUNT.privacyBody}</p>`,
      },
      {
        kind: "content" as const,
        body: html`<h2>${icon("download", { size: 20 })} ${ACCOUNT.exportTitle}</h2><p>${ACCOUNT.exportBody}</p>${linkButton(
          { label: ACCOUNT.exportCta, href: "/plan/checklist", variant: "secondary", icon: "printer" },
        )}`,
      },
      {
        kind: "content" as const,
        body: html`<h2>${icon("trash-2", { size: 20 })} ${ACCOUNT.deleteTitle}</h2><p>${ACCOUNT.deleteBody}</p>`,
      },
      {
        kind: "content" as const,
        body: html`<h2>${ACCOUNT.passTitle}</h2><p>${
          entitlements.data.seasonPass ? ACCOUNT.passActive : ACCOUNT.passNone
        }</p><p class="muted">${entitlements.data.coreAccessNotice}</p>`,
      },
    ];
  });
  return { ...base, sections: [intro(ACCOUNT.title, ACCOUNT.lead), ...sections] };
}
