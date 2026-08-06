/**
 * Phase 5 endpoint contract tests on real workerd (D1 + KV + R2), in fixture
 * mode: every endpoint, its error paths, Turnstile + rate limiting, Stripe
 * entitlements (§1.2: never gating core data), the mandated basket pipeline
 * order with P4-3 byte-identity to the algorithm module, and the §1.4
 * response-shape walk over every envelope this suite produced.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  T0,
  T_HOLIDAY,
  makeClient,
  ocrDocFor,
  uploadBytes,
  contentObjectKey,
  confirmItemsFromReview,
  dumpAllTables,
  householdIdOf,
  clearSourceCaches,
} from "./api-helpers";
import type { WorkerClient } from "./api-helpers";
import { FIXTURE_LIBRARY } from "../src/index";
import { FIXTURE_STRIPE_SIGNATURE, STRIPE_SIGNATURE_HEADER } from "../src/api/stripe";
import { computeMergePlan, deriveBasketInputs } from "../src/api/plan";
import { deriveCandidates, lookupSalesTax } from "../src/api/catalog";
import { createSourcePipelines, serveSource } from "../src/api/sources";
import { ensureBrand, listHouseholdRequirements, listInventory } from "../src/api/store";
import { optimizeBasket } from "../src/algorithms/basket";
import type { TaxHolidayWindowInput } from "../src/algorithms/basket";
import { provenanceDefect } from "../src/ingestion/provenance";
import type { ProvenanceRecord } from "../src/contracts/provenance";

const TURNSTILE = { "x-turnstile-token": "fixture-turnstile-pass" };

/** Seeds the two-child household plan used by merge/basket/checklist tests. */
async function seedPlan(client: WorkerClient): Promise<void> {
  const paste = await client.call("POST", "/api/intake/paste", {
    body: { text: "12 glue sticks\n2 wide ruled composition notebooks" },
  });
  expect(paste.status).toBe(200);
  const confirm1 = await client.call("POST", "/api/lists/confirm", {
    body: {
      intakeId: paste.body.data.intakeId,
      intakeMethod: "paste",
      schoolYear: "2026-2027",
      gradeLevel: "3",
      memberOrdinal: 1,
      state: "TX",
      items: confirmItemsFromReview(paste.body.data.review),
    },
  });
  expect(confirm1.status).toBe(201);
  const confirm2 = await client.call("POST", "/api/lists/confirm", {
    body: {
      intakeId: `manual_${client.deps.ids()}`,
      intakeMethod: "manual",
      schoolYear: "2026-2027",
      gradeLevel: "K",
      memberOrdinal: 2,
      items: [
        { productTypeSlug: "glue-stick", quantity: 6 },
        { productTypeSlug: "crayons", quantity: 24 },
      ],
    },
  });
  expect(confirm2.status).toBe(201);
  const inventory = await client.call("POST", "/api/inventory", {
    body: {
      items: [
        { productTypeSlug: "glue-stick", quantity: 4, condition: "new" },
        { productTypeSlug: "glue-stick", quantity: 3, condition: "usable" },
      ],
    },
  });
  expect(inventory.status).toBe(201);
}

/** §1.4 walk: every provenanceIds entry in `data` resolves to a complete record. */
function walkEnvelope(envelope: unknown): number {
  const body = envelope as {
    data: unknown;
    provenance: Record<string, ProvenanceRecord>;
  };
  let factNodes = 0;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if ("provenanceIds" in record) {
      factNodes += 1;
      const ids = record["provenanceIds"] as unknown[];
      expect(Array.isArray(ids) && ids.length > 0, "fact node without provenance").toBe(true);
      for (const id of ids) {
        const prov = body.provenance[id as string];
        expect(prov, `unresolvable provenance id ${String(id)}`).toBeDefined();
        expect(provenanceDefect(prov!)).toBeNull();
      }
    }
    Object.values(record).forEach(walk);
  };
  walk(body.data);
  return factNodes;
}

describe("session — anonymous-first, opaque, no account anywhere", () => {
  it("establishes an opaque HttpOnly cookie and reuses it without reissuing", async () => {
    const client = makeClient({ idPrefix: "sess" });
    const first = await client.call("GET", "/api/session");
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ established: true, householdPresent: true });
    expect(first.headers.get("set-cookie")).toContain("HttpOnly");
    // Opaque: the cookie carries an id, not identity — and nothing echoes it.
    const token = client.cookie!;
    expect(token).toMatch(/^k8p_sid=st_/);
    const again = await client.call("GET", "/api/session");
    expect(again.headers.get("set-cookie")).toBeNull();
    expect(again.body.data.memberOrdinals).toEqual([]);
  });
});

describe("intake endpoints", () => {
  it("paste returns the mandatory review payload with item provenance", async () => {
    const client = makeClient({ idPrefix: "p" });
    const result = await client.call("POST", "/api/intake/paste", {
      body: { text: "12 glue sticks" },
    });
    expect(result.status).toBe(200);
    expect(result.body.data.review.requiresUserConfirmation).toBe(true);
    expect(result.body.data.review.items).toHaveLength(1);
    expect(result.body.data.itemProvenance[0].provenanceIds).toHaveLength(1);
    walkEnvelope(result.body);
  });

  it("manual intake rejects unknown slugs WITHOUT echoing them (422)", async () => {
    const client = makeClient({ idPrefix: "m" });
    const result = await client.call("POST", "/api/intake/manual", {
      body: { items: [{ productTypeSlug: "Zephyrines-secret-item", quantity: 1 }] },
    });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe("validation_failed");
    expect(JSON.stringify(result.body)).not.toContain("Zephyrine");
  });

  it("upload requires Turnstile: missing -> 403 turnstile_required, bad -> turnstile_failed", async () => {
    const client = makeClient({ idPrefix: "u1" });
    const missing = await client.call("POST", "/api/intake/upload", {
      rawBody: "bytes",
      headers: { "content-type": "image/png" },
    });
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("turnstile_required");
    const bad = await client.call("POST", "/api/intake/upload", {
      rawBody: "bytes",
      headers: { "content-type": "image/png", "x-turnstile-token": "wrong" },
    });
    expect(bad.status).toBe(403);
    expect(bad.body.error.code).toBe("turnstile_failed");
  });

  it("upload parses through the fixture OCR replay and leaves R2 EMPTY", async () => {
    const text = "6 glue sticks\n24 crayons";
    const bytes = new TextEncoder().encode(text);
    const objectKey = await contentObjectKey(bytes);
    const client = makeClient({ idPrefix: "u2", ocrDoc: ocrDocFor(objectKey, text) });
    const result = await uploadBytes(client, bytes);
    expect(result.status).toBe(200);
    const slugs = result.body.data.review.items.map(
      (i: { proposed: { productTypeSlug: string } }) => i.proposed.productTypeSlug,
    );
    expect(slugs).toEqual(["glue-stick", "crayons"]);
    const { objects } = await env.UPLOAD_BUFFER.list({ prefix: "uploads/" });
    expect(objects).toEqual([]);
  });

  it("unlabeled fixture uploads fail closed with actionable copy and leave R2 EMPTY", async () => {
    const client = makeClient({ idPrefix: "u-empty-ocr" });
    const result = await uploadBytes(client, new TextEncoder().encode("synthetic upload"));

    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe("upload_unreadable");
    expect(result.body.error.message).toContain("live OCR is disabled");
    const { objects } = await env.UPLOAD_BUFFER.list({ prefix: "uploads/" });
    expect(objects).toEqual([]);
  });

  it("upload rejects non-image/PDF bodies (400) and rate-limits after 5 in a minute (429)", async () => {
    const text = "1 glue stick";
    const bytes = new TextEncoder().encode(text);
    const objectKey = await contentObjectKey(bytes);
    const client = makeClient({ idPrefix: "u3", ocrDoc: ocrDocFor(objectKey, text) });
    const wrongType = await client.call("POST", "/api/intake/upload", {
      rawBody: "hello",
      headers: { "content-type": "text/plain", ...TURNSTILE },
    });
    expect(wrongType.status).toBe(400);

    for (let i = 0; i < 4; i += 1) {
      expect((await uploadBytes(client, bytes)).status).toBe(200);
    }
    const limited = await uploadBytes(client, bytes);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    expect(limited.headers.get("retry-after")).toBeTruthy();
    // Injected clock refills the bucket — no real timers anywhere.
    client.setNow(T0 + 60_000);
    expect((await uploadBytes(client, bytes)).status).toBe(200);
  });
});

describe("confirm -> lists -> inventory (P3-2: controlled fields only)", () => {
  it("persists confirmed requirements as user_confirmed with resolvable provenance", async () => {
    const client = makeClient({ idPrefix: "c1" });
    await seedPlan(client);
    const lists = await client.call("GET", "/api/lists");
    expect(lists.body.data.lists).toHaveLength(2);
    const child1 = lists.body.data.lists.find(
      (l: { memberOrdinals: number[] }) => l.memberOrdinals[0] === 1,
    );
    expect(child1.verificationStatus).toBe("user_confirmed");
    expect(child1.requirements).toHaveLength(2);
    const notebook = child1.requirements.find(
      (r: { productTypeSlug: string }) => r.productTypeSlug === "composition-notebook",
    );
    expect(notebook.rulingStyle).toBe("wide_ruled");
    walkEnvelope(lists.body);
    const inventory = await client.call("GET", "/api/inventory");
    expect(inventory.body.data.items).toHaveLength(2);
    walkEnvelope(inventory.body);
  });

  it("ignores smuggled free-text fields: nothing beyond the allowlist reaches D1", async () => {
    const client = makeClient({ idPrefix: "c2" });
    const confirm = await client.call("POST", "/api/lists/confirm", {
      body: {
        intakeId: "smuggle-test",
        intakeMethod: "paste",
        schoolYear: "2026-2027",
        memberOrdinal: 1,
        items: [
          {
            productTypeSlug: "glue-stick",
            quantity: 2,
            // Fields NOT on the contract — must be structurally ignored:
            originalText: "SMUGGLEDPIIVALUE Room 4127",
            interpretation: "SMUGGLEDPIIVALUE",
            notes: "SMUGGLEDPIIVALUE",
          },
        ],
      },
    });
    expect(confirm.status).toBe(201);
    const dump = await dumpAllTables();
    expect(dump).not.toContain("SMUGGLEDPIIVALUE");
    expect(JSON.stringify(client.logs)).not.toContain("SMUGGLEDPIIVALUE");
  });

  it("refuses a free-text requiredBrandSlug: 422, never echoed, no brands row, nothing in D1 (P5-1)", async () => {
    const client = makeClient({ idPrefix: "c4" });
    const before = await env.DB.prepare(`SELECT COUNT(*) AS n FROM brands`).first<{ n: number }>();
    const confirm = await client.call("POST", "/api/lists/confirm", {
      body: {
        intakeId: "brand-channel-test",
        intakeMethod: "manual",
        schoolYear: "2026-2027",
        memberOrdinal: 1,
        items: [
          {
            productTypeSlug: "glue-stick",
            quantity: 1,
            brandRequirement: "required",
            // PII-shaped prose on the one field round 1 checked for presence only:
            requiredBrandSlug: "BRANDPIIVALUE Room 4127",
          },
        ],
      },
    });
    expect(confirm.status).toBe(422);
    expect(confirm.body.error.code).toBe("validation_failed");
    expect(JSON.stringify(confirm.body)).not.toContain("BRANDPIIVALUE");
    const after = await env.DB.prepare(`SELECT COUNT(*) AS n FROM brands`).first<{ n: number }>();
    expect(after!.n).toBe(before!.n); // the GLOBAL brands table gained nothing
    const dump = await dumpAllTables();
    expect(dump).not.toContain("BRANDPIIVALUE");
    expect(JSON.stringify(client.logs)).not.toContain("BRANDPIIVALUE");
  });

  it("store.ensureBrand independently refuses non-lexicon slugs (P5-1 defense in depth)", async () => {
    // Bypasses the route + parse pipeline entirely: even if a future parsing
    // change dropped its vocabulary check, the store still refuses.
    const client = makeClient({ idPrefix: "c5" });
    await expect(
      ensureBrand(client.deps.db, "free text brand attempt", client.deps.clock),
    ).rejects.toThrow(/controlled brand vocabulary/);
    const row = await env.DB.prepare(`SELECT id FROM brands WHERE id = ?`)
      .bind("brand:free text brand attempt")
      .first();
    expect(row).toBeNull();
    expect(await dumpAllTables()).not.toContain("free text brand attempt");
  });

  it("rejects malformed confirm requests: bad school year, bad ordinal, unresolved slug", async () => {
    const client = makeClient({ idPrefix: "c3" });
    const base = {
      intakeId: "x",
      intakeMethod: "paste",
      schoolYear: "2026-2027",
      memberOrdinal: 1,
      items: [{ productTypeSlug: "glue-stick", quantity: 1 }],
    };
    expect(
      (await client.call("POST", "/api/lists/confirm", { body: { ...base, schoolYear: "26" } }))
        .status,
    ).toBe(400);
    expect(
      (await client.call("POST", "/api/lists/confirm", { body: { ...base, memberOrdinal: 0 } }))
        .status,
    ).toBe(400);
    expect(
      (
        await client.call("POST", "/api/lists/confirm", {
          body: { ...base, items: [{ productTypeSlug: "not-a-slug", quantity: 1 }] },
        })
      ).status,
    ).toBe(422);
  });
});

describe("merge + checklist — net-required math over D1 state", () => {
  it("merges two children minus condition-weighted inventory (18 - 5.5 -> buy 13)", async () => {
    const client = makeClient({ idPrefix: "mg" });
    await seedPlan(client);
    const merge = await client.call("GET", "/api/plan/merge");
    expect(merge.status).toBe(200);
    const glue = merge.body.data.lines.find(
      (l: { productTypeSlug: string }) => l.productTypeSlug === "glue-stick",
    );
    expect(glue.grossRequiredUnits).toBe(18);
    expect(glue.usableInventoryUnits).toBe(5.5);
    expect(glue.netRequiredUnits).toBe(12.5);
    expect(glue.unitsToBuy).toBe(13);
    expect(glue.perMember).toEqual([
      { memberOrdinal: 1, requiredUnits: 12 },
      { memberOrdinal: 2, requiredUnits: 6 },
    ]);
    expect(merge.body.data.lines).toHaveLength(3);
    expect(merge.body.data.requiredLineKeys).toHaveLength(3);
    walkEnvelope(merge.body);
  });

  it("checklist payload is printable-complete with display names and per-member detail", async () => {
    const client = makeClient({ idPrefix: "ck" });
    await seedPlan(client);
    const checklist = await client.call("GET", "/api/plan/checklist");
    expect(checklist.body.data.memberOrdinals).toEqual([1, 2]);
    expect(checklist.body.data.lines).toHaveLength(3);
    const glue = checklist.body.data.lines.find(
      (l: { productTypeSlug: string }) => l.productTypeSlug === "glue-stick",
    );
    expect(glue.displayName).toBe("glue sticks");
    expect(glue.unitsToBuy).toBe(13);
    expect(walkEnvelope(checklist.body)).toBeGreaterThanOrEqual(3);
  });

  it("returns an empty plan (not an error, not an account prompt) without a session", async () => {
    const client = makeClient({ idPrefix: "mg0" });
    const merge = await client.call("GET", "/api/plan/merge");
    expect(merge.status).toBe(200);
    expect(merge.body.data.lines).toEqual([]);
    expect(JSON.stringify(merge.body)).not.toMatch(/account|sign.?up|log.?in/i);
  });
});

describe("basket — Pareto set, pipeline order, P4-3 byte-identity", () => {
  it("serves the FULL frontier with tax-holiday caveats and visible exclusions", async () => {
    const client = makeClient({ idPrefix: "b1" });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    const result = await client.call("POST", "/api/plan/basket", {
      body: { daysUntilNeeded: 4 },
    });
    expect(result.status).toBe(200);
    const basket = result.body.data.basket;
    expect(basket.feasible).toBe(true);
    expect(basket.options).toHaveLength(18);
    expect(basket.frontier).toHaveLength(3);
    // Never one false "optimal": four labeled views, no such key anywhere.
    expect(JSON.stringify(result.body.data)).not.toMatch(/"(optimal|best|recommended|winner)"/);
    expect(basket.views.lowestCost.landedCostCents).toBe(984);
    expect(basket.views.lowestCost.costComplete).toBe(false);
    expect(basket.views.fewestStops.landedCostCents).toBe(1004);
    expect(basket.views.fewestStops.stops).toBe(1);
    expect(basket.views.highestConfidence.lowConfidenceCount).toBe(2);
    // TX fixture holiday (unverified): tax 0 WITH the surviving caveat.
    for (const option of basket.options) {
      expect(option.taxCents).toBe(0);
      expect(option.taxCaveats[0]).toContain("UNVERIFIED");
    }
    // Out-of-stock exclusion is visible, never silent (§1.5).
    expect(basket.excludedOffers).toContainEqual({
      offerKey: "fixture-depot:FXD-70388",
      detail: "out of stock",
    });
    // Match reports: every line had all three retailers gate-eligible.
    expect(
      result.body.data.itemMatches.map((m: { eligibleCount: number }) => m.eligibleCount),
    ).toEqual([3, 3, 3]);
    expect(result.body.meta.sources.map((s: { sourceId: string }) => s.sourceId).sort()).toEqual(
      ["affiliate_feeds", "cpsc_recalls", "state_tax_holidays"],
    );
    walkEnvelope(result.body);
  });

  it("is byte-identical to optimizeBasket over the same derived inputs (P4-3)", async () => {
    const client = makeClient({ idPrefix: "b2" });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    const result = await client.call("POST", "/api/plan/basket", {
      body: { daysUntilNeeded: 4 },
    });

    // Independent recomputation through the exported pipeline pieces.
    const deps = client.deps;
    const householdId = await householdIdOf(client);
    const rows = await listHouseholdRequirements(deps.db, householdId);
    const inventory = await listInventory(deps.db, householdId);
    const merge = computeMergePlan(rows, inventory);
    const pipelines = createSourcePipelines(deps);
    const offersEnv = await serveSource(pipelines.offers);
    const recallsEnv = await serveSource(pipelines.recalls);
    const holidaysEnv = await serveSource(pipelines.taxHolidays);
    const candidates = deriveCandidates(
      offersEnv.records,
      deps.fixtures.catalog,
      deps.fixtures.logistics,
      deps.clock,
    );
    const holidays: TaxHolidayWindowInput[] = holidaysEnv.records.map((r) => ({
      state: r.record.holiday.state,
      startsOn: r.record.holiday.startsOn,
      endsOn: r.record.holiday.endsOn,
      categories: r.record.categories.map((c) => ({
        category: c.category,
        priceCapCents: c.priceCapCents,
      })),
      verified: false,
      provenanceId: r.provenance.id,
    }));
    const tax = lookupSalesTax("TX", deps.fixtures.taxRates, deps.clock);
    const inputs = deriveBasketInputs({
      merge,
      candidatesBySlug: candidates.bySlug,
      recallRefs: recallsEnv.records.flatMap((r) =>
        r.record.products.map((p) => ({ recallId: p.recallId, upc: p.upc })),
      ),
      holidays,
      state: "TX",
      salesTaxRate: tax.rate,
      salesTaxBasis: tax.assumption,
      purchaseDate: "2026-08-08",
      daysUntilNeeded: 4,
      nowMs: deps.clock(),
    });
    const direct = optimizeBasket(inputs.items, inputs.offers, inputs.ctx);

    // BYTE-IDENTICAL: the API neither collapses nor re-ranks the result.
    expect(JSON.stringify(result.body.data.basket)).toBe(JSON.stringify(direct));

    // And every offer's matchScore is exactly the match-gate score (0.7222
    // for 13 glue units into 6-packs; 1.0 for exact-fit lines).
    const glueOffers = inputs.offers.filter((o) => o.itemKey.startsWith("glue-stick"));
    expect(glueOffers.map((o) => o.matchScore)).toEqual([0.7222, 0.7222, 0.7222]);
  });

  it("suppresses recall-matched offers from EVERY option before optimization", async () => {
    const recalledOffers = {
      ...FIXTURE_LIBRARY.offers,
      records: FIXTURE_LIBRARY.offers.records.map((r) =>
        r.sku === "FXM-GLUE-06" ? { ...r, upc: "FIXTURE-UPC-0007" } : r,
      ),
    };
    const client = makeClient({
      idPrefix: "b3",
      fixtures: { ...FIXTURE_LIBRARY, offers: recalledOffers },
    });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    await clearSourceCaches(); // storage is shared across tests in this file
    const result = await client.call("POST", "/api/plan/basket", { body: {} });
    const serialized = JSON.stringify(result.body.data.basket);
    expect(serialized).not.toContain("FXM-GLUE-06");
    expect(result.body.data.basket.feasible).toBe(true); // two glue offers remain
    const recallNotes = result.body.suppressions.filter(
      (s: { decision: { findings: { reason: string }[] } }) =>
        s.decision.findings[0]?.reason === "recalled_or_under_review",
    );
    expect(recallNotes).toHaveLength(1);
    expect(recallNotes[0].subject).toBe("offer:fixture-mart:FXM-GLUE-06");
  });

  it("flags deadline-unmeetable views when the window is too short (§1.5 trigger 8)", async () => {
    const client = makeClient({ idPrefix: "b4" });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    const result = await client.call("POST", "/api/plan/basket", {
      body: { daysUntilNeeded: 1 },
    });
    const deadlineNotes = result.body.suppressions.filter(
      (s: { subject: string; decision: { findings: { reason: string }[] } }) =>
        s.subject.startsWith("view:") &&
        s.decision.findings[0]?.reason === "deadline_unmeetable",
    );
    expect(deadlineNotes.length).toBeGreaterThan(0);
  });

  it("suppresses stale offers entirely after the 7-day threshold — basket goes infeasible, never guessed", async () => {
    const client = makeClient({ idPrefix: "b5" });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    await client.call("POST", "/api/plan/basket", { body: {} }); // seeds offer cache at T_HOLIDAY
    client.setNow(T_HOLIDAY + 8 * 24 * 3600 * 1000);
    const result = await client.call("POST", "/api/plan/basket", { body: {} });
    expect(result.body.data.basket.feasible).toBe(false);
    expect(result.body.data.basket.unfulfillableItems.length).toBe(3);
    const staleNotes = result.body.suppressions.filter(
      (s: { decision: { findings: { reason: string }[] } }) =>
        s.decision.findings[0]?.reason === "price_stock_stale",
    );
    expect(staleNotes.length).toBe(9);
    // The source envelope itself carries the stale badge for the frontend.
    const offersSource = result.body.meta.sources.find(
      (s: { sourceId: string }) => s.sourceId === "affiliate_feeds",
    );
    expect(offersSource.stale).toBe(true);
  });
});

describe("alerts — anonymous in-app subscriptions (Turnstile + rate limit)", () => {
  it("subscribes with the fixture token, lists back with provenance, validates inputs", async () => {
    const client = makeClient({ idPrefix: "a1" });
    await client.call("GET", "/api/session");
    const subscribe = await client.call("POST", "/api/alerts/subscribe", {
      body: { alertKind: "recall", productTypeSlug: "glue-stick" },
      headers: TURNSTILE,
    });
    expect(subscribe.status).toBe(201);
    expect(subscribe.body.data.alertKind).toBe("recall");
    const list = await client.call("GET", "/api/alerts");
    expect(list.body.data.subscriptions).toHaveLength(1);
    expect(list.body.data.subscriptions[0].productTypeSlug).toBe("glue-stick");
    walkEnvelope(list.body);

    const badKind = await client.call("POST", "/api/alerts/subscribe", {
      body: { alertKind: "spam_me" },
      headers: TURNSTILE,
    });
    expect(badKind.status).toBe(400);
    const foreignList = await client.call("POST", "/api/alerts/subscribe", {
      body: { alertKind: "deadline", listId: "list_not_mine" },
      headers: TURNSTILE,
    });
    expect(foreignList.status).toBe(422);
    const noToken = await client.call("POST", "/api/alerts/subscribe", {
      body: { alertKind: "recall" },
    });
    expect(noToken.status).toBe(403);
  });

  it("rate-limits alert subscriptions after 5 in a minute", async () => {
    const client = makeClient({ idPrefix: "a2" });
    await client.call("GET", "/api/session");
    for (let i = 0; i < 5; i += 1) {
      const ok = await client.call("POST", "/api/alerts/subscribe", {
        body: { alertKind: "price_change" },
        headers: TURNSTILE,
      });
      expect(ok.status).toBe(201);
    }
    const limited = await client.call("POST", "/api/alerts/subscribe", {
      body: { alertKind: "price_change" },
      headers: TURNSTILE,
    });
    expect(limited.status).toBe(429);
  });
});

describe("entitlements — Season Pass gates ad-free extras ONLY (§1.2)", () => {
  it("entitlement-less sessions read a null pass plus the core-access notice", async () => {
    const client = makeClient({ idPrefix: "e1" });
    await client.call("GET", "/api/session");
    const result = await client.call("GET", "/api/entitlements");
    expect(result.body.data.seasonPass).toBeNull();
    expect(result.body.data.gates.adFreeExtras).toBe(false);
    expect(result.body.data.coreAccessNotice).toContain("without an account");
  });

  it("fixture webhook grants and refunds a pass; bad signatures are rejected", async () => {
    const client = makeClient({ idPrefix: "e2" });
    await client.call("GET", "/api/session");
    const event = {
      _fixture: true,
      eventId: "evt-1",
      eventType: "season_pass.purchased",
      householdRef: await householdIdOf(client),
      paymentRef: "fixture-pay-1",
      validFrom: "2026-08-01T00:00:00.000Z",
      validUntil: "2027-08-01T00:00:00.000Z",
    };
    const badSig = await client.call("POST", "/api/webhooks/stripe", {
      body: event,
      headers: { [STRIPE_SIGNATURE_HEADER]: "forged" },
    });
    expect(badSig.status).toBe(400);
    expect(badSig.body.error.code).toBe("webhook_verification_failed");

    const purchase = await client.call("POST", "/api/webhooks/stripe", {
      body: event,
      headers: { [STRIPE_SIGNATURE_HEADER]: FIXTURE_STRIPE_SIGNATURE },
    });
    expect(purchase.status).toBe(200);
    expect(purchase.body.data.entitlementId).toBeTruthy();

    const active = await client.call("GET", "/api/entitlements");
    expect(active.body.data.seasonPass.status).toBe("active");
    expect(active.body.data.gates.adFreeExtras).toBe(true);
    walkEnvelope(active.body);

    const refund = await client.call("POST", "/api/webhooks/stripe", {
      body: { ...event, eventId: "evt-2", eventType: "season_pass.refunded" },
      headers: { [STRIPE_SIGNATURE_HEADER]: FIXTURE_STRIPE_SIGNATURE },
    });
    expect(refund.status).toBe(200);
    const after = await client.call("GET", "/api/entitlements");
    expect(after.body.data.seasonPass).toBeNull();
  });

  it("core plan data is BYTE-IDENTICAL with and without a Season Pass", async () => {
    const client = makeClient({ idPrefix: "e3" });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    const before = {
      merge: await client.call("GET", "/api/plan/merge"),
      basket: await client.call("POST", "/api/plan/basket", { body: {} }),
      checklist: await client.call("GET", "/api/plan/checklist"),
      recalls: await client.call("GET", "/api/recalls"),
    };
    await client.call("POST", "/api/webhooks/stripe", {
      body: {
        _fixture: true,
        eventId: "evt-3",
        eventType: "season_pass.purchased",
        householdRef: await householdIdOf(client),
        paymentRef: "fixture-pay-3",
        validFrom: "2026-08-01T00:00:00.000Z",
        validUntil: "2027-08-01T00:00:00.000Z",
      },
      headers: { [STRIPE_SIGNATURE_HEADER]: FIXTURE_STRIPE_SIGNATURE },
    });
    const after = {
      merge: await client.call("GET", "/api/plan/merge"),
      basket: await client.call("POST", "/api/plan/basket", { body: {} }),
      checklist: await client.call("GET", "/api/plan/checklist"),
      recalls: await client.call("GET", "/api/recalls"),
    };
    for (const key of ["merge", "basket", "checklist", "recalls"] as const) {
      expect(JSON.stringify(after[key].body.data)).toBe(
        JSON.stringify(before[key].body.data),
      );
    }
  });
});

describe("§1.4 response-shape walk — every envelope this suite produced", () => {
  it("no ok-envelope ships a fact node without resolvable, complete provenance", async () => {
    const client = makeClient({ idPrefix: "walk" });
    await seedPlan(client);
    client.setNow(T_HOLIDAY);
    await client.call("GET", "/api/plan/merge");
    await client.call("POST", "/api/plan/basket", { body: { daysUntilNeeded: 4 } });
    await client.call("GET", "/api/plan/checklist");
    await client.call("GET", "/api/lists");
    await client.call("GET", "/api/inventory");
    await client.call("GET", "/api/recalls");
    await client.call("POST", "/api/recalls/check", { body: { upc: "FIXTURE-UPC-0007" } });
    let factNodes = 0;
    expect(client.envelopes.length).toBeGreaterThanOrEqual(10);
    for (const envelope of client.envelopes) factNodes += walkEnvelope(envelope);
    expect(factNodes).toBeGreaterThan(30);
  });
});
