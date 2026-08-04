/**
 * Forms + motion + color-independence checks (Phase 11).
 *
 * - Every form control is programmatically labeled (WCAG 1.3.1/3.3.2) and
 *   every aria-describedby resolves to real hint text.
 * - Server-side validation errors are identified in text with role="alert"
 *   (WCAG 3.3.1) even when client-side validation is bypassed.
 * - prefers-reduced-motion collapses every animation/transition (direction
 *   §8), verified in the CSS text AND in a real reduced-motion context.
 * - No badge or banner communicates by color alone: icon + text label are
 *   present in the DOM for all eleven badge kinds (direction §6 contract).
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { buildStylesheet } from "../src/ui/styles";
import { gotoSnapshot } from "./helpers";
import { snapshotPages } from "./snapshots";

const FORM_PAGES = [
  ["home", "/"],
  ["intake paste", "/intake"],
  ["intake manual", "/intake?tab=manual"],
  ["intake upload", "/intake?tab=upload"],
  ["household", "/household"],
  ["capsule", "/capsule"],
  ["safety", "/safety"],
  ["account", "/account"],
] as const;

interface LabelReport {
  unlabeled: string[];
  danglingDescribedBy: string[];
}

async function labelReport(page: Page): Promise<LabelReport> {
  return page.evaluate(() => {
    const unlabeled: string[] = [];
    const dangling: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), select, textarea",
    );
    for (const el of controls) {
      const id = el.id;
      const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
      const wrapped = el.closest("label");
      const aria = el.getAttribute("aria-label");
      const labelText = (byFor?.textContent ?? wrapped?.textContent ?? aria ?? "").trim();
      if (labelText.length === 0) unlabeled.push(`${el.tagName.toLowerCase()}#${id || "(no id)"}`);
      const describedBy = el.getAttribute("aria-describedby");
      if (describedBy) {
        for (const token of describedBy.split(/\s+/)) {
          const target = document.getElementById(token);
          if (!target || (target.textContent ?? "").trim().length === 0) {
            dangling.push(`${el.tagName.toLowerCase()}#${id} -> #${token}`);
          }
        }
      }
    }
    return { unlabeled, danglingDescribedBy: dangling };
  });
}

test.describe("form labeling (programmatic association)", () => {
  for (const [label, path] of FORM_PAGES) {
    test(`${label} — every control labeled, every describedby resolves`, async ({ page }) => {
      await page.goto(path);
      const report = await labelReport(page);
      expect(report.unlabeled, `unlabeled controls on ${path}`).toEqual([]);
      expect(report.danglingDescribedBy, `dangling aria-describedby on ${path}`).toEqual([]);
    });
  }

  test("review screen (paste journey) — generated per-item controls all labeled", async ({
    page,
  }) => {
    await page.goto("/intake");
    await page.locator("#paste-text").fill("3 spiral notebooks\n6 glue sticks");
    await page.locator('form[action="/intake/paste"] button[type="submit"]').click();
    await expect(page.locator("h1")).toContainText("Confirm what we read");
    const report = await labelReport(page);
    expect(report.unlabeled).toEqual([]);
    expect(report.danglingDescribedBy).toEqual([]);
  });
});

test.describe("error identification (WCAG 3.3.1)", () => {
  test("server-side validation failure renders a role=alert explanation", async ({ page }) => {
    await page.goto("/capsule");
    await page.locator("#cap-wash").fill("2");
    await page.locator("#cap-reserve").fill("1");
    await page.locator("#cap-existing").fill("3");
    // Bypass client-side constraint validation to prove the server-rendered
    // error path is itself accessible: daysBetweenWashes=0 fails the
    // engine's own range check (RangeError -> 422 validation_failed).
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('form[action="/capsule"]')!;
      form.noValidate = true;
      const wash = document.querySelector<HTMLInputElement>("#cap-wash")!;
      wash.removeAttribute("min");
      wash.value = "0";
    });
    await page.locator('form[action="/capsule"] button[type="submit"]').click();
    const alert = page.locator("[role='alert']").first();
    await expect(alert).toBeVisible();
    await expect(alert).not.toHaveText(/^\s*$/);
  });

  test("client-side constraints are native + programmatic (required/pattern present)", async ({
    page,
  }) => {
    await page.goto("/safety");
    await expect(page.locator("#upc")).toHaveAttribute("required", "");
    await expect(page.locator("#upc")).toHaveAttribute("pattern", "[0-9]{8,14}");
    await expect(page.locator("#upc")).toHaveAttribute("aria-describedby", "upc-hint");
  });
});

test.describe("motion discipline (direction §8 + prefers-reduced-motion)", () => {
  test("the stylesheet collapses all animation/transition under reduce", () => {
    const css = buildStylesheet();
    const reduceAt = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(reduceAt).toBeGreaterThan(-1);
    const block = css.slice(reduceAt, css.indexOf("}", css.indexOf("}", reduceAt) + 1) + 1);
    expect(block).toContain("animation: none !important");
    expect(block).toContain("transition: none !important");
  });

  test("skeleton pulse animates by default and stops under reduced motion", async ({
    browser,
  }) => {
    const loading = snapshotPages().find((p) => p.id === "plan-loading")!;

    const normal = await browser.newContext();
    const normalPage = await normal.newPage();
    await gotoSnapshot(normalPage, loading);
    const animated = await normalPage
      .locator(".skeleton .skeleton-bar")
      .first()
      .evaluate((el) => window.getComputedStyle(el).animationName);
    expect(animated).toBe("skeleton-pulse");
    await normal.close();

    const reduced = await browser.newContext({ reducedMotion: "reduce" });
    const reducedPage = await reduced.newPage();
    await gotoSnapshot(reducedPage, loading);
    const stopped = await reducedPage
      .locator(".skeleton .skeleton-bar")
      .first()
      .evaluate((el) => window.getComputedStyle(el).animationName);
    expect(stopped).toBe("none");
    await reduced.close();
  });

  test("no autoplaying media, no meta refresh, anywhere in the shell", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("video, audio, marquee, [autoplay]").count()).toBe(0);
    expect(await page.locator('meta[http-equiv="refresh"]').count()).toBe(0);
  });
});

test.describe("no information by color alone (direction §2/§6 contract)", () => {
  test("all eleven badges carry an icon AND a text label in the DOM", async ({ page }) => {
    const gallery = snapshotPages().find((p) => p.id === "component-gallery")!;
    await gotoSnapshot(page, gallery);
    const badges = page.locator("[data-badge]");
    const kinds = new Set<string>();
    for (let i = 0; i < (await badges.count()); i += 1) {
      const badge = badges.nth(i);
      kinds.add((await badge.getAttribute("data-badge"))!);
      expect(await badge.locator("svg[aria-hidden='true']").count()).toBeGreaterThan(0);
      const label = (await badge.locator(".badge-label").textContent())?.trim() ?? "";
      expect(label.length, `badge ${await badge.getAttribute("data-badge")} label`).toBeGreaterThan(
        0,
      );
    }
    expect([...kinds].sort()).toEqual(
      [
        "cooling",
        "insufficient-evidence",
        "optional",
        "out-of-stock",
        "recalled",
        "required",
        "school-restricted",
        "sponsored",
        "stale",
        "trending",
        "useful",
      ].sort(),
    );
  });

  test("safety banners are role=alert with icon + text, live", async ({ page }) => {
    await page.goto("/safety?upc=FIXTURE-UPC-0007");
    const banner = page.locator(".banner-recall[role='alert']").first();
    await expect(banner).toBeVisible();
    expect(await banner.locator("svg[aria-hidden='true']").count()).toBeGreaterThan(0);
    await expect(banner.locator(".badge-label").first()).toContainText("Recalled");
  });
});
