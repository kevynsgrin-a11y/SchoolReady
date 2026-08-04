/**
 * Screen state-matrix spot tests: loading (skeleton), empty (inviting),
 * stale (badge with date), partial (per-fact suppression), conflicting
 * source, expired, sold-out, recalled (banner above commercial), rate
 * limited, and error — each rendered from hand-built labeled fixtures.
 * Full matrix: docs/handoffs/08-frontend-engineer-7.md §6.
 */
import { describe, expect, it } from "vitest";
import type { NetRequiredLine } from "../src/algorithms/net-required";
import type { BasketOption, BasketParetoResult } from "../src/algorithms/basket";
import type { BasketData, ChecklistData, MergeData, TrendData } from "../src/api/contracts";
import { renderDocument } from "../src/ui/components/chrome";
import type { Screen } from "../src/ui/components/chrome";
import { renderHome } from "../src/ui/screens/home";
import { renderPlan } from "../src/ui/screens/plan";
import { renderChecklist } from "../src/ui/screens/checklist";
import { renderBasket } from "../src/ui/screens/basket";
import { renderTrends, MIN_ORGANIC_FAMILIES_FOR_TREND } from "../src/ui/screens/trends";
import { renderMethodology } from "../src/ui/screens/methodology";
import { renderStatus } from "../src/ui/screens/status";
import { escapeHtml } from "../src/ui/html";
import { SUPPRESSION } from "../src/ui/copy/en";
import { EMOJI_RE, SINGLE_ANSWER_WORDS, envelope, record, staleSource } from "./helpers/ui";

const doc = (screen: Screen): string => renderDocument(screen, { fixtureMode: true });

/* ------------------------------------------------------------------ */
/* Fixture builders (typed, hand-computed, labeled)                    */
/* ------------------------------------------------------------------ */

const PROV = record({ id: "prov:ui:merge" });

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
      {
        family: "social_engagement",
        samples: 2,
        median: 0,
        scaledMad: 0,
        winsorizedLatest: null,
        rawZ: null,
        freshnessWeight: 0.5,
        decayedZ: null,
        passes: false,
        sponsoredShare: 0,
        geography: "US",
        failureReasons: ["below minimum sample count"],
        provenanceIds: [PROV.id],
      },
    ],
    reasons: ["fewer than the required organic families pass"],
    provenanceIds: [PROV.id],
    ...overrides,
  };
}

const provs = { [PROV.id]: PROV };

/* ------------------------------------------------------------------ */
/* Homepage                                                            */
/* ------------------------------------------------------------------ */

describe("homepage — five-second test", () => {
  const page = doc(renderHome());

  it("states what it does and who it is for, above the fold", () => {
    expect(page).toContain("supply list");
    expect(page).toContain("K-8");
  });

  it("demonstrates the promise in ONE interaction: the hero parses a list", () => {
    expect(page).toContain('action="/intake/paste"');
    expect(page).toContain("<textarea");
  });

  it("carries no ad slots, no emoji, no lorem", () => {
    expect(page).not.toContain("ad-slot");
    expect(EMOJI_RE.test(page)).toBe(false);
    expect(page.toLowerCase()).not.toContain("lorem");
  });
});

/* ------------------------------------------------------------------ */
/* Plan (merged list)                                                  */
/* ------------------------------------------------------------------ */

describe("plan — merged shopping list states", () => {
  it("loading renders a skeleton (aria-busy), never a spinner, never a fact", () => {
    const page = doc(renderPlan({ kind: "loading" }));
    expect(page).toContain('aria-busy="true"');
    expect(page).not.toContain("spinner");
    expect(page).not.toContain("net-required-stack");
  });

  it("empty state invites the first action with specific copy", () => {
    const page = doc(renderPlan({ kind: "ready", envelope: envelope(mergeData([]), {}) }));
    expect(page).toContain("No lists yet");
    expect(page).toContain("/intake");
  });

  it("ready renders the Net-Required Stack with the true minus sign and receipts", () => {
    const page = doc(renderPlan({ kind: "ready", envelope: envelope(mergeData([mergeLine()]), provs) }));
    expect(page).toContain("net-required-stack");
    expect(page).toContain("−");
    expect(page).toContain("To buy (whole units)");
    expect(page).toContain("Child 1: 12");
    expect(page).toContain("provenance-line");
  });

  it("partial state: a line without resolvable provenance renders its refusal, not the fact", () => {
    const bad = mergeLine({ key: "marker|*|*|*", productTypeSlug: "marker", provenanceIds: ["prov:gone"] });
    const page = doc(
      renderPlan({ kind: "ready", envelope: envelope(mergeData([mergeLine(), bad]), provs) }),
    );
    expect(page).toContain(SUPPRESSION.unresolvedProvenance);
    expect(page).toContain("glue sticks"); // the good line still renders
  });

  it("P7-1: a guard-refused line never contributes to the whole-plan totals, and the exclusion is announced", () => {
    // Refused line carries distinctive units: leaking them would make gross
    // 18 + 7 = 25 and whole-units 13 + 7 = 20.
    const bad = mergeLine({
      key: "marker|*|*|*",
      productTypeSlug: "marker",
      provenanceIds: ["prov:gone"],
      grossRequiredUnits: 7,
      usableInventoryUnits: 0,
      reserveUnits: 0,
      netRequiredUnits: 7,
      unitsToBuy: 7,
      perMember: [{ memberOrdinal: 1, requiredUnits: 7 }],
    });
    const page = doc(
      renderPlan({ kind: "ready", envelope: envelope(mergeData([mergeLine(), bad]), provs) }),
    );
    const wholePlan = page.slice(page.indexOf("Whole plan"));
    // (a) the refused line's units are NOT in the grand total
    expect(wholePlan).not.toContain(">25<");
    expect(wholePlan).not.toContain(">20<");
    // (b) a visible suppression note explains the smaller total
    expect(wholePlan).toContain("suppression-notice");
    expect(wholePlan).toContain("1 required line was held back above");
    // (c) guard-passing lines still total correctly, with provenance chrome
    expect(wholePlan).toContain(">18<"); // gross from the good line only
    expect(wholePlan).toContain(">12.5<"); // net
    expect(wholePlan).toContain(">13<"); // whole units
    expect(wholePlan).toContain("provenance-line");
  });

  it("P7-1: when every required line is refused, the whole-plan stack refuses instead of totaling zero", () => {
    const bad = mergeLine({ provenanceIds: ["prov:gone"] });
    const page = doc(renderPlan({ kind: "ready", envelope: envelope(mergeData([bad]), provs) }));
    const wholePlan = page.slice(page.indexOf("Whole plan"));
    expect(wholePlan).not.toContain("net-required-stack");
    expect(wholePlan).toContain("suppression-notice");
  });

  it("stale/downgraded list findings render as visible suppression notes (§1.5)", () => {
    const data: MergeData = {
      ...mergeData([mergeLine()]),
      listFindings: [
        {
          listId: "list1",
          decision: {
            action: "downgrade",
            findings: [
              {
                reason: "stale_or_unverified_list",
                action: "downgrade",
                detail: "supply list is stale; renders only with a stale badge",
              },
            ],
          },
        },
      ],
    };
    const page = doc(
      renderPlan({
        kind: "ready",
        envelope: envelope(data, provs, {
          suppressions: [
            {
              subject: "list:list1",
              decision: data.listFindings[0]!.decision,
            },
          ],
        }),
      }),
    );
    expect(page).toContain(SUPPRESSION.reasonLabels["stale_or_unverified_list"]);
  });

  it("rate-limited state names the wait and the fix", () => {
    const page = doc(renderPlan({ kind: "rate_limited", retryAfterSeconds: 30 }));
    expect(page).toContain("Wait 30 seconds");
  });

  it("error state says what went wrong and how to recover", () => {
    const page = doc(renderPlan({ kind: "error", code: "internal_error", message: "" }));
    expect(page).toContain("nothing was saved");
    expect(page).toContain("Reload the page");
  });
});

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */

describe("checklist — in-store mode", () => {
  const checklist: ChecklistData = {
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
        provenanceIds: [PROV.id],
      },
    ],
  };

  it("ready: large native check targets keyed by opaque line keys", () => {
    const page = doc(
      renderChecklist({ kind: "ready", envelope: envelope(checklist, provs) }, { storeMode: false }),
    );
    expect(page).toContain('type="checkbox"');
    expect(page).toContain('data-line-key="glue-stick|*|*|*"');
    expect(page).toContain("Buy 13");
    expect(page).toContain("data-template");
  });

  it("store mode sets the one-hand body class and drops the lead", () => {
    const page = doc(
      renderChecklist({ kind: "ready", envelope: envelope(checklist, provs) }, { storeMode: true }),
    );
    expect(page).toContain('class="store-mode"');
  });

  it("empty state routes back to intake", () => {
    const page = doc(
      renderChecklist(
        { kind: "ready", envelope: envelope({ ...checklist, lines: [] }, {}) },
        { storeMode: false },
      ),
    );
    expect(page).toContain("no plan exists yet");
  });
});

/* ------------------------------------------------------------------ */
/* Basket (Pareto)                                                     */
/* ------------------------------------------------------------------ */

describe("basket — Pareto UI states", () => {
  it("ready: four labeled views, frontier, caveated tax, sold-out badge — and NO single answer", () => {
    const page = doc(
      renderBasket(
        { kind: "ready", envelope: envelope(basketData(feasiblePareto([basketOption()])), provs) },
        { view: "lowest-cost", daysUntilNeeded: 4 },
      ),
    );
    for (const label of ["Lowest cost", "Fewest stops", "Fastest", "Highest confidence"]) {
      expect(page).toContain(label);
    }
    expect(page).toContain("1 undominated option");
    expect(page).toContain("UNVERIFIED fixture calendar"); // tax caveat WITH tax numbers
    expect(page).toContain("$9.84");
    expect(page).toContain("double-rule");
    expect(page).toContain('data-badge="out-of-stock"');
    expect(SINGLE_ANSWER_WORDS.test(page)).toBe(false);
    expect(page).not.toMatch(/\bbest\b/i);
  });

  it("sold-out variant: cost-incomplete option is flagged, not hidden", () => {
    const incomplete = basketOption({ costComplete: false, shippingCents: 0, landedCostCents: 897 });
    const page = doc(
      renderBasket(
        { kind: "ready", envelope: envelope(basketData(feasiblePareto([incomplete])), provs) },
        { view: null, daysUntilNeeded: null },
      ),
    );
    expect(page).toContain("Shipping unknown");
  });

  it("recalled state: the recall notice renders before any basket content", () => {
    const page = doc(
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
    );
    const bannerAt = page.indexOf("banner-recall");
    const frontierAt = page.indexOf("undominated");
    expect(bannerAt).toBeGreaterThan(-1);
    expect(frontierAt).toBeGreaterThan(-1);
    expect(bannerAt).toBeLessThan(frontierAt);
  });

  it("conflicting-source suppression renders both the reason and the detail", () => {
    const page = doc(
      renderBasket(
        {
          kind: "ready",
          envelope: envelope(basketData(feasiblePareto([basketOption()])), provs, {
            suppressions: [
              {
                subject: "offer:fixture-mart:FXM-GLUE-06",
                decision: {
                  action: "suppress",
                  findings: [
                    {
                      reason: "affiliate_neutral_conflict",
                      action: "suppress",
                      detail: "affiliate price disagrees with neutral source",
                    },
                  ],
                },
              },
            ],
          }),
        },
        { view: null, daysUntilNeeded: null },
      ),
    );
    expect(page).toContain(SUPPRESSION.reasonLabels["affiliate_neutral_conflict"]);
    expect(page).toContain("affiliate price disagrees with neutral source");
  });

  it("nothing-to-buy (basket null) is an honest state, not an error", () => {
    const page = doc(
      renderBasket(
        { kind: "ready", envelope: envelope(basketData(null), {}) },
        { view: null, daysUntilNeeded: null },
      ),
    );
    expect(page).toContain("inventory already covers");
  });

  it("infeasible basket lists the gaps instead of pretending", () => {
    const infeasible: BasketParetoResult = {
      ...feasiblePareto([]),
      feasible: false,
      unfulfillableItems: [
        { itemKey: "glue-stick|*|*|*", detail: "no in-stock, geography-eligible offer available" },
      ],
    };
    const page = doc(
      renderBasket(
        { kind: "ready", envelope: envelope(basketData(infeasible), provs) },
        { view: null, daysUntilNeeded: null },
      ),
    );
    expect(page).toContain("No store combination covers");
    expect(page).toContain("no in-stock, geography-eligible offer available");
  });

  it("stale sources render the dated stale badge from meta.sources", () => {
    const page = doc(
      renderBasket(
        {
          kind: "ready",
          envelope: envelope(basketData(feasiblePareto([basketOption()])), provs, {
            sources: [staleSource],
          }),
        },
        { view: null, daysUntilNeeded: null },
      ),
    );
    expect(page).toContain("Prices last checked 2026-08-03");
  });

  it("rate-limited and search-space errors render actionable copy", () => {
    expect(doc(renderBasket({ kind: "rate_limited", retryAfterSeconds: null }, { view: null, daysUntilNeeded: null }))).toContain(
      "faster than this beta allows",
    );
    expect(
      doc(
        renderBasket(
          { kind: "error", code: "basket_search_space_exceeded", message: "" },
          { view: null, daysUntilNeeded: null },
        ),
      ),
    ).toContain("Split the list");
  });
});

/* ------------------------------------------------------------------ */
/* Trends + methodology + status                                       */
/* ------------------------------------------------------------------ */

describe("trend radar states (§1.3)", () => {
  it("insufficient evidence is the designed default state with honest counts", () => {
    const page = doc(
      renderTrends({ kind: "ready", envelope: envelope({ cards: [trendData()] }, provs) }),
    );
    expect(page).toContain("Not enough evidence");
    expect(page).toContain(`we need at least ${MIN_ORGANIC_FAMILIES_FOR_TREND}`);
    expect(page).toContain("below minimum sample count");
  });

  it("a passing label renders WITH its family count and the evidence table", () => {
    const hot = trendData({
      label: "viral",
      organicPassingFamilies: ["search_interest", "retail_sellthrough", "review_velocity"],
    });
    const page = doc(renderTrends({ kind: "ready", envelope: envelope({ cards: [hot] }, provs) }));
    expect(page).toContain("Trending (3 of 5 signal families)");
    expect(page).toContain("evidence-table");
  });

  it("empty radar invites adding a list", () => {
    const page = doc(renderTrends({ kind: "ready", envelope: envelope({ cards: [] }, {}) }));
    expect(page).toContain("No plan items to evaluate yet");
  });

  it("the §1.3 UI constant mirrors the engine's classification threshold", () => {
    expect(MIN_ORGANIC_FAMILIES_FOR_TREND).toBe(3);
  });
});

describe("methodology + provider status", () => {
  it("methodology lists all eight suppression triggers and code-derived thresholds", () => {
    const page = doc(renderMethodology());
    expect(page).toContain("6 hours");
    expect(page).toContain("7 days");
    expect(page).toContain("at least 3 of 5 independent signal families");
    for (const label of Object.values(SUPPRESSION.reasonLabels)) {
      expect(page).toContain(escapeHtml(label));
    }
    expect(Object.keys(SUPPRESSION.reasonLabels)).toHaveLength(8);
  });

  it("status screen renders freshness, circuit, and fixture-mode per source", () => {
    const page = doc(
      renderStatus({ kind: "ready", envelope: envelope({ sources: [staleSource] }, {}) }),
    );
    expect(page).toContain("affiliate_feeds");
    expect(page).toContain("Stale (26 hours old)");
    expect(page).toContain("Closed (healthy)");
    expect(page).toContain("Fixture data (live feed off)");
    expect(page).toContain("Serving from cache fallback");
  });
});

/* ------------------------------------------------------------------ */
/* Cross-screen hygiene                                                */
/* ------------------------------------------------------------------ */

describe("cross-screen hygiene", () => {
  const pages = [
    doc(renderHome()),
    doc(renderPlan({ kind: "loading" })),
    doc(renderPlan({ kind: "ready", envelope: envelope(mergeData([mergeLine()]), provs) })),
    doc(renderMethodology()),
  ];

  it("no emoji, no lorem/placeholder text, anywhere", () => {
    for (const page of pages) {
      expect(EMOJI_RE.test(page)).toBe(false);
      expect(page.toLowerCase()).not.toContain("lorem");
      expect(page).not.toContain("TODO");
      expect(page).not.toContain("TBD");
    }
  });

  it("no inline click handlers and no positive tabindex (keyboard reachability)", () => {
    for (const page of pages) {
      expect(page).not.toContain("onclick=");
      expect(page).not.toMatch(/tabindex="[1-9]/);
    }
  });

  it("every page has the skip link, lang, viewport, and the app shell", () => {
    for (const page of pages) {
      expect(page).toContain('<html lang="en">');
      expect(page).toContain("skip-link");
      expect(page).toContain('name="viewport"');
      expect(page).toContain("/assets/ui.css");
    }
  });
});
