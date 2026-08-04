/**
 * Shared plumbing for the Phase 12 release E2E suite: UI-driven session
 * seeding (the same forms a user submits — no API shortcuts for state a
 * user would create), congruence-evidence screenshots (written to
 * docs/release/screenshots/ as gate evidence), viewport presets, and the
 * zero-account-creation assertion used across journeys.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Congruence-gate evidence screenshots land here (referenced by docs/release/congruence-gate.md). */
export const SCREENSHOT_DIR = join(process.cwd(), "docs", "release", "screenshots");

export const MOBILE_VIEWPORT = { width: 390, height: 844 } as const; // small-phone class
export const DESKTOP_VIEWPORT = { width: 1280, height: 800 } as const;

/** Captures a named evidence screenshot (PNG, binary — carries no brand string). */
export async function shot(page: Page, name: string, fullPage = true): Promise<void> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  // This sandbox's Chromium network-change notifier flaps
  // navigator.onLine to false while the server is demonstrably reachable
  // (the page just loaded over HTTP), which — correctly, per app.js —
  // shows the offline banner. Pin the EMULATED network state to online via
  // CDP so evidence screenshots reflect a normal online environment; the
  // app's own online handler hides the banner. Nothing in the page is
  // edited by hand.
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await page
      .waitForFunction(
        () => document.getElementById("offline-banner")?.hidden !== false,
        undefined,
        { timeout: 3000 },
      )
      .catch(() => undefined);
    await cdp.detach();
  } catch {
    /* CDP unavailable (non-Chromium): capture as-is. */
  }
  await page.screenshot({ path: join(SCREENSHOT_DIR, `${name}.png`), fullPage });
}

/**
 * goto with one retry: headless Chromium's network-change notifier can flap
 * in sandboxes (navigator.onLine briefly false -> net::ERR_ABORTED before
 * the request reaches wrangler dev). One short retry absorbs it.
 */
export async function gotoStable(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url);
  } catch {
    await page.waitForTimeout(500);
    await page.goto(url);
  }
}

/**
 * Adds one manual glue-stick item and confirms it for the given child
 * ordinal — the exact form path a parent uses (§6 journey 1). `base` is ""
 * for the config baseURL or an absolute origin for journey 2's server.
 */
export async function addManualList(
  page: Page,
  args: { quantity: string; memberValue: string; base?: string },
): Promise<void> {
  const base = args.base ?? "";
  await gotoStable(page, `${base}/intake?tab=manual`);
  await page.locator("#manual-product").selectOption("glue-stick");
  await page.locator("#manual-quantity").fill(args.quantity);
  await page.locator('form[action="/intake/manual"] button[type="submit"]').click();
  await expect(page.locator('input[name="intakeId"]')).toBeAttached();
  await page.locator("#confirm-member").selectOption(args.memberValue);
  await page.locator('form[action="/intake/confirm"] button[type="submit"]').click();
  await page.waitForURL("**/plan");
  await page.waitForLoadState();
}

/** Seeds the two-child merged plan (6 + 12 glue sticks) + 2 owned units through the UI. */
export async function seedTwoChildPlan(page: Page, base = ""): Promise<void> {
  await addManualList(page, { quantity: "6", memberValue: "1", base });
  await addManualList(page, { quantity: "12", memberValue: "2", base });
  await gotoStable(page, `${base}/household`);
  await page.locator("#inv-product").selectOption("glue-stick");
  await page.locator("#inv-quantity").fill("2");
  await page.locator('form[action="/household/inventory"] button[type="submit"]').click();
  await page.waitForURL("**/household");
  await page.waitForLoadState();
}

/**
 * §6 journey 1 outcome "zero account creation": the page must offer no
 * account surface at all — no email/password/tel inputs, no signup/login
 * affordance anywhere in the rendered document.
 */
export async function expectNoAccountAffordances(page: Page, label: string): Promise<void> {
  for (const selector of ['input[type="email"]', 'input[type="password"]', 'input[type="tel"]']) {
    await expect(page.locator(selector), `${label}: ${selector} must not exist`).toHaveCount(0);
  }
  // Note: the privacy copy legitimately SAYS "no login of any kind", so this
  // matches affordance phrasing, not the word "login" in a negation.
  const text = await page.locator("body").innerText();
  expect(text, `${label}: no signup/login affordance`).not.toMatch(
    /\b(sign up|sign in|create (an )?account)\b/i,
  );
}

/** The session cookie is the ONLY cookie the app may set (§1.7 anonymous-first). */
export async function expectOnlySessionCookie(page: Page, label: string): Promise<void> {
  const cookies = await page.context().cookies();
  const names = [...new Set(cookies.map((c) => c.name))];
  expect(names, `${label}: cookie jar must hold only the anonymous session id`).toEqual([
    "k8p_sid",
  ]);
}

/** y-position of a locator's bounding box (throws when not visible). */
export async function topOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `bounding box for ${selector}`).not.toBeNull();
  return box!.y;
}
