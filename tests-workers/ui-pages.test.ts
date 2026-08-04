/**
 * Workers-runtime end-to-end: the REAL UI server over the REAL API router,
 * D1, KV, and R2 — a browser-shaped journey from paste to plan with
 * provenance visible on every fact, plus route hygiene (no ad slots on
 * planner surfaces, no emoji, branded 404, working offline shell markers).
 */
import { describe, expect, it } from "vitest";
import { BRAND } from "../config/brand";
import { handleUiRequest } from "../src/ui/server";
import { makeClient } from "./api-helpers";
import type { WorkerClient } from "./api-helpers";

const EMOJI_RE = new RegExp(
  "[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{1F1E6}-\\u{1F1FF}" +
    "\\u{2190}-\\u{21FF}\\u{2139}\\u{203C}\\u{2049}\\u{3030}\\u{303D}\\u{3297}\\u{3299}]",
  "u",
);

interface UiResult {
  status: number;
  html: string;
  location: string | null;
}

const capturedPages: string[] = [];

async function ui(
  client: WorkerClient,
  method: "GET" | "POST",
  path: string,
  form?: Record<string, string>,
): Promise<UiResult> {
  const headers = new Headers();
  if (client.cookie) headers.set("cookie", client.cookie);
  let body: FormData | undefined;
  if (form) {
    body = new FormData();
    for (const [key, value] of Object.entries(form)) body.append(key, value);
  }
  const response = await handleUiRequest(
    new Request(`http://fixture.test${path}`, { method, headers, body }),
    client.deps,
  );
  if (response === null) throw new Error(`UI layer did not own ${method} ${path}`);
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0] ?? null;
  const html = response.status === 303 ? "" : await response.text();
  if (html) capturedPages.push(html);
  return { status: response.status, html, location: response.headers.get("location") };
}

describe("UI pages — anonymous journey end to end", () => {
  const client = makeClient({ idPrefix: "ui" });

  it("homepage: five-second hero with the paste form, wordmark from config", async () => {
    const home = await ui(client, "GET", "/");
    expect(home.status).toBe(200);
    expect(home.html).toContain(BRAND.wordmark);
    expect(home.html).toContain('action="/intake/paste"');
    expect(home.html).toContain("/assets/ui.css");
  });

  it("manual intake renders the mandatory review screen and mints the anonymous cookie", async () => {
    const review = await ui(client, "POST", "/intake/manual", {
      productTypeSlug: "glue-stick",
      quantity: "6",
      unit: "each",
      optionality: "required",
    });
    expect(review.status).toBe(200);
    expect(client.cookie).toContain("k8p_sid=");
    expect(review.html).toContain("Confirm what we read");
    expect(review.html).toContain("glue sticks");
    expect(review.html).toContain('name="intakeId"');
    expect(review.html).toContain("provenance-line"); // §1.4 on parsed proposals
  });

  it("confirm persists ONLY controlled-vocabulary fields and redirects to the plan", async () => {
    const review = await ui(client, "POST", "/intake/manual", {
      productTypeSlug: "glue-stick",
      quantity: "6",
      unit: "each",
      optionality: "required",
    });
    const intakeId = /name="intakeId" value="([^"]+)"/.exec(review.html)?.[1];
    expect(intakeId).toBeTruthy();
    const confirmed = await ui(client, "POST", "/intake/confirm", {
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
    });
    expect(confirmed.status).toBe(303);
    expect(confirmed.location).toBe("/plan");
  });

  it("plan renders the Net-Required Stack with visible provenance", async () => {
    const plan = await ui(client, "GET", "/plan");
    expect(plan.status).toBe(200);
    expect(plan.html).toContain("net-required-stack");
    expect(plan.html).toContain("glue sticks");
    expect(plan.html).toContain("provenance-line");
    expect(plan.html).toContain("To buy");
  });

  it("inventory audit subtracts owned items from the plan", async () => {
    const saved = await ui(client, "POST", "/household/inventory", {
      productTypeSlug: "glue-stick",
      quantity: "2",
      condition: "new",
    });
    expect(saved.status).toBe(303);
    const household = await ui(client, "GET", "/household");
    expect(household.html).toContain("1 item marked as already at home");
    const plan = await ui(client, "GET", "/plan");
    expect(plan.html).toContain("Already at home");
  });

  it("checklist ships the offline in-store mode with big targets", async () => {
    const checklist = await ui(client, "GET", "/plan/checklist");
    expect(checklist.status).toBe(200);
    expect(checklist.html).toContain("data-checklist");
    expect(checklist.html).toContain('data-line-key="glue-stick|');
    const store = await ui(client, "GET", "/plan/checklist?mode=store");
    expect(store.html).toContain('class="store-mode"');
    expect(store.html).toContain("checklist-bar");
  });

  it("basket comparison serves four labeled views and never a single answer", async () => {
    const basket = await ui(client, "GET", "/plan/basket?days=6");
    expect(basket.status).toBe(200);
    for (const label of ["Lowest cost", "Fewest stops", "Fastest", "Highest confidence"]) {
      expect(basket.html).toContain(label);
    }
    expect(basket.html).toContain("undominated");
    expect(basket.html).not.toMatch(/\b(optimal|recommended)\b/i);
    expect(basket.html).not.toMatch(/\bbest\b/i);
  });

  it("budget and deals pages render from the same envelopes, caveats intact", async () => {
    const budget = await ui(client, "GET", "/budget");
    expect(budget.status).toBe(200);
    expect(budget.html).toContain("Required items to buy");
    const deals = await ui(client, "GET", "/deals");
    expect(deals.status).toBe(200);
    expect(deals.html).toContain("revenue department");
  });

  it("safety center lists CPSC recalls with credit and provenance", async () => {
    const safety = await ui(client, "GET", "/safety");
    expect(safety.status).toBe(200);
    expect(safety.html).toContain("U.S. Consumer Product Safety Commission");
    expect(safety.html).toContain("provenance-line");
  });

  it("item detail renders evidence + the truthful disclosure slot", async () => {
    const item = await ui(client, "GET", "/item/fixture-gel-pen");
    expect(item.status).toBe(200);
    expect(item.html).toContain("evidence-table");
    expect(item.html).toContain("How we make money on this page");
  });

  it("trend radar over the plan is honest about missing evidence", async () => {
    const trends = await ui(client, "GET", "/trends");
    expect(trends.status).toBe(200);
    expect(trends.html).toContain("Not enough evidence");
  });

  it("account page carries alerts, privacy, export, delete, and the core-access notice", async () => {
    const account = await ui(client, "GET", "/account");
    expect(account.status).toBe(200);
    expect(account.html).toContain("No alerts set");
    expect(account.html).toContain("always");
    expect(account.html).toContain("without an account");
  });

  it("provider status shows per-source freshness and fixture mode", async () => {
    const status = await ui(client, "GET", "/admin/status");
    expect(status.status).toBe(200);
    expect(status.html).toContain("cpsc_recalls");
    expect(status.html).toContain("Fixture data (live feed off)");
  });

  it("unknown routes get the branded 404, not a bare error", async () => {
    const missing = await ui(client, "GET", "/no-such-page");
    expect(missing.status).toBe(404);
    expect(missing.html).toContain("no page at this address");
    expect(missing.html).toContain(BRAND.wordmark);
  });

  it("stylesheet and manifest are served by the worker (brand from config)", async () => {
    const css = await ui(client, "GET", "/assets/ui.css");
    expect(css.status).toBe(200);
    expect(css.html).toContain("--color-ink: #25302A");
    const manifest = await ui(client, "GET", "/manifest.webmanifest");
    expect(manifest.html).toContain(BRAND.name);
  });

  it("hygiene across every captured page: no emoji, no ad slots, skip links everywhere", () => {
    expect(capturedPages.length).toBeGreaterThan(10);
    for (const page of capturedPages) {
      expect(EMOJI_RE.test(page)).toBe(false);
      if (page.startsWith("<!doctype html>")) {
        // No mounted ad slot on any planner/safety surface in this beta.
        expect(page).not.toContain('class="ad-slot"');
        expect(page).not.toContain("onclick=");
        expect(page).toContain("skip-link");
        expect(page).toContain('<html lang="en">');
      }
    }
  });
});
