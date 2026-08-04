/**
 * §1.2 route-tree scan, node half — the layout-level rule from the brief
 * proven against RENDERED documents: no ad slot, sponsored unit, upsell, or
 * interstitial between the user and any of the seven protected content
 * kinds. This suite (a) seeds every scanner rule with a failing
 * counterexample, (b) renders the real screens across representative DATA
 * states (recalled, stale, correction, suppressed, entitled) and asserts
 * zero findings, and (c) proves the rules against a synthetic editorial
 * surface — the only place a slot may ever mount — including the ad-free
 * entitlement suppressing it. The workers half
 * (tests-workers/monetization-routes.test.ts) walks the real server's route
 * table end to end.
 */
import { describe, expect, it } from "vitest";
import type {
  BasketData,
  ChecklistData,
  EntitlementsData,
  MergeData,
  RecallCheckData,
  RecallEntry,
  SessionData,
} from "../src/api/contracts";
import { CORE_ACCESS_NOTICE } from "../src/api/contracts";
import type { BasketOption, BasketParetoResult } from "../src/algorithms/basket";
import type { NetRequiredLine } from "../src/algorithms/net-required";
import { renderDocument } from "../src/ui/components/chrome";
import type { Screen } from "../src/ui/components/chrome";
import { SlotPlacementError } from "../src/ui/slots";
import { html } from "../src/ui/html";
import { renderHome } from "../src/ui/screens/home";
import { renderIntake } from "../src/ui/screens/intake";
import { renderHousehold } from "../src/ui/screens/household";
import { renderPlan } from "../src/ui/screens/plan";
import { renderChecklist } from "../src/ui/screens/checklist";
import { renderBasket } from "../src/ui/screens/basket";
import { renderCapsule } from "../src/ui/screens/capsule";
import { renderTrends } from "../src/ui/screens/trends";
import { renderItem } from "../src/ui/screens/item";
import { renderSafety } from "../src/ui/screens/safety";
import { renderBudget } from "../src/ui/screens/budget";
import { renderDeals } from "../src/ui/screens/deals";
import { renderMethodology } from "../src/ui/screens/methodology";
import { renderAccount } from "../src/ui/screens/account";
import { scanRenderedPage } from "../src/monetization/route-scan";
import { editorialAdSections } from "../src/monetization/ad-rules";
import { decorateOutboundLink } from "../src/monetization/links";
import type { MonetizedLink } from "../src/monetization/links";
import { renderMonetizedLink } from "../src/monetization/disclosure";
import { T0_ISO, envelope, record } from "./helpers/ui";

const doc = (screen: Screen): string => renderDocument(screen, { fixtureMode: true });

/* ------------------------------------------------------------------ */
/* Scanner rule seeds — every rule must catch its counterexample       */
/* ------------------------------------------------------------------ */

const section = (kind: string, body: string): string =>
  `<section class="page-section section-${kind}">${body}</section>`;

describe("scanner rules — seeded violations (each rule provably non-vacuous)", () => {
  it("Rule A: a commercial section above protected content is caught", () => {
    const page = section("ad_slot", "<div>ad</div>") + section("required_items", "<p>glue</p>");
    const findings = scanRenderedPage(page);
    expect(findings.some((f) => f.rule === "commercial_section_order")).toBe(true);
  });

  it("Rule A: a disclosure section above a safety warning is caught", () => {
    const page = section("disclosure", "<p>note</p>") + section("safety_warning", "<p>recall</p>");
    expect(scanRenderedPage(page).some((f) => f.rule === "commercial_section_order")).toBe(true);
  });

  it("Rule B: an ad-slot container EMBEDDED inside a protected section is caught", () => {
    const page = section("required_items", '<div class="ad-slot">ad</div><p>glue</p>');
    const findings = scanRenderedPage(page);
    expect(findings.some((f) => f.rule === "commercial_unit_position" && f.detail.includes("inside"))).toBe(true);
  });

  it("Rule B: an affiliate link above a deadline is caught even with its disclosure", () => {
    const link = decorateOutboundLink({
      deepLinkUrl: "https://example.com/fixture/fixture-mart/FXM-GLUE-06",
      retailerSlug: "fixture-mart",
    }) as MonetizedLink;
    const page =
      section("content", renderMonetizedLink(link, "Fixture Mart").__html) +
      section("deadline", "<p>order-by date</p>");
    expect(scanRenderedPage(page).some((f) => f.rule === "commercial_unit_position")).toBe(true);
  });

  it("Rule B: an upsell unit above an assistance resource is caught", () => {
    const page =
      section("content", '<div data-upsell="season-pass">buy the pass</div>') +
      section("assistance_resource", "<p>help</p>");
    expect(scanRenderedPage(page).some((f) => f.rule === "commercial_unit_position")).toBe(true);
  });

  it("Rule C: any interstitial on a page carrying protected content is caught", () => {
    const page = section("safety_warning", "<p>recall</p>") + "<dialog open>anything</dialog>";
    expect(scanRenderedPage(page).some((f) => f.rule === "interstitial")).toBe(true);
  });

  it("Rule D: an undisclosed affiliate link is caught", () => {
    const page = section("content", '<a class="affiliate-link" href="x">shop</a>');
    expect(scanRenderedPage(page).some((f) => f.rule === "disclosure_coverage")).toBe(true);
  });

  it("Rule E: dark-pattern markup is caught", () => {
    const page = section("content", '<div class="offer countdown">00:59 — hurry</div>');
    expect(scanRenderedPage(page).some((f) => f.rule === "dark_pattern")).toBe(true);
  });

  it("a compliant ordering passes: protected first, commercial strictly after", () => {
    const page =
      section("safety_warning", "<p>recall</p>") +
      section("required_items", "<p>glue</p>") +
      section("content", "<p>notes</p>") +
      section("disclosure", "<p>how we make money</p>");
    expect(scanRenderedPage(page)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Real screens across representative states                           */
/* ------------------------------------------------------------------ */

const PROV = record({ id: "prov:scan:1" });
const CORRECTED_PROV = record({ id: "prov:scan:corrected", correctionStatus: "corrected" });
const provs = { [PROV.id]: PROV, [CORRECTED_PROV.id]: CORRECTED_PROV };

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
    perMember: [{ memberOrdinal: 1, requiredUnits: 12 }],
    provenanceIds: [PROV.id],
    ...overrides,
  };
}

const mergeData = (lines: NetRequiredLine[]): MergeData => ({
  lines,
  requiredLineKeys: lines.filter((l) => l.optionality === "required").map((l) => l.key),
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
});

function basketOption(): BasketOption {
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
  };
}

const pareto = (options: BasketOption[]): BasketParetoResult => ({
  feasible: true,
  unfulfillableItems: [],
  excludedOffers: [],
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

const basketData = (p: BasketParetoResult): BasketData => ({
  basket: p,
  itemMatches: [],
  coveredLineKeys: [],
  optionalLineKeysExcluded: [],
  purchaseDate: "2026-08-08",
  state: "TX",
});

const recallEntry: RecallEntry = {
  recall: {
    id: "rec1",
    cpscRecallId: "FIXTURE-9001",
    recallNumber: "FX-26-101",
    recallDate: "2026-07-01",
    lastPublishDate: null,
    title: "Fixture slime kit recalled for a chemical hazard",
    description: "Synthetic recall fixture for layout tests.",
    cpscUrl: "https://example.com/fixture/recall/FX-26-101",
    hazardDescription: "Chemical",
    remedyDescription: "Refund",
    unitsAffected: null,
    isSynthetic: true,
    provenanceId: PROV.id,
    createdAt: T0_ISO,
  },
  products: [],
  provenanceIds: [PROV.id],
};

const recallCheck: RecallCheckData = {
  upc: "123456789012",
  matches: [recallEntry],
  decision: {
    action: "suppress",
    findings: [
      { reason: "recalled_or_under_review", action: "suppress", detail: "matches CPSC recall FX-26-101" },
    ],
  },
};

const sessionData: SessionData = {
  established: true,
  householdPresent: true,
  householdState: "TX",
  memberOrdinals: [1],
};

const checklistData: ChecklistData = {
  generatedAt: T0_ISO,
  memberOrdinals: [1],
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

const entitlementsFor = (active: boolean): EntitlementsData =>
  active
    ? {
        seasonPass: {
          kind: "season_pass",
          status: "active",
          validFrom: "2026-08-01T00:00:00.000Z",
          validUntil: "2027-08-01T00:00:00.000Z",
          provenanceIds: [PROV.id],
        },
        gates: { adFreeExtras: true },
        coreAccessNotice: CORE_ACCESS_NOTICE,
      }
    : { seasonPass: null, gates: { adFreeExtras: false }, coreAccessNotice: CORE_ACCESS_NOTICE };

const accountState = (active: boolean): Parameters<typeof renderAccount>[0] => ({
  kind: "ready",
  envelope: envelope(
    {
      alerts: envelope({ subscriptions: [] }, provs),
      entitlements: envelope(entitlementsFor(active), provs),
    },
    provs,
  ),
});

describe("route-tree scan — real screens across representative states", () => {
  const recalledBasket = renderBasket(
    {
      kind: "ready",
      envelope: envelope(basketData(pareto([basketOption()])), provs, {
        suppressions: [
          {
            subject: "offer:fixture-mart:FXM-SLIME-01",
            decision: recallCheck.decision,
          },
        ],
        sources: [
          {
            sourceId: "affiliate_feeds",
            stale: true,
            ageSeconds: 26 * 3600,
            storedAt: "2026-08-03T10:00:00.000Z",
            circuitState: "closed",
            degraded: "cache_fallback",
          },
        ],
      }),
    },
    { view: null, daysUntilNeeded: 4 },
  );

  const correctedPlan = renderPlan({
    kind: "ready",
    envelope: envelope(mergeData([mergeLine({ provenanceIds: [CORRECTED_PROV.id] })]), provs),
  });

  const cases: Record<string, Screen> = {
    "home": renderHome(),
    "intake form": renderIntake({ kind: "form", tab: "paste" }),
    "household": renderHousehold({
      kind: "ready",
      envelope: envelope({ session: sessionData, inventory: { items: [] } }, provs),
    }),
    "plan (stale finding + corrected provenance)": correctedPlan,
    "checklist": renderChecklist(
      { kind: "ready", envelope: envelope(checklistData, provs) },
      { storeMode: false },
    ),
    "basket (recalled + stale + deadline)": recalledBasket,
    "capsule form": renderCapsule({ kind: "form" }),
    "trends (empty)": renderTrends({ kind: "ready", envelope: envelope({ cards: [] }, provs) }),
    "item (recall banner + disclosure section)": renderItem(
      {
        kind: "ready",
        envelope: envelope(
          { productSlug: "fixture-gel-pen", trend: null, recallCheck: envelope(recallCheck, provs) },
          provs,
        ),
      },
      "fixture-gel-pen",
    ),
    "safety (matches + list)": renderSafety({
      kind: "ready",
      envelope: envelope(
        { recalls: envelope({ recalls: [recallEntry] }, provs), check: envelope(recallCheck, provs) },
        provs,
      ),
    }),
    "budget (required spend + price ranges)": renderBudget({
      kind: "ready",
      envelope: envelope(
        {
          checklist: envelope(checklistData, provs),
          basket: envelope(basketData(pareto([basketOption()])), provs),
        },
        provs,
      ),
    }),
    "deals (deadline windows)": renderDeals({
      kind: "ready",
      envelope: envelope(
        { session: sessionData, basket: envelope(basketData(pareto([basketOption()])), provs) },
        provs,
      ),
    }),
    "methodology": renderMethodology(),
    "account (no pass, checkout entry)": renderAccount(accountState(false), { fixtureMode: true }),
    "account (entitled)": renderAccount(accountState(true), { fixtureMode: true }),
  };

  for (const [name, screen] of Object.entries(cases)) {
    it(`${name}: zero §1.2 findings in the rendered document`, () => {
      const page = doc(screen);
      expect(scanRenderedPage(page)).toEqual([]);
    });
  }

  it("the account checkout entry point exists, after all protected content, dark-pattern free", () => {
    const page = doc(renderAccount(accountState(false), { fixtureMode: true }));
    const upsellAt = page.indexOf('data-upsell="season-pass"');
    const assistanceAt = page.indexOf("section-assistance_resource");
    expect(upsellAt).toBeGreaterThan(-1);
    expect(assistanceAt).toBeGreaterThan(-1);
    expect(upsellAt).toBeGreaterThan(assistanceAt);
    expect(page).toContain("Checkout is switched off in this validation beta");
    expect(page).toContain(CORE_ACCESS_NOTICE);
  });

  it("an entitled account shows the active pass instead of the upsell", () => {
    const page = doc(renderAccount(accountState(true), { fixtureMode: true }));
    expect(page).not.toContain("data-upsell=");
    expect(page).toContain("Active through 2027-08-01");
    expect(page).toContain(CORE_ACCESS_NOTICE);
  });
});

/* ------------------------------------------------------------------ */
/* Synthetic editorial surface — the only place a slot may ever mount  */
/* ------------------------------------------------------------------ */

describe("synthetic editorial surface — slots legal only here, entitlement-suppressible", () => {
  const article = (extra: Screen["sections"]): Screen => ({
    title: "Synthetic editorial guide (test-only)",
    description: "Synthetic editorial surface for placement-rule proofs.",
    activeNav: null,
    container: "page",
    sections: [
      { kind: "content", body: html`<h1>Synthetic guide</h1><p>Guide body copy.</p>` },
      ...extra,
    ],
  });

  it("an editorial article with its ad slot after all content renders and scans clean", () => {
    const page = doc(article(editorialAdSections("editorial_article", null)));
    expect(page).toContain('class="ad-slot"');
    expect(page).toContain('data-slot-id="editorial-inline-rect"');
    expect(scanRenderedPage(page)).toEqual([]);
  });

  it("the ad-free entitlement removes the slot from the same surface", () => {
    const page = doc(article(editorialAdSections("editorial_article", { adFreeExtras: true })));
    expect(page).not.toContain('class="ad-slot"');
    expect(scanRenderedPage(page)).toEqual([]);
  });

  it("protected content below the slot: the composer throws before shipping", () => {
    const sections = [
      ...editorialAdSections("editorial_article", null),
      { kind: "deadline" as const, body: html`<p>shopping deadline</p>` },
    ];
    expect(() => doc(article(sections))).toThrow(SlotPlacementError);
  });

  it("...and the outside scanner catches the same layout if the composer were bypassed", () => {
    const bypassed =
      section("content", "<h1>Synthetic guide</h1>") +
      section("ad_slot", '<div class="ad-slot" data-slot-id="editorial-inline-rect">x</div>') +
      section("deadline", "<p>shopping deadline</p>");
    const findings = scanRenderedPage(bypassed);
    expect(findings.some((f) => f.rule === "commercial_section_order")).toBe(true);
    expect(findings.some((f) => f.rule === "commercial_unit_position")).toBe(true);
  });

  it("monetized links on an editorial surface pass ONLY with their adjacent disclosures", () => {
    const link = decorateOutboundLink({
      deepLinkUrl: "https://example.com/fixture/fixture-supply-co/FSC-A-118",
      retailerSlug: "fixture-supply-co",
    }) as MonetizedLink;
    const withDisclosure = doc(
      article([{ kind: "content", body: renderMonetizedLink(link, "Fixture Supply Co") }]),
    );
    expect(scanRenderedPage(withDisclosure)).toEqual([]);
    const stripped = withDisclosure.replace(/<span class="affiliate-disclosure">[^<]*<\/span>/, "");
    expect(scanRenderedPage(stripped).some((f) => f.rule === "disclosure_coverage")).toBe(true);
  });
});
