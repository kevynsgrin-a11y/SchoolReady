/**
 * Phase 10 (compliance-officer) — THE deletion/export acceptance test, on
 * the real workerd D1:
 *
 *  1. Seed a session with data in EVERY user-data table (two lists across
 *     two child ordinals incl. a brand-required item, inventory, an alert
 *     subscription, a Season Pass entitlement via the real fixture-verified
 *     webhook) — plus a SECOND independent household as a bystander.
 *  2. GET /api/export returns everything user-linked (cross-checked against
 *     direct D1 queries) and nothing else (no token hash, no bystander
 *     data).
 *  3. ONE call to DELETE /api/session removes every user-linked row —
 *     proven by walking sqlite_master and scanning ALL rows of ALL tables
 *     for every tracer id, including the per-user provenance records.
 *  4. The bystander household and the GLOBAL taxonomy (product_types,
 *     brands + their seed provenance) survive untouched.
 *  5. The purge is idempotent and the old cookie is dead.
 *  6. The account screen wires both flows (form -> POST /account/delete ->
 *     303 + expired cookie; link -> GET /api/export).
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleUiRequest } from "../src/ui/server";
import { FIXTURE_STRIPE_SIGNATURE, STRIPE_SIGNATURE_HEADER } from "../src/api/stripe";
import { FIXTURE_TURNSTILE_PASS_TOKEN } from "../src/api/turnstile";
import { TURNSTILE_HEADER, SESSION_COOKIE } from "../src/api/contracts";
import { makeClient, householdIdOf } from "./api-helpers";
import type { WorkerClient } from "./api-helpers";

const confirmBody = (memberOrdinal: number, items: unknown[]) => ({
  intakeId: `del-intake-${memberOrdinal}`,
  intakeMethod: "manual",
  schoolYear: "2026-2027",
  gradeLevel: "3",
  memberOrdinal,
  state: "TX",
  items,
});

const GLUE = {
  productTypeSlug: "glue-stick",
  quantity: 6,
  unit: "each",
  optionality: "required",
  sourceConfidence: 1,
};

async function seedHousehold(client: WorkerClient, withExtras: boolean): Promise<void> {
  const first = await client.call("POST", "/api/lists/confirm", {
    body: confirmBody(1, [
      GLUE,
      withExtras
        ? {
            ...GLUE,
            productTypeSlug: "crayons",
            quantity: 1,
            brandRequirement: "required",
            requiredBrandSlug: "crayola",
          }
        : { ...GLUE, quantity: 2 },
    ]),
  });
  expect(first.status).toBe(201);
  if (!withExtras) return;
  const second = await client.call("POST", "/api/lists/confirm", {
    body: confirmBody(2, [{ ...GLUE, quantity: 4 }]),
  });
  expect(second.status).toBe(201);
  const inventory = await client.call("POST", "/api/inventory", {
    body: { items: [{ productTypeSlug: "glue-stick", quantity: 2, condition: "usable" }] },
  });
  expect(inventory.status).toBe(201);
  const alert = await client.call("POST", "/api/alerts/subscribe", {
    body: { alertKind: "recall" },
    headers: { [TURNSTILE_HEADER]: FIXTURE_TURNSTILE_PASS_TOKEN },
  });
  expect(alert.status).toBe(201);
  const purchase = await client.call("POST", "/api/webhooks/stripe", {
    body: {
      _fixture: true,
      eventId: "del-evt-1",
      eventType: "season_pass.purchased",
      householdRef: await householdIdOf(client),
      paymentRef: "fixture-pay-del-1",
      validFrom: "2026-08-01T00:00:00.000Z",
      validUntil: "2027-08-01T00:00:00.000Z",
    },
    headers: { [STRIPE_SIGNATURE_HEADER]: FIXTURE_STRIPE_SIGNATURE },
  });
  expect(purchase.status).toBe(200);
  expect(purchase.body.data.entitlementId).toBeTruthy();
}

async function tokenHashOf(client: WorkerClient): Promise<string> {
  const token = client.cookie?.split("=")[1];
  expect(token).toBeTruthy();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token!));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Serializes every application-table row for tracer scans. */
async function fullDump(): Promise<string> {
  const { results: tables } = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table'
     AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name NOT LIKE 'd1\\_%' ESCAPE '\\' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`,
  ).all<{ name: string }>();
  expect(tables.length).toBeGreaterThanOrEqual(11); // the walk actually saw the schema
  let dump = "";
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM "${name}"`).all();
    dump += JSON.stringify({ table: name, rows: results });
  }
  return dump;
}

/** Every provenanceIds entry anywhere in a JSON value. */
function collectIds(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectIds(v, out);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record["provenanceIds"])) {
    for (const id of record["provenanceIds"]) if (typeof id === "string") out.add(id);
  }
  for (const v of Object.values(record)) collectIds(v, out);
}

describe("§1.7 one-pass deletion + export (workers, real D1)", () => {
  const subject = makeClient({ idPrefix: "delA" });
  const bystander = makeClient({ idPrefix: "delB" });

  /** Ids that must be GONE from every table after the purge. */
  const tracers = new Set<string>();
  let subjectHousehold = "";
  let bystanderHousehold = "";
  let bystanderDump = "";

  it("seeds both households across every user-data table", async () => {
    await seedHousehold(subject, true);
    await seedHousehold(bystander, false);
    subjectHousehold = await householdIdOf(subject);
    bystanderHousehold = await householdIdOf(bystander);
    tracers.add(subjectHousehold);
    const hash = await tokenHashOf(subject);
    tracers.add(hash);
    tracers.add(hash.slice(0, 16)); // the session provenance id embeds this prefix
    // The turnstiled alert call left a KV rate-limit bucket keyed by the hash.
    expect(await env.SOURCE_KV.get(`ratelimit:alerts:${hash}`)).not.toBeNull();
    const { results } = await env.DB.prepare(
      `SELECT id FROM supply_lists WHERE household_id = ?`,
    )
      .bind(bystanderHousehold)
      .all<{ id: string }>();
    bystanderDump = JSON.stringify(results);
    expect(results.length).toBe(1);
  });

  it("GET /api/export returns everything user-linked, cross-checked against D1", async () => {
    const result = await subject.call("GET", "/api/export");
    expect(result.status).toBe(200);
    const data = result.body.data;
    const exported = JSON.stringify(result.body);

    // Shape: both lists, both children, inventory, alert, entitlement, state.
    expect(data.householdState).toBe("TX");
    expect(data.members.map((m: { ordinal: number }) => m.ordinal)).toEqual([1, 2]);
    expect(data.lists).toHaveLength(2);
    expect(data.lists.flatMap((l: { requirements: unknown[] }) => l.requirements)).toHaveLength(3);
    expect(data.inventory).toHaveLength(1);
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0].alertKind).toBe("recall");
    expect(data.entitlements).toHaveLength(1);
    expect(data.entitlements[0].status).toBe("active");

    // Completeness: every session-linked row id in D1 appears in the export.
    const rowIds = async (sql: string): Promise<string[]> => {
      const { results } = await env.DB.prepare(sql).bind(subjectHousehold).all<{ id: string }>();
      return results.map((r) => r.id);
    };
    const linkedIds = [
      ...(await rowIds(`SELECT id FROM supply_lists WHERE household_id = ?`)),
      ...(await rowIds(
        `SELECT r.id AS id FROM requirements r JOIN supply_lists sl ON sl.id = r.list_id WHERE sl.household_id = ?`,
      )),
      ...(await rowIds(`SELECT id FROM inventory_items WHERE household_id = ?`)),
      ...(await rowIds(`SELECT id FROM alert_subscriptions WHERE household_id = ?`)),
    ];
    expect(linkedIds.length).toBeGreaterThanOrEqual(7);
    for (const id of linkedIds) {
      expect(exported, `export is missing user-linked row ${id}`).toContain(id);
      tracers.add(id);
    }
    const { results: ents } = await env.DB.prepare(
      `SELECT id, provenance_id FROM entitlements WHERE household_id = ?`,
    )
      .bind(subjectHousehold)
      .all<{ id: string; provenance_id: string }>();
    expect(ents).toHaveLength(1);
    tracers.add(ents[0]!.id);
    tracers.add(ents[0]!.provenance_id);

    // ...and nothing else: no credential, no bystander data.
    expect(exported).not.toContain(await tokenHashOf(subject));
    expect(exported).not.toContain(bystanderHousehold);

    // Per-user provenance ids ride along as tracers for the purge proof.
    const provIds = new Set<string>();
    collectIds(data, provIds);
    expect(provIds.size).toBeGreaterThanOrEqual(7);
    for (const id of provIds) {
      // Global taxonomy provenance is shared vocabulary, not user data.
      if (id.startsWith("prov:taxonomy:") || id.startsWith("prov:brand:")) continue;
      tracers.add(id);
    }
  });

  it("ONE DELETE call purges every user-linked row — proven by walking sqlite_master", async () => {
    const purge = await subject.call("DELETE", "/api/session");
    expect(purge.status).toBe(200);
    expect(purge.body.data.purged).toBe(true);
    // 2 lists + 2 assignments + 3 requirements + 1 inventory + 1 alert +
    // 1 entitlement + 2 members + 1 session + 1 household = 14 data rows,
    // plus their per-user provenance records.
    expect(purge.body.data.rowsDeleted).toBeGreaterThanOrEqual(14 + 7);

    const dump = await fullDump();
    expect(tracers.size).toBeGreaterThanOrEqual(15);
    for (const tracer of tracers) {
      expect(dump, `user-linked value survived the purge: ${tracer}`).not.toContain(tracer);
    }

    // The KV rate-limit bucket keyed by the dead token hash is gone too.
    const hash = [...tracers].find((t) => t.length === 64)!;
    expect(await env.SOURCE_KV.get(`ratelimit:alerts:${hash}`)).toBeNull();
  });

  it("the bystander household and the global taxonomy survive untouched", async () => {
    const dump = await fullDump();
    expect(dump).toContain(bystanderHousehold);
    const { results } = await env.DB.prepare(
      `SELECT id FROM supply_lists WHERE household_id = ?`,
    )
      .bind(bystanderHousehold)
      .all<{ id: string }>();
    expect(JSON.stringify(results)).toBe(bystanderDump);
    // Shared vocabulary rows are NOT user data and must remain.
    expect(dump).toContain('"pt:glue-stick"');
    expect(dump).toContain('"brand:crayola"');
    expect(dump).toContain("prov:taxonomy:glue-stick");
  });

  it("the purge is idempotent and the old cookie is dead", async () => {
    const lists = await subject.call("GET", "/api/lists");
    expect(lists.body.data.lists).toEqual([]);
    const emptyExport = await subject.call("GET", "/api/export");
    expect(emptyExport.body.data.lists).toEqual([]);
    expect(emptyExport.body.data.members).toEqual([]);
    const again = await subject.call("DELETE", "/api/session");
    expect(again.status).toBe(200);
    expect(again.body.data).toMatchObject({ purged: true, rowsDeleted: 0 });
  });
});

describe("account screen wiring (UI server, workers)", () => {
  const client = makeClient({ idPrefix: "delC" });

  async function uiCall(
    method: "GET" | "POST",
    path: string,
    form?: Record<string, string>,
  ): Promise<Response> {
    const headers = new Headers();
    if (client.cookie) headers.set("cookie", client.cookie);
    let body: FormData | undefined;
    if (form) {
      body = new FormData();
      for (const [k, v] of Object.entries(form)) body.append(k, v);
    }
    const response = await handleUiRequest(
      new Request(`http://fixture.test${path}`, { method, headers, body }),
      client.deps,
    );
    if (response === null) throw new Error(`UI layer did not own ${method} ${path}`);
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) client.cookie = setCookie.split(";")[0] ?? null;
    return response;
  }

  it("the account page carries the delete form and the export link", async () => {
    const page = await (await uiCall("GET", "/account")).text();
    expect(page).toContain('action="/account/delete"');
    expect(page).toContain('href="/api/export"');
  });

  it("POST /account/delete purges the session's data and expires the cookie", async () => {
    await seedHousehold(client, false);
    const household = await householdIdOf(client);
    const response = await uiCall("POST", "/account/delete");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/account");
    const cookies = [...response.headers.entries()]
      .filter(([k]) => k === "set-cookie")
      .map(([, v]) => v)
      .join("; ");
    expect(cookies).toContain(`${SESSION_COOKIE}=;`);
    expect(cookies).toContain("Max-Age=0");
    const row = await env.DB.prepare(`SELECT id FROM households WHERE id = ?`)
      .bind(household)
      .first<{ id: string }>();
    expect(row).toBeNull();
  });
});
