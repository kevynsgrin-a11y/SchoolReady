/**
 * §1.2 route-tree scan, workers half — Phase 9 (monetization-engineer).
 *
 * Renders EVERY route in the UI server's route table (GET routes, the POST
 * review/result renders, and the 404) over the REAL router, D1, KV, and R2,
 * across representative states: anonymous, seeded session, recall-matched,
 * Season-Pass-entitled, and stale-clock. Every captured page goes through
 * src/monetization/route-scan.ts: no ad slot, sponsored unit, upsell, or
 * interstitial between the user and any protected content kind; 100%
 * adjacent disclosure on affiliate links (zero exist — checked, not
 * assumed); zero mounted ad slots anywhere; zero dark-pattern markers.
 *
 * Also proves the §1.2 paywall rule end to end: required list data, safety
 * warnings, and deadline surfaces render BYTE-IDENTICAL with and without a
 * Season Pass (the pass may change ad-free extras only).
 *
 * Route list mirrors src/ui/server.ts. If the server grows a route, add it
 * here AND to tests/seo-route-metadata.test.ts (gate finding P8-3).
 */
import { describe, expect, it } from "vitest";
import { handleUiRequest } from "../src/ui/server";
import { scanRenderedPage } from "../src/monetization/route-scan";
import { FIXTURE_STRIPE_SIGNATURE, STRIPE_SIGNATURE_HEADER } from "../src/api/stripe";
import { makeClient, householdIdOf, T0 } from "./api-helpers";
import type { WorkerClient } from "./api-helpers";

interface UiResult {
  status: number;
  html: string;
  location: string | null;
}

const captured: { label: string; html: string }[] = [];

async function ui(
  client: WorkerClient,
  method: "GET" | "POST",
  path: string,
  options: { form?: Record<string, string>; label?: string; capture?: boolean } = {},
): Promise<UiResult> {
  const headers = new Headers();
  if (client.cookie) headers.set("cookie", client.cookie);
  let body: FormData | undefined;
  if (options.form) {
    body = new FormData();
    for (const [key, value] of Object.entries(options.form)) body.append(key, value);
  }
  const response = await handleUiRequest(
    new Request(`http://fixture.test${path}`, { method, headers, body }),
    client.deps,
  );
  if (response === null) throw new Error(`UI layer did not own ${method} ${path}`);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0] ?? null;
  const html = response.status === 303 ? "" : await response.text();
  if (html.startsWith("<!doctype html>") && options.capture !== false) {
    captured.push({ label: options.label ?? `${method} ${path}`, html });
  }
  return { status: response.status, html, location: response.headers.get("location") };
}

/** The server's HTML routes (src/ui/server.ts switch) — keep in sync (P8-3). */
const GET_ROUTES_ANONYMOUS = [
  "/",
  "/intake",
  "/capsule",
  "/methodology",
  "/plan/basket",
  "/budget",
  "/deals",
  "/safety",
  "/plan",
  "/plan/checklist",
  "/household",
  "/trends",
  "/account",
  "/admin/status",
  "/item/fixture-gel-pen",
] as const;

const GET_ROUTES_SESSION = [
  ...GET_ROUTES_ANONYMOUS,
  "/plan/checklist?mode=store",
  "/plan/basket?days=6",
  "/safety?upc=FIXTURE-UPC-0007", // matches the fixture CPSC recall — recalled state
] as const;

/** Surfaces whose bytes may never depend on an entitlement (§1.2). */
const PROTECTED_SURFACES = [
  "/plan",
  "/plan/checklist",
  "/plan/basket?days=6",
  "/safety",
  "/safety?upc=FIXTURE-UPC-0007",
  "/budget",
  "/deals",
] as const;

describe("§1.2 route-tree scan over the real server", () => {
  const client = makeClient({ idPrefix: "mon" });

  it("renders every route anonymously (crawler view)", async () => {
    for (const path of GET_ROUTES_ANONYMOUS) {
      const result = await ui(client, "GET", path, { label: `anon GET ${path}` });
      expect([200, 404].includes(result.status), `${path} -> ${result.status}`).toBe(true);
    }
    const missing = await ui(client, "GET", "/no-such-page", { label: "anon 404" });
    expect(missing.status).toBe(404);
  });

  it("seeds a real plan through the UI forms (session state)", async () => {
    const review = await ui(client, "POST", "/intake/manual", {
      form: { productTypeSlug: "glue-stick", quantity: "6", unit: "each", optionality: "required" },
      label: "POST /intake/manual review render",
    });
    expect(review.status).toBe(200);
    const intakeId = /name="intakeId" value="([^"]+)"/.exec(review.html)?.[1];
    expect(intakeId).toBeTruthy();
    const confirmed = await ui(client, "POST", "/intake/confirm", {
      form: {
        intakeId: intakeId!,
        intakeMethod: "manual",
        itemCount: "1",
        "item-0-include": "on",
        "item-0-product": "glue-stick",
        "item-0-quantity": "6",
        "item-0-unit": "each",
        "item-0-optionality": "required",
        "item-0-confidence": "1",
        memberOrdinal: "1",
        schoolYear: "2026-2027",
        gradeLevel: "3",
        state: "TX",
      },
    });
    expect(confirmed.status).toBe(303);
    const inventory = await ui(client, "POST", "/household/inventory", {
      form: { productTypeSlug: "glue-stick", quantity: "2", condition: "new" },
    });
    expect(inventory.status).toBe(303);
  });

  it("renders every route with the session, including POST review/result renders", async () => {
    for (const path of GET_ROUTES_SESSION) {
      const result = await ui(client, "GET", path, { label: `session GET ${path}` });
      expect(result.status, path).toBe(200);
    }
    const paste = await ui(client, "POST", "/intake/paste", {
      form: { text: "6 glue sticks\n2 boxes of crayons" },
      label: "POST /intake/paste review render",
    });
    expect(paste.status).toBe(200);
    const capsule = await ui(client, "POST", "/capsule", {
      form: {
        category: "tops",
        climateBand: "temperate",
        daysBetweenWashes: "3",
        reserveDays: "2",
        usableExisting: "1",
        uniformRequired: "on", // exercises the dress_code_restriction section
      },
      label: "POST /capsule result render (dress-code state)",
    });
    expect(capsule.status).toBe(200);
    expect(capsule.html).toContain("section-dress_code_restriction");
  });

  it("recalled state: the UPC check surfaces the fixture recall above everything commercial", async () => {
    const safety = captured.find((p) => p.label === "session GET /safety?upc=FIXTURE-UPC-0007");
    expect(safety).toBeDefined();
    expect(safety!.html).toContain("1 recall match for this UPC");
    expect(safety!.html).toContain("section-safety_warning");
  });

  it("§1.2 paywall rule: protected surfaces are byte-identical with and without a Season Pass", async () => {
    const before = new Map<string, string>();
    for (const path of PROTECTED_SURFACES) {
      before.set(path, (await ui(client, "GET", path, { capture: false })).html);
    }

    // Purchase through the REAL Phase 5 fixture-verified Stripe webhook.
    const purchase = await client.call("POST", "/api/webhooks/stripe", {
      body: {
        _fixture: true,
        eventId: "mon-evt-1",
        eventType: "season_pass.purchased",
        householdRef: await householdIdOf(client),
        paymentRef: "fixture-pay-mon-1",
        validFrom: "2026-08-01T00:00:00.000Z",
        validUntil: "2027-08-01T00:00:00.000Z",
      },
      headers: { [STRIPE_SIGNATURE_HEADER]: FIXTURE_STRIPE_SIGNATURE },
    });
    expect(purchase.status).toBe(200);
    expect(purchase.body.data.entitlementId).toBeTruthy();

    for (const path of PROTECTED_SURFACES) {
      const after = await ui(client, "GET", path, { label: `entitled GET ${path}` });
      expect(after.html, `${path} must not change with an entitlement`).toBe(before.get(path));
    }
  });

  it("account: checkout entry point before purchase, active pass after — never a payment form", async () => {
    const account = captured.find((p) => p.label === "session GET /account");
    expect(account).toBeDefined();
    expect(account!.html).toContain('data-upsell="season-pass"');
    expect(account!.html).toContain("Checkout is switched off in this validation beta");
    expect(account!.html).not.toContain('type="card"');

    const entitled = await ui(client, "GET", "/account", { label: "entitled GET /account" });
    expect(entitled.html).toContain("Active through 2027-08-01");
    expect(entitled.html).not.toContain("data-upsell=");
  });

  it("stale state: aged sources still render with zero commercial intrusion", async () => {
    client.setNow(T0 + 30 * 3600 * 1000);
    const basket = await ui(client, "GET", "/plan/basket?days=6", { label: "stale GET /plan/basket" });
    expect(basket.status).toBe(200);
    const status = await ui(client, "GET", "/admin/status", { label: "stale GET /admin/status" });
    expect(status.status).toBe(200);
  });

  it("EVERY captured page passes the §1.2 scan: no ads/upsells/interstitials before protected content, 100% disclosure, no dark patterns", () => {
    expect(captured.length).toBeGreaterThanOrEqual(30);
    for (const page of captured) {
      const findings = scanRenderedPage(page.html);
      expect(findings, `${page.label}: ${findings.map((f) => f.detail).join(" | ")}`).toEqual([]);
    }
  });

  it("zero ad slots are mounted on any rendered route in this beta", () => {
    for (const page of captured) {
      expect(page.html, page.label).not.toContain('class="ad-slot"');
      expect(page.html, page.label).not.toContain("data-slot-id");
    }
  });
});
