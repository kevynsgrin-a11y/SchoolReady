/**
 * §6 critical journey 1 — anonymous two-child merge, end to end over the
 * real Worker (wrangler dev, local D1/KV/R2).
 *
 * Outcome asserted precisely: a parent pastes/types two children's lists
 * and gets (a) a merged net-required list with the subtraction shown,
 * (b) a Pareto basket SET (frontier + four labeled views, never one
 * "optimal"), (c) a printable, offline-capable in-store checklist with
 * >=44px targets, and (d) ZERO account creation — no account surface
 * exists and the only cookie is the anonymous session id.
 */
import { test, expect } from "@playwright/test";
import {
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  expectNoAccountAffordances,
  expectOnlySessionCookie,
  gotoStable,
  seedTwoChildPlan,
  shot,
} from "./helpers";

test.describe("journey 1 — anonymous two-child merge", () => {
  test("intake x2 -> merged net-required plan -> Pareto basket set -> printable checklist, zero account creation", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(DESKTOP_VIEWPORT);

    /* -- first impression: fresh browser, no cookies, no account ask -- */
    expect(await page.context().cookies()).toEqual([]);
    await gotoStable(page, "/");
    await expect(page.locator("h1")).toContainText("Turn the supply list into a finished errand");
    await expectNoAccountAffordances(page, "home");
    await shot(page, "home-desktop");

    /* -- two children through the real intake forms + owned inventory -- */
    await seedTwoChildPlan(page);

    /* -- merged net-required list: the subtraction is SHOWN (6+12-2) -- */
    await gotoStable(page, "/plan");
    await expect(page.locator(".net-required-stack").first()).toBeVisible();
    const wholePlan = page.locator(".net-required-stack").last();
    await expect(wholePlan).toContainText("Required (2 children)");
    await expect(wholePlan).toContainText("18");
    await expect(wholePlan).toContainText("Already at home");
    await expect(wholePlan).toContainText("2");
    await expect(wholePlan).toContainText("To buy");
    await expect(wholePlan).toContainText("16");
    // Per-child receipt behind the merged number (tap any number -> receipt).
    const receipt = page.locator(".ledger-line-details").first();
    await receipt.locator("summary").click();
    await expect(page.locator(".ledger-receipt").first()).toContainText("Child 1: 6");
    await expect(page.locator(".ledger-receipt").first()).toContainText("Child 2: 12");
    // Provenance visible on the merged facts (§1.4).
    await expect(page.locator(".provenance-line").first()).toBeVisible();
    await expect(page.locator(".provenance-line").first()).toContainText("retrieved");
    await shot(page, "plan-merged-desktop");

    /* -- Pareto basket set: frontier + four views, never one answer -- */
    await gotoStable(page, "/plan/basket");
    await expect(page.locator("h2").filter({ hasText: /\d+ undominated option/ })).toBeVisible();
    const viewsNav = page.locator('[aria-label="Basket views"]');
    for (const label of ["Lowest cost", "Fewest stops", "Fastest", "Highest confidence"]) {
      await expect(viewsNav.getByText(label)).toBeVisible();
    }
    await expect(page.getByText("Every option shown is undominated")).toBeVisible();
    // The no-single-answer vocabulary: no "recommended"/"optimal"/"best pick"
    // language anywhere on the comparison surface (unit tests pin the copy;
    // this asserts the rendered page a user actually sees).
    const basketText = await page.locator("main").innerText();
    expect(basketText).not.toMatch(/\b(recommended|optimal|best (choice|pick|deal|option))\b/i);

    // Expanded view: per-retailer trip grouping, landed-cost double rule,
    // pack math, labeled assumptions, provenance on the priced facts.
    await gotoStable(page, "/plan/basket?view=lowest-cost");
    await expect(page.locator(".retailer-column").first()).toBeVisible();
    await expect(page.locator(".retailer-name").first()).toContainText("trip");
    await expect(page.locator(".ledger-total-value.double-rule").first()).toBeVisible();
    await expect(page.getByText("Labeled assumptions in this math")).toBeVisible();
    const basketSection = page.locator("section.section-required_items").first();
    await expect(basketSection.locator(".provenance-line").first()).toBeVisible();
    await shot(page, "basket-expanded-desktop");

    /* -- printable in-store checklist (store mode), one-hand mobile -- */
    await page.setViewportSize(MOBILE_VIEWPORT);
    await gotoStable(page, "/plan/checklist?mode=store");
    await expect(page.locator("body.store-mode")).toBeAttached();
    await expect(page.locator(".check-row").first()).toBeVisible();
    await expect(page.getByText("Buy 16")).toBeVisible();
    // [P12-4] §6 J1: the PRINTABLE checklist is STORE-GROUPED once a basket
    // exists — retailer trip headings from the labeled lowest-cost frontier
    // view, cited as a view (never "the" answer), with the check rows inside
    // their trip's group.
    await expect(page.locator(".checklist-store").first()).toBeVisible();
    await expect(page.locator(".checklist-store").first()).toContainText("trip");
    await expect(page.locator(".checklist-grouping")).toContainText(
      'Grouped by store using the "Lowest cost" basket view',
    );
    await expect(page.locator(".checklist-store-group .check-row").first()).toBeVisible();
    // Print button: revealed by the enhancement layer (JS is live here).
    const printButton = page.locator("[data-print]");
    await expect(printButton).toBeVisible();
    // >=44px targets in the aisle: every check row and the mode/print
    // controls meet the target size on a 390px-wide phone viewport.
    for (const selector of [".check-row", ".checklist-bar a", ".checklist-bar button"]) {
      const boxes = await page.locator(selector).evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().height),
      );
      expect(boxes.length, `${selector} present`).toBeGreaterThan(0);
      for (const height of boxes) {
        expect(height, `${selector} height >= 44px`).toBeGreaterThanOrEqual(44);
      }
    }
    // Crossing off works and the progress line follows (localStorage-only).
    await page.locator("input[data-check-item]").first().check();
    await expect(page.locator("#checklist-progress")).toContainText("1 of 1 crossed off");
    await shot(page, "checklist-store-mobile");

    /* -- zero account creation, end of journey -- */
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoStable(page, "/account");
    await expect(page.getByText("There is no account and none is ever required.")).toBeVisible();
    await expectNoAccountAffordances(page, "account");
    await expectOnlySessionCookie(page, "end of journey 1");
    await shot(page, "account-desktop");
  });
});
