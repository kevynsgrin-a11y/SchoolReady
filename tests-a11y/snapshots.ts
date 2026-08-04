/**
 * Snapshot page catalog for the Phase 11 axe suite.
 *
 * Some screen states cannot be driven over HTTP against wrangler dev: they
 * depend on an injected clock (stale sources), a guard refusal (partial
 * provenance), a Season Pass entitlement (webhook needs the opaque
 * household id), or a transient condition (loading, rate-limited). Those
 * states are rendered here through the REAL screen functions and the REAL
 * document composer with the same labeled synthetic fixtures the Phase 7
 * unit tests use (tests/helpers/ui.ts), then served to Chromium via route
 * interception (tests-a11y/helpers.ts). The bytes are what the Worker
 * would ship for the same envelope — the only synthetic part is the state.
 */
import type { NetRequiredLine } from "../src/algorithms/net-required";
import type { BasketOption, BasketParetoResult } from "../src/algorithms/basket";
import type {
  AlertsData,
  BasketData,
  ChecklistData,
  EntitlementsData,
  MergeData,
  TrendData,
} from "../src/api/contracts";
import { renderDocument } from "../src/ui/components/chrome";
import type { Screen } from "../src/ui/components/chrome";
import { renderPlan } from "../src/ui/screens/plan";
import { renderChecklist } from "../src/ui/screens/checklist";
import { renderBasket } from "../src/ui/screens/basket";
import { renderTrends } from "../src/ui/screens/trends";
import { renderStatus } from "../src/ui/screens/status";
import { renderAccount } from "../src/ui/screens/account";
import { badgeFor, BADGE_KINDS } from "../src/ui/components/badges";
import { recallBanner, restrictionBanner, correctionBanner } from "../src/ui/components/banners";
import { netRequiredStack, sumRuleTotal, packMathChip, budgetBar } from "../src/ui/components/ledger";
import { suppressionNotice } from "../src/ui/render-guard";
import { assumptionsList } from "../src/ui/components/status";
import { html, joinHtml } from "../src/ui/html";
import { envelope, record, staleSource } from "../tests/helpers/ui";

const PROV = record({ id: "prov:a11y:1" });
const provs = { [PROV.id]: PROV };

/* ----- fixture builders (mirroring tests/ui-screens.test.ts) ------- */

function mergeLine(overrides: Partial<NetRequiredLine> = {}): NetRequiredLine {
  return {
    key: "glue-stick|*|*|*",
    productTypeSlug: "glue-stick",
    dimensions: null,
    rulingStyle: null,
    color: null,
    optionality: "required",
    shareable: false,
    mixedShareability: false,
    grossRequiredUnits: 18,
    usableInventoryUnits: 5.5,
    reserveUnits: 0,
    netRequiredUnits: 12.5,
    unitsToBuy: 13,
    perMember: [
      { memberOrdinal: 1, requiredUnits: 12 },
      { memberOrdinal: 2, requiredUnits: 6 },
    ],
    provenanceIds: [PROV.id],
    ...overrides,
  };
}

const mergeData = (lines: NetRequiredLine[]): MergeData => ({
  lines,
  requiredLineKeys: lines.filter((l) => l.optionality === "required").map((l) => l.key),
  listFindings: [],
});

function basketOption(overrides: Partial<BasketOption> = {}): BasketOption {
  return {
    assignmentKey: "glue-stick|*|*|*->fixture-mart:FXM-GLUE-06",
    lines: [
      {
        itemKey: "glue-stick|*|*|*",
        offerKey: "fixture-mart:FXM-GLUE-06",
        retailerSlug: "fixture-mart",
        packsToBuy: 3,
        unitsPurchased: 18,
        lineSubtotalCents: 897,
        taxCents: 0,
        holidayApplied: true,
      },
    ],
    retailerSlugs: ["fixture-mart"],
    stops: 1,
    itemsSubtotalCents: 897,
    taxCents: 0,
    shippingCents: 87,
    landedCostCents: 984,
    costComplete: true,
    deliveryDaysMax: 3,
    deliveryDaysKnown: true,
    deadlineRiskDays: 0,
    matchPenalty: 0.2778,
    lowConfidenceCount: 0,
    weightedObjectiveCents: 984,
    taxCaveats: ["sales-tax holiday from an UNVERIFIED fixture calendar"],
    provenanceIds: [PROV.id],
    ...overrides,
  };
}

function basketData(pareto: BasketParetoResult | null): BasketData {
  return {
    basket: pareto as BasketData["basket"],
    itemMatches: [],
    coveredLineKeys: [],
    optionalLineKeysExcluded: ["marker|*|*|*"],
    purchaseDate: "2026-08-08",
    state: "TX",
  };
}

const feasiblePareto = (options: BasketOption[]): BasketParetoResult => ({
  feasible: true,
  unfulfillableItems: [],
  excludedOffers: [{ offerKey: "fixture-depot:FXD-CRAY-24", detail: "out of stock" }],
  options,
  frontier: options,
  views: {
    lowestCost: options[0] ?? null,
    fewestStops: options[0] ?? null,
    fastest: options[0] ?? null,
    highestConfidence: options[0] ?? null,
  },
  assumptions: [
    { name: "sales_tax_rate", value: "fixture placeholder rate for TX", basis: "fixture_assumption" },
  ],
});

function trendData(overrides: Partial<TrendData> = {}): TrendData {
  return {
    productSlug: "fixture-gel-pen",
    label: "insufficient_evidence",
    confidence: 0.21,
    organicPassingFamilies: ["search_interest"],
    familyEvaluations: [
      {
        family: "search_interest",
        samples: 9,
        median: 40,
        scaledMad: 5.93,
        winsorizedLatest: 55,
        rawZ: 2.53,
        freshnessWeight: 0.93,
        decayedZ: 2.35,
        passes: true,
        sponsoredShare: 0.1,
        geography: "US",
        failureReasons: [],
        provenanceIds: [PROV.id],
      },
    ],
    reasons: ["fewer than the required organic families pass"],
    provenanceIds: [PROV.id],
    ...overrides,
  };
}

// [P12-4] Grouped state: the checklist's store-trip headings + no-store
// group are new markup and get axed here (heading order, list semantics).
const checklistData: ChecklistData = {
  generatedAt: "2026-08-04T12:00:00.000Z",
  memberOrdinals: [1, 2],
  lines: [
    {
      key: "glue-stick|*|*|*",
      productTypeSlug: "glue-stick",
      displayName: "glue sticks",
      dimensions: null,
      rulingStyle: null,
      color: null,
      optionality: "required",
      unitsToBuy: 13,
      netRequiredUnits: 12.5,
      grossRequiredUnits: 18,
      usableInventoryUnits: 5.5,
      perMember: [{ memberOrdinal: 1, requiredUnits: 12 }],
      retailerSlug: "fixture-mart",
      provenanceIds: [PROV.id],
    },
    {
      key: "sticker-set|*|*|*",
      productTypeSlug: "sticker-set",
      displayName: "sticker sets",
      dimensions: null,
      rulingStyle: null,
      color: null,
      optionality: "optional",
      unitsToBuy: 1,
      netRequiredUnits: 1,
      grossRequiredUnits: 1,
      usableInventoryUnits: 0,
      perMember: [{ memberOrdinal: 1, requiredUnits: 1 }],
      retailerSlug: null,
      provenanceIds: [PROV.id],
    },
  ],
  grouping: {
    view: "lowest_cost",
    retailerSlugs: ["fixture-mart"],
    provenanceIds: [PROV.id],
  },
};

const alertsData: AlertsData = {
  subscriptions: [
    {
      id: "a11y-alert-1",
      alertKind: "recall",
      productTypeSlug: "glue-stick",
      listId: null,
      provenanceIds: [PROV.id],
    },
  ],
};

const entitledData: EntitlementsData = {
  seasonPass: {
    kind: "season_pass",
    status: "active",
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2027-08-01T00:00:00.000Z",
    provenanceIds: [PROV.id],
  },
  gates: { adFreeExtras: true },
  coreAccessNotice:
    "Every planning feature works without a pass; the pass only removes extras.",
};

/** All 11 badges + banners + ledger + notices on one page for axe + checks. */
function componentGallery(): Screen {
  const badges = joinHtml(
    BADGE_KINDS.map((kind) =>
      html`<li>${badgeFor(kind, {
        passingFamilies: 4,
        totalFamilies: 5,
        lastCheckedDate: "2026-08-03",
      })}</li>`,
    ),
  );
  return {
    title: "Component states (a11y snapshot)",
    description: "Synthetic gallery of every badge, banner, and ledger state for the axe suite.",
    activeNav: null,
    container: "plan",
    sections: [
      {
        kind: "safety_warning",
        body: html`<h1>Component states</h1>${recallBanner({
          title: "1 recall match (fixture sample)",
          body: html`<p>Synthetic recall body for the accessibility snapshot. <a href="https://example.com/fixture">FX-26-101</a></p>`,
        })}${restrictionBanner({
          title: "Restricted by school policy (fixture sample)",
          body: html`<p>Synthetic restriction body for the accessibility snapshot.</p>`,
        })}`,
      },
      {
        kind: "correction",
        body: correctionBanner({
          title: "Corrected on 2026-08-03 (fixture sample)",
          body: html`<p>Synthetic correction body for the accessibility snapshot.</p>`,
        }),
      },
      {
        kind: "content",
        body: html`<h2>All eleven badges</h2><ul class="plain-list">${badges}</ul>
<h2>Ledger</h2>${netRequiredStack({
          requiredLabel: "Required (both kids)",
          requiredUnits: 18,
          ownedLabel: "Already at home",
          ownedUnits: 5.5,
          resultLabel: "To buy",
          resultUnits: 12.5,
          wholeUnitsLabel: "To buy (whole units)",
          wholeUnits: 13,
          requiredReceipt: html`<p>Child 1: 12 · Child 2: 6</p>`,
        })}${sumRuleTotal({ label: "Landed cost", value: "$9.84", final: true })}<p>${packMathChip({ packs: 3, packCount: 6, units: 18 })}</p>${budgetBar({ label: "Spent so far", value: "$9.84", fraction: 0.4 })}
<h2>Notices</h2>${suppressionNotice("Synthetic suppression reason for the snapshot.")}${assumptionsList("Assumptions", [
          { name: "sales_tax_rate", value: "fixture placeholder rate", basis: "fixture_assumption" },
        ])}`,
      },
    ],
  };
}

const doc = (screen: Screen): string => renderDocument(screen, { fixtureMode: true });

export interface SnapshotPage {
  /** Path under http://snapshots.a11y.internal/ */
  readonly id: string;
  readonly screenName: string;
  readonly stateName: string;
  readonly html: string;
}

export function snapshotPages(): SnapshotPage[] {
  const pages: SnapshotPage[] = [];
  const add = (id: string, screenName: string, stateName: string, page: string): void => {
    pages.push({ id, screenName, stateName, html: page });
  };

  add("plan-loading", "plan", "loading (skeleton)", doc(renderPlan({ kind: "loading" })));
  add("plan-ready", "plan", "ready (two-child merge)", doc(renderPlan({ kind: "ready", envelope: envelope(mergeData([mergeLine()]), provs) })));
  add(
    "plan-partial",
    "plan",
    "partial (guard refusal + held-back total)",
    doc(
      renderPlan({
        kind: "ready",
        envelope: envelope(
          mergeData([
            mergeLine(),
            mergeLine({ key: "marker|*|*|*", productTypeSlug: "marker", provenanceIds: ["prov:gone"] }),
          ]),
          provs,
        ),
      }),
    ),
  );
  add("plan-rate-limited", "plan", "rate limited", doc(renderPlan({ kind: "rate_limited", retryAfterSeconds: 30 })));
  add("plan-error", "plan", "error", doc(renderPlan({ kind: "error", code: "internal_error", message: "" })));

  add(
    "checklist-ready",
    "checklist",
    "ready",
    doc(renderChecklist({ kind: "ready", envelope: envelope(checklistData, provs) }, { storeMode: false })),
  );
  add(
    "checklist-store",
    "checklist",
    "in-store mode",
    doc(renderChecklist({ kind: "ready", envelope: envelope(checklistData, provs) }, { storeMode: true })),
  );

  add(
    "basket-ready",
    "basket",
    "ready (sold-out exclusion + caveats)",
    doc(
      renderBasket(
        { kind: "ready", envelope: envelope(basketData(feasiblePareto([basketOption()])), provs) },
        { view: "lowest-cost", daysUntilNeeded: 4 },
      ),
    ),
  );
  add(
    "basket-recalled",
    "basket",
    "recalled (banner above all)",
    doc(
      renderBasket(
        {
          kind: "ready",
          envelope: envelope(basketData(feasiblePareto([basketOption()])), provs, {
            suppressions: [
              {
                subject: "offer:fixture-mart:FXM-SLIME-01",
                decision: {
                  action: "suppress",
                  findings: [
                    {
                      reason: "recalled_or_under_review",
                      action: "suppress",
                      detail: "matches CPSC recall FX-26-101",
                    },
                  ],
                },
              },
            ],
          }),
        },
        { view: null, daysUntilNeeded: null },
      ),
    ),
  );
  add(
    "basket-stale",
    "basket",
    "stale sources (dated badge)",
    doc(
      renderBasket(
        {
          kind: "ready",
          envelope: envelope(basketData(feasiblePareto([basketOption()])), provs, { sources: [staleSource] }),
        },
        { view: null, daysUntilNeeded: null },
      ),
    ),
  );
  add(
    "basket-infeasible",
    "basket",
    "infeasible (gaps listed)",
    doc(
      renderBasket(
        {
          kind: "ready",
          envelope: envelope(
            basketData({
              ...feasiblePareto([]),
              feasible: false,
              unfulfillableItems: [
                { itemKey: "glue-stick|*|*|*", detail: "no in-stock, geography-eligible offer available" },
              ],
            }),
            provs,
          ),
        },
        { view: null, daysUntilNeeded: null },
      ),
    ),
  );

  add(
    "trends-insufficient",
    "trends",
    "insufficient evidence (default)",
    doc(renderTrends({ kind: "ready", envelope: envelope({ cards: [trendData()] }, provs) })),
  );
  add(
    "trends-trending",
    "trends",
    "trending (3 of 5 families)",
    doc(
      renderTrends({
        kind: "ready",
        envelope: envelope(
          {
            cards: [
              trendData({
                label: "viral",
                organicPassingFamilies: ["search_interest", "retail_sellthrough", "review_velocity"],
              }),
            ],
          },
          provs,
        ),
      }),
    ),
  );

  add(
    "status-stale",
    "provider status",
    "stale source + fixture mode",
    doc(renderStatus({ kind: "ready", envelope: envelope({ sources: [staleSource] }, {}) })),
  );

  add(
    "account-entitled",
    "account",
    "Season Pass active (entitled)",
    doc(
      renderAccount(
        {
          kind: "ready",
          envelope: envelope(
            { alerts: envelope(alertsData, provs), entitlements: envelope(entitledData, provs) },
            provs,
          ),
        },
        { fixtureMode: true },
      ),
    ),
  );

  add("component-gallery", "components", "all badges/banners/ledger states", doc(componentGallery()));

  return pages;
}
