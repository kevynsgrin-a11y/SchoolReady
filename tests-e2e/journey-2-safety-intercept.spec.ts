/**
 * §6 critical journey 2 — safety intercept, end to end over a real Worker.
 *
 * Outcome asserted precisely: a recalled product is on the family's list ->
 * (a) the recall warning renders ABOVE all commercial content, (b) the
 * recalled offer is suppressed from EVERY basket option before
 * optimization, and (c) an alternative is offered with its OWN provenance.
 *
 * Mechanics: the shipped fixture feed deliberately contains no recalled
 * UPC, and a running miniflare holds its KV store exclusively — so this
 * spec boots its OWN wrangler dev (:8788, dedicated persist dir) after
 * seeding the offers SWR cache with a batch built by the REAL fixture
 * adapter (src/ingestion/adapters/product-feeds.ts) from the shipped
 * fixture documents, with exactly one change: the fixture-mart glue SKU
 * carries the UPC of the fixture CPSC recall — the same sanctioned
 * technique as tests-workers/api-endpoints.test.ts ("suppresses
 * recall-matched offers from EVERY option"). No number is invented; every
 * price/provenance byte comes from the fixture documents through the real
 * adapter code path.
 */
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { createProductFeedFixtureAdapter } from "../src/ingestion/adapters/product-feeds";
import type { ProductFeedRow } from "../src/ingestion/adapters/product-feeds";
import type { FixtureDocument } from "../src/ingestion/types";
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  addManualList,
  gotoStable,
  shot,
  topOf,
} from "./helpers";

const B = "http://127.0.0.1:8788";
const PERSIST = join(process.cwd(), ".wrangler", "e2e-recall-state");
const RECALLED_SKU = "FXM-GLUE-06"; // fixture-mart's glue offer (fixtures/product-feeds)

let server: ChildProcess | null = null;
let recalledUpc = "";
let recallTitle = "";

async function waitForHealthz(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${B}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("journey-2 wrangler dev did not become healthy");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

test.beforeAll(async () => {
  test.setTimeout(180_000);

  // The recalled UPC comes FROM the recall fixture — never typed in here.
  const recallsDoc = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "cpsc-recalls", "recalls.fixture.json"), "utf8"),
  ) as { records: { Title: string; Products: { UPC: string }[] }[] };
  recalledUpc = recallsDoc.records[0]!.Products[0]!.UPC;
  recallTitle = recallsDoc.records[0]!.Title;

  // Fresh persist dir + migrations for the dedicated server.
  rmSync(PERSIST, { recursive: true, force: true });
  mkdirSync(PERSIST, { recursive: true });
  execSync(
    `npx wrangler d1 migrations apply k8-planner-fixture --local --persist-to "${PERSIST}"`,
    { stdio: "pipe" },
  );

  // Build the recalled offers batch through the REAL adapter, then store it
  // in the exact SwrCache envelope shape ({storedAt, payload}) under the
  // pipeline's cache key, before the server ever opens the store.
  const offersDoc = JSON.parse(
    readFileSync(join(process.cwd(), "fixtures", "product-feeds", "offers.fixture.json"), "utf8"),
  ) as FixtureDocument<ProductFeedRow>;
  const doc: FixtureDocument<ProductFeedRow> = {
    ...offersDoc,
    records: offersDoc.records.map((r) =>
      r.sku === RECALLED_SKU ? { ...r, upc: recalledUpc } : r,
    ),
  };
  const batch = await createProductFeedFixtureAdapter(doc, () => Date.now()).fetchBatch();
  const envelope = JSON.stringify({ storedAt: new Date().toISOString(), payload: batch });
  const envelopePath = join(PERSIST, "recalled-offers-envelope.json");
  writeFileSync(envelopePath, envelope);
  execSync(
    `npx wrangler kv key put --binding SOURCE_KV "cache:affiliate_feeds" --path "${envelopePath}" --local --persist-to "${PERSIST}"`,
    { stdio: "pipe" },
  );

  server = spawn(
    "npx",
    ["wrangler", "dev", "--port", "8788", "--ip", "127.0.0.1", "--persist-to", PERSIST],
    { cwd: process.cwd(), stdio: "ignore", detached: true },
  );
  await waitForHealthz(120_000);
});

test.afterAll(() => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
});

test.describe("journey 2 — recalled product on the list", () => {
  test("recall warning above ALL commercial content; offer out of EVERY option; alternative with its own provenance", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(DESKTOP_VIEWPORT);

    // The family's list contains the recalled product (glue sticks whose
    // fixture-mart offer now matches the fixture CPSC recall by UPC).
    await addManualList(page, { quantity: "6", memberValue: "1", base: B });

    await gotoStable(page, `${B}/plan/basket`);

    /* -- (a) recall warning above all commercial content -- */
    const banner = page.locator(".banner-recall[role='alert']").first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Recalled");
    await expect(banner).toContainText(`offer:fixture-mart:${RECALLED_SKU}`);
    // Structural: the safety_warning section precedes every priced section.
    const sectionKinds = await page
      .locator("main section.page-section")
      .evaluateAll((els) => els.map((el) => el.className));
    const safetyIdx = sectionKinds.findIndex((c) => c.includes("section-safety_warning"));
    const firstPriced = sectionKinds.findIndex((c) => c.includes("section-required_items"));
    expect(safetyIdx, "safety_warning section exists").toBeGreaterThanOrEqual(0);
    expect(safetyIdx, "safety warning precedes priced content").toBeLessThan(firstPriced);
    // Geometric: the banner sits above the views nav, above every frontier
    // card, and above every ledger (prices) on the page.
    const bannerTop = await topOf(page, ".banner-recall");
    expect(bannerTop).toBeLessThan(await topOf(page, '[aria-label="Basket views"]'));
    expect(bannerTop).toBeLessThan(await topOf(page, ".card"));
    expect(bannerTop).toBeLessThan(await topOf(page, ".ledger"));
    // Hit test: nothing overlays the warning (no interstitial can eat the tap).
    const hitIsBanner = await banner.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit !== null && el.contains(hit);
    });
    expect(hitIsBanner, "recall banner is hit-testable, not covered").toBe(true);

    /* -- (b) the recalled offer is out of EVERY option -- */
    // Rendered side: no priced section mentions the recalled retailer at all
    // (the only glue offers left are fixture-depot / fixture-supply-co).
    const pricedSections = page.locator("main section.section-required_items");
    const pricedText = (await pricedSections.allInnerTexts()).join("\n");
    expect(pricedText).not.toContain("fixture-mart");
    expect(pricedText).toMatch(/undominated option/);
    // API side, same session: the serialized Pareto result contains no
    // trace of the recalled SKU, remains feasible on the alternatives, and
    // carries the §1.5 suppression note naming the recalled offer.
    // (Cookie attached explicitly: the session cookie is Secure, which
    // APIRequestContext will not send over plain http even to 127.0.0.1.)
    const sid = (await page.context().cookies()).find((c) => c.name === "k8p_sid");
    expect(sid, "anonymous session cookie present").toBeTruthy();
    const api = await page.request.post(`${B}/api/plan/basket`, {
      data: {},
      headers: { cookie: `k8p_sid=${sid!.value}` },
    });
    expect(api.ok()).toBe(true);
    const body = (await api.json()) as {
      data: { basket: { feasible: boolean } };
      provenance: Record<string, { source: string }>;
      suppressions: { subject: string; decision: { findings: { reason: string }[] } }[];
    };
    expect(JSON.stringify(body.data.basket)).not.toContain(RECALLED_SKU);
    expect(body.data.basket.feasible).toBe(true);
    const recallNote = body.suppressions.find(
      (s) => s.subject === `offer:fixture-mart:${RECALLED_SKU}`,
    );
    expect(recallNote?.decision.findings[0]?.reason).toBe("recalled_or_under_review");
    // The alternative's priced facts cite the retailer-offers source in the
    // envelope's provenance map (its OWN provenance, not the recall's).
    const provenanceSources = Object.values(body.provenance).map((p) => p.source);
    expect(provenanceSources).toContain("fixture:retailer-offers-2026-v1");

    /* -- (c) alternative offered, with its OWN provenance -- */
    await gotoStable(page, `${B}/plan/basket?view=lowest-cost`);
    await expect(page.locator(".banner-recall[role='alert']").first()).toBeVisible();
    const column = page.locator(".retailer-column").first();
    await expect(column).toBeVisible();
    const retailer = await column.locator(".retailer-name").innerText();
    expect(retailer).not.toContain("fixture-mart");
    expect(retailer).toMatch(/fixture-(depot|supply-co) trip/);
    // The alternative's landed cost renders through the render guard with a
    // visible provenance line (§1.4): first source shown + "and N more
    // sources" (the offers source is asserted by id in the API provenance
    // map above — the visible line collapses multi-source facts by design).
    const expanded = page.locator("main section.section-required_items").first();
    await expect(expanded.locator(".ledger-total-value.double-rule").first()).toBeVisible();
    const provenance = expanded.locator(".provenance-line").first();
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText("fixture");
    await expect(provenance).toContainText("retrieved");
    await expect(provenance).toContainText("more sources");

    await shot(page, "basket-recall-desktop");
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStable(page, `${B}/plan/basket`);
    await expect(page.locator(".banner-recall[role='alert']").first()).toBeVisible();
    await shot(page, "basket-recall-mobile");
  });

  test("safety center intercept: the same recall renders alert-first above the check form", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStable(page, `${B}/safety?upc=${recalledUpc}`);
    const banner = page.locator(".banner-recall[role='alert']").first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("1 recall match for this UPC");
    await expect(banner).toContainText(recallTitle);
    const bannerTop = await topOf(page, ".banner-recall");
    expect(bannerTop).toBeLessThan(
      await topOf(page, 'form[aria-label="Check a product\'s UPC"]'),
    );
    // Every recall match links to the official notice with provenance shown.
    await expect(banner.locator(".provenance-line").first()).toBeVisible();
    // [P12-3 regression] The recall entry nested in the banner is READABLE:
    // its card text renders in ink on the white card, never white-on-white
    // (the defect this phase found on the intercept and fixed in styles.ts).
    const colors = await page.evaluate(() => {
      const card = document.querySelector(".banner-recall .card");
      const h3 = card?.querySelector("h3");
      if (!card || !h3) return null;
      return {
        cardBg: window.getComputedStyle(card).backgroundColor,
        text: window.getComputedStyle(h3).color,
      };
    });
    expect(colors).not.toBeNull();
    expect(colors!.text).not.toBe(colors!.cardBg);
    expect(colors!.text).not.toBe("rgb(255, 255, 255)");
    await shot(page, "safety-intercept-mobile");
  });
});
