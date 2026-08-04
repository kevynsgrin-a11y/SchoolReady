/**
 * Shared plumbing for the Phase 11 accessibility suite: the axe-core
 * runner (zero serious/critical is the acceptance bar), the snapshot
 * server (route interception — no extra process), keyboard-walk helpers,
 * and the focus-ring assertion.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { buildStylesheet } from "../src/ui/styles";
import type { SnapshotPage } from "./snapshots";

export const SNAPSHOT_ORIGIN = "http://snapshots.a11y.internal";

// Playwright runs from the repo root (npm run test:a11y); avoid __dirname
// so the file works under both CJS and ESM transforms.
const PUBLIC_DIR = join(process.cwd(), "public");

const contentTypeFor = (path: string): string =>
  path.endsWith(".css")
    ? "text/css; charset=utf-8"
    : path.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : path.endsWith(".woff2")
        ? "font/woff2"
        : path.endsWith(".txt")
          ? "text/plain; charset=utf-8"
          : "application/octet-stream";

/**
 * Serves a hand-built snapshot document (plus the REAL generated stylesheet
 * and the real public/ assets) from an internal origin via route
 * interception. The HTML bytes are exactly what renderDocument produced.
 */
export async function gotoSnapshot(page: Page, snapshot: SnapshotPage): Promise<void> {
  await page.route(`${SNAPSHOT_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/${snapshot.id}`) {
      await route.fulfill({ contentType: "text/html; charset=utf-8", body: snapshot.html });
      return;
    }
    if (url.pathname === "/assets/ui.css") {
      await route.fulfill({ contentType: "text/css; charset=utf-8", body: buildStylesheet() });
      return;
    }
    const local = join(PUBLIC_DIR, url.pathname.replace(/^\//, ""));
    if (url.pathname.startsWith("/assets/") && existsSync(local)) {
      await route.fulfill({
        contentType: contentTypeFor(url.pathname),
        body: readFileSync(local),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "text/plain", body: "not found" });
  });
  await page.goto(`${SNAPSHOT_ORIGIN}/${snapshot.id}`, { waitUntil: "load" });
}

export interface AxeSummary {
  /** rule id -> node target list, serious/critical only. */
  blocking: { id: string; impact: string; help: string; targets: string[] }[];
  /** Everything else (moderate/minor) — recorded, not blocking. */
  advisory: { id: string; impact: string | null; help: string; targets: string[] }[];
}

/** Runs axe-core over the current page; splits by the acceptance bar. */
export async function axeScan(page: Page): Promise<AxeSummary> {
  const results = await new AxeBuilder({ page }).analyze();
  const summarize = (v: (typeof results.violations)[number]) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  });
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ ...summarize(v), impact: v.impact as string }));
  const advisory = results.violations
    .filter((v) => v.impact !== "serious" && v.impact !== "critical")
    .map(summarize);
  return { blocking, advisory };
}

/** Asserts the acceptance bar and logs advisory findings for the audit doc. */
export async function expectNoBlockingViolations(page: Page, label: string): Promise<void> {
  const { blocking, advisory } = await axeScan(page);
  for (const v of advisory) {
    console.log(`[axe advisory] ${label}: ${v.impact ?? "n/a"} ${v.id} (${v.targets.join(" | ")})`);
  }
  expect(
    blocking,
    `serious/critical axe violations on ${label}:\n${JSON.stringify(blocking, null, 2)}`,
  ).toEqual([]);
}

/** Computed outline of the currently focused element. */
export async function focusedOutline(page: Page): Promise<{
  tag: string;
  id: string;
  text: string;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
}> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) {
      return { tag: "body", id: "", text: "", outlineStyle: "", outlineWidth: "", outlineColor: "" };
    }
    const style = window.getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      text: (el.textContent ?? "").trim().slice(0, 60),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    };
  });
}

/**
 * goto with one retry: headless Chromium's network-change notifier can flap
 * in sandboxes (navigator.onLine briefly false -> net::ERR_ABORTED before
 * the request reaches wrangler dev). One short retry absorbs it.
 */
export async function gotoStable(page: Page, path: string): Promise<void> {
  try {
    await page.goto(path);
  } catch {
    await page.waitForTimeout(500);
    await page.goto(path);
  }
}

/** The direction §11 ring: 2px solid Chalk Green (#1B6B54 = rgb(27, 107, 84)). */
export const RING_GREEN = "rgb(27, 107, 84)";
export const RING_WHITE = "rgb(255, 255, 255)";

/** Asserts the focused element shows the visible :focus-visible ring. */
export async function expectVisibleRing(page: Page, expectedColor = RING_GREEN): Promise<void> {
  const focused = await focusedOutline(page);
  expect(focused.outlineStyle, `focused <${focused.tag}#${focused.id}> ring style`).toBe("solid");
  expect(focused.outlineWidth, `focused <${focused.tag}#${focused.id}> ring width`).toBe("2px");
  expect(focused.outlineColor, `focused <${focused.tag}#${focused.id}> ring color`).toBe(
    expectedColor,
  );
}

export interface TabStop {
  tag: string;
  id: string;
  text: string;
}

/**
 * Walks Tab from the top of the document, recording every focus stop until
 * focus cycles back to the first stop (or maxSteps). Asserts the visible
 * ring at every stop along the way.
 */
export async function tabWalk(page: Page, maxSteps = 200): Promise<TabStop[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  const stops: TabStop[] = [];
  for (let i = 0; i < maxSteps; i += 1) {
    await page.keyboard.press("Tab");
    // Cycle detection by ELEMENT IDENTITY (distinct elements can share
    // text — e.g. repeated ledger summaries): mark each visited node.
    const revisited = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (el.hasAttribute("data-a11y-visited")) return true;
      el.setAttribute("data-a11y-visited", "1");
      return false;
    });
    if (revisited === null || revisited === true) break;
    const focused = await focusedOutline(page);
    expect(focused.outlineStyle, `ring at stop ${i} <${focused.tag}#${focused.id}>`).toBe("solid");
    expect(focused.outlineWidth, `ring at stop ${i} <${focused.tag}#${focused.id}>`).toBe("2px");
    stops.push({ tag: focused.tag, id: focused.id, text: focused.text });
  }
  return stops;
}

/** Index of the first stop matching the predicate; -1 when absent. */
export const stopIndex = (stops: TabStop[], predicate: (s: TabStop) => boolean): number =>
  stops.findIndex(predicate);

/* ------------------------------------------------------------------ */
/* Live-journey seeding (browser-driven, same forms a user submits)    */
/* ------------------------------------------------------------------ */

/** Adds one manual item and confirms it for the given child ordinal. */
export async function addManualList(
  page: Page,
  args: { quantity: string; memberValue: string },
): Promise<void> {
  await page.goto("/intake?tab=manual");
  await page.locator("#manual-product").selectOption("glue-stick");
  await page.locator("#manual-quantity").fill(args.quantity);
  await page.locator('form[action="/intake/manual"] button[type="submit"]').click();
  await expect(page.locator('input[name="intakeId"]')).toBeAttached();
  await page.locator("#confirm-member").selectOption(args.memberValue);
  await page.locator('form[action="/intake/confirm"] button[type="submit"]').click();
  await page.waitForURL("**/plan");
  await page.waitForLoadState();
}

/** Seeds the two-child merged plan + one inventory item through the UI. */
export async function seedTwoChildPlan(page: Page): Promise<void> {
  await addManualList(page, { quantity: "6", memberValue: "1" });
  await addManualList(page, { quantity: "12", memberValue: "2" });
  await page.goto("/household");
  await page.locator("#inv-product").selectOption("glue-stick");
  await page.locator("#inv-quantity").fill("2");
  await page.locator('form[action="/household/inventory"] button[type="submit"]').click();
  await page.waitForURL("**/household");
  await page.waitForLoadState();
}
