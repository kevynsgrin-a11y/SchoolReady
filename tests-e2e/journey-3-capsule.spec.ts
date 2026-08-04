/**
 * §6 critical journey 3 — dress-code school + climate + laundry cadence +
 * existing wardrobe -> quantity RANGES with visible assumptions, PLUS
 * cost-per-wear and the buy-now-vs-wait verdict.
 *
 * Coverage (P12-1/P12-2 correction round, 2026-08-04): all three §6
 * journey-3 outcomes now drive through the SHIPPED capsule form end to
 * end — quantity ranges with labeled assumptions and the uniform rule
 * (test 1), the §1.5 unconfirmable-dress-code state (test 2), and
 * cost-per-wear + buy-now-vs-wait through the form's optional price and
 * timing fields (test 3, previously PARTIAL findings P12-1/P12-2). The
 * API-level test keeps both verdict branches + the cost-per-wear response
 * contract pinned against the real price-history fixture window.
 */
import { test, expect } from "@playwright/test";
import { DESKTOP_VIEWPORT, MOBILE_VIEWPORT, gotoStable, shot } from "./helpers";

test.describe("journey 3 — uniform + capsule planner", () => {
  test("capsule form -> ranges (never one number) with visible assumptions and the uniform dress-code rule", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStable(page, "/capsule");

    // Inputs: temperate climate, wash every 2 days, 1 buffer day, 3 usable
    // existing pieces, uniform required (the dress-code school).
    await page.locator("#cap-category").selectOption("tops");
    await page.locator("#cap-climate").selectOption("temperate");
    await page.locator("#cap-wash").fill("2");
    await page.locator("#cap-reserve").fill("1");
    await page.locator("#cap-existing").fill("3");
    await page.locator("#cap-uniform").check();
    await page.locator('form[action="/capsule"] button[type="submit"]').click();

    // Result is a RANGE (tops, temperate: 1-2 rewears; 2+1+1 uniform days
    // to cover; minus 3 existing -> 0 to 1), rendered as a range even here.
    const card = page.locator(".capsule-card-header").first();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Tops");
    const resultSection = page.locator("section.section-dress_code_restriction").first();
    await expect(resultSection).toBeVisible();
    await expect(resultSection.getByText(/^\d+ to \d+$/).first()).toBeVisible();
    await expect(resultSection.getByText("0 to 1")).toBeVisible();
    await expect(
      resultSection.getByText("assumes 1 to 2 wears per piece between washes"),
    ).toBeVisible();

    // The dress-code rule is visible, named, and explained.
    await expect(
      resultSection.getByText(
        "uniform required: +1 reserve day because uniform garments have no substitutes",
      ),
    ).toBeVisible();

    // Every number that produced the range is a LABELED assumption with its
    // basis — user input vs model constant — visible on the card.
    const assumptions = resultSection.locator(".assumptions").first();
    await expect(assumptions).toBeVisible();
    await expect(assumptions).toContainText("days between washes");
    await expect(assumptions).toContainText("[user input]");
    await expect(assumptions).toContainText("rewears per unit range");
    await expect(assumptions).toContainText("1-2 (tops, temperate climate band)");
    await expect(assumptions).toContainText("[model constant]");
    await expect(assumptions).toContainText("usable existing units");
    await expect(assumptions).toContainText("3");

    // The capsule facts render through the §1.4 guard with provenance.
    await expect(resultSection.locator(".provenance-line").first()).toBeVisible();
    await shot(page, "capsule-results-mobile");
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoStable(page, "/capsule");
    await shot(page, "capsule-form-desktop", false);
  });

  test("no-dress-code state is designed: filter off, said plainly (§1.5 unconfirmable policy)", async ({
    page,
  }) => {
    await gotoStable(page, "/capsule");
    await page.locator("#cap-wash").fill("3");
    await page.locator("#cap-reserve").fill("1");
    await page.locator("#cap-existing").fill("0");
    // uniform NOT checked -> no confirmed dress code -> the filter is OFF
    // and the interface says so instead of guessing.
    await page.locator('form[action="/capsule"] button[type="submit"]').click();
    await expect(
      page.getByText("We cannot confirm this school's dress code from an official source"),
    ).toBeVisible();
  });

  test("cost-per-wear and buy-now-vs-wait render through the shipped form (P12-1/P12-2 closed)", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStable(page, "/capsule");

    // Same wardrobe as test 1 (tops, temperate, wash 2, buffer 1, 3 owned,
    // uniform -> range 0 to 1, so 3-4 pieces in rotation), plus the optional
    // price/timing inputs: $1.99 a piece, 120 wear days, needed in 30 days,
    // 3-day delivery, the fixture price-history UPC.
    await page.locator("#cap-category").selectOption("tops");
    await page.locator("#cap-climate").selectOption("temperate");
    await page.locator("#cap-wash").fill("2");
    await page.locator("#cap-reserve").fill("1");
    await page.locator("#cap-existing").fill("3");
    await page.locator("#cap-uniform").check();
    await page.locator("#cap-price").fill("1.99");
    await page.locator("#cap-wear-days").fill("120");
    await page.locator("#cap-needed").fill("30");
    await page.locator("#cap-delivery").fill("3");
    await page.locator("#cap-upc").fill("FIXTURE-UPC-0001");
    await page.locator('form[action="/capsule"] button[type="submit"]').click();

    // Cost-per-wear (P12-1): a Sum Rule money ledger on the category card —
    // operands (price, projected wears) above the rule, the computed range
    // beneath it. Hand-computed: 199c over 30-40 wears -> 4.97-6.63c,
    // displayed at whole cents.
    const resultSection = page.locator("section.section-dress_code_restriction").first();
    await expect(resultSection).toBeVisible();
    const cpw = resultSection.locator(".capsule-cost-per-wear").first();
    await expect(cpw).toBeVisible();
    await expect(cpw.getByText("$0.05 to $0.07 per wear")).toBeVisible();
    await expect(cpw.getByText("$1.99")).toBeVisible();
    await expect(cpw.getByText("30 to 40")).toBeVisible();

    // The wears basis is visible and labeled — assumptions, never facts.
    await expect(cpw.getByText("Wears basis")).toBeVisible();
    await expect(
      cpw.getByText("30-40 (120 wear days over 3-4 pieces in rotation)"),
    ).toBeVisible();
    await expect(cpw.getByText("[user input]").first()).toBeVisible();

    // The card's shared §1.4 provenance line covers the money fact.
    await expect(resultSection.locator(".provenance-line").first()).toBeVisible();

    // Buy-now-vs-wait (P12-2): 199c is at the observed rolling median (199)
    // with no deadline pressure -> buy_now, reasoning + no-forecast
    // disclaimer rendered in the protected deadline section.
    const deadline = page.locator("section.section-deadline").first();
    await expect(deadline).toBeVisible();
    await expect(deadline.getByText("Buy now or wait?")).toBeVisible();
    await expect(deadline.getByText("Buy now", { exact: true })).toBeVisible();
    await expect(
      deadline.getByText("current price is at or below the observed rolling median"),
    ).toBeVisible();
    await expect(deadline.getByText(/no price prediction is made/)).toBeVisible();
    await expect(deadline.locator(".provenance-line").first()).toBeVisible();
    await shot(page, "capsule-cost-per-wear-mobile");

    // Second branch through the SAME form: $99.99 (9999c) sits above the
    // observed median with no deadline pressure -> waiting is reasonable.
    await page.locator("#cap-category").selectOption("tops");
    await page.locator("#cap-climate").selectOption("temperate");
    await page.locator("#cap-wash").fill("2");
    await page.locator("#cap-reserve").fill("1");
    await page.locator("#cap-existing").fill("3");
    await page.locator("#cap-uniform").check();
    await page.locator("#cap-price").fill("99.99");
    await page.locator("#cap-wear-days").fill("120");
    await page.locator("#cap-needed").fill("30");
    await page.locator("#cap-delivery").fill("3");
    await page.locator("#cap-upc").fill("FIXTURE-UPC-0001");
    await page.locator('form[action="/capsule"] button[type="submit"]').click();
    const wait = page.locator("section.section-deadline").first();
    await expect(wait.getByText("Waiting is reasonable")).toBeVisible();
    await expect(
      wait.getByText("current price is above the observed rolling median"),
    ).toBeVisible();
  });

  test("buy-now-vs-wait over the live API: deadline pressure and observed-median branches, provenance attached", async ({
    page,
  }) => {
    // Branch 1 — deadline pressure forces buy_now (no price forecast).
    const categories = [
      {
        category: "tops",
        climateBand: "temperate",
        daysBetweenWashes: 2,
        reserveDays: 1,
        usableExisting: 3,
        dressCode: { solidColorsOnly: false, uniformRequired: true, allowedColors: null },
      },
    ];
    const buyNow = await page.request.post("/api/capsule", {
      data: {
        categories,
        timing: {
          daysUntilNeeded: 3,
          typicalDeliveryDays: 4,
          currentPriceCents: 199,
          upc: "FIXTURE-UPC-0001",
        },
      },
    });
    expect(buyNow.ok()).toBe(true);
    const buyNowBody = (await buyNow.json()) as {
      data: { timing: { timing: string; reason: string; disclaimer: string; provenanceIds: string[] } };
    };
    expect(buyNowBody.data.timing.timing).toBe("buy_now");
    expect(buyNowBody.data.timing.reason).toContain("deadline pressure");
    expect(buyNowBody.data.timing.disclaimer).toContain("no price prediction is made");
    expect(buyNowBody.data.timing.provenanceIds.length).toBeGreaterThan(0);

    // Branch 2 — no deadline pressure, price above the observed rolling
    // median (real fixture price-history window, >=5 observations) ->
    // waiting is reasonable; the history window's provenance rides along.
    const wait = await page.request.post("/api/capsule", {
      data: {
        categories,
        costPerWear: { priceCents: 9999, seasonWearDays: 120 },
        timing: {
          daysUntilNeeded: 30,
          typicalDeliveryDays: 4,
          currentPriceCents: 9999,
          upc: "FIXTURE-UPC-0001",
        },
      },
    });
    expect(wait.ok()).toBe(true);
    const waitBody = (await wait.json()) as {
      data: {
        lines: {
          costPerWear: {
            projectedWearsRange: { min: number; max: number };
            perWearCentsRange: { min: number; max: number };
            provenanceIds: string[];
          } | null;
        }[];
        timing: { timing: string; reason: string; provenanceIds: string[] };
      };
      provenance: Record<string, { source: string }>;
    };
    expect(waitBody.data.timing.timing).toBe("waiting_reasonable");
    expect(waitBody.data.timing.reason).toContain("observed rolling median");
    const historyProv = waitBody.data.timing.provenanceIds.find((id) =>
      id.includes("price-history"),
    );
    expect(historyProv, "price-history window provenance attached").toBeTruthy();
    expect(waitBody.provenance[historyProv!]?.source).toBe("fixture:price-history-2026-v1");

    // [P12-1] The response contract carries cost-per-wear per line, engine
    // math verbatim: units {0,1} + 3 existing -> 3-4 pieces; 120 wear days
    // -> wears {30, 40}; 9999c -> {round(9999/40,2), round(9999/30,2)}.
    const cpw = waitBody.data.lines[0]!.costPerWear;
    expect(cpw, "cost-per-wear present when price inputs are sent").toBeTruthy();
    expect(cpw!.projectedWearsRange).toEqual({ min: 30, max: 40 });
    expect(cpw!.perWearCentsRange).toEqual({ min: 249.98, max: 333.3 });
    expect(cpw!.provenanceIds.length).toBeGreaterThan(0);
  });
});
