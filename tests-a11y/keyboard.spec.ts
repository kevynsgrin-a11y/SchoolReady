/**
 * Keyboard paths — the three §6 critical journeys driven with the keyboard
 * (WCAG 2.1.1/2.1.2/2.4.3/2.4.7): focus order, the visible :focus-visible
 * ring at every stop, no traps, and operability of every interactive
 * element class (links, buttons, selects, text inputs, checkboxes,
 * details/summary receipts, skip link).
 *
 * The keyboard maps asserted here are transcribed into
 * docs/a11y/audit-phase-11.md §4.
 */
import { test, expect } from "@playwright/test";
import {
  RING_GREEN,
  expectVisibleRing,
  focusedOutline,
  gotoStable,
  stopIndex,
  tabWalk,
} from "./helpers";

test.describe("skip link (all pages ship it)", () => {
  test("first Tab reveals the skip link; Enter jumps to #main", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const focused = await focusedOutline(page);
    expect(focused.text).toBe("Skip to main content");
    await expectVisibleRing(page);
    // Hidden off-screen until focused; must be on-screen while focused.
    const box = await page.locator(".skip-link").boundingBox();
    expect(box, "skip link must be visible while focused").not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });
});

test.describe("journey 1 — two-child merge, keyboard only", () => {
  test("manual intake -> review -> confirm -> second child -> merged plan -> inventory audit", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    /* -- child 1: manual intake form, keyboard-order + operability -- */
    await page.goto("/intake?tab=manual");
    const stops = await tabWalk(page);
    // Focus order follows the visual order: skip link, chrome nav, intake
    // tabs, then the form controls in label order, then the submit button.
    const order = [
      stopIndex(stops, (s) => s.text === "Skip to main content"),
      stopIndex(stops, (s) => s.text === "Type items"), // manual tab link (INTAKE.tabManual)
      stopIndex(stops, (s) => s.id === "manual-product"),
      stopIndex(stops, (s) => s.id === "manual-quantity"),
      stopIndex(stops, (s) => s.id === "manual-unit"),
      stopIndex(stops, (s) => s.id === "manual-color"),
      stopIndex(stops, (s) => s.id === "manual-ruling"),
      stopIndex(stops, (s) => s.id === "manual-optionality"),
      stopIndex(stops, (s) => s.tag === "button"),
    ];
    for (const idx of order) expect(idx, `journey stop present: ${order}`).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]!, `focus order position ${i}`).toBeGreaterThan(order[i - 1]!);
    }

    // Select operability by keyboard: arrow keys change the value.
    await page.locator("#manual-optionality").focus();
    const before = await page.locator("#manual-optionality").inputValue();
    await page.keyboard.press("ArrowDown");
    const after = await page.locator("#manual-optionality").inputValue();
    expect(after).not.toBe(before);
    await page.keyboard.press("ArrowUp"); // restore

    // Fill and submit with the keyboard (Enter on the focused button).
    await page.locator("#manual-product").selectOption("glue-stick");
    await page.locator("#manual-quantity").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("6");
    await page.locator('form[action="/intake/manual"] button[type="submit"]').focus();
    await expectVisibleRing(page);
    await page.keyboard.press("Enter");

    /* -- mandatory review: checkbox + selects operable by keyboard -- */
    await expect(page.locator("h1")).toContainText("Confirm what we read");
    const include = page.locator("#item-0-include");
    await expect(include).toBeChecked(); // proposed item pre-included
    await include.focus();
    await expectVisibleRing(page);
    await page.keyboard.press("Space");
    await expect(include).not.toBeChecked();
    await page.keyboard.press("Space");
    await expect(include).toBeChecked();

    await page.locator('form[action="/intake/confirm"] button[type="submit"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/plan");

    /* -- child 2: same path, member select operated with arrows -- */
    await page.goto("/intake?tab=manual");
    await page.locator("#manual-product").selectOption("glue-stick");
    await page.locator("#manual-quantity").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("12");
    await page.locator('form[action="/intake/manual"] button[type="submit"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("h1")).toContainText("Confirm what we read");
    const member = page.locator("#confirm-member");
    await member.focus();
    // Options: "Child 1" (existing) then "New child (2)" — arrow to child 2.
    await member.selectOption({ index: 0 });
    await page.keyboard.press("ArrowDown");
    await expect(member).toHaveValue("2");
    await page.locator('form[action="/intake/confirm"] button[type="submit"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/plan");

    /* -- merged plan: net-required stack + expandable receipt -- */
    await expect(page.locator(".net-required-stack").first()).toBeVisible();
    const summary = page.locator(".ledger-line-details summary").first();
    await summary.focus();
    await expectVisibleRing(page);
    await page.keyboard.press("Enter");
    await expect(page.locator(".ledger-line-details[open]").first()).toBeAttached();
    await expect(page.locator(".ledger-receipt").first()).toContainText("Child 2");

    /* -- inventory audit: keyboard form entry, subtraction visible -- */
    await page.goto("/household");
    await page.locator("#inv-product").selectOption("glue-stick");
    await page.locator("#inv-quantity").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("2");
    await page.locator('form[action="/household/inventory"] button[type="submit"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/household");
    await page.waitForLoadState();
    await gotoStable(page, "/plan");
    await expect(page.getByText("Already at home").first()).toBeVisible();

    /* -- whole plan page keyboard-walkable without a trap -- */
    const planStops = await tabWalk(page, 300);
    expect(planStops.length).toBeGreaterThan(10);
  });
});

test.describe("journey 2 — safety intercept, keyboard only", () => {
  test("UPC check by keyboard; recall intercept renders alert-first with visible focus", async ({
    page,
  }) => {
    await page.goto("/safety");
    // The UPC input is reachable, labeled, and described by its format hint.
    const stops = await tabWalk(page, 300);
    expect(stopIndex(stops, (s) => s.id === "upc")).toBeGreaterThan(-1);
    await page.locator("#upc").focus();
    await expectVisibleRing(page);
    const describedBy = await page.locator("#upc").getAttribute("aria-describedby");
    expect(describedBy).toBe("upc-hint");
    await expect(page.locator("#upc-hint")).toContainText("digits");

    // Keyboard submit (Enter inside the text input submits the GET form).
    await page.keyboard.type("00000000");
    await page.keyboard.press("Enter");
    await page.waitForURL("**/safety?upc=00000000");
    await expect(page.getByText("No recall match for this UPC")).toBeVisible();

    // The recall intercept: alert banner first, before the check form.
    await page.goto("/safety?upc=FIXTURE-UPC-0007");
    const banner = page.locator(".banner-recall[role='alert']").first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Recalled"); // icon + text, not color alone
    const bannerBox = (await banner.boundingBox())!;
    const formBox = (await page.locator('form[aria-label="Check a product\'s UPC"]').boundingBox())!;
    expect(bannerBox.y).toBeLessThan(formBox.y);

    // Recall banners must never animate (direction §8).
    const animation = await banner.evaluate((el) => window.getComputedStyle(el).animationName);
    expect(animation).toBe("none");

    // Links inside the banner are keyboard-reachable with a VISIBLE ring.
    // [Release — Phase 12, finding P12-3] The first banner link sits on the
    // recall-entry CARD — a white surface nested inside the red banner —
    // where Phase 11's banner-wide white ring (and white text) was
    // invisible white-on-white. Card content now reverts to the normal
    // palette, so the correct visible ring HERE is the action green; banner
    // chrome outside cards keeps the Phase 11 white ring (D2). Erratum
    // appended to docs/handoffs/12-accessibility-qa-11.md.
    const bannerLink = banner.locator("a").first();
    await bannerLink.focus();
    await expectVisibleRing(page, RING_GREEN);
    const onCard = await bannerLink.evaluate((el) => el.closest(".card") !== null);
    expect(onCard, "first banner link sits on the white recall-entry card").toBe(true);
  });
});

test.describe("journey 3 — uniform + capsule planner, keyboard only", () => {
  test("capsule form order, checkbox by Space, submit by Enter, ranges render", async ({
    page,
  }) => {
    await page.goto("/capsule");
    const stops = await tabWalk(page);
    const order = [
      stopIndex(stops, (s) => s.id === "cap-category"),
      stopIndex(stops, (s) => s.id === "cap-climate"),
      stopIndex(stops, (s) => s.id === "cap-wash"),
      stopIndex(stops, (s) => s.id === "cap-reserve"),
      stopIndex(stops, (s) => s.id === "cap-existing"),
      stopIndex(stops, (s) => s.id === "cap-uniform"),
    ];
    for (const idx of order) expect(idx, `capsule stop present: ${order}`).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]!, `capsule focus order position ${i}`).toBeGreaterThan(order[i - 1]!);
    }

    await page.locator("#cap-wash").focus();
    await page.keyboard.type("2");
    await page.locator("#cap-reserve").focus();
    await page.keyboard.type("1");
    await page.locator("#cap-existing").focus();
    await page.keyboard.type("3");
    const uniform = page.locator("#cap-uniform");
    await uniform.focus();
    await expectVisibleRing(page);
    await page.keyboard.press("Space");
    await expect(uniform).toBeChecked();
    await page.locator('form[action="/capsule"] button[type="submit"]').focus();
    await page.keyboard.press("Enter");

    // Results: ranges (never one number) with the accent header, provenance
    // visible, and the whole results page still keyboard-walkable.
    await expect(page.locator(".capsule-card-header").first()).toBeVisible();
    await expect(page.locator(".provenance-line").first()).toBeVisible();
    const resultStops = await tabWalk(page, 300);
    expect(resultStops.length).toBeGreaterThan(5);
  });
});
