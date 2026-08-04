/**
 * Merged shopping plan — §0 capability 2 rendered literally: the
 * Net-Required Stack per merged line and once for the whole plan
 * (direction §5.2). Every line is a fact and renders through the §1.4
 * guard; downgraded lists render their findings (§1.5). The whole-plan
 * aggregate is itself a fact: it sums ONLY guard-passing lines, renders
 * through renderFact with the union of contributing provenance ids, and
 * when any required line was refused it says so — the total is never
 * silently smaller (gate finding P7-1).
 */
import type { MergeData } from "../../api/contracts";
import type { NetRequiredLine } from "../../algorithms/net-required";
import type { ProvenanceRecord } from "../../contracts/provenance";
import { getLexiconEntry } from "../../parsing/lexicon";
import type { Html } from "../html";
import { html, joinHtml } from "../html";
import type { Screen } from "../components/chrome";
import { linkButton } from "../components/forms";
import { requiredBadge, optionalBadge } from "../components/badges";
import { netRequiredStack } from "../components/ledger";
import { guardFact, renderFact, suppressionNotice } from "../render-guard";
import type { ScreenState } from "../state";
import { envelopeChrome, foldState, intro } from "./shared";
import { PLAN, SUPPRESSION } from "../copy/en";

export type PlanScreenState = ScreenState<MergeData>;

export function lineDisplayName(line: {
  productTypeSlug: string;
  dimensions: string | null;
  rulingStyle: string | null;
  color: string | null;
}): string {
  const name = getLexiconEntry(line.productTypeSlug)?.displayName ?? line.productTypeSlug;
  const details = [line.dimensions, line.rulingStyle?.replace(/_/g, " "), line.color].filter(
    (d): d is string => d !== null,
  );
  return details.length > 0 ? `${name} (${details.join(", ")})` : name;
}

function perMemberReceipt(line: NetRequiredLine): Html {
  return html`<ul class="plain-list">${joinHtml(
    line.perMember.map(
      (m) => html`<li class="text-data-s">${PLAN.perChild(m.memberOrdinal)}: ${m.requiredUnits}</li>`,
    ),
  )}</ul>`;
}

function planLine(
  line: NetRequiredLine,
  index: number,
  provenance: Record<string, ProvenanceRecord>,
): Html {
  return renderFact({
    provenanceIds: line.provenanceIds,
    provenance,
    render: () =>
      html`<li class="list-row"><span class="row-ordinal">${index + 1}.</span><div><span class="row-name">${lineDisplayName(line)}</span>${
        line.mixedShareability ? html`<p class="row-detail">${PLAN.mixedShareability}</p>` : null
      }${netRequiredStack({
        requiredLabel: PLAN.requiredLine,
        requiredUnits: line.grossRequiredUnits,
        ownedLabel: PLAN.ownedLine,
        ownedUnits: line.usableInventoryUnits,
        reserveLabel: PLAN.reserveLine,
        reserveUnits: line.reserveUnits,
        resultLabel: PLAN.toBuyLine,
        resultUnits: line.netRequiredUnits,
        wholeUnitsLabel: PLAN.toBuyWholeLine,
        wholeUnits: line.unitsToBuy,
        requiredReceipt: perMemberReceipt(line),
      })}</div><div class="row-badges">${line.optionality === "required" ? requiredBadge() : optionalBadge()}</div></li>`,
  });
}

export function renderPlan(state: PlanScreenState): Screen {
  const base = {
    title: PLAN.title,
    description: PLAN.lead,
    activeNav: "plan" as const,
    container: "plan" as const,
  };
  const sections = foldState(state, { loadingRows: 5, withLedger: true }, (envelope) => {
    const { lines } = envelope.data;
    if (lines.length === 0) {
      return [
        {
          kind: "content" as const,
          body: html`<p class="lead">${PLAN.empty}</p>${linkButton({ label: PLAN.emptyCta, href: "/intake", icon: "clipboard-paste" })}`,
        },
      ];
    }
    // P7-1: only guard-passing lines may contribute facts to the aggregate.
    const passing = lines.filter((l) => guardFact(l.provenanceIds, envelope.provenance).ok);
    const memberOrdinals = new Set<number>();
    for (const line of passing) for (const m of line.perMember) memberOrdinals.add(m.memberOrdinal);
    const required = passing.filter((l) => l.optionality === "required");
    const refusedRequired =
      lines.filter((l) => l.optionality === "required").length - required.length;
    const totals = {
      gross: required.reduce((sum, l) => sum + l.grossRequiredUnits, 0),
      owned: required.reduce((sum, l) => sum + l.usableInventoryUnits, 0),
      reserve: required.reduce((sum, l) => sum + l.reserveUnits, 0),
      net: required.reduce((sum, l) => sum + l.netRequiredUnits, 0),
      toBuy: required.reduce((sum, l) => sum + l.unitsToBuy, 0),
    };
    const contributingIds = [...new Set(required.flatMap((l) => l.provenanceIds))];
    const rows = joinHtml(lines.map((line, i) => planLine(line, i, envelope.provenance)));
    return [
      {
        kind: "required_items" as const,
        body: html`${envelopeChrome(envelope)}<ol class="list-rows">${rows}</ol>`,
      },
      {
        kind: "required_items" as const,
        body: html`<h2>${PLAN.wholePlanTitle}</h2>${
          refusedRequired > 0
            ? suppressionNotice(SUPPRESSION.totalsHeldBackNote(refusedRequired))
            : null
        }${renderFact({
          provenanceIds: contributingIds,
          provenance: envelope.provenance,
          render: () =>
            netRequiredStack({
              requiredLabel: PLAN.planRequired(memberOrdinals.size),
              requiredUnits: totals.gross,
              ownedLabel: PLAN.ownedLine,
              ownedUnits: totals.owned,
              reserveLabel: PLAN.reserveLine,
              reserveUnits: totals.reserve,
              resultLabel: PLAN.toBuyLine,
              resultUnits: totals.net,
              wholeUnitsLabel: PLAN.toBuyWholeLine,
              wholeUnits: totals.toBuy,
            }),
        })}`,
      },
      {
        kind: "navigation" as const,
        body: html`${linkButton({ label: PLAN.goChecklist, href: "/plan/checklist", icon: "list-checks" })} ${linkButton(
          { label: PLAN.goBasket, href: "/plan/basket", icon: "store", variant: "secondary" },
        )}`,
      },
    ];
  });
  return { ...base, sections: [intro(PLAN.title, PLAN.lead), ...sections] };
}
