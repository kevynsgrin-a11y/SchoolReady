/**
 * Phase 5 route policy (§1.2 precursor + anonymous-first, node) and contract
 * tests for the STATELESS endpoints (trend / capsule / recalls) — run
 * through the real router with a db that throws on touch, proving core
 * evidence and safety data need no storage, no session, and no account.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ROUTES } from "../src/api/routes";
import {
  assertRoutePolicies,
  PROTECTED_CATEGORIES,
  RoutePolicyError,
} from "../src/api/http";
import type { RouteDef } from "../src/api/http";
import { assertResponseProvenance } from "../src/api/provenance-gate";
import { provenanceDefect } from "../src/ingestion/provenance";
import { callApi, makeNodeDeps, T0 } from "./helpers/api";

const T_FRESH = Date.parse("2026-08-01T12:00:00.000Z"); // fixture signals are fresh here

describe("route table — §1.2: entitlements gate ad-free extras ONLY", () => {
  it("covers every mandated endpoint", () => {
    const patterns = ROUTES.map((r) => `${r.method} ${r.pattern}`).sort();
    expect(patterns).toEqual(
      [
        "GET /api/session",
        "POST /api/intake/paste",
        "POST /api/intake/manual",
        "POST /api/intake/upload",
        "POST /api/lists/confirm",
        "GET /api/lists",
        "POST /api/inventory",
        "GET /api/inventory",
        "GET /api/plan/merge",
        "POST /api/plan/basket",
        "GET /api/plan/checklist",
        "POST /api/capsule",
        "GET /api/trend/:slug",
        "GET /api/recalls",
        "POST /api/recalls/check",
        "POST /api/alerts/subscribe",
        "GET /api/alerts",
        "GET /api/entitlements",
        "POST /api/webhooks/stripe",
        // Phase 10 (compliance-officer) sanctioned extension: data rights.
        "GET /api/export",
        "DELETE /api/session",
      ].sort(),
    );
  });

  it("NO protected-category route (required data / safety / deadline) is entitlement-gated", () => {
    for (const route of ROUTES) {
      if (PROTECTED_CATEGORIES.includes(route.category)) {
        expect(
          route.entitlementGated,
          `${route.method} ${route.pattern} must never be entitlement-gated (§1.2)`,
        ).toBe(false);
      }
    }
    // In this beta NOTHING is gated — the flag exists for future extras only.
    expect(ROUTES.every((r) => !r.entitlementGated)).toBe(true);
  });

  it("the router REFUSES a route table that would gate protected content", () => {
    const gated: RouteDef = {
      method: "GET",
      pattern: "/api/plan/premium-merge",
      category: "core_required_data",
      session: "read",
      turnstile: false,
      rateLimit: null,
      entitlementGated: true,
      handler: () => Promise.resolve({ data: {} }),
    };
    expect(() => assertRoutePolicies([...ROUTES, gated])).toThrow(RoutePolicyError);
  });

  it("no route knows what an account is (anonymous-first, structurally)", () => {
    for (const route of ROUTES) {
      expect(route.pattern).not.toMatch(/account|login|signup|register|password|oauth/i);
      expect(["none", "read", "ensure"]).toContain(route.session);
    }
  });

  it("Turnstile + rate limiting sit on exactly the §2-mandated endpoints (upload, alerts)", () => {
    const turnstiled = ROUTES.filter((r) => r.turnstile).map((r) => r.pattern).sort();
    expect(turnstiled).toEqual(["/api/alerts/subscribe", "/api/intake/upload"]);
    const rateLimited = ROUTES.filter((r) => r.rateLimit !== null).map((r) => r.pattern).sort();
    expect(rateLimited).toEqual(["/api/alerts/subscribe", "/api/intake/upload"]);
    // Safety READS are never behind friction: recalls need no token at all.
    for (const route of ROUTES.filter((r) => r.pattern.startsWith("/api/recalls"))) {
      expect(route.turnstile).toBe(false);
      expect(route.rateLimit).toBeNull();
    }
  });
});

describe("contracts — §1.4: fact-bearing response types carry provenanceIds (P5-2)", () => {
  // The provenance-gate walker keys on the PRESENCE of `provenanceIds`; a
  // contract added without the field would silently opt out of the gate.
  // This suite forces every exported contract type into an explicit class,
  // so a future addition fails here until it is classified deliberately.
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const read = (rel: string): string => readFileSync(join(repoRoot, rel), "utf8");
  const contractsSource = read("src/api/contracts.ts");

  const exportedTypeNames = (source: string): string[] =>
    [...source.matchAll(/^export (?:interface|type) ([A-Za-z0-9_]+)/gm)].map((m) => m[1]!);

  /** Declaration slice from `export interface|type Name` to the next export. */
  function declBody(source: string, name: string): string {
    const match = new RegExp(`^export (?:interface|type) ${name}\\b`, "m").exec(source);
    if (!match) throw new Error(`declaration not found: ${name}`);
    const rest = source.slice(match.index);
    const next = /^export /m.exec(rest.slice(match[0].length));
    return next ? rest.slice(0, match[0].length + next.index) : rest;
  }

  /** Must LITERALLY declare provenanceIds (directly or on inline nodes). */
  const CARRIERS = [
    "IntakeData",
    "RequirementSummary",
    "InventorySummary",
    "ChecklistLine",
    "ChecklistGrouping", // [P12-4] store-grouping fact on the checklist
    "CapsuleData",
    "CapsuleCostPerWear", // [P12-1] cost-per-wear node on capsule lines
    "TrendData",
    "RecallEntry",
    "AlertsData",
    "EntitlementsData",
  ];

  /** Fact-bearing via composition: must reference the named carrier type. */
  const COMPOSITES: Record<string, string> = {
    ConfirmListData: "RequirementSummary",
    ExportData: "RequirementSummary", // Phase 10: data-rights export
    ListsData: "RequirementSummary",
    InventoryData: "InventorySummary",
    ChecklistData: "ChecklistLine",
    RecallsData: "RecallEntry",
    RecallCheckData: "RecallEntry",
    MergeData: "NetRequiredLine", // algorithm carrier (checked below)
    BasketData: "BasketParetoResult", // algorithm carrier (checked below)
  };

  /** Algorithm-side carriers: file + the interface that declares the ids. */
  const ALGORITHM_CARRIERS: Record<string, { file: string; declaring: string }> = {
    NetRequiredLine: { file: "src/algorithms/net-required.ts", declaring: "NetRequiredLine" },
    // The Pareto result carries provenance on every option it composes.
    BasketParetoResult: { file: "src/algorithms/basket.ts", declaring: "BasketOption" },
  };

  /** Deliberately NOT fact nodes — each entry states why (reviewed P5-2). */
  const NON_FACT: Record<string, string> = {
    SourceStatus: "meta.sources freshness/health badge input, not a rendered fact",
    SuppressionNote: "§1.5 explanation of what did NOT render",
    ResponseMeta: "envelope machinery",
    ApiOk: "envelope machinery (carries the provenance dictionary itself)",
    ApiErrorCode: "envelope machinery",
    ApiErr: "envelope machinery (errors ship no data)",
    ApiResponseBody: "envelope machinery",
    SessionData: "echo of user-volunteered session state; no world facts",
    PasteIntakeBody: "request body",
    ManualIntakeItemBody: "request body",
    ManualIntakeBody: "request body",
    ConfirmedRequirementInput: "request body",
    ConfirmListBody: "request body",
    InventoryItemBody: "request body",
    InventoryBody: "request body",
    BasketBody: "request body",
    CapsuleTimingBody: "request body",
    CapsuleCostPerWearBody: "request body", // [P12-1] price + wear-days inputs
    CapsuleBody: "request body",
    RecallCheckBody: "request body",
    AlertSubscribeBody: "request body",
    SeasonPassWebhookBody: "request body (processor -> worker)",
    ItemMatchReport: "§1.5 exclusion explanations (like SuppressionNote)",
    AlertKind: "closed enum",
    AlertSubscribeData: "creation ack; the fact-bearing read is AlertsData",
    WebhookAckData: "webhook ack; the fact-bearing read is EntitlementsData",
    SessionPurgeData:
      "Phase 10 deletion ack: a purge count, no world facts (the deleted data is gone by definition)",
  };

  it("every exported contract type is explicitly classified — additions cannot opt out silently", () => {
    const classified = [...CARRIERS, ...Object.keys(COMPOSITES), ...Object.keys(NON_FACT)].sort();
    expect(new Set(classified).size, "a type is classified twice").toBe(classified.length);
    expect(exportedTypeNames(contractsSource).sort()).toEqual(classified);
  });

  it("every provenance carrier literally declares provenanceIds", () => {
    for (const name of CARRIERS) {
      expect(
        declBody(contractsSource, name),
        `${name} must carry provenanceIds or the §1.4 walker never sees it`,
      ).toContain("provenanceIds");
    }
  });

  it("every composite references a carrier whose declaration carries provenanceIds", () => {
    for (const [name, carrier] of Object.entries(COMPOSITES)) {
      expect(declBody(contractsSource, name), `${name} must compose ${carrier}`).toContain(carrier);
      const algorithm = ALGORITHM_CARRIERS[carrier];
      if (algorithm) {
        const source = read(algorithm.file);
        if (algorithm.declaring !== carrier) {
          expect(
            declBody(source, carrier),
            `${carrier} must compose ${algorithm.declaring}`,
          ).toContain(algorithm.declaring);
        }
        expect(
          declBody(source, algorithm.declaring),
          `${algorithm.declaring} (${algorithm.file}) must carry provenanceIds`,
        ).toContain("provenanceIds");
      } else {
        expect(CARRIERS, `${carrier} must itself be a checked carrier`).toContain(carrier);
      }
    }
  });
});

describe("router — error envelopes", () => {
  it("404s unknown endpoints and 405s wrong methods, as typed envelopes", async () => {
    const { deps } = makeNodeDeps();
    const missing = await callApi(deps, "GET", "/api/nope");
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ ok: false, error: { code: "not_found" } });
    const wrongMethod = await callApi(deps, "POST", "/api/recalls");
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.body.error.code).toBe("method_not_allowed");
  });

  it("rejects malformed JSON bodies without echoing them", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", {
      rawBody: "{broken json with Zephyrine inside",
    });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("invalid_request");
    expect(JSON.stringify(result.body)).not.toContain("Zephyrine");
  });
});

describe("GET /api/trend/:slug — label + confidence + evidence ALWAYS together", () => {
  it("labels the 3-organic-family fixture product viral WITH its evidence", async () => {
    const { deps, setNow } = makeNodeDeps();
    setNow(T_FRESH);
    const result = await callApi(deps, "GET", "/api/trend/fixture-gel-pen");
    expect(result.status).toBe(200);
    const data = result.body.data;
    expect(data.label).toBe("viral");
    expect(data.organicPassingFamilies.length).toBeGreaterThanOrEqual(3);
    expect(data.familyEvaluations.length).toBeGreaterThanOrEqual(3);
    expect(typeof data.confidence).toBe("number");
    expect(data.reasons.length).toBeGreaterThan(0);
    assertResponseProvenance(data, result.body.provenance);
  });

  it("single-family spikes and unknown products fall back to insufficient_evidence", async () => {
    const { deps, setNow } = makeNodeDeps();
    setNow(T_FRESH);
    const single = await callApi(deps, "GET", "/api/trend/fixture-sticker-set");
    expect(single.body.data.label).toBe("insufficient_evidence");
    const unknown = await callApi(deps, "GET", "/api/trend/fixture-unknown-product");
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.label).toBe("insufficient_evidence");
    expect(unknown.body.data.confidence).toBe(0);
    // Even "no evidence" cites the dataset it consulted (§1.4).
    expect(unknown.body.data.provenanceIds.length).toBeGreaterThan(0);
    assertResponseProvenance(unknown.body.data, unknown.body.provenance);
  });

  it("sponsored-majority families yield paid_campaign_driven, never viral", async () => {
    const { deps, setNow } = makeNodeDeps();
    setNow(T_FRESH);
    const result = await callApi(deps, "GET", "/api/trend/fixture-clip-light");
    expect(result.body.data.label).toBe("paid_campaign_driven");
  });
});

describe("POST /api/capsule — ranges with visible assumptions", () => {
  const categories = [
    {
      category: "tops",
      climateBand: "temperate",
      daysBetweenWashes: 7,
      reserveDays: 2,
      usableExisting: 3,
      dressCode: null,
    },
  ];

  it("returns the hand-computed range {2, 6} with labeled assumptions", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", { body: { categories } });
    expect(result.status).toBe(200);
    const line = result.body.data.lines[0];
    expect(line.unitsRange).toEqual({ min: 2, max: 6 });
    expect(line.assumptions.length).toBeGreaterThanOrEqual(4);
    for (const record of Object.values(result.body.provenance)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(provenanceDefect(record as any)).toBeNull();
    }
    assertResponseProvenance(result.body.data, result.body.provenance);
  });

  it("uniform dress codes add one visible reserve day: range {2, 7}", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", {
      body: {
        categories: [
          {
            ...categories[0],
            dressCode: { solidColorsOnly: false, uniformRequired: true, allowedColors: null },
          },
        ],
      },
    });
    const line = result.body.data.lines[0];
    expect(line.unitsRange).toEqual({ min: 2, max: 7 });
    expect(line.dressCodeNotes[0]).toContain("uniform required");
  });

  it("[P12-1] cost-per-wear rides per line: hand-computed engine range + labeled wears basis", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", {
      body: { categories, costPerWear: { priceCents: 1299, seasonWearDays: 160 } },
    });
    expect(result.status).toBe(200);
    const cpw = result.body.data.lines[0].costPerWear;
    // Hand-computed: unitsRange {2,6} + 3 existing -> 5-9 pieces in rotation;
    // wears = round(160/pieces, 2); perWearCents = round(1299/wears, 2).
    expect(cpw.projectedWearsRange).toEqual({ min: 17.78, max: 32 });
    expect(cpw.perWearCentsRange).toEqual({ min: 40.59, max: 73.06 });
    expect(cpw.priceCents).toBe(1299);
    expect(cpw.seasonWearDays).toBe(160);
    const names = cpw.assumptions.map((a: { name: string }) => a.name);
    expect(names).toContain("price_per_piece_cents");
    expect(names).toContain("season_wear_days");
    expect(names).toContain("projected_wears_per_piece_range");
    for (const a of cpw.assumptions) {
      expect(["user_input", "model_constant"]).toContain(a.basis);
    }
    expect(cpw.provenanceIds.length).toBeGreaterThan(0);
    assertResponseProvenance(result.body.data, result.body.provenance);
  });

  it("[P12-1] no price input -> costPerWear is null, never a guessed price", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", { body: { categories } });
    expect(result.body.data.lines[0].costPerWear).toBeNull();
    const invalid = await callApi(deps, "POST", "/api/capsule", {
      body: { categories, costPerWear: { priceCents: 0, seasonWearDays: 160 } },
    });
    expect(invalid.status).toBe(400);
  });

  it("buy-now-vs-wait uses observed fixture history and never forecasts", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", {
      body: {
        categories,
        timing: {
          daysUntilNeeded: 30,
          typicalDeliveryDays: 3,
          currentPriceCents: 179,
          upc: "FIXTURE-UPC-0001",
        },
      },
    });
    const timing = result.body.data.timing;
    expect(timing.timing).toBe("buy_now"); // 179 <= observed median
    expect(timing.disclaimer).toContain("no price prediction");
    expect(timing.provenanceIds.length).toBe(2);
    assertResponseProvenance(result.body.data, result.body.provenance);
  });

  it("insufficient history -> insufficient_data, never a guessed median", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/capsule", {
      body: {
        categories,
        timing: {
          daysUntilNeeded: 30,
          typicalDeliveryDays: 3,
          currentPriceCents: 179,
          upc: "FIXTURE-UPC-NO-HISTORY",
        },
      },
    });
    expect(result.body.data.timing.timing).toBe("insufficient_data");
  });

  it("rejects unknown categories and non-positive integers (422/400)", async () => {
    const { deps } = makeNodeDeps();
    const badCategory = await callApi(deps, "POST", "/api/capsule", {
      body: { categories: [{ ...categories[0], category: "hats" }] },
    });
    expect(badCategory.status).toBe(400);
    const badDays = await callApi(deps, "POST", "/api/capsule", {
      body: { categories: [{ ...categories[0], daysBetweenWashes: 0 }] },
    });
    expect(badDays.status).toBe(422);
  });
});

describe("recalls endpoints — safety layer, sessionless and frictionless", () => {
  it("lists fixture recalls with provenance and source freshness meta", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "GET", "/api/recalls");
    expect(result.status).toBe(200);
    expect(result.body.data.recalls.length).toBeGreaterThanOrEqual(2);
    expect(result.body.meta.sources[0]).toMatchObject({
      sourceId: "cpsc_recalls",
      degraded: expect.any(String),
    });
    assertResponseProvenance(result.body.data, result.body.provenance);
  });

  it("matches a recalled UPC exactly and returns a suppress decision", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/recalls/check", {
      body: { upc: "FIXTURE-UPC-0007" },
    });
    expect(result.body.data.matches).toHaveLength(1);
    expect(result.body.data.matches[0].recall.cpscRecallId).toBe("FIXTURE-990001");
    expect(result.body.data.decision.action).toBe("suppress");
  });

  it("returns render (no match) for unknown UPCs — never a guessed match", async () => {
    const { deps } = makeNodeDeps();
    const result = await callApi(deps, "POST", "/api/recalls/check", {
      body: { upc: "FIXTURE-UPC-9999" },
    });
    expect(result.body.data.matches).toHaveLength(0);
    expect(result.body.data.decision.action).toBe("render");
  });

  it("recall staleness surfaces as a stale badge signal after the threshold", async () => {
    const { deps, setNow } = makeNodeDeps();
    setNow(T0);
    await callApi(deps, "GET", "/api/recalls"); // seeds the SWR cache at T0
    setNow(T0 + 7 * 3600 * 1000); // 7h later: > staleAfterSeconds (6h)
    const result = await callApi(deps, "GET", "/api/recalls");
    expect(result.body.meta.sources[0].stale).toBe(true);
    expect(result.body.meta.sources[0].ageSeconds).toBe(7 * 3600);
    // Stale-badged data still serves — an outage is never an error page.
    expect(result.body.data.recalls.length).toBeGreaterThanOrEqual(2);
  });
});
