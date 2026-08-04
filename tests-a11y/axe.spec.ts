/**
 * Axe-core sweep — every screen × key states (Phase 11 mandate).
 *
 * Acceptance bar: ZERO violations at serious/critical severity, no waivers.
 * Moderate/minor findings are logged as advisories and recorded in
 * docs/a11y/audit-phase-11.md.
 *
 * Coverage strategy (documented in the audit doc §2):
 * - LIVE pages: served by wrangler dev (real Worker, real D1/KV/R2, fixture
 *   data) — default, empty, review, recalled (safety intercept), error/404
 *   states driven through real HTTP journeys.
 * - SNAPSHOT pages: states that cannot be driven over HTTP (injected stale
 *   clocks, guard refusals, entitlements, loading, rate-limited) rendered
 *   through the REAL screen functions + composer (tests-a11y/snapshots.ts).
 */
import { test, expect } from "@playwright/test";
import {
  addManualList,
  expectNoBlockingViolations,
  gotoSnapshot,
  seedTwoChildPlan,
} from "./helpers";
import { snapshotPages } from "./snapshots";

/* ----------------------- anonymous (empty) states ------------------ */

const EMPTY_STATE_PAGES = [
  ["home", "/"],
  ["intake paste form", "/intake"],
  ["intake manual form", "/intake?tab=manual"],
  ["intake upload form", "/intake?tab=upload"],
  ["plan (empty)", "/plan"],
  ["checklist (empty)", "/plan/checklist"],
  ["basket (empty)", "/plan/basket"],
  ["household (empty)", "/household"],
  ["capsule form", "/capsule"],
  ["trends (empty)", "/trends"],
  ["safety center (fixture recalls)", "/safety"],
  ["budget (empty)", "/budget"],
  ["deals (no session)", "/deals"],
  ["account (no alerts)", "/account"],
  ["methodology", "/methodology"],
  ["provider status", "/admin/status"],
  ["item detail (unknown slug)", "/item/no-such-product"],
  ["item detail (fixture product)", "/item/fixture-gel-pen"],
  ["404 page", "/no-such-page"],
] as const;

test.describe("axe: anonymous/empty states (live wrangler dev)", () => {
  for (const [label, path] of EMPTY_STATE_PAGES) {
    test(`${label} — ${path}`, async ({ page }) => {
      await page.goto(path);
      await expectNoBlockingViolations(page, `${label} (${path})`);
    });
  }
});

/* ----------------------- journey-driven live states ----------------- */

test.describe("axe: journey-driven states (live wrangler dev)", () => {
  test("intake review state (paste -> mandatory review, incl. unparsed-line refusal)", async ({
    page,
  }) => {
    await page.goto("/intake");
    await page
      .locator("#paste-text")
      .fill("3 spiral notebooks\n6 glue sticks\n1 mystery gadget deluxe");
    await page.locator('form[action="/intake/paste"] button[type="submit"]').click();
    await expect(page.locator("h1")).toContainText("Confirm what we read");
    await expectNoBlockingViolations(page, "intake review (paste)");
  });

  test("safety intercept: recalled UPC renders the alert banner first", async ({ page }) => {
    await page.goto("/safety?upc=FIXTURE-UPC-0007");
    await expect(page.locator(".banner-recall[role='alert']").first()).toBeVisible();
    await expectNoBlockingViolations(page, "safety intercept (recalled UPC)");
  });

  test("safety check: no-match state", async ({ page }) => {
    await page.goto("/safety?upc=00000000");
    await expect(page.getByText("No recall match for this UPC")).toBeVisible();
    await expectNoBlockingViolations(page, "safety check (no match)");
  });

  test("capsule results (uniform dress code on)", async ({ page }) => {
    await page.goto("/capsule");
    await page.locator("#cap-wash").fill("2");
    await page.locator("#cap-reserve").fill("1");
    await page.locator("#cap-existing").fill("3");
    await page.locator("#cap-uniform").check();
    await page.locator('form[action="/capsule"] button[type="submit"]').click();
    await expect(page.locator(".capsule-card-header").first()).toBeVisible();
    await expectNoBlockingViolations(page, "capsule results (uniform)");
  });

  test.describe("seeded two-child plan states", () => {
    test("plan, checklist (both modes), basket, budget, household, trends, account", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await seedTwoChildPlan(page);

      const seededPages = [
        ["plan (two-child merge + inventory)", "/plan"],
        ["checklist (ready)", "/plan/checklist"],
        ["checklist (store mode)", "/plan/checklist?mode=store"],
        ["basket (ready, deadline set)", "/plan/basket?days=6"],
        ["basket (lowest-cost view)", "/plan/basket?view=lowest-cost"],
        ["budget (ready)", "/budget"],
        ["household (inventory listed)", "/household"],
        ["trends (plan items)", "/trends"],
        ["deals (session + basket)", "/deals"],
      ] as const;
      for (const [label, path] of seededPages) {
        await page.goto(path);
        await expectNoBlockingViolations(page, `${label} (${path})`);
      }
    });

    test("account with an alert subscription", async ({ page }) => {
      await addManualList(page, { quantity: "3", memberValue: "1" });
      await page.goto("/account");
      await page.locator("#alert-kind").selectOption("recall");
      await page.locator('form[action="/account/alerts"] button[type="submit"]').click();
      await page.waitForURL("**/account");
      await expectNoBlockingViolations(page, "account (alert subscribed)");
    });
  });
});

/* ----------------------- snapshot states ---------------------------- */

test.describe("axe: snapshot states (real renderers, synthetic envelopes)", () => {
  for (const snapshot of snapshotPages()) {
    test(`${snapshot.screenName} — ${snapshot.stateName}`, async ({ page }) => {
      await gotoSnapshot(page, snapshot);
      await expectNoBlockingViolations(page, `${snapshot.screenName} / ${snapshot.stateName}`);
    });
  }
});
