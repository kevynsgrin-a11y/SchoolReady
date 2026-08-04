/**
 * Alerts / privacy / export / delete. There is no account — the copy says
 * so plainly. Alerts are in-app and channel-less (§1.7: no email/phone
 * column even exists). Core-access notice renders verbatim from the API
 * contract so the §1.2 posture is user-visible.
 *
 * [Monetization — Phase 9] The Season Pass block is a COMMERCIAL section
 * (kind "disclosure"), rendered last — after the assistance-resource alerts
 * block and everything else (§1.2). Its checkout entry point is honest:
 * checkout is off in this build (src/monetization/season-pass.ts throws by
 * construction); purchases arrive only via the Phase 5 fixture-verified
 * Stripe webhook. No countdowns, no scarcity, no pre-checked anything (§5).
 */
import type { AlertsData, EntitlementsData } from "../../api/contracts";
import type { ApiOk } from "../../api/contracts";
import { ALERT_KINDS } from "../../api/contracts";
import type { AlertKind } from "../../api/contracts";
import { seasonPassSurface } from "../../monetization/season-pass";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import { icon } from "../icons";
import type { Screen } from "../components/chrome";
import { button, field, form, linkButton, select } from "../components/forms";
import { renderFact } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro, isoDate } from "./shared";
import { ACCOUNT, DISCLAIMERS, MONETIZATION, PRIVACY } from "../copy/en";
// [Compliance — Phase 10] The upload-retention number in the privacy policy
// is the enforced TTL constant, never a typed-in literal.
import { UPLOAD_BUFFER_TTL_SECONDS } from "../../parsing/upload-buffer";

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
          alerts.data.subscriptions.map(
            (sub, i) =>
              // [A11y — Phase 11] <li> wraps the guard call so a refusal
              // notice is a valid list child (see plan.ts planLine).
              html`<li class="fact-row">${renderFact({
                provenanceIds: sub.provenanceIds,
                provenance: alerts.provenance,
                withLine: false,
                render: () =>
                  html`<div class="list-row"><span class="row-ordinal">${i + 1}.</span><span>${icon("bell", { size: 20 })} ${ALERT_LABELS[sub.alertKind]}</span><span class="text-data-s muted">${sub.productTypeSlug ?? ""}</span></div>`,
              })}</li>`,
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

/**
 * [Monetization — Phase 9] Season Pass block. Commercial by nature, so its
 * section kind is "disclosure" and it renders after everything protected.
 * The active state's expiry date is a fact and renders only through the
 * §1.4 guard; the checkout entry point carries the data-upsell marker the
 * §1.2 route-tree scan keys on.
 */
function seasonPassBlock(entitlements: ApiOk<EntitlementsData>, fixtureMode: boolean): Html {
  const surface = seasonPassSurface(entitlements.data, fixtureMode);
  const status =
    surface.kind === "active"
      ? renderFact({
          provenanceIds: surface.provenanceIds,
          provenance: entitlements.provenance,
          render: () =>
            html`<p>${ACCOUNT.passActive} ${MONETIZATION.passActiveThrough(isoDate(surface.validUntil))}</p><p class="muted">${MONETIZATION.passAdFree}</p>`,
        })
      : html`<p>${ACCOUNT.passNone}</p>`;
  const checkout =
    surface.kind === "active"
      ? null
      : html`<div class="season-pass-checkout" data-upsell="season-pass"><h3>${MONETIZATION.passCheckoutTitle}</h3><p>${MONETIZATION.passExplainer}</p><p class="muted">${MONETIZATION.passCheckoutUnavailable}</p></div>`;
  return html`<h2>${icon("receipt-text", { size: 20 })} ${ACCOUNT.passTitle}</h2>${status}${checkout}<p class="muted">${entitlements.data.coreAccessNotice}</p>`;
}

/**
 * [Compliance — Phase 10] Full plain-language privacy policy. Every claim in
 * this copy is enforced by code/tests cited in docs/compliance/coppa-posture.md.
 */
function privacyBlock(): Html {
  const items = (list: readonly string[]): Html =>
    html`<ul>${joinHtml(list.map((item) => html`<li>${item}</li>`))}</ul>`;
  return html`<h2>${icon("shield-check", { size: 20 })} ${PRIVACY.title}</h2><p class="lead">${PRIVACY.lead}</p><p>${ACCOUNT.privacyBody}</p><h3>${PRIVACY.collectTitle}</h3>${items(
    PRIVACY.collectItems,
  )}<h3>${PRIVACY.neverTitle}</h3>${items(PRIVACY.neverItems)}<h3>${PRIVACY.retentionTitle}</h3><p>${PRIVACY.retentionUpload(
    Math.round(UPLOAD_BUFFER_TTL_SECONDS / 60),
  )}</p><p>${PRIVACY.retentionSession}</p><h3>${PRIVACY.thirdPartiesTitle}</h3><p>${PRIVACY.thirdPartiesBody}</p><h3>${PRIVACY.childrenTitle}</h3><p>${PRIVACY.childrenBody}</p><h3>${PRIVACY.rightsTitle}</h3><p>${PRIVACY.rightsBody}</p>`;
}

/** [Compliance — Phase 10] Standing disclaimers for the four fact categories. */
function disclaimersBlock(): Html {
  return html`<h2>${DISCLAIMERS.title}</h2><p class="lead">${DISCLAIMERS.lead}</p><h3>${DISCLAIMERS.pricesTitle}</h3><p>${DISCLAIMERS.prices}</p><h3>${DISCLAIMERS.taxTitle}</h3><p>${DISCLAIMERS.tax}</p><h3>${DISCLAIMERS.trendsTitle}</h3><p>${DISCLAIMERS.trends}</p><h3>${DISCLAIMERS.recallsTitle}</h3><p>${DISCLAIMERS.recalls}</p>`;
}

export function renderAccount(
  state: AccountScreenState,
  options: { fixtureMode: boolean } = { fixtureMode: true },
): Screen {
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
      { kind: "content" as const, body: privacyBlock() },
      { kind: "content" as const, body: disclaimersBlock() },
      {
        kind: "content" as const,
        body: html`<h2>${icon("download", { size: 20 })} ${ACCOUNT.exportTitle}</h2><p>${ACCOUNT.exportBody}</p><p>${linkButton(
          { label: ACCOUNT.exportCta, href: "/plan/checklist", variant: "secondary", icon: "printer" },
        )} ${linkButton(
          { label: ACCOUNT.exportJsonCta, href: "/api/export", variant: "secondary", icon: "download" },
        )}</p>`,
      },
      {
        // [Compliance — Phase 10] One-pass purge: plain HTML form -> POST
        // /account/delete -> DELETE /api/session (src/ui/server.ts).
        kind: "content" as const,
        body: html`<h2>${icon("trash-2", { size: 20 })} ${ACCOUNT.deleteTitle}</h2><p>${ACCOUNT.deleteBody}</p><p class="muted">${ACCOUNT.deleteNote}</p>${form(
          {
            action: "/account/delete",
            ariaLabel: ACCOUNT.deleteTitle,
            body: [button({ label: ACCOUNT.deleteSubmit, variant: "secondary", icon: "trash-2" })],
          },
        )}`,
      },
      {
        // Commercial section: always last (§1.2; composer + route scan enforce).
        kind: "disclosure" as const,
        body: seasonPassBlock(entitlements, options.fixtureMode),
      },
    ];
  });
  return { ...base, sections: [intro(ACCOUNT.title, ACCOUNT.lead), ...sections] };
}
